import { AppError } from "@/server/lib/errors";
import {
  GscService,
  GscNotConnectedError,
} from "@/server/features/gsc/services/GscService";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { ContentRepository } from "@/server/features/content/repositories/ContentRepository";
import {
  fetchContentPages,
  type ContentPageFetchResult,
} from "@/server/features/content/services/contentPageFetch";
import {
  buildPageFlags,
  computeDecaySignal,
  containsKeyword,
  isThinContent,
  type DecayStatus,
} from "@/server/features/content/services/contentAuditScoring";
import {
  decodePageFlags,
  type PageFlag,
} from "@/server/features/content/contentJsonCodecs";

// A content audit names a handful of important pages, not a whole-site crawl
// (that's Site Audit) — cap so the GSC lookups and page fetches this runs
// synchronously stay bounded.
const MAX_AUDIT_PAGES = 20;
const GSC_DATA_LAG_DAYS = 3;
const WINDOW_DAYS = 90;
const GSC_ROW_LIMIT = 1000;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** last-90-days window ending GSC_DATA_LAG_DAYS ago, and the 90 days before
 *  that (the "prior" baseline for the decay signal). */
function computeWindows(today: Date = new Date()) {
  const lastEnd = new Date(today);
  lastEnd.setUTCDate(lastEnd.getUTCDate() - GSC_DATA_LAG_DAYS);
  const lastStart = new Date(lastEnd);
  lastStart.setUTCDate(lastStart.getUTCDate() - WINDOW_DAYS);
  const priorEnd = new Date(lastStart);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - WINDOW_DAYS);
  return {
    lastStart: formatDate(lastStart),
    lastEnd: formatDate(lastEnd),
    priorStart: formatDate(priorStart),
    priorEnd: formatDate(priorEnd),
  };
}

function normalizeForMatch(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

type GscPageSignal = {
  topQuery: string | null;
  clicksLast90: number;
  impressionsLast90: number;
  clicksPrior90: number;
  impressionsPrior90: number;
};

/**
 * Two GSC calls total (page+query for the last window, page-only for the
 * prior window) rather than one per audited page — cheaper, and GSC has no
 * endpoint for querying two disjoint date ranges at once. `null` means GSC
 * isn't connected or the read failed; callers degrade every page's decay
 * signal to "insufficient_data" rather than failing the whole audit.
 */
async function loadGscSignals(
  projectId: string,
  urls: string[],
): Promise<Map<string, GscPageSignal> | null> {
  const connection = await GscService.getConnection(projectId);
  if (!connection) return null;

  const windows = computeWindows();
  let lastRows: Awaited<ReturnType<typeof GscService.getPerformance>>["rows"];
  let priorRows: Awaited<ReturnType<typeof GscService.getPerformance>>["rows"];
  try {
    [{ rows: lastRows }, { rows: priorRows }] = await Promise.all([
      GscService.getPerformance({
        projectId,
        dimensions: ["page", "query"],
        startDate: windows.lastStart,
        endDate: windows.lastEnd,
        rowLimit: GSC_ROW_LIMIT,
      }),
      GscService.getPerformance({
        projectId,
        dimensions: ["page"],
        startDate: windows.priorStart,
        endDate: windows.priorEnd,
        rowLimit: GSC_ROW_LIMIT,
      }),
    ]);
  } catch (error) {
    if (error instanceof GscNotConnectedError) return null;
    // A token/reconnect failure degrades this to "no GSC signal" rather than
    // failing the whole audit — word count/title/H1 checks still run fine.
    console.warn("content-audit.gsc-signal-load failed:", error);
    return null;
  }

  const lastByPage = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      topQuery: string | null;
      topQueryClicks: number;
    }
  >();
  for (const row of lastRows) {
    const page = row.keys?.[0];
    const query = row.keys?.[1];
    if (!page) continue;
    const key = normalizeForMatch(page);
    const entry = lastByPage.get(key) ?? {
      clicks: 0,
      impressions: 0,
      topQuery: null,
      topQueryClicks: -1,
    };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    if (query && row.clicks > entry.topQueryClicks) {
      entry.topQuery = query;
      entry.topQueryClicks = row.clicks;
    }
    lastByPage.set(key, entry);
  }

  const priorByPage = new Map<
    string,
    { clicks: number; impressions: number }
  >();
  for (const row of priorRows) {
    const page = row.keys?.[0];
    if (!page) continue;
    const key = normalizeForMatch(page);
    const entry = priorByPage.get(key) ?? { clicks: 0, impressions: 0 };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    priorByPage.set(key, entry);
  }

  const result = new Map<string, GscPageSignal>();
  for (const url of urls) {
    const key = normalizeForMatch(url);
    const last = lastByPage.get(key);
    const prior = priorByPage.get(key);
    if (!last && !prior) continue;
    result.set(url, {
      topQuery: last?.topQuery ?? null,
      clicksLast90: last?.clicks ?? 0,
      impressionsLast90: last?.impressions ?? 0,
      clicksPrior90: prior?.clicks ?? 0,
      impressionsPrior90: prior?.impressions ?? 0,
    });
  }
  return result;
}

