import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Loader2 } from "lucide-react";
import {
  getShoppingDomainOverview,
  listShoppingDomainOverviews,
  pollShoppingDomainOverview,
} from "@/serverFunctions/shopping";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export const Route = createFileRoute("/_project/p/$projectId/shopping/domain")({
  component: ShoppingDomainOverviewRoute,
});

const POLL_INTERVAL_MS = 4000;

function ShoppingDomainOverviewRoute() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [targetDomain, setTargetDomain] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["shoppingDomainOverviews", projectId],
    queryFn: () => listShoppingDomainOverviews({ data: { projectId } }),
  });

  const overviewMutation = useMutation({
    mutationFn: (domain: string) =>
      getShoppingDomainOverview({
        data: { projectId, targetDomain: domain || undefined },
      }),
    onSuccess: (result) => {
      setSelectedRunId(result.runId);
      queryClient.setQueryData(
        ["shoppingDomainOverview", projectId, result.runId],
        result,
      );
      void queryClient.invalidateQueries({
        queryKey: ["shoppingDomainOverviews", projectId],
      });
    },
    onError: (error) => {
      toast.error(
        getStandardErrorMessage(error, "Shopping domain overview failed."),
      );
    },
  });

  const runQuery = useQuery({
    queryKey: ["shoppingDomainOverview", projectId, selectedRunId],
    queryFn: () =>
      pollShoppingDomainOverview({
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
          overviewMutation.mutate(targetDomain.trim());
        }}
      >
        <label className="text-sm font-medium" htmlFor="overview-domain">
          Domain (defaults to this project&apos;s domain)
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="input input-bordered flex-1 min-w-64 items-center gap-2">
            <Globe className="size-4 text-base-content/50" />
            <input
              id="overview-domain"
              type="text"
              className="grow"
              placeholder="e.g. example.com"
              value={targetDomain}
              onChange={(event) => setTargetDomain(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={overviewMutation.isPending}
          >
            {overviewMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Get Shopping overview
          </button>
        </div>
        <p className="mt-2 text-xs text-base-content/60">
          An aggregate Google Shopping visibility snapshot for a domain
          (DataForSEO Merchant API). This endpoint&apos;s exact response shape
          wasn&apos;t verified against a live call while building this feature,
          so the result below is shown as-is rather than a curated summary — use
          the product search tab for the reviewed, normalized view. Uses
          DataForSEO credits.
        </p>
      </form>

      {historyQuery.data && historyQuery.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-base-content/60">Past runs:</span>
          {historyQuery.data.map((run) => (
            <button
              key={run.runId}
              type="button"
              className={`badge badge-lg cursor-pointer ${selectedRunId === run.runId ? "badge-primary" : "badge-outline"}`}
              onClick={() => setSelectedRunId(run.runId)}
            >
              {run.targetDomain}
            </button>
          ))}
        </div>
      )}

      {result?.status === "processing" && (
        <div className="flex items-center gap-2 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" /> Collecting overview — this
          page updates automatically...
        </div>
      )}

      {result?.status === "failed" && (
        <div className="alert alert-warning text-sm">
          {result.errorMessage ?? "This overview could not be completed."}
        </div>
      )}

      {result?.status === "completed" && (
        <div className="rounded-xl border border-base-300 bg-base-100 p-4">
          <h3 className="font-medium mb-2">
            Raw overview for {result.targetDomain}
          </h3>
          {result.overview ? (
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(result.overview, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-base-content/60">
              No Shopping visibility data returned for this domain.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
