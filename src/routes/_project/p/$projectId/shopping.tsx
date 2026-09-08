import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/shopping")({
  component: ShoppingLayout,
});

const tabs = [
  {
    to: "/p/$projectId/shopping" as const,
    label: "Product Search",
    exact: true,
  },
  {
    to: "/p/$projectId/shopping/domain" as const,
    label: "Domain Overview",
  },
];

function ShoppingLayout() {
  const { projectId } = Route.useParams();

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Shopping Research</h1>
          <p className="text-sm text-base-content/70">
            See who&apos;s visible in Google Shopping for your product keywords,
            how prices compare, and where your own listings rank
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
