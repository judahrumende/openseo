import { and, desc, eq } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import {
  contentAuditPages,
  contentAudits,
  contentBriefs,
  contentTopicClusters,
  contentTopicResearchRuns,
} from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";

const DEFAULT_HISTORY_LIMIT = 20;

// ---------------------------------------------------------------------------
// Topic Research
// ---------------------------------------------------------------------------

async function createTopicResearchRun(
  data: InferInsertModel<typeof contentTopicResearchRuns>,
) {
  await db.insert(contentTopicResearchRuns).values(data);
}

async function insertTopicClusters(
  rows: InferInsertModel<typeof contentTopicClusters>[],
) {
  await executeInBatches(rows, (tx, row) =>
    tx.insert(contentTopicClusters).values(row),
  );
}

async function getTopicResearchRun(runId: string, projectId: string) {
  const rows = await db
    .select()
    .from(contentTopicResearchRuns)
    .where(
      and(
        eq(contentTopicResearchRuns.id, runId),
        eq(contentTopicResearchRuns.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getTopicClustersForRun(runId: string) {
  return db
    .select()
    .from(contentTopicClusters)
    .where(eq(contentTopicClusters.runId, runId))
    .orderBy(desc(contentTopicClusters.totalSearchVolume));
}

async function listTopicResearchRuns(
  projectId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
) {
  return db
    .select()
    .from(contentTopicResearchRuns)
    .where(eq(contentTopicResearchRuns.projectId, projectId))
    .orderBy(desc(contentTopicResearchRuns.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Content Briefs
// ---------------------------------------------------------------------------

async function createBrief(data: InferInsertModel<typeof contentBriefs>) {
  await db.insert(contentBriefs).values(data);
}

async function getBrief(briefId: string, projectId: string) {
  const rows = await db
    .select()
    .from(contentBriefs)
    .where(
      and(
        eq(contentBriefs.id, briefId),
        eq(contentBriefs.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function listBriefs(
  projectId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
) {
  return db
    .select()
    .from(contentBriefs)
    .where(eq(contentBriefs.projectId, projectId))
    .orderBy(desc(contentBriefs.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Content Audits
// ---------------------------------------------------------------------------

async function createAudit(data: InferInsertModel<typeof contentAudits>) {
  await db.insert(contentAudits).values(data);
}

async function insertAuditPages(
  rows: InferInsertModel<typeof contentAuditPages>[],
) {
  await executeInBatches(rows, (tx, row) =>
    tx
      .insert(contentAuditPages)
      .values(row)
      .onConflictDoNothing({
        target: [contentAuditPages.auditId, contentAuditPages.url],
      }),
  );
}

async function getAudit(auditId: string, projectId: string) {
  const rows = await db
    .select()
    .from(contentAudits)
    .where(
      and(
        eq(contentAudits.id, auditId),
        eq(contentAudits.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getAuditPages(auditId: string) {
  return db
    .select()
    .from(contentAuditPages)
    .where(eq(contentAuditPages.auditId, auditId))
    .orderBy(contentAuditPages.url);
}

async function listAudits(
  projectId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
) {
  return db
    .select()
    .from(contentAudits)
    .where(eq(contentAudits.projectId, projectId))
    .orderBy(desc(contentAudits.createdAt))
    .limit(limit);
}

export const ContentRepository = {
  createTopicResearchRun,
  insertTopicClusters,
  getTopicResearchRun,
  getTopicClustersForRun,
  listTopicResearchRuns,
  createBrief,
  getBrief,
  listBriefs,
  createAudit,
  insertAuditPages,
  getAudit,
  getAuditPages,
  listAudits,
};
