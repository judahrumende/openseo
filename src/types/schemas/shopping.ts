import { z } from "zod";

export const searchShoppingProductsInputSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().min(1).max(200),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
  depth: z.number().int().min(10).max(100).optional(),
});

export const getShoppingProductsSearchSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().min(1),
});

export const listShoppingProductSearchesSchema = z.object({
  projectId: z.string().uuid(),
});

export const getShoppingDomainOverviewInputSchema = z.object({
  projectId: z.string().uuid(),
  targetDomain: z.string().min(1).max(253).optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

export const pollShoppingDomainOverviewSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().min(1),
});

export const listShoppingDomainOverviewsSchema = z.object({
  projectId: z.string().uuid(),
});
