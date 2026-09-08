import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Sparkles, Wrench } from "lucide-react";
import {
  generateAdCopy,
  getAdCopyDraft,
  getAdCopySetupStatus,
  listAdCopyDrafts,
} from "@/serverFunctions/advertising";
import { adCopyDraftSearchSchema } from "@/types/schemas/advertising";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export const Route = createFileRoute(
  "/_project/p/$projectId/advertising/ad-copy",
)({
  validateSearch: adCopyDraftSearchSchema,
  component: AdCopyRoute,
});

// Mirrors useContentBriefAccess (src/client/features/content/
// useContentBriefAccess.ts) — inlined since this is the only route that
// needs it.
function useAdCopyAccess(projectId: string) {
  const isHosted = isHostedClientAuthMode();
  const { data, error, isRefetching, refetch } = useQuery({
    queryKey: ["adCopySetupStatus", projectId],
    queryFn: () => getAdCopySetupStatus({ data: { projectId } }),
    enabled: !isHosted,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  });
  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (isHosted) {
    return {
      showSetupGate: false,
      errorMessage: null,
      isRefetching: false,
      onRetry,
    };
  }
  const resolved = data !== undefined || error != null;
  return {
    showSetupGate: resolved && !(data?.enabled ?? false),
    errorMessage:
      data?.errorMessage ??
      (error
        ? getStandardErrorMessage(
            error,
            "Could not load AI Ad Copy setup status.",
          )
        : null),
    isRefetching,
    onRetry,
  };
}

function AdCopyRoute() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const access = useAdCopyAccess(projectId);
  const queryClient = useQueryClient();

  const [targetKeyword, setTargetKeyword] = useState(search.keyword ?? "");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  useEffect(() => {
    if (search.keyword) setTargetKeyword(search.keyword);
  }, [search.keyword]);

  const historyQuery = useQuery({
    queryKey: ["adCopyDrafts", projectId],
    queryFn: () => listAdCopyDrafts({ data: { projectId } }),
  });

  const generateMutation = useMutation({
    mutationFn: (input: {
      targetKeyword: string;
      inspirationSearchId?: string;
    }) => generateAdCopy({ data: { projectId, ...input } }),
    onSuccess: (result) => {
      setSelectedDraftId(result.draftId);
      void queryClient.invalidateQueries({
        queryKey: ["adCopyDrafts", projectId],
      });
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Ad copy generation failed."));
    },
  });

  const selectedDraftQuery = useQuery({
    queryKey: ["adCopyDraft", projectId, selectedDraftId],
    queryFn: () =>
      getAdCopyDraft({ data: { projectId, draftId: selectedDraftId! } }),
    enabled: selectedDraftId != null && !generateMutation.data,
  });

  if (access.showSetupGate) {
    return (
      <section>
        <div className="rounded-2xl border border-base-300 bg-base-100 p-6 md:p-7 space-y-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-warning/15 p-2.5 text-warning shrink-0">
              <Wrench className="size-5" />
            </div>
            <div className="max-w-3xl space-y-1.5">
              <h2 className="text-xl font-semibold">Enable AI Ad Copy</h2>
              <div className="text-sm text-base-content/68">
                AI Ad Copy writes with an AI model and needs an OpenRouter API
                key. Create a key on OpenRouter, set it as the{" "}
                <code>OPENROUTER_API_KEY</code> environment variable, restart
                OpenSEO, then confirm here.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="btn btn-primary"
              onClick={access.onRetry}
              disabled={access.isRefetching}
            >
              {access.isRefetching ? "Confirming..." : "Confirm API Key"}
            </button>
            <a
              className="btn"
              href="https://openrouter.ai/settings/keys"
              target="_blank"
              rel="noreferrer"
            >
              Open OpenRouter Keys
            </a>
          </div>
          {access.errorMessage ? (
            <div className="alert alert-warning">
              <ShieldAlert className="size-4 shrink-0" />
              <span>{access.errorMessage}</span>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  const draft =
    generateMutation.data ??
    (selectedDraftId ? selectedDraftQuery.data : null) ??
    null;

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
            inspirationSearchId: search.inspirationSearchId,
          });
        }}
      >
        <label className="text-sm font-medium" htmlFor="ad-copy-keyword">
          Target keyword
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="input input-bordered flex-1 min-w-64 items-center gap-2">
            <Sparkles className="size-4 text-base-content/50" />
            <input
              id="ad-copy-keyword"
              type="text"
              className="grow"
              placeholder="e.g. sim racing pedals"
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
            Draft ad copy
          </button>
        </div>
        {search.inspirationSearchId ? (
          <p className="mt-2 text-xs text-primary">
            Seeded from competitor ad copy — variants will draw on what
            competitors are currently running.
          </p>
        ) : (
          <p className="mt-2 text-xs text-base-content/60">
            Drafts 3-5 Google Ads-style headline/description variants. Uses one
            AI generation (no DataForSEO credits).
          </p>
        )}
      </form>

      {historyQuery.data && historyQuery.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-base-content/60">Past drafts:</span>
          {historyQuery.data.map((entry) => (
            <button
              key={entry.draftId}
              type="button"
              className={`badge badge-lg cursor-pointer ${selectedDraftId === entry.draftId ? "badge-primary" : "badge-outline"}`}
              onClick={() => {
                generateMutation.reset();
                setSelectedDraftId(entry.draftId);
              }}
            >
              {entry.targetKeyword}
            </button>
          ))}
        </div>
      )}

      {draft && (
        <div className="rounded-xl border border-base-300 bg-base-100 p-4">
          <h3 className="font-medium mb-3">
            Variants for &quot;{draft.targetKeyword}&quot;
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {draft.variants.map((variant, index) => (
              <div
                key={index}
                className="rounded-lg border border-base-300 p-3"
              >
                <div className="font-medium">{variant.headline}</div>
                <div className="text-sm text-base-content/70">
                  {variant.description}
                </div>
              </div>
            ))}
          </div>
          {draft.modelUsed ? (
            <p className="mt-3 text-xs text-base-content/50">
              Generated with {draft.modelUsed}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
