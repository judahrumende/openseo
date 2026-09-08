import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { generateContentBriefTool } from "./generate-content-brief";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/content/services/ContentBriefService", () => ({
  ContentBriefService: { generate: mocks.generate },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();
const usProjectRow = {
  id: "project_1",
  locationCode: 2840,
  languageCode: "en",
};

const briefResult = {
  briefId: "brief_1",
  targetKeyword: "electric bike battery",
  locationCode: 2840,
  languageCode: "en",
  titleOptions: ["The Complete Guide to Electric Bike Batteries"],
  targetWordCount: 1800,
  competitorAvgWordCount: 1636,
  competitorSampleSize: 4,
  outline: [
    { level: "h2" as const, heading: "How electric bike batteries work" },
  ],
  entities: ["lithium-ion", "watt-hours"],
  targetReadingLevel: "Grade 7-8",
  modelUsed: "openai/gpt-5.6-luna",
  topicResearchRunId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("generate_content_brief MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
    mocks.generate.mockResolvedValue(briefResult);
  });

  it("resolves the project's market and returns the generated brief", async () => {
    const result = await generateContentBriefTool.handler(
      { projectId: "project_1", targetKeyword: "electric bike battery" },
      toolContext,
    );

    expect(mocks.generate).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        targetKeyword: "electric bike battery",
        topicResearchRunId: undefined,
        locationCode: 2840,
        languageCode: "en",
        userId: "user_123",
      },
      expect.objectContaining({
        organizationId: "org_123",
        projectId: "project_1",
      }),
    );
    expect(result.structuredContent).toMatchObject(briefResult);
    expect(textContent(result)).toContain("brief_1");
    expect(textContent(result)).toContain("How electric bike batteries work");
  });

  it("forwards an explicit topicResearchRunId", async () => {
    await generateContentBriefTool.handler(
      {
        projectId: "project_1",
        targetKeyword: "electric bike battery",
        topicResearchRunId: "run_1",
      },
      toolContext,
    );

    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ topicResearchRunId: "run_1" }),
      expect.anything(),
    );
  });

  it("surfaces AI_FEATURE_NOT_CONFIGURED when OpenRouter isn't set up", async () => {
    mocks.generate.mockRejectedValue(
      new AppError(
        "AI_FEATURE_NOT_CONFIGURED",
        "OpenRouter API key not configured",
      ),
    );

    await expect(
      generateContentBriefTool.handler(
        { projectId: "project_1", targetKeyword: "electric bike battery" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "AI_FEATURE_NOT_CONFIGURED" });
  });
});
