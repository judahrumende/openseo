import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  getTopicResearchRun,
  listTopicResearchRuns,
  runTopicResearch,
} from "@/serverFunctions/content";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export const Route = createFileRoute("/_project/p/$projectId/content/")({
  component: TopicResearchRoute,
});

const INTENT_BADGE: Record<string, string> = {
  informational: "badge-info",
  commercial: "badge-warning",
  transactional: "badge-success",
  navigational: "badge-neutral",
};

function TopicResearchRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [seedKeyword, setSeedKeyword] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["contentTopicResearchRuns", projectId],
    queryFn: () => listTopicResearchRuns({ data: { projectId } }),
  });

  const researchMutation = useMutation({
    mutationFn: (seed: string) =>
      runTopicResearch({ data: { projectId, seedKeyword: seed } }),
    onSuccess: (result) => {
      setSelectedRunId(result.runId);
      void queryClient.invalidateQueries({
        queryKey: ["contentTopicResearchRuns", projectId],
      });
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Topic research failed."));
    },
  });

  const selectedRunQuery = useQuery({
    queryKey: ["contentTopicResearchRun", projectId, selectedRunId],
    queryFn: () =>
      getTopicResearchRun({ data: { projectId, runId: selectedRunId! } }),
    enabled: selectedRunId != null && !researchMutation.data,
  });

  const result =
    researchMutation.data ??
    (selectedRunId ? selectedRunQuery.data : null) ??
    null;

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-base-300 bg-base-100 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = seedKeyword.trim();
          if (!trimmed) return;
          researchMutation.mutate(trimmed);
        }}
      >
        <label className="text-sm font-medium" htmlFor="seed-keyword">
          Seed keyword or topic
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="input input-bordered flex-1 min-w-64 items-center gap-2">
            <Search className="size-4 text-base-content/50" />
            <input
              id="seed-keyword"
              type="text"
              className="grow"
              placeholder="e.g. electric bike"
              value={seedKeyword}
              onChange={(event) => setSeedKeyword(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={researchMutation.isPending || seedKeyword.trim() === ""}
          >
            {researchMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Research topics
          </button>
        </div>
        <p className="mt-2 text-xs text-base-content/60">
          Returns subtopic clusters grouped by search intent, People Also Ask
          questions, and related searches. Uses DataForSEO credits.
        </p>
      </form>

      {historyQuery.data && historyQuery.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-base-content/60">Past research:</span>
          {historyQuery.data.map((run) => (
            <button
              key={run.runId}
              type="button"
              className={`badge badge-lg cursor-pointer ${selectedRunId === run.runId ? "badge-primary" : "badge-outline"}`}
              onClick={() => {
                researchMutation.reset();
                setSelectedRunId(run.runId);
              }}
            >
              {run.seedKeyword}
            </button>
          ))}
        </div>
      )}

      {selectedRunQuery.isFetching && !result ? (
        <div className="flex items-center gap-2 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" /> Loading research...
        </div>
      ) : null}

      {result && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {result.clusters.map((cluster) => (
              <div
                key={cluster.id}
                className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium capitalize">{cluster.label}</h3>
                  {cluster.intent ? (
                    <span
                      className={`badge badge-sm ${INTENT_BADGE[cluster.intent] ?? "badge-ghost"}`}
                    >
                      {cluster.intent}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-base-content/60">
                  Combined volume:{" "}
                  {cluster.totalSearchVolume?.toLocaleString() ?? "unknown"}
                </p>
                <ul className="text-sm text-base-content/80 space-y-0.5">
                  {cluster.keywords.slice(0, 6).map((keyword) => (
                    <li
                      key={keyword.keyword}
                      className="flex justify-between gap-2"
                    >
                      <span>{keyword.keyword}</span>
                      <span className="text-base-content/50">
                        {keyword.searchVolume?.toLocaleString() ?? "-"}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-outline btn-xs mt-1"
                  onClick={() =>
                    void navigate({
                      to: "/p/$projectId/content/briefs",
                      params: { projectId },
                      search: {
                        keyword: cluster.keywords[0]?.keyword ?? cluster.label,
                        runId: result.runId,
                      },
                    })
                  }
                >
                  Brief this cluster
                </button>
              </div>
            ))}
          </div>

          {result.questions.length > 0 && (
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <h3 className="font-medium mb-2">People also ask</h3>
              <ul className="list-disc list-inside text-sm text-base-content/80 space-y-1">
                {result.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}

          {result.relatedSearches.length > 0 && (
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <h3 className="font-medium mb-2">Related searches</h3>
              <div className="flex flex-wrap gap-1.5">
                {result.relatedSearches.map((term) => (
                  <span key={term} className="badge badge-ghost">
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
