import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Megaphone, Search } from "lucide-react";
import {
  getAdCopySearch,
  listAdAdvertiserSearches,
  searchAdAdvertisers,
  searchAdCopy,
} from "@/serverFunctions/advertising";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export const Route = createFileRoute("/_project/p/$projectId/advertising/")({
  component: AdvertisingResearchRoute,
});

// The Ads Advertisers/Ads Search response shape is unverified in this
// sandbox (see src/server/lib/dataforseo/ads-transparency.ts) — read every
// field defensively rather than assuming one name.
function readString(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function advertiserId(row: Record<string, unknown>) {
  return readString(row, "advertiser_id", "advertiserId", "id");
}

function AdvertisingResearchRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [selectedSearchId, setSelectedSearchId] = useState<string | null>(null);
  const [selectedAdvertiserIds, setSelectedAdvertiserIds] = useState<
    Set<string>
  >(new Set());
  const [adCopySearchId, setAdCopySearchId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["adAdvertiserSearches", projectId],
    queryFn: () => listAdAdvertiserSearches({ data: { projectId } }),
  });

  const advertiserSearchMutation = useMutation({
    mutationFn: (kw: string) =>
      searchAdAdvertisers({ data: { projectId, keyword: kw } }),
    onSuccess: (result) => {
      setSelectedSearchId(result.searchId);
      setSelectedAdvertiserIds(new Set());
      setAdCopySearchId(null);
      void queryClient.invalidateQueries({
        queryKey: ["adAdvertiserSearches", projectId],
      });
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Advertiser search failed."));
    },
  });

  const adCopyMutation = useMutation({
    mutationFn: (advertiserIds: string[]) =>
      searchAdCopy({
        data: {
          projectId,
          advertiserIds,
          advertiserSearchId: selectedSearchId ?? undefined,
        },
      }),
    onSuccess: (result) => setAdCopySearchId(result.searchId),
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Ad copy search failed."));
    },
  });

  const adCopyQuery = useQuery({
    queryKey: ["adCopySearch", projectId, adCopySearchId],
    queryFn: () =>
      getAdCopySearch({ data: { projectId, searchId: adCopySearchId! } }),
    enabled: adCopySearchId != null && !adCopyMutation.data,
  });

  const advertisers = advertiserSearchMutation.data?.advertisers ?? [];
  const ads = adCopyMutation.data?.ads ?? adCopyQuery.data?.ads ?? [];

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-base-300 bg-base-100 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = keyword.trim();
          if (!trimmed) return;
          advertiserSearchMutation.mutate(trimmed);
        }}
      >
        <label className="text-sm font-medium" htmlFor="ads-keyword">
          Keyword
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="input input-bordered flex-1 min-w-64 items-center gap-2">
            <Search className="size-4 text-base-content/50" />
            <input
              id="ads-keyword"
              type="text"
              className="grow"
              placeholder="e.g. sim racing pedals"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              advertiserSearchMutation.isPending || keyword.trim() === ""
            }
          >
            {advertiserSearchMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Find advertisers
          </button>
        </div>
        <p className="mt-2 text-xs text-base-content/60">
          Finds advertisers running Google Ads on this keyword (Google Ads
          Transparency Center data). Select advertisers below to pull their
          actual running ad copy. Uses DataForSEO credits.
        </p>
      </form>

      {historyQuery.data && historyQuery.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-base-content/60">Past searches:</span>
          {historyQuery.data.map((run) => (
            <span key={run.searchId} className="badge badge-outline badge-lg">
              {run.keyword}
            </span>
          ))}
        </div>
      )}

      {advertisers.length > 0 && (
        <div className="rounded-xl border border-base-300 bg-base-100 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Advertiser</th>
                <th>Domain</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {advertisers.map((row, index) => {
                const id = advertiserId(row);
                const key = id ?? String(index);
                return (
                  <tr key={key}>
                    <td>
                      {id ? (
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={selectedAdvertiserIds.has(id)}
                          onChange={(event) => {
                            setSelectedAdvertiserIds((prev) => {
                              const next = new Set(prev);
                              if (event.target.checked) next.add(id);
                              else next.delete(id);
                              return next;
                            });
                          }}
                        />
                      ) : null}
                    </td>
                    <td>
                      {readString(row, "title", "advertiser_name", "name") ??
                        id ??
                        "Unknown advertiser"}
                    </td>
                    <td>{readString(row, "domain", "website") ?? "—"}</td>
                    <td>{row.verified === true ? "yes" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="p-3 border-t border-base-300">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={
                selectedAdvertiserIds.size === 0 || adCopyMutation.isPending
              }
              onClick={() => adCopyMutation.mutate([...selectedAdvertiserIds])}
            >
              {adCopyMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Megaphone className="size-4" />
              )}
              Get ad copy for {selectedAdvertiserIds.size || ""} selected
            </button>
          </div>
        </div>
      )}

      {ads.length > 0 && (
        <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Ad copy</h3>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() =>
                void navigate({
                  to: "/p/$projectId/advertising/ad-copy",
                  params: { projectId },
                  search: {
                    keyword,
                    inspirationSearchId: adCopySearchId ?? undefined,
                  },
                })
              }
            >
              Draft AI ad copy from this
            </button>
          </div>
          <ul className="space-y-2 text-sm">
            {ads.map((row, index) => (
              <li key={index} className="rounded-lg border border-base-300 p-3">
                <div className="font-medium">
                  {readString(row, "title", "headline") ?? "Untitled ad"}
                </div>
                <div className="text-base-content/70">
                  {readString(row, "description") ??
                    "No description text returned."}
                </div>
                {readString(row, "domain", "url") ? (
                  <div className="text-xs text-base-content/50 mt-1">
                    {readString(row, "domain", "url")}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
