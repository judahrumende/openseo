import { z } from "zod";

export const searchAdAdvertisersInputSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().min(1).max(200),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

export const getAdAdvertiserSearchSchema = z.object({
  projectId: z.string().uuid(),
  searchId: z.string().min(1),
});

export const listAdAdvertiserSearchesSchema = z.object({
  projectId: z.string().uuid(),
});

export const searchAdCopyInputSchema = z.object({
  projectId: z.string().uuid(),
  advertiserIds: z.array(z.string().min(1)).min(1).max(20),
  advertiserSearchId: z.string().min(1).optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

export const getAdCopySearchSchema = z.object({
  projectId: z.string().uuid(),
  searchId: z.string().min(1),
});

export const listAdCopySearchesSchema = z.object({
  projectId: z.string().uuid(),
});

export const generateAdCopyInputSchema = z.object({
  projectId: z.string().uuid(),
  targetKeyword: z.string().min(1).max(200),
  inspirationSearchId: z.string().min(1).optional(),
});

export const getAdCopyDraftSchema = z.object({
  projectId: z.string().uuid(),
  draftId: z.string().min(1),
});

export const listAdCopyDraftsSchema = z.object({
  projectId: z.string().uuid(),
});

// URL search params for /p/$projectId/advertising/ad-copy — lets the
// competitor ad copy tab's "draft AI ad copy from this" action deep-link into
// a pre-filled form.
export const adCopyDraftSearchSchema = z.object({
  keyword: z.string().optional().catch(undefined),
  inspirationSearchId: z.string().optional().catch(undefined),
});
