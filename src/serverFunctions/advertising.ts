import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { resolveMarket } from "@/shared/keyword-locations";
import { AdvertisingResearchService } from "@/server/features/advertising/services/AdvertisingResearchService";
import { AdCopyGenerationService } from "@/server/features/advertising/services/AdCopyGenerationService";
import {
  generateAdCopyInputSchema,
  getAdAdvertiserSearchSchema,
  getAdCopyDraftSchema,
  getAdCopySearchSchema,
  listAdAdvertiserSearchesSchema,
  listAdCopyDraftsSchema,
  listAdCopySearchesSchema,
  searchAdAdvertisersInputSchema,
  searchAdCopyInputSchema,
} from "@/types/schemas/advertising";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

const AD_COPY_AI_SETUP_MESSAGE =
  "AI Ad Copy needs an OpenRouter API key. Create a key on OpenRouter, set it as the OPENROUTER_API_KEY environment variable, restart OpenSEO, then confirm here.";

// ---------------------------------------------------------------------------
// Competitor advertiser / ad copy research (ads_advertisers, ads_search)
// ---------------------------------------------------------------------------

export const searchAdAdvertisers = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchAdAdvertisersInputSchema)
  .handler(async ({ data, context }) =>
    AdvertisingResearchService.searchAdvertisers(
      {
        projectId: context.projectId,
        keyword: data.keyword,
        userId: context.userId,
        ...resolveMarket(data, context.project),
      },
      context,
    ),
  );

export const getAdAdvertiserSearch = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getAdAdvertiserSearchSchema)
  .handler(async ({ data, context }) =>
    AdvertisingResearchService.getAdvertiserSearch(
      data.searchId,
      context.projectId,
    ),
  );

export const listAdAdvertiserSearches = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listAdAdvertiserSearchesSchema)
  .handler(async ({ context }) =>
    AdvertisingResearchService.listAdvertiserSearches(context.projectId),
  );

export const searchAdCopy = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchAdCopyInputSchema)
  .handler(async ({ data, context }) =>
    AdvertisingResearchService.searchAdCopy(
      {
        projectId: context.projectId,
        advertiserIds: data.advertiserIds,
        advertiserSearchId: data.advertiserSearchId,
        userId: context.userId,
        ...resolveMarket(data, context.project),
      },
      context,
    ),
  );

export const getAdCopySearch = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getAdCopySearchSchema)
  .handler(async ({ data, context }) =>
    AdvertisingResearchService.getAdCopySearch(
      data.searchId,
      context.projectId,
    ),
  );

export const listAdCopySearches = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listAdCopySearchesSchema)
  .handler(async ({ context }) =>
    AdvertisingResearchService.listAdCopySearches(context.projectId),
  );

// ---------------------------------------------------------------------------
// AI-generated ad copy
// ---------------------------------------------------------------------------

type AdCopySetupStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

// Gates the AI Ad Copy UI on an OpenRouter key being configured, mirroring
// getContentBriefSetupStatus (src/serverFunctions/content.ts): hosted
// deployments always have the key provisioned, so only self-hosted is checked.
export const getAdCopySetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<AdCopySetupStatus> => {
    if (await isHostedServerAuthMode()) {
      return { enabled: true, errorMessage: null };
    }
    const enabled = Boolean(await getOptionalEnvValue("OPENROUTER_API_KEY"));
    return { enabled, errorMessage: enabled ? null : AD_COPY_AI_SETUP_MESSAGE };
  });

export const generateAdCopy = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(generateAdCopyInputSchema)
  .handler(async ({ data, context }) =>
    AdCopyGenerationService.generate(
      {
        projectId: context.projectId,
        targetKeyword: data.targetKeyword,
        inspirationSearchId: data.inspirationSearchId,
        userId: context.userId,
      },
      context,
    ),
  );

export const getAdCopyDraft = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getAdCopyDraftSchema)
  .handler(async ({ data, context }) =>
    AdCopyGenerationService.getDraft(data.draftId, context.projectId),
  );

export const listAdCopyDrafts = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listAdCopyDraftsSchema)
  .handler(async ({ context }) =>
    AdCopyGenerationService.listDrafts(context.projectId),
  );
