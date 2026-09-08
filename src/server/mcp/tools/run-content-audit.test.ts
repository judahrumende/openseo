import { beforeEach, describe, expect, it, vi } from "vitest";
import { runContentAuditTool } from "./run-content-audit";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/content/services/ContentAuditService", () => ({
  ContentAuditService: { run: mocks.run, MAX_AUDIT_PAGES: 20 },
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

const auditResult = {
  auditId: "audit_1",
  gscConnected: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  pages: [
    {
      url: "https://example.com/blog/electric-bikes",
      statusCode: 200,
      fetchError: null,
      title: "Electric Bikes 101",
      h1: "Electric Bikes 101",
      wordCount: 200,
      targetKeyword: "electric bikes",
      targetKeywordSource: "gsc" as const,
      keywordInTitle: true,
      keywordInH1: true,
      isThin: true,
      clicksLast90: 40,
      clicksPrior90: 100,
      impressionsLast90: 900,
      impressionsPrior90: 1200,
      clicksChangePct: -0.6,
      decayStatus: "declining" as const,
      flags: ["thin_content", "declining_performance"],
    },
  ],
};

describe("run_content_audit MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
    mocks.run.mockResolvedValue(auditResult);
  });

  it("audits the project's pages and reports flags in the text output", async () => {
    const result = await runContentAuditTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(mocks.run).toHaveBeenCalledWith({
      projectId: "project_1",
      userId: "user_123",
      urls: undefined,
      targetKeywords: undefined,
    });
    expect(result.structuredContent).toMatchObject(auditResult);
    expect(textContent(result)).toContain("audit_1");
    expect(textContent(result)).toContain(
      "thin_content, declining_performance",
    );
  });

  it("forwards an explicit URL list and target keywords", async () => {
    await runContentAuditTool.handler(
      {
        projectId: "project_1",
        urls: ["https://example.com/a"],
        targetKeywords: { "https://example.com/a": "widget" },
      },
      toolContext,
    );

    expect(mocks.run).toHaveBeenCalledWith({
      projectId: "project_1",
      userId: "user_123",
      urls: ["https://example.com/a"],
      targetKeywords: { "https://example.com/a": "widget" },
    });
  });

  it("rejects a project the caller's organization can't access", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);

    await expect(
      runContentAuditTool.handler(
        { projectId: "project_missing" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
