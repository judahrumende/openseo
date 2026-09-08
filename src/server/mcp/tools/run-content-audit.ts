import { z } from "zod";
import { ContentAuditService } from "@/server/features/content/services/ContentAuditService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  urls: z
    .array(z.string().min(1).max(2048))
    .max(ContentAuditService.MAX_AUDIT_PAGES)
    .optional()
    .describe(
      `Explicit URLs to audit (max ${ContentAuditService.MAX_AUDIT_PAGES}). Omit to use the project's saved key pages (see get_project_context / update_project_context).`,
    ),
  targetKeywords: z
    .record(z.string(), z.string().min(1).max(200))
    .optional()
    .describe(
      "Optional map of url -> target keyword to score title/H1 against. A page without an entry here uses its top Search Console query when Search Console is connected for this project; otherwise its keyword checks are skipped.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const runContentAuditTool = {
  name: "run_content_audit",
  config: {
    title: "Run content audit",
    description:
      "Scores a project's pages for content health: thin content (word count below 300), whether the target keyword appears in the title/H1, and a decay signal (Search Console clicks/impressions over the last 90 days vs the prior 90 days). Free — no DataForSEO credits; uses the app's own page fetcher and, when connected, Search Console. Uses the project's saved key pages when no urls are given. Call this after generate_content_brief or research_content_topics to check whether existing content already covers a topic before writing something new.",
    inputSchema,
    outputSchema: {
      auditId: z.string(),
      gscConnected: z.boolean(),
      pages: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await ContentAuditService.run({
      projectId: args.projectId,
      userId: context.auth.userId,
      urls: args.urls,
      targetKeywords: args.targetKeywords,
    });

    const flaggedCount = result.pages.filter(
      (page) => page.flags.length > 0,
    ).length;
    const text = [
      `Content audit ${result.auditId}: ${result.pages.length} pages, ${flaggedCount} flagged.`,
      result.gscConnected
        ? "Search Console connected — decay signal included."
        : "Search Console not connected — decay signal unavailable for every page.",
      "",
      ...result.pages.map((page) => {
        if (page.fetchError)
          return `- ${page.url}: FETCH FAILED (${page.fetchError})`;
        const flagsText =
          page.flags.length > 0 ? page.flags.join(", ") : "none";
        return `- ${page.url}: ${page.wordCount ?? "?"} words, target keyword "${page.targetKeyword ?? "unknown"}" (in title: ${page.keywordInTitle ?? "?"}, in H1: ${page.keywordInH1 ?? "?"}), decay: ${page.decayStatus ?? "n/a"}, flags: ${flagsText}`;
      }),
    ].join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/content/audit`,
      ),
      structuredContent: result,
    });
  }),
};