type ContentAuditPageResult = {
  url: string;
  statusCode: number | null;
  fetchError: string | null;
  title: string | null;
  h1: string | null;
  wordCount: number | null;
  targetKeyword: string | null;
  targetKeywordSource: "manual" | "gsc" | null;
  keywordInTitle: boolean | null;
  keywordInH1: boolean | null;
  isThin: boolean;
  clicksLast90: number | null;
  clicksPrior90: number | null;
  impressionsLast90: number | null;
  impressionsPrior90: number | null;
  clicksChangePct: number | null;
  decayStatus: DecayStatus | null;
  flags: PageFlag[];
};

type ContentAuditResult = {
  auditId: string;
  gscConnected: boolean;
  pages: ContentAuditPageResult[];
  createdAt: string;
};

function scorePage(
  fetched: ContentPageFetchResult,
  targetKeywords: Map<string, string>,
  gscSignals: Map<string, GscPageSignal> | null,
): ContentAuditPageResult {
  const gsc = gscSignals?.get(fetched.url) ?? null;
  const manualKeyword = targetKeywords.get(fetched.url) ?? null;
  const targetKeyword = manualKeyword ?? gsc?.topQuery ?? null;
  const targetKeywordSource: "manual" | "gsc" | null = manualKeyword
    ? "manual"
    : gsc?.topQuery
      ? "gsc"
      : null;

  const fetchFailed = fetched.fetchError != null;
  const isThin = isThinContent(fetched.wordCount);
  const keywordInTitle = fetchFailed
    ? null
    : containsKeyword(fetched.title, targetKeyword);
  const keywordInH1 = fetchFailed
    ? null
    : containsKeyword(fetched.h1, targetKeyword);
  const decay = computeDecaySignal(
    gsc
      ? { clicksLast90: gsc.clicksLast90, clicksPrior90: gsc.clicksPrior90 }
      : null,
  );

  return {
    url: fetched.url,
    statusCode: fetched.statusCode,
    fetchError: fetched.fetchError,
    title: fetched.title,
    h1: fetched.h1,
    wordCount: fetched.wordCount,
    targetKeyword,
    targetKeywordSource,
    keywordInTitle,
    keywordInH1,
    isThin,
    clicksLast90: gsc?.clicksLast90 ?? null,
    clicksPrior90: gsc?.clicksPrior90 ?? null,
    impressionsLast90: gsc?.impressionsLast90 ?? null,
    impressionsPrior90: gsc?.impressionsPrior90 ?? null,
    clicksChangePct: decay.changePct,
    decayStatus: fetchFailed ? null : decay.status,
    flags: buildPageFlags({
      fetchFailed,
      isThin,
      keywordInTitle,
      keywordInH1,
      decayStatus: decay.status,
    }),
  };
}

