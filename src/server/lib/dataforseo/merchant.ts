import { dataforseoGet, dataforseoPost } from "@/server/lib/dataforseo/core";
import type { JsonRecord } from "@/shared/json";
import {
  assertOk,
  buildTaskBilling,
  isNoResultsTask,
  isRecord,
  isTaskInProgress,
  type DataforseoApiResponse,
  type DataforseoResponseLike,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

// ---------------------------------------------------------------------------
// Merchant API (Google Shopping / PLA). Confirmed-real endpoint paths (from
// DataForSEO's own docs URLs — docs.dataforseo.com/v3/merchant-google-
// products-task_post/, .../merchant-google-products-task_get-advanced/,
// .../merchant-google-overview/), but this sandbox has no DataForSEO API key
// to make a real call against, so the *exact* request/response field shapes
// below are NOT independently verified. Every result field is read as
// `unknown` (Record<string, unknown> items, no rigid Zod item schema) and the
// service layer (src/server/features/shopping/) extracts known fields
// defensively — a missing or renamed field degrades to `null`, it never
// throws. If DataForSEO's real shape drifts from what's assumed here, this is
// the file and the shopping service to revisit.
//
// Both endpoints follow the same async task_post (billed) -> task_get
// (free) pattern as business_data (see business.ts's
// postGoogleReviewsTask/fetchBusinessDataTaskResult, copied here) — Merchant
// is a queued/crawled SERP-like API, not a live one, per DataForSEO's own
// "task_post -> poll -> task_get/advanced" description of it.
// ---------------------------------------------------------------------------

// A malformed request is not proven un-billed by a 5xx, so posts must never
// be replayed automatically — same rule as business.ts's task_post calls.
const NO_RETRY = { maxServerErrorRetries: 0 } as const;

// The whole response was JSON.parse'd (core.ts), so every value reached
// through it is JSON-shaped; isRecord only proves "object", which is why this
// is a hand-written type guard rather than a cast.
function isJsonRecord(value: unknown): value is JsonRecord {
  return isRecord(value);
}

type MerchantLocationInput = {
  locationCode?: number;
  locationName?: string;
  languageCode: string;
};

function locationParams(input: MerchantLocationInput) {
  return input.locationName
    ? { location_name: input.locationName }
    : { location_code: input.locationCode };
}

function postedTaskId<T extends DataforseoTaskLike & { id?: string }>(
  response: DataforseoResponseLike<T> | null,
): DataforseoApiResponse<string> {
  const task = assertOk(response, { okTaskStatusCode: 20100 });
  if (!task.id) {
    throw new AppError("INTERNAL_ERROR", "DataForSEO did not return a task id");
  }
  return { data: task.id, billing: buildTaskBilling(task) };
}

// ---------------------------------------------------------------------------
// merchant/google/products — Google Shopping listings for a keyword.
// ---------------------------------------------------------------------------

export async function postGoogleProductsTask(
  input: MerchantLocationInput & {
    keyword: string;
    /**
     * Number of listings to collect. Left unclamped here — DataForSEO's own
     * validation is the source of truth for valid bounds (unverified in this
     * sandbox); the caller (MCP tool / server function) bounds the range it
     * exposes to users.
     */
    depth?: number;
  },
): Promise<DataforseoApiResponse<string>> {
  return postedTaskId(
    await dataforseoPost<DataforseoTaskLike & { id?: string }>(
      "/v3/merchant/google/products/task_post",
      [
        {
          keyword: input.keyword,
          ...locationParams(input),
          language_code: input.languageCode,
          depth: input.depth,
        },
      ],
      NO_RETRY,
    ),
  );
}

export type MerchantTaskOutcome = {
  status: "pending" | "completed";
  /** Raw result items, `[]` when the task completed with no listings. */
  items: JsonRecord[];
};

/**
 * Collects one queued products task. Deliberately not metered and not
 * wrapped in the billing envelope: collection is free (the task was charged
 * at task_post), so routing it through the metering seam would charge twice —
 * same rule as fetchBusinessDataTaskResult.
 */
export async function fetchGoogleProductsTaskResult(
  taskId: string,
): Promise<MerchantTaskOutcome> {
  const response = await dataforseoGet(
    `/v3/merchant/google/products/task_get/advanced/${encodeURIComponent(taskId)}`,
  );
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_get failed",
    );
  }

  if (isTaskInProgress(task)) return { status: "pending", items: [] };

  if (task.status_code !== 20000) {
    // "No Search Results" is a valid empty outcome for an obscure/new query.
    if (!isNoResultsTask(task)) {
      throw new AppError(
        "INTERNAL_ERROR",
        task.status_message || `DataForSEO task failed (${task.status_code})`,
      );
    }
    return { status: "completed", items: [] };
  }

  const first = task.result?.[0];
  const items =
    isRecord(first) && Array.isArray(first.items) ? first.items : [];
  return {
    status: "completed",
    items: items.filter(isJsonRecord),
  };
}

// ---------------------------------------------------------------------------
// merchant/google/overview — aggregate Shopping visibility snapshot for a
// domain. Same async task_post/task_get shape as products; the response
// object's structure is even less certain (it's an aggregate/summary object,
// not a listing array), so the caller gets the raw record back untouched
// rather than this file projecting named fields onto it.
// ---------------------------------------------------------------------------

export async function postGoogleShoppingOverviewTask(
  input: MerchantLocationInput & { target: string },
): Promise<DataforseoApiResponse<string>> {
  return postedTaskId(
    await dataforseoPost<DataforseoTaskLike & { id?: string }>(
      "/v3/merchant/google/overview/task_post",
      [
        {
          target: input.target,
          ...locationParams(input),
          language_code: input.languageCode,
        },
      ],
      NO_RETRY,
    ),
  );
}

export type MerchantOverviewOutcome = {
  status: "pending" | "completed";
  /** Raw first result entry, or null when the task completed with nothing. */
  result: JsonRecord | null;
};

/** Collects one queued overview task. Unmetered — see fetchGoogleProductsTaskResult. */
export async function fetchGoogleShoppingOverviewTaskResult(
  taskId: string,
): Promise<MerchantOverviewOutcome> {
  const response = await dataforseoGet(
    `/v3/merchant/google/overview/task_get/advanced/${encodeURIComponent(taskId)}`,
  );
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_get failed",
    );
  }

  if (isTaskInProgress(task)) return { status: "pending", result: null };

  if (task.status_code !== 20000) {
    if (!isNoResultsTask(task)) {
      throw new AppError(
        "INTERNAL_ERROR",
        task.status_message || `DataForSEO task failed (${task.status_code})`,
      );
    }
    return { status: "completed", result: null };
  }

  const first = task.result?.[0];
  return { status: "completed", result: isJsonRecord(first) ? first : null };
}
