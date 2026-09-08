import {
  normalizeAndValidateStartUrl,
  isCrawlableUrl,
} from "@/server/lib/audit/url-policy";
import {
  fetchRobotsTxtText,
  parseRobotsTxt,
} from "@/server/lib/audit/discovery";

/**
 * Lightweight page read for Content Brief (competitor word counts) and
 * Content Audit (own-page word count/title/H1). Reuses the site-audit
 * crawler's real building blocks — SSRF/private-host validation
 * (`normalizeAndValidateStartUrl`), robots.txt parsing (`parseRobotsTxt`),
 * and HTML parsing (`analyzeHtml`) — rather than a bespoke fetcher, but skips
 * the full crawl workflow (frontier, redirect-chain rows, Durable Object
 * checkpointing): callers here always name a small, known set of URLs.
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 1024 * 1024;
const USER_AGENT = "OpenSEO-Content/1.0 (+https://openseo.so)";

export type ContentPageFetchResult = {
  url: string;
  statusCode: number | null;
  title: string | null;
  h1: string | null;
  wordCount: number | null;
  fetchError: string | null;
};

function failure(url: string, message: string): ContentPageFetchResult {
  return {
    url,
    statusCode: null,
    title: null,
    h1: null,
    wordCount: null,
    fetchError: message,
  };
}

async function readTextUpTo(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytesRead = 0;
  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytesRead;
      const chunk =
        value.byteLength > remaining ? value.subarray(0, remaining) : value;
      bytesRead += chunk.byteLength;
      parts.push(decoder.decode(chunk, { stream: true }));
      if (bytesRead >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  parts.push(decoder.decode());
  return parts.join("");
}

/** Fetches and parses one page. Never throws — every failure mode (blocked
 *  host, robots disallow, non-HTML, network error) resolves to a result with
 *  `fetchError` set, so callers can process a batch without try/catch. Not
 *  exported — callers use the batch wrapper below. */
async function fetchContentPage(
  rawUrl: string,
): Promise<ContentPageFetchResult> {
  let validated: string;
  try {
    validated = await normalizeAndValidateStartUrl(rawUrl);
  } catch {
    return failure(rawUrl, "URL is blocked or invalid");
  }

  const origin = new URL(validated).origin;
  const robotsText = await fetchRobotsTxtText(origin);
  const robots = parseRobotsTxt(origin, robotsText);
  if (!robots.isAllowed(validated)) {
    return failure(validated, "Disallowed by robots.txt");
  }

  const startTime = Date.now();
  try {
    const response = await fetch(validated, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (
        !location ||
        !isCrawlableUrl(new URL(location, validated).toString())
      ) {
        return failure(
          validated,
          `Redirected (${response.status}) to a blocked URL`,
        );
      }
      // One hop, re-validated (SSRF), no further follows — matches the
      // onboarding scraper's redirect policy.
      const redirectUrl = await normalizeAndValidateStartUrl(
        new URL(location, validated).toString(),
      );
      const redirected = await fetch(redirectUrl, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      return parseResponse(redirectUrl, redirected, startTime);
    }

    return parseResponse(validated, response, startTime);
  } catch (error) {
    return failure(
      validated,
      error instanceof Error ? error.message : "Fetch failed",
    );
  }
}

async function parseResponse(
  url: string,
  response: Response,
  startTime: number,
): Promise<ContentPageFetchResult> {
  if (!response.ok) {
    return failure(url, `HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return failure(url, `Not HTML (${contentType || "unknown content-type"})`);
  }
  const html = await readTextUpTo(response, MAX_HTML_BYTES);
  const { analyzeHtml } = await import("@/server/lib/audit/page-analyzer");
  const analysis = analyzeHtml(
    html,
    url,
    response.status,
    Date.now() - startTime,
  );
  return {
    url,
    statusCode: response.status,
    title: analysis.title || null,
    h1: analysis.h1s.find((h) => h.trim().length > 0) ?? null,
    wordCount: analysis.wordCount,
    fetchError: null,
  };
}

/** Fetches a batch of pages concurrently. Individual failures never fail the
 *  batch — each URL resolves to its own result. */
export async function fetchContentPages(
  urls: string[],
): Promise<ContentPageFetchResult[]> {
  return Promise.all(urls.map((url) => fetchContentPage(url)));
}
