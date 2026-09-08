import { beforeEach, describe, expect, it, vi } from "vitest";
import { researchContentTopicsTool } from "./research-content-topics";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  research: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/content/services/TopicResearchService", () => ({
  TopicResearchService: { research: mocks.research },
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

const researchResult = {
  runId: "run_1",
  seedKeyword: "electric bike",
  locationCode: 2840,
  languageCode: "en",
  questions: ["How much does an electric bike cost?"],
  relatedSearches: ["best electric bike 2026"],
  clusters: [
    {
      id: "cluster_1",
      label: "battery",
      intent: "informational",
      totalSearchVolume: 800,
      keywords: [
        {
          keyword: "electric bike battery",
          searchVolume: 500,
          cpc: 1.2,
          keywordDifficulty: 30,
        },
      ],
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("research_content_topics MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
    mocks.research.mockResolvedValue(researchResult);
  });

  it("resolves the project's market and returns the clustered research", async () => {
    const result = await researchContentTopicsTool.handler(
      { projectId: "project_1", seedKeyword: "electric bike" },
      toolContext,
    );

    expect(mocks.research).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        seedKeyword: "electric bike",
        locationCode: 2840,
        languageCode: "en",
        userId: "user_123",
      },
      expect.objectContaining({
        organizationId: "org_123",
        projectId: "project_1",
      }),
    );
    expect(result.structuredContent).toMatchObject(researchResult);
    expect(textContent(result)).toContain("battery");
    expect(textContent(result)).toContain("run_1");
  });

  it("rejects a project the caller's organization can't access", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);

    await expect(
      researchContentTopicsTool.handler(
        { projectId: "project_missing", seedKeyword: "electric bike" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.research).not.toHaveBeenCalled();
  });
});
