import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  generateContentBrief,
  getContentBrief,
  listContentBriefs,
} from "@/serverFunctions/content";
import { contentBriefSearchSchema } from "@/types/schemas/content";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useContentBriefAccess } from "@/client/features/content/useContentBriefAccess";
import { ContentBriefSetupGate } from "@/client/features/content/ContentBriefSetupGate";

export const Route = createFileRoute("/_project/p/$projectId/content/briefs")({
  validateSearch: contentBriefSearchSchema,
  component: ContentBriefRoute,
});

function ContentBriefRoute() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const access = useContentBriefAccess(projectId);
  const queryClient = useQueryClient();

  const [targetKeyword, setTargetKeyword] = useState(search.keyword ?? "");
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);

  useEffect(() => {
    if (search.keyword) setTargetKeyword(search.keyword);
  }, [search.keyword]);

  const historyQuery = useQuery({
    queryKey: ["contentBriefs", projectId],
    queryFn: () => listContentBriefs({ data: { projectId } }),
  });

  const generateMutation = useMutation({
    mutationFn: (input: {
      targetKeyword: string;
      topicResearchRunId?: string;
    }) => generateContentBrief({ data: { projectId, ...input } }),
    onSuccess: (result) => {
      setSelectedBriefId(result.briefId);
      void queryClient.invalidateQueries({
        queryKey: ["contentBriefs", projectId],
      });
    },
    onError: (error) => {
      toast.error(
        getStandardErrorMessage(error, "Content brief generation failed."),
      );
    },
  });

  const selectedBriefQuery = useQuery({
    queryKey: ["contentBrief", projectId, selectedBriefId],
    queryFn: () =>
      getContentBrief({ data: { projectId, briefId: selectedBriefId! } }),
    enabled: selectedBriefId != null && !generateMutation.data,
  });

  if (access.showSetupGate) {
    return (
      <ContentBriefSetupGate
        errorMessage={access.errorMessage}
        isRefetching={access.isRefetching}
        onRetry={access.onRetry}
      />
    );
  }

  const brief =
    generateMutation.data ?? (selectedBriefId ? selectedBriefQuery.data : null);

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-base-300 bg-base-100 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = targetKeyword.trim();
          if (!trimmed) return;
          generateMutation.mutate({
            targetKeyword: trimmed,
            topicResearchRunId: search.runId,
          });
        }}
      >
        <label className="text-sm font-medium" htmlFor="target-keyword">
          Target keyword
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="input input-bordered flex-1 min-w-64 items-center gap-2">
            <Search className="size-4 text-base-content/50" />
            <input
              id="target-keyword"
              type="text"
              className="grow"
              placeholder="e.g. electric bike battery"
              value={targetKeyword}
              onChange={(event) => setTargetKeyword(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={generateMutation.isPending || targetKeyword.trim() === ""}
          >
            {generateMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Generate brief
          </button>
        </div>
        {search.runId ? (
          <p className="mt-2 text-xs text-primary">
            Seeded from topic research — entities and questions will be drawn
            from that cluster.
          </p>
        ) : (
          <p className="mt-2 text-xs text-base-content/60">
            Derives a target word count from live competitor pages, then drafts
            titles, an outline, entities, and a reading level. Uses DataForSEO
            credits plus one AI generation.
          </p>
        )}
      </form>

      {historyQuery.data && historyQuery.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-base-content/60">Past briefs:</span>
          {historyQuery.data.map((entry) => (
            <button
              key={entry.briefId}
              type="button"
              className={`badge badge-lg cursor-pointer ${selectedBriefId === entry.briefId ? "badge-primary" : "badge-outline"}`}
              onClick={() => {
                generateMutation.reset();
                setSelectedBriefId(entry.briefId);
              }}
            >
              {entry.targetKeyword}
            </button>
          ))}
        </div>
      )}

      {selectedBriefQuery.isFetching && !brief ? (
        <div className="flex items-center gap-2 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" /> Loading brief...
        </div>
      ) : null}

      {brief && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
            <div>
              <h3 className="font-medium">Title options</h3>
              <ul className="mt-1 list-disc list-inside text-sm text-base-content/80 space-y-1">
                {brief.titleOptions.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <div className="text-base-content/50 text-xs">
                  Target length
                </div>
                <div className="font-medium">
                  {brief.targetWordCount != null
                    ? `~${brief.targetWordCount.toLocaleString()} words`
                    : "unknown"}
                </div>
                {brief.competitorSampleSize > 0 && (
                  <div className="text-xs text-base-content/50">
                    from {brief.competitorSampleSize} competitor page
                    {brief.competitorSampleSize === 1 ? "" : "s"}, avg{" "}
                    {brief.competitorAvgWordCount?.toLocaleString()}
                  </div>
                )}
              </div>
              <div>
                <div className="text-base-content/50 text-xs">
                  Reading level
                </div>
                <div className="font-medium">
                  {brief.targetReadingLevel ?? "unknown"}
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-medium">Entities to cover</h3>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {brief.entities.map((entity) => (
                  <span key={entity} className="badge badge-ghost">
                    {entity}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <h3 className="font-medium mb-2">Outline</h3>
            <ul className="space-y-1.5 text-sm">
              {brief.outline.map((item, index) => (
                <li
                  key={`${item.heading}-${index}`}
                  className={
                    item.level === "h3"
                      ? "ml-4 text-base-content/80"
                      : "font-medium"
                  }
                >
                  {item.level === "h3" ? "– " : ""}
                  {item.heading}
                  {item.notes ? (
                    <div className="text-xs text-base-content/50 font-normal">
                      {item.notes}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
