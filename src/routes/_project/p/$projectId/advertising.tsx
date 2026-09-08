import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/advertising")({
  component: AdvertisingLayout,
});

const tabs = [
  {
    to: "/p/$projectId/advertising" as const,
    label: "Competitor Ads",
    exact: true,
  },
  {
    to: "/p/$projectId/advertising/ad-copy" as const,
    label: "AI Ad Copy",
  },
];

function AdvertisingLayout() {
  const { projectId } = Route.useParams();

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Advertising Research</h1>
          <p className="text-sm text-base-content/70">
            See who&apos;s running Google Ads on your keywords, read their
            actual ad copy, and draft your own
          </p>
        </div>

        <div role="tablist" className="tabs tabs-border">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              role="tab"
              to={tab.to}
              params={{ projectId }}
              activeOptions={{ exact: tab.exact ?? false }}
              className="tab"
              activeProps={{ className: "tab-active", "aria-selected": true }}
              inactiveProps={{ "aria-selected": false }}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <Outlet />
      </div>
    </div>
  );
}
