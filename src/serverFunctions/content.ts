import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { resolveLabsMarket } from "@/shared/keyword-locations";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { TopicResearchService } from "@/server/features/content/services/TopicResearchService";
import { ContentBriefService } from "@/server/features/content/services/ContentBriefService";
import { ContentAuditService } from "@/server/features/content/services/ContentAuditService";
import {
  contentAuditInputSchema,
  contentBriefInputSchema,
  getContentAuditSchema,
  getContentBriefSchema,
  getTopicResearchRunSchema,
  listContentAuditsSchema,
  listContentBriefsSchema,
  listTopicResearchRunsSchema,
  topicResearchInputSchema,
} from "@/types/schemas/content";

const CONTENT_AI_SETUP_MESSAGE =
  "Content Brief needs an OpenRouter API key. Create a key on OpenRouter, set it as the OPENROUTER_API_KEY environment variable, restart OpenSEO, then confirm here.";

// ---------------------------------------------------------------------------
// Topic Research
// ---------------------------------------------------------------------------

export const runTopicResearch = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(topicResearchInputSchema)
  .handler(async ({ data, context }) =>
    TopicResearchService.research(
      {
        projectId: context.projectId,
        seedKeyword: data.seedKeyword,
        ...resolveLabsMarket(data, context.project),
        userId: context.userId,
      },
      context,
    ),
  );

export const getTopicResearchRun = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getTopicResearchRunSchema)
  .handler(async ({ data, context }) =>
    TopicResearchService.getRun(data.runId, context.projectId),
  );

export const listTopicResearchRuns = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listTopicResearchRunsSchema)
  .handler(async ({ context }) =>
    TopicResearchService.listRuns(context.projectId),
  );

// ---------------------------------------------------------------------------
// Content Brief / Writing Assistant
// ---------------------------------------------------------------------------

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

type ContentBriefSetupStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

// Gates the Content Brief UI on an OpenRouter key being configured, mirroring
// getSamAccessSetupStatus (src/serverFunctions/samAccess.ts): hosted
// deployments always have the key provisioned, so only self-hosted is checked.
export const getContentBriefSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<ContentBriefSetupStatus> => {
    if (await isHostedServerAuthMode()) {
      return { enabled: true, errorMessage: null };
    }
    const enabled = Boolean(await getOptionalEnvValue("OPENROUTER_API_KEY"));
    return { enabled, errorMessage: enabled ? null : CONTENT_AI_SETUP_MESSAGE };
  });

export const generateContentBrief = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(contentBriefInputSchema)
  .handler(async ({ data, context }) =>
    ContentBriefService.generate(
      {
        projectId: context.projectId,
        targetKeyword: data.targetKeyword,
        topicResearchRunId: data.topicResearchRunId,
        ...resolveLabsMarket(data, context.project),
        userId: context.userId,
      },
      context,
    ),
  );

export const getContentBrief = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getContentBriefSchema)
  .handler(async ({ data, context }) =>
    ContentBriefService.getBrief(data.briefId, context.projectId),
  );

export const listContentBriefs = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listContentBriefsSchema)
  .handler(async ({ context }) =>
    ContentBriefService.listBriefs(context.projectId),
  );

// ---------------------------------------------------------------------------
// Content Audit
// ---------------------------------------------------------------------------

export const runContentAudit = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(contentAuditInputSchema)
  .handler(async ({ data, context }) =>
    ContentAuditService.run({
      projectId: context.projectId,
      userId: context.userId,
      urls: data.urls,
      targetKeywords: data.targetKeywords,
    }),
  );

export const getContentAudit = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getContentAuditSchema)
  .handler(async ({ data, context }) =>
    ContentAuditService.getAudit(data.auditId, context.projectId),
  );

export const listContentAudits = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listContentAuditsSchema)
  .handler(async ({ context }) =>
    ContentAuditService.listAudits(context.projectId),
  );
