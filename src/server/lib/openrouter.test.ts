import { describe, expect, it, vi } from "vitest";

interface CapturedSettings {
  extraBody?: { reasoning?: { effort: string } };
  reasoning?: { effort: string };
  provider?: { zdr?: boolean };
  models?: string[];
}

const openrouterCalls: Array<[string, CapturedSettings]> = [];
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => (modelId: string, settings: CapturedSettings) => {
    openrouterCalls.push([modelId, settings]);
    return { modelId, settings };
  },
}));

import { buildChatAgentModel } from "@/server/lib/openrouter";

describe("buildChatAgentModel", () => {
  it("forces max reasoning effort for the paid default model", () => {
    openrouterCalls.length = 0;
    buildChatAgentModel("key", "openai/gpt-5.6-luna");
    const [, settings] = openrouterCalls[0];
    expect(settings).toMatchObject({
      extraBody: { reasoning: { effort: "max" } },
    });
  });

  it("routes MiniMax M3 through ZDR providers with medium reasoning", () => {
    openrouterCalls.length = 0;
    buildChatAgentModel("key", "minimax/minimax-m3");
    const [, settings] = openrouterCalls[0];
    expect(settings).toMatchObject({
      reasoning: { effort: "medium" },
      provider: { zdr: true },
    });
  });

  it("configures the free auto-router without a forced reasoning effort, with fallbacks", () => {
    openrouterCalls.length = 0;
    buildChatAgentModel("key", "openrouter/free");
    const [, settings] = openrouterCalls[0];
    expect(settings.extraBody).toBeUndefined();
    expect(settings.reasoning).toBeUndefined();
    expect(settings.models?.length).toBeGreaterThan(0);
  });

  it("treats any :free-suffixed model as a free model", () => {
    openrouterCalls.length = 0;
    buildChatAgentModel("key", "qwen/qwen3-coder:free");
    const [, settings] = openrouterCalls[0];
    expect(settings.extraBody).toBeUndefined();
    expect(settings.models?.length).toBeGreaterThan(0);
  });
});
