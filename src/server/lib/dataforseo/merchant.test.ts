import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchGoogleProductsTaskResult,
  fetchGoogleShoppingOverviewTaskResult,
  postGoogleProductsTask,
  postGoogleShoppingOverviewTask,
} from "@/server/lib/dataforseo/merchant";
import { AppError } from "@/server/lib/errors";

function stubDataforseo(payload: unknown) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestOf(fetchMock: ReturnType<typeof stubDataforseo>) {
  const [url, init] = fetchMock.mock.calls[0];
  const rawUrl = typeof url === "string" || url instanceof URL ? url : url.url;
  const body = init?.body;
  return {
    url: rawUrl.toString(),
    body: typeof body === "string" ? (JSON.parse(body) as unknown) : null,
  };
}

describe("merchant/google/products", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts a task and returns its id billed from the post entry", async () => {
    const fetchMock = stubDataforseo({
      status_code: 20000,
      tasks: [
        {
          id: "task-1",
          status_code: 20100,
          cost: 0.01,
          path: ["v3", "merchant", "google", "products", "task_post"],
        },
      ],
    });

    const taskId = await postGoogleProductsTask({
      keyword: "sim racing wheel",
      locationCode: 2036,
      languageCode: "en",
      depth: 20,
    });

    const { url, body } = requestOf(fetchMock);
    expect(url).toBe(
      "https://api.dataforseo.com/v3/merchant/google/products/task_post",
    );
    expect(body).toEqual([
      {
        keyword: "sim racing wheel",
        location_code: 2036,
        language_code: "en",
        depth: 20,
      },
    ]);
    expect(taskId.data).toBe("task-1");
    expect(taskId.billing.costUsd).toBe(0.01);
  });

  it("throws when task_post succeeds without returning a task id", async () => {
    stubDataforseo({
      status_code: 20000,
      tasks: [
        {
          status_code: 20100,
          cost: 0.01,
          path: ["v3", "merchant", "google", "products", "task_post"],
        },
      ],
    });

    await expect(
      postGoogleProductsTask({
        keyword: "sim racing wheel",
        locationCode: 2036,
        languageCode: "en",
      }),
    ).rejects.toThrow("DataForSEO did not return a task id");
  });

  it("reports a queued task as pending", async () => {
    stubDataforseo({
      status_code: 20000,
      tasks: [
        { id: "task-1", status_code: 20100, status_message: "Task Created." },
      ],
    });

    const outcome = await fetchGoogleProductsTaskResult("task-1");
    expect(outcome).toEqual({ status: "pending", items: [] });
  });

  it("collects completed listings, dropping non-object items", async () => {
    stubDataforseo({
      status_code: 20000,
      tasks: [
        {
          id: "task-1",
          status_code: 20000,
          result: [
            {
              items: [
                { title: "Sim Racing Wheel", price: 499.99 },
                null,
                "not an item",
              ],
            },
          ],
        },
      ],
    });

    const outcome = await fetchGoogleProductsTaskResult("task-1");
    expect(outcome.status).toBe("completed");
    expect(outcome.items).toEqual([
      { title: "Sim Racing Wheel", price: 499.99 },
    ]);
  });

  it("treats a charged 'no search results' task as a completed empty result", async () => {
    stubDataforseo({
      status_code: 20000,
      tasks: [
        {
          id: "task-1",
          status_code: 40501,
          status_message: "No Search Results.",
        },
      ],
    });

    const outcome = await fetchGoogleProductsTaskResult("task-1");
    expect(outcome).toEqual({ status: "completed", items: [] });
  });

  it("throws AppError on a genuine task failure", async () => {
    stubDataforseo({
      status_code: 20000,
      tasks: [
        {
          id: "task-1",
          status_code: 40400,
          status_message: "Not Found.",
        },
      ],
    });

    await expect(
      fetchGoogleProductsTaskResult("task-1"),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("merchant/google/overview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts an overview task keyed on target domain", async () => {
    const fetchMock = stubDataforseo({
      status_code: 20000,
      tasks: [
        {
          id: "task-2",
          status_code: 20100,
          cost: 0.02,
          path: ["v3", "merchant", "google", "overview", "task_post"],
        },
      ],
    });

    await postGoogleShoppingOverviewTask({
      target: "hyperlabs.com.au",
      locationCode: 2036,
      languageCode: "en",
    });

    const { body } = requestOf(fetchMock);
    expect(body).toEqual([
      {
        target: "hyperlabs.com.au",
        location_code: 2036,
        language_code: "en",
      },
    ]);
  });

  it("returns the raw first result entry unshaped", async () => {
    stubDataforseo({
      status_code: 20000,
      tasks: [
        {
          id: "task-2",
          status_code: 20000,
          result: [{ some_field_we_did_not_predict: 42 }],
        },
      ],
    });

    const outcome = await fetchGoogleShoppingOverviewTaskResult("task-2");
    expect(outcome).toEqual({
      status: "completed",
      result: { some_field_we_did_not_predict: 42 },
    });
  });
});
