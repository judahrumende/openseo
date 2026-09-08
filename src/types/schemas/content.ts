import { z } from "zod";

export const topicResearchInputSchema = z.object({
  projectId: z.string().uuid(),
  seedKeyword: z.string().min(1).max(200),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

export const getTopicResearchRunSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().min(1),
});

export const listTopicResearchRunsSchema = z.object({
  projectId: z.string().uuid(),
});

export const contentBriefInputSchema = z.object({
  projectId: z.string().uuid(),
  targetKeyword: z.string().min(1).max(200),
  topicResearchRunId: z.string().min(1).optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

export const getContentBriefSchema = z.object({
  projectId: z.string().uuid(),
  briefId: z.string().min(1),
});

export const listContentBriefsSchema = z.object({
  projectId: z.string().uuid(),
});

export const contentAuditInputSchema = z.object({
  projectId: z.string().uuid(),
  urls: z.array(z.string().min(1).max(2048)).max(20).optional(),
  targetKeywords: z.record(z.string(), z.string().min(1).max(200)).optional(),
});

export const getContentAuditSchema = z.object({
  projectId: z.string().uuid(),
  auditId: z.string().min(1),
});

export const listContentAuditsSchema = z.object({
  projectId: z.string().uuid(),
});

// URL search params for /p/$projectId/content/briefs — lets Topic Research's
// "brief this cluster" action deep-link into a pre-filled form.
export const contentBriefSearchSchema = z.object({
  keyword: z.string().optional().catch(undefined),
  runId: z.string().optional().catch(undefined),
});