async function run(input: {
  projectId: string;
  userId: string;
  urls?: string[];
  targetKeywords?: Record<string, string>;
}): Promise<ContentAuditResult> {
  let urls = input.urls;
  if (!urls || urls.length === 0) {
    const keyPages = await ProjectContextRepository.listKeyPages(
      input.projectId,
    );
    urls = keyPages.map((page) => page.url);
  }
  // Dedupe while preserving order, then cap.
  urls = [...new Set(urls)].slice(0, MAX_AUDIT_PAGES);

  if (urls.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "No pages to audit. Add key pages to this project, or pass an explicit list of URLs.",
    );
  }

  const targetKeywords = new Map(Object.entries(input.targetKeywords ?? {}));

  const [fetchedPages, gscSignals] = await Promise.all([
    fetchContentPages(urls),
    loadGscSignals(input.projectId, urls),
  ]);

  const pages = fetchedPages.map((fetched) =>
    scorePage(fetched, targetKeywords, gscSignals),
  );

  const auditId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await ContentRepository.createAudit({
    id: auditId,
    projectId: input.projectId,
    createdByUserId: input.userId,
    pageCount: pages.length,
  });
  await ContentRepository.insertAuditPages(
    pages.map((page) => ({
      id: crypto.randomUUID(),
      auditId,
      url: page.url,
      statusCode: page.statusCode,
      fetchError: page.fetchError,
      title: page.title,
      h1: page.h1,
      wordCount: page.wordCount,
      targetKeyword: page.targetKeyword,
      targetKeywordSource: page.targetKeywordSource,
      keywordInTitle: page.keywordInTitle,
      keywordInH1: page.keywordInH1,
      isThin: page.isThin,
      clicksLast90: page.clicksLast90,
      clicksPrior90: page.clicksPrior90,
      impressionsLast90: page.impressionsLast90,
      impressionsPrior90: page.impressionsPrior90,
      clicksChangePct: page.clicksChangePct,
      decayStatus: page.decayStatus,
      flagsJson: JSON.stringify(page.flags),
    })),
  );

  return { auditId, gscConnected: gscSignals != null, pages, createdAt };
}

async function getAudit(
  auditId: string,
  projectId: string,
): Promise<ContentAuditResult | null> {
  const audit = await ContentRepository.getAudit(auditId, projectId);
  if (!audit) return null;
  const rows = await ContentRepository.getAuditPages(auditId);
  return {
    auditId: audit.id,
    gscConnected: rows.some((row) => row.decayStatus != null),
    createdAt: audit.createdAt,
    pages: rows.map((row) => ({
      url: row.url,
      statusCode: row.statusCode,
      fetchError: row.fetchError,
      title: row.title,
      h1: row.h1,
      wordCount: row.wordCount,
      targetKeyword: row.targetKeyword,
      targetKeywordSource: row.targetKeywordSource,
      keywordInTitle: row.keywordInTitle,
      keywordInH1: row.keywordInH1,
      isThin: row.isThin,
      clicksLast90: row.clicksLast90,
      clicksPrior90: row.clicksPrior90,
      impressionsLast90: row.impressionsLast90,
      impressionsPrior90: row.impressionsPrior90,
      clicksChangePct: row.clicksChangePct,
      decayStatus: row.decayStatus,
      flags: decodePageFlags(row.flagsJson),
    })),
  };
}

type ContentAuditSummary = {
  auditId: string;
  pageCount: number;
  createdAt: string;
};

async function listAudits(projectId: string): Promise<ContentAuditSummary[]> {
  const rows = await ContentRepository.listAudits(projectId);
  return rows.map((row) => ({
    auditId: row.id,
    pageCount: row.pageCount,
    createdAt: row.createdAt,
  }));
}

export const ContentAuditService = {
  run,
  getAudit,
  listAudits,
  MAX_AUDIT_PAGES,
};
