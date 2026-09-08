import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShoppingBag, Star } from "lucide-react";
import {
  getShoppingProductsSearch,
  listShoppingProductSearches,
  searchShoppingProducts,
} from "@/serverFunctions/shopping";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export const Route = createFileRoute("/_project/p/$projectId/shopping/")({
  component: ShoppingProductsRoute,
});

const POLL_INTERVAL_MS = 4000;

function ShoppingProductsRoute() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["shoppingProductSearches", projectId],
    queryFn: () => listShoppingProductSearches({ data: { projectId } }),
  });

  const searchMutation = useMutation({
    mutationFn: (kw: string) =>
      searchShoppingProducts({ data: { projectId, keyword: kw } }),
    onSuccess: (result) => {
      setSelectedRunId(result.runId);
      queryClient.setQueryData(
        ["shoppingProductsSearch", projectId, result.runId],
        result,
      );
      void queryClient.invalidateQueries({
        queryKey: ["shoppingProductSearches", projectId],
      });
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Shopping search failed."));
    },
  });

  const runQuery = useQuery({
    queryKey: ["shoppingProductsSearch", projectId, selectedRunId],
    queryFn: () =>
      getShoppingProductsSearch({
        data: { projectId, runId: selectedRunId! },
      }),
    enabled: selectedRunId != null,
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? POLL_INTERVAL_MS : false,
  });

  const result = runQuery.data;

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-base-300 bg-base-100 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = keyword.trim();
          if (!trimmed) return;
          searchMutation.mutate(trimmed);
        }}
      >
        <label className="text-sm font-medium" htmlFor="shopping-keyword">
          Product keyword
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="input input-bordered flex-1 min-w-64 items-center gap-2">
            <ShoppingBag className="size-4 text-base-content/50" />
            <input
              id="shopping-keyword"
              type="text"
              className="grow"
              placeholder="e.g. sim racing wheel"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={searchMutation.isPending || keyword.trim() === ""}
          >
            {searchMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Search Google Shopping
          </button>
        </div>
        <p className="mt-2 text-xs text-base-content/60">
          Shows current Google Shopping listings for this keyword: who&apos;s
          visible, price positioning, and whether your own domain appears. Uses
          DataForSEO credits. Results can take up to a minute to collect — this
          page keeps checking automatically.
        </p>
      </form>

      {historyQuery.data && historyQuery.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-base-content/60">Past searches:</span>
          {historyQuery.data.map((run) => (
            <button
              key={run.runId}
              type="button"
              className={`badge badge-lg cursor-pointer ${selectedRunId === run.runId ? "badge-primary" : "badge-outline"}`}
              onClick={() => setSelectedRunId(run.runId)}
            >
              {run.keyword}
              {run.status === "pending" ? (
                <Loader2 className="ml-1 size-3 animate-spin" />
              ) : null}
            </button>
          ))}
        </div>
      )}

      {result?.status === "processing" && (
        <div className="flex items-center gap-2 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" /> Collecting Shopping
          results — this page updates automatically...
        </div>
      )}

      {result?.status === "failed" && (
        <div className="alert alert-warning text-sm">
          {result.errorMessage ?? "This search could not be completed."}
        </div>
      )}

      {result?.status === "completed" && (
        <div className="space-y-4">
          {result.priceStats && (
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <h3 className="font-medium mb-2">Price positioning</h3>
              <div className="flex flex-wrap gap-6 text-sm">
                <Stat
                  label="Lowest"
                  value={result.priceStats.min}
                  currency={result.priceStats.currency}
                />
                <Stat
                  label="Median"
                  value={result.priceStats.median}
                  currency={result.priceStats.currency}
                />
                <Stat
                  label="Highest"
                  value={result.priceStats.max}
                  currency={result.priceStats.currency}
                />
                <div>
                  <div className="text-base-content/50 text-xs">
                    Priced listings
                  </div>
                  <div className="font-medium">
                    {result.priceStats.sampleSize}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-base-300 bg-base-100 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Seller</th>
                  <th>Price</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {result.listings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center text-base-content/60"
                    >
                      No Google Shopping listings found for this keyword.
                    </td>
                  </tr>
                ) : (
                  result.listings.map((listing, index) => (
                    <tr
                      key={`${listing.url ?? listing.title ?? index}-${index}`}
                      className={
                        listing.isProjectDomain ? "bg-primary/10" : undefined
                      }
                    >
                      <td>{listing.position ?? "—"}</td>
                      <td className="max-w-xs">
                        <div className="truncate">
                          {listing.title ?? "Untitled listing"}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {listing.sellerDomain ?? listing.seller ?? "—"}
                          {listing.isProjectDomain ? (
                            <span className="badge badge-primary badge-xs">
                              you
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {listing.price != null
                          ? `${listing.currency ?? ""} ${listing.price.toLocaleString()}`.trim()
                          : "—"}
                      </td>
                      <td>
                        {listing.rating != null ? (
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3.5 fill-warning text-warning" />
                            {listing.rating.toFixed(1)}
                            {listing.ratingCount != null
                              ? ` (${listing.ratingCount})`
                              : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string | null;
}) {
  return (
    <div>
      <div className="text-base-content/50 text-xs">{label}</div>
      <div className="font-medium">
        {currency ?? ""} {value.toLocaleString()}
      </div>
    </div>
  );
}
