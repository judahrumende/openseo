import { z } from "zod";
import { generateObject } from "ai";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  assertUsageCreditsAvailable,
  getOrCreateOrganizationCustomer,
  trackUsageCreditSpend,
} from "@/server/billing/subscription";
import { openRouterCostUsd } from "@/server/lib/chatAgent";
import { buildChatAgentModel } from "@/server/lib/openrouter";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";
import { AdvertisingRepository } from "@/server/features/advertising/repositories/AdvertisingRepository";
import { decodeAdCopyVariants } from "@/server/features/advertising/advertisingJsonCodecs";
import type { JsonRecord } from "@/shared/json";

const OPENROUTER_KEY_MISSING_MESSAGE =
  "This feature needs an OpenRouter API key. Set OPENROUTER_API_KEY for this deployment and try again.";

// Google Responsive Search Ads character limits — headline 30, description
// 90 — used as soft guidance in the prompt and a hard cap on the schema so a
// generated variant can't come back unusable.
const HEADLINE_MAX_LENGTH = 30;
const DESCRIPTION_MAX_LENGTH = 90;

const adCopyLlmSchema = z.object({
  variants: z
    .array(
      z.object({
        headline: z
          .string()
          .min(1)
          .max(HEADLINE_MAX_LENGTH)
          .describe(
            `Google Ads-style headline, <=${HEADLINE_MAX_LENGTH} characters.`,
          ),
        description: z
          .string()
          .min(1)
          .max(DESCRIPTION_MAX_LENGTH)
          .describe(
            `Google Ads-style description line, <=${DESCRIPTION_MAX_LENGTH} characters.`,
          ),
      }),
    )
    .min(3)
    .max(5)
    .describe("3-5 distinct headline/description variants."),
});

type AdCopyLlmOutput = z.infer<typeof adCopyLlmSchema>;

type AdCopyDraftResult = {
  draftId: string;
  targetKeyword: string;
  variants: AdCopyLlmOutput["variants"];
  modelUsed: string | null;
  inspirationSearchId: string | null;
  createdAt: string;
};

function isEnabled(): Promise<boolean> {
  return getOptionalEnvValue("OPENROUTER_API_KEY").then(Boolean);
}

/** Reads plausible ad-creative text fields off a raw ads_search row (see
 *  ads-transparency.ts for why the shape is unverified) — never throws on a
 *  missing/renamed field. */
function extractAdCreativeText(row: JsonRecord): string | null {
  const title =
    typeof row.title === "string"
      ? row.title
      : typeof row.headline === "string"
        ? row.headline
        : null;
  const description =
    typeof row.description === "string" ? row.description : null;
  const parts = [title, description].filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : null;
}

