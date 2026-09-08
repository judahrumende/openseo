import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import {
  getShoppingDomainOverviewTool,
  researchShoppingProductsTool,
} from "./shopping-tools";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  resume: vi.fn(),
  getOverview: vi.fn(),
  overviewResume: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/shopping/services/ShoppingProductsService", () => ({
  ShoppingProductsService: {
    search: mocks.search,
    resume: mocks.resume,
  },
  DEFAULT_PRODUCTS_DEPTH: 20,
  MAX_PRODUCTS_DEPTH: 100,
}));
vi.mock("@/server/features/shopping/services/ShoppingOverviewService", () => ({
  ShoppingOverviewService: {
    getOverview: mocks.getOverview,
    resume: mocks.overviewResume,
  },
}));
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

describe("research_shopping_products MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
  });

  it("rejects a call with neither keyword nor runId", async () => {
    await expect(
      researchShoppingProductsTool.handler(
        { projectId: "project_1" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("resolves the project's market and starts a new search", async () => {
    mocks.search.mockResolvedValue({
      runId: "run_1",
      status: "completed",
      keyword: "sim racing wheel",
      locationCode: 2036,
      languageCode: "en",
      listings: [
        {
          position: 1,
          title: "Wheel",
          sellerDomain: "hyperlabs.com.au",
          price: 499,
          currency: "AUD",
          isProjectDomain: true,
        },
      ],
      priceStats: {
        min: 499,
        max: 499,
        median: 499,
        currency: "AUD",
        sampleSize: 1,
      },
      errorMessage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await researchShoppingProductsTool.handler(
      { projectId: "project_1", keyword: "sim racing wheel" },
      toolContext,
    );

    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        keyword: "sim racing wheel",
        locationCode: 2036,
        languageCode: "en",
        projectDomain: "hyperlabs.com.au",
        userId: "user_123",
      }),
      expect.objectContaining({ organizationId: "org_123" }),
    );
    expect(textContent(result)).toContain("run_1");
    expect(textContent(result)).toContain("you");
    expect(result.structuredContent).toMatchObject({ status: "completed" });
  });

  it("resumes an existing run by runId instead of starting a new one", async () => {
    mocks.resume.mockResolvedValue({
      runId: "run_1",
      status: "processing",
      keyword: "",
      locationCode: 0,
      languageCode: "",
      listings: [],
      priceStats: null,
      errorMessage: null,
      createdAt: "",
    });

    const result = await researchShoppingProductsTool.handler(
      { projectId: "project_1", runId: "run_1" },
      toolContext,
    );

    expect(mocks.resume).toHaveBeenCalledWith(
      "run_1",
      "project_1",
      "hyperlabs.com.au",
    );
    expect(mocks.search).not.toHaveBeenCalled();
    expect(textContent(result)).toContain("run_1");
    expect(textContent(result)).toContain("Still collecting");
  });

  it("surfaces a failed run's error message", async () => {
    mocks.search.mockResolvedValue({
      runId: "run_2",
      status: "failed",
      keyword: "x",
      locationCode: 2036,
      languageCode: "en",
      listings: [],
      priceStats: null,
      errorMessage: "DataForSEO task failed (40000)",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await researchShoppingProductsTool.handler(
      { projectId: "project_1", keyword: "x" },
      toolContext,
    );

    expect(textContent(result)).toContain("DataForSEO task failed (40000)");
  });
});

describe("get_shopping_domain_overview MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
  });

  it("defaults targetDomain to the project's own domain", async () => {
    mocks.getOverview.mockResolvedValue({
      runId: "run_3",
      status: "completed",
      targetDomain: "hyperlabs.com.au",
      locationCode: 2036,
      languageCode: "en",
      overview: { some_field: 1 },
      errorMessage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await getShoppingDomainOverviewTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(mocks.getOverview).toHaveBeenCalledWith(
      expect.objectContaining({ targetDomain: "hyperlabs.com.au" }),
      expect.anything(),
    );
  });

  it("rejects when the project has no domain and none was given", async () => {
    mocks.getProjectForOrganization.mockResolvedValue({
      ...usProjectRow,
      domain: null,
    });

    await expect(
      getShoppingDomainOverviewTool.handler(
        { projectId: "project_1" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getOverview).not.toHaveBeenCalled();
  });

  it("resumes by runId without re-checking the project's domain", async () => {
    mocks.overviewResume.mockResolvedValue({
      runId: "run_3",
      status: "processing",
      targetDomain: "",
      locationCode: 0,
      languageCode: "",
      overview: null,
      errorMessage: null,
      createdAt: "",
    });

    await getShoppingDomainOverviewTool.handler(
      { projectId: "project_1", runId: "run_3" },
      toolContext,
    );

    expect(mocks.overviewResume).toHaveBeenCalledWith("run_3", "project_1");
    expect(mocks.getOverview).not.toHaveBeenCalled();
  });

  it("throws AppError instances from the service unchanged", async () => {
    mocks.getOverview.mockRejectedValue(new AppError("UPSTREAM_UNAVAILABLE"));

    await expect(
      getShoppingDomainOverviewTool.handler(
        { projectId: "project_1" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });
});
