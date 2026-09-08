import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import {
  generateAdCopyTool,
  getAdCopyTool,
  researchAdAdvertisersTool,
} from "./advertising-tools";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  searchAdvertisers: vi.fn(),
  searchAdCopy: vi.fn(),
  generate: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock(
  "@/server/features/advertising/services/AdvertisingResearchService",
  () => ({
    AdvertisingResearchService: {
      searchAdvertisers: mocks.searchAdvertisers,
      searchAdCopy: mocks.searchAdCopy,
    },
    extractAdvertiserId: (row: Record<string, unknown>) =>
      typeof row.advertiser_id === "string" ? row.advertiser_id : null,
    MAX_ADVERTISER_IDS_PER_SEARCH: 20,
  }),
);
vi.mock(
  "@/server/features/advertising/services/AdCopyGenerationService",
  () => ({
    AdCopyGenerationService: { generate: mocks.generate },
  }),
);
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();
const usProjectRow = {
  id: "project_1",
  domain: "hyperlabs.com.au",
  locationCode: 2036,
  languageCode: "en",
};

describe("research_ad_advertisers MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
  });

  it("resolves the project's market and lists advertisers", async () => {
    mocks.searchAdvertisers.mockResolvedValue({
      searchId: "search_1",
      keyword: "sim racing pedals",
      locationCode: 2036,
      languageCode: "en",
      advertisers: [
        {
          advertiser_id: "AR01",
          title: "Competitor Co",
          domain: "competitor.example",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await researchAdAdvertisersTool.handler(
      { projectId: "project_1", keyword: "sim racing pedals" },
      toolContext,
    );

    expect(mocks.searchAdvertisers).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        keyword: "sim racing pedals",
        locationCode: 2036,
        languageCode: "en",
        userId: "user_123",
      }),
      expect.objectContaining({ organizationId: "org_123" }),
    );
    expect(textContent(result)).toContain("AR01");
    expect(result.structuredContent).toMatchObject({ searchId: "search_1" });
  });

  it("reports no advertisers found without erroring", async () => {
    mocks.searchAdvertisers.mockResolvedValue({
      searchId: "search_2",
      keyword: "an obscure keyword",
      locationCode: 2036,
      languageCode: "en",
      advertisers: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await researchAdAdvertisersTool.handler(
      { projectId: "project_1", keyword: "an obscure keyword" },
      toolContext,
    );

    expect(textContent(result)).toContain("No advertisers found");
  });
});

describe("get_ad_copy MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
  });

  it("forwards advertiserIds and advertiserSearchId", async () => {
    mocks.searchAdCopy.mockResolvedValue({
      searchId: "search_3",
      advertiserIds: ["AR01"],
      ads: [{ title: "Best Pedals", description: "Free shipping" }],
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await getAdCopyTool.handler(
      {
        projectId: "project_1",
        advertiserIds: ["AR01"],
        advertiserSearchId: "search_1",
      },
      toolContext,
    );

    expect(mocks.searchAdCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        advertiserIds: ["AR01"],
        advertiserSearchId: "search_1",
      }),
      expect.anything(),
    );
  });
});

describe("generate_ad_copy MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
  });

  it("returns the generated variants", async () => {
    mocks.generate.mockResolvedValue({
      draftId: "draft_1",
      targetKeyword: "sim racing pedals",
      variants: [
        {
          headline: "Pro Sim Pedals",
          description: "Built for endurance racing.",
        },
      ],
      modelUsed: "openai/gpt-5.6-luna",
      inspirationSearchId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await generateAdCopyTool.handler(
      { projectId: "project_1", targetKeyword: "sim racing pedals" },
      toolContext,
    );

    expect(textContent(result)).toContain("Pro Sim Pedals");
    expect(result.structuredContent).toMatchObject({ draftId: "draft_1" });
  });

  it("surfaces AI_FEATURE_NOT_CONFIGURED when OpenRouter isn't set up", async () => {
    mocks.generate.mockRejectedValue(
      new AppError(
        "AI_FEATURE_NOT_CONFIGURED",
        "OpenRouter API key not configured",
      ),
    );

    await expect(
      generateAdCopyTool.handler(
        { projectId: "project_1", targetKeyword: "sim racing pedals" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "AI_FEATURE_NOT_CONFIGURED" });
  });
});
