import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { fetchGoogleShoppingOverviewTaskResult } from "@/server/lib/dataforseo/merchant";
import { AppError } from "@/server/lib/errors";
import { ShoppingRepository } from "@/server/features/shopping/repositories/ShoppingRepository";
import { decodeRawJsonRecord } from "@/server/features/shopping/shoppingJsonCodecs";
import type { JsonRecord } from "@/shared/json";

// Same inline poll budget as ShoppingProductsService — see that file.
const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 4000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type OverviewResult = {
  runId: string;
  status: "processing" | "completed" | "failed";
  targetDomain: string;
  locationCode: number;
  languageCode: string;
  /** Raw passthrough of whatever DataForSEO returned — see merchant.ts for
   *  why this stays unshaped rather than projecting named fields. */
  overview: JsonRecord | null;
  errorMessage: string | null;
  createdAt: string;
};

async function advanceRun(
  row: NonNullable<
    Awaited<ReturnType<typeof ShoppingRepository.getDomainOverview>>
  >,
): Promise<OverviewResult> {
  if (row.status !== "pending") {
    return {
      runId: row.id,
      status: row.status,
      targetDomain: row.targetDomain,
      locationCode: row.locationCode,
      languageCode: row.languageCode,
      overview: decodeRawJsonRecord(row.overviewJson),
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
    };
  }

  let outcome: Awaited<
    ReturnType<typeof fetchGoogleShoppingOverviewTaskResult>
  >;
  try {
    outcome = await fetchGoogleShoppingOverviewTaskResult(row.taskId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ShoppingRepository.failDomainOverview(row.id, {
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });
    return {
      runId: row.id,
      status: "failed",
      targetDomain: row.targetDomain,
      locationCode: row.locationCode,
      languageCode: row.languageCode,
      overview: null,
      errorMessage: message,
      createdAt: row.createdAt,
    };
  }

  if (outcome.status === "pending") {
    return {
      runId: row.id,
      status: "processing",
      targetDomain: row.targetDomain,
      locationCode: row.locationCode,
      languageCode: row.languageCode,
      overview: null,
      errorMessage: null,
      createdAt: row.createdAt,
    };
  }

  const completedAt = new Date().toISOString();
  await ShoppingRepository.completeDomainOverview(row.id, {
    overviewJson: outcome.result ? JSON.stringify(outcome.result) : null,
    completedAt,
  });

  return {
    runId: row.id,
    status: "completed",
    targetDomain: row.targetDomain,
    locationCode: row.locationCode,
    languageCode: row.languageCode,
    overview: outcome.result,
    errorMessage: null,
    createdAt: row.createdAt,
  };
}

async function pollUntilSettledOrTimeout(
  runId: string,
  projectId: string,
): Promise<OverviewResult> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) await wait(POLL_INTERVAL_MS);
    const row = await ShoppingRepository.getDomainOverview(runId, projectId);
    if (!row)
      throw new AppError("NOT_FOUND", "Shopping overview run not found");
    const result = await advanceRun(row);
    if (result.status !== "processing") return result;
  }
  return {
    runId,
    status: "processing",
    targetDomain: "",
    locationCode: 0,
    languageCode: "",
    overview: null,
    errorMessage: null,
    createdAt: "",
  };
}

async function getOverview(
  input: {
    projectId: string;
    targetDomain: string;
    locationCode: number;
    languageCode: string;
    userId: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<OverviewResult> {
  const client = createDataforseoClient(billingCustomer);
  const taskId = await client.merchant.overviewTaskPost({
    target: input.targetDomain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const runId = crypto.randomUUID();
  await ShoppingRepository.createDomainOverview({
    id: runId,
    projectId: input.projectId,
    targetDomain: input.targetDomain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    taskId,
    createdByUserId: input.userId,
  });

  return pollUntilSettledOrTimeout(runId, input.projectId);
}

async function resume(
  runId: string,
  projectId: string,
): Promise<OverviewResult> {
  const row = await ShoppingRepository.getDomainOverview(runId, projectId);
  if (!row) throw new AppError("NOT_FOUND", "Shopping overview run not found");
  if (row.status !== "pending") return advanceRun(row);
  return pollUntilSettledOrTimeout(runId, projectId);
}

async function pollOnce(
  runId: string,
  projectId: string,
): Promise<OverviewResult> {
  const row = await ShoppingRepository.getDomainOverview(runId, projectId);
  if (!row) throw new AppError("NOT_FOUND", "Shopping overview run not found");
  return advanceRun(row);
}

type OverviewSummary = {
  runId: string;
  targetDomain: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
};

async function listOverviews(projectId: string): Promise<OverviewSummary[]> {
  const rows = await ShoppingRepository.listDomainOverviews(projectId);
  return rows.map((row) => ({
    runId: row.id,
    targetDomain: row.targetDomain,
    status: row.status,
    createdAt: row.createdAt,
  }));
}

export const ShoppingOverviewService = {
  getOverview,
  resume,
  pollOnce,
  listOverviews,
};