function buildPrompt(input: {
  targetKeyword: string;
  competitorAdCopy: string[];
}): string {
  const lines = [
    `Write Google Ads Responsive Search Ad copy for the keyword "${input.targetKeyword}".`,
    `Each headline must be ${HEADLINE_MAX_LENGTH} characters or fewer; each description ${DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    "Make each variant distinct in angle (e.g. price/value, urgency, product benefit, trust/social proof) rather than rephrasing the same idea.",
  ];
  if (input.competitorAdCopy.length > 0) {
    lines.push(
      "Ad copy currently running for this keyword, for inspiration — do not copy it verbatim:",
      ...input.competitorAdCopy.map((text) => `- ${text}`),
    );
  }
  return lines.join("\n");
}

async function generateAdCopyContent(prompt: string): Promise<{
  output: AdCopyLlmOutput;
  providerMetadata: unknown;
  modelId: string;
}> {
  const apiKey = await getOptionalEnvValue("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new AppError(
      "AI_FEATURE_NOT_CONFIGURED",
      OPENROUTER_KEY_MISSING_MESSAGE,
    );
  }
  const modelId = await getOptionalEnvValue("OPENROUTER_MODEL");
  const model = buildChatAgentModel(apiKey, modelId);
  const result = await generateObject({
    model,
    schema: adCopyLlmSchema,
    prompt,
  });
  return {
    output: result.object,
    providerMetadata: result.providerMetadata,
    modelId: model.modelId,
  };
}

/** Gates and meters the LLM spend the same way ContentBriefService does
 *  (src/server/features/content/services/ContentBriefService.ts). */
async function withLlmMetering<T>(
  billingCustomer: BillingCustomerContext,
  execute: () => Promise<{ result: T; providerMetadata: unknown }>,
): Promise<T> {
  const hosted = await isHostedServerAuthMode();
  if (!hosted) {
    const { result } = await execute();
    return result;
  }
  const customer = await getOrCreateOrganizationCustomer(billingCustomer);
  const { monthlyRemaining } = await assertUsageCreditsAvailable(customer.id);
  const { result, providerMetadata } = await execute();
  await trackUsageCreditSpend({
    customer: billingCustomer,
    customerId: customer.id,
    creditFeature: "agent",
    costUsd: openRouterCostUsd(providerMetadata),
    monthlyRemaining,
    properties: { provider: "openrouter", feature: "ad_copy_draft" },
  });
  return result;
}

async function generate(
  input: {
    projectId: string;
    targetKeyword: string;
    inspirationSearchId?: string;
    userId: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<AdCopyDraftResult> {
  if (!(await isEnabled())) {
    throw new AppError(
      "AI_FEATURE_NOT_CONFIGURED",
      OPENROUTER_KEY_MISSING_MESSAGE,
    );
  }

  let competitorAdCopy: string[] = [];
  if (input.inspirationSearchId) {
    const inspiration = await AdvertisingRepository.getAdCopySearch(
      input.inspirationSearchId,
      input.projectId,
    );
    if (!inspiration) {
      throw new AppError(
        "NOT_FOUND",
        "Ad copy search not found for this project",
      );
    }
    let ads: unknown;
    try {
      ads = JSON.parse(inspiration.adsJson);
    } catch {
      ads = [];
    }
    competitorAdCopy = Array.isArray(ads)
      ? ads
          .filter(
            (row): row is JsonRecord => row !== null && typeof row === "object",
          )
          .map(extractAdCreativeText)
          .filter((text): text is string => text != null)
          .slice(0, 10)
      : [];
  }

  const prompt = buildPrompt({
    targetKeyword: input.targetKeyword,
    competitorAdCopy,
  });

  const { output, modelId } = await withLlmMetering(billingCustomer, () =>
    generateAdCopyContent(prompt).then(
      ({ output: obj, providerMetadata, modelId: model }) => ({
        result: { output: obj, modelId: model },
        providerMetadata,
      }),
    ),
  );

  const draftId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await AdvertisingRepository.createAdCopyDraft({
    id: draftId,
    projectId: input.projectId,
    targetKeyword: input.targetKeyword,
    inspirationSearchId: input.inspirationSearchId ?? null,
    variantsJson: JSON.stringify(output.variants),
    modelUsed: modelId,
    createdByUserId: input.userId,
  });

  return {
    draftId,
    targetKeyword: input.targetKeyword,
    variants: output.variants,
    modelUsed: modelId,
    inspirationSearchId: input.inspirationSearchId ?? null,
    createdAt,
  };
}

async function getDraft(
  draftId: string,
  projectId: string,
): Promise<AdCopyDraftResult | null> {
  const row = await AdvertisingRepository.getAdCopyDraft(draftId, projectId);
  if (!row) return null;
  return {
    draftId: row.id,
    targetKeyword: row.targetKeyword,
    variants: decodeAdCopyVariants(row.variantsJson),
    modelUsed: row.modelUsed,
    inspirationSearchId: row.inspirationSearchId,
    createdAt: row.createdAt,
  };
}

type AdCopyDraftSummary = {
  draftId: string;
  targetKeyword: string;
  createdAt: string;
};

async function listDrafts(projectId: string): Promise<AdCopyDraftSummary[]> {
  const rows = await AdvertisingRepository.listAdCopyDrafts(projectId);
  return rows.map((row) => ({
    draftId: row.id,
    targetKeyword: row.targetKeyword,
    createdAt: row.createdAt,
  }));
}

export const AdCopyGenerationService = {
  isEnabled,
  generate,
  getDraft,
  listDrafts,
};
