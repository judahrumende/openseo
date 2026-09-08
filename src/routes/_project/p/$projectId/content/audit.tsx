import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  getContentAudit,
  listContentAudits,
  runContentAudit,
} from "@/serverFunctions/content";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export const Route = createFileRoute("/_project/p/$projectId/content/audit")({
  component: ContentAuditRoute,
});

const DECAY_LABEL: Record<string, string> = {
  declining: "Declining",
  stable: "Stable",
  growing: "Growing",
  insufficient_data: "No data",
};

const DECAY_BADGE: Record<string, string> = {
  declining: "badge-error",
  stable: "badge-ghost",
  growing: "badge-success",
  insufficient_data: "badge-ghost",
};

function parseUrls(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ContentAuditRoute() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [urlsInput, setUrlsInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["contentAudits", projectId],
    queryFn: () => listContentAudits({ data: { projectId } }),
  });

  const auditMutation = useMutation({
    mutationFn: (urls: string[]) =>
      runContentAudit({
        data: { projectId, urls: urls.length > 0 ? urls : undefined },
      }),
    onSuccess: (result) => {
      setSelectedAuditId(result.auditId);
      void queryClient.invalidateQueries({
        queryKey: ["contentAudits", projectId],
      });
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Content audit failed."));
    },
  });

  const selectedAuditQuery = useQuery({
    queryKey: ["contentAudit", projectId, selectedAuditId],
    queryFn: () =>
      getContentAudit({ data: { projectId, auditId: selectedAuditId! } }),
    enabled: selectedAuditId != null && !auditMutation.data,
  });

  const audit =
    auditMutation.data ?? (selectedAuditId ? selectedAuditQuery.data : null);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-base-300 bg-base-100 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-medium">Audit content health</h3>
            <p className="text-xs text-base-content/60">
              Thin content, missing target keywords, and a 90-vs-prior-90-day
              Search Console decay signal. Free — uses the project&apos;s saved
              key pages unless you list URLs below.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={auditMutation.isPending}
            onClick={() => auditMutation.mutate(parseUrls(urlsInput))}
          >
            {auditMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Run audit
          </button>
        </div>
        <button
          type="button"
          className="text-xs text-primary underline underline-offset-2"
          onClick={() => setShowUrlInput((prev) => !prev)}
        >
          {showUrlInput ? "Hide" : "Use specific URLs instead"}
        </button>
        {showUrlInput && (
          <textarea
            className="textarea textarea-bordered w-full text-sm"
            rows={4}
            placeholder={"One URL per line (max 20)"}
            value={urlsInput}
            onChange={(event) => setUrlsInput(event.target.value)}
          />
        )}
      </div>

      {historyQuery.data && historyQuery.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-base-content/60">Past audits:</span>
          {historyQuery.data.map((entry) => (
            <button
              key={entry.auditId}
              type="button"
              className={`badge badge-lg cursor-pointer ${selectedAuditId === entry.auditId ? "badge-primary" : "badge-outline"}`}
              onClick={() => {
                auditMutation.reset();
                setSelectedAuditId(entry.auditId);
              }}
            >
              {entry.pageCount} pages —{" "}
              {new Date(entry.createdAt).toLocaleDateString()}
            </button>
          ))}
        </div>
      )}

      {selectedAuditQuery.isFetching && !audit ? (
        <div className="flex items-center gap-2 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" /> Loading audit...
        </div>
      ) : null}

      {audit && (
        <div className="space-y-3">
          {!audit.gscConnected && (
            <div className="alert alert-info text-sm">
              <span>
                Search Console isn&apos;t connected for this project — decay
                status is unavailable, and target keywords fall back to whatever
                you passed explicitly.
              </span>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-base-300">
            <table className="table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Words</th>
                  <th>Target keyword</th>
                  <th>Title</th>
                  <th>H1</th>
                  <th>Decay</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {audit.pages.map((page) => (
                  <tr key={page.url}>
                    <td className="max-w-64 truncate" title={page.url}>
                      {page.url}
                    </td>
                    {page.fetchError ? (
                      <td colSpan={6} className="text-error text-sm">
                        Fetch failed: {page.fetchError}
                      </td>
                    ) : (
                      <>
                        <td className={page.isThin ? "text-error" : ""}>
                          {page.wordCount ?? "-"}
                        </td>
                        <td>
                          {page.targetKeyword ?? "-"}
                          {page.targetKeywordSource === "gsc" && (
                            <span className="badge badge-ghost badge-xs ml-1">
                              GSC
                            </span>
                          )}
                        </td>
                        <td>
                          {page.keywordInTitle == null
                            ? "-"
                            : page.keywordInTitle
                              ? "Yes"
                              : "No"}
                        </td>
                        <td>
                          {page.keywordInH1 == null
                            ? "-"
                            : page.keywordInH1
                              ? "Yes"
                              : "No"}
                        </td>
                        <td>
                          {page.decayStatus ? (
                            <span
                              className={`badge badge-sm ${DECAY_BADGE[page.decayStatus]}`}
                            >
                              {DECAY_LABEL[page.decayStatus]}
                              {page.clicksChangePct != null
                                ? ` ${Math.round(page.clicksChangePct * 100)}%`
                                : ""}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="text-xs text-base-content/60">
                          {page.flags.length > 0
                            ? page.flags.join(", ")
                            : "none"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
