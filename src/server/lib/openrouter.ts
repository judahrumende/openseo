import {
  createOpenRouter,
  type LanguageModelV3,
} from "@openrouter/ai-sdk-provider";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

// OpenRouter model slug used for the in-app chat agents (onboarding + SAM).
// Override with OPENROUTER_MODEL to swap models without a code change.
const DEFAULT_CHAT_AGENT_MODEL = "openai/gpt-5.6-luna";

// Previous default; kept reachable via OPENROUTER_MODEL for rollback. Its
// routing needs the ZDR/provider tuning below.
const MINIMAX_M3 = "minimax/minimax-m3";

// OpenRouter's auto-router: picks among currently-available $0 models,
// filtered for tool-calling support (required — SAM and the onboarding
// agent both call MCP tools). Point OPENROUTER_MODEL here for a genuinely
// free deployment.
const FREE_AUTOROUTER_MODEL = "openrouter/free";

// Named free fallbacks for the `models` array below. Free models rotate out
// of OpenRouter's catalog without warning; a short fallback list keeps a
// request from failing outright when the top pick is rate-limited or gone.
const FREE_FALLBACK_MODELS = [
  "qwen/qwen3-coder:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

function isFreeModel(model: string): boolean {
  return model === FREE_AUTOROUTER_MODEL || model.endsWith(":free");
}

export async function getChatAgentModel(): Promise<LanguageModelV3> {
  const apiKey = await getRequiredEnvValue("OPENROUTER_API_KEY");
  const modelId = await getOptionalEnvValue("OPENROUTER_MODEL");
  return buildChatAgentModel(apiKey, modelId);
}

/**
 * Returns the AI SDK LanguageModel for the chat agents. `usage: { include: true }`
 * turns on OpenRouter usage accounting so each response carries its real USD
 * cost (providerMetadata.openrouter.usage.cost) — which we meter against the
 * shared usage-credit pool.
 *
 * Default model: GPT-5.6 Luna at `reasoning.effort: "max"` — "max" is valid at
 * the OpenRouter API for GPT-5.x but missing from the SDK's effort union, so
 * the reasoning config rides in `extraBody`. Reasoning tokens stream on the
 * separate reasoning channel and are billed as output tokens, which the usage
 * accounting above captures.
 *
 * Sync on purpose: Think's `getModel()` hook is sync and runs on every turn,
 * so the SAM agent reads the key/model from its DO env and builds here.
 */
export function buildChatAgentModel(
  apiKey: string,
  modelId?: string,
): LanguageModelV3 {
  const model = modelId ?? DEFAULT_CHAT_AGENT_MODEL;
  const openrouter = createOpenRouter({ apiKey });

  // MiniMax M3 (env-override path only): `provider.order` prefers Together,
  // then Atlas Cloud (fp8); `zdr: true` restricts routing to Zero-Data-
  // Retention endpoints, which excludes MiniMax first-party — the account's
  // "Non-frontier requires ZDR" data policy enforces the same, this flag is
  // belt-and-braces. Fallbacks stay on within the ZDR set because pinning
  // providers caused a prod outage (Jul 2026: Together upstream-rate-limited
  // m3 and every chat turn 429'd). The explicit reasoning channel keeps m3's
  // `<think>` trace out of the visible answer text.
  if (model === MINIMAX_M3) {
    return openrouter(model, {
      usage: { include: true },
      reasoning: { effort: "medium" },
      provider: {
        order: ["together", "atlas-cloud/fp8"],
        zdr: true,
        allow_fallbacks: true,
      },
    });
  }

  // Free-tier models (env-override path): most don't support the paid
  // default's forced max-effort reasoning param and error or silently drop
  // it, so we skip `extraBody.reasoning` entirely here. `models` gives
  // OpenRouter a fallback chain so a rate-limited or delisted free model
  // doesn't fail the whole request.
  if (isFreeModel(model)) {
    return openrouter(model, {
      usage: { include: true },
      models: FREE_FALLBACK_MODELS,
      provider: { allow_fallbacks: true },
    });
  }

  return openrouter(model, {
    usage: { include: true },
    extraBody: { reasoning: { effort: "max" } },
  });
}
