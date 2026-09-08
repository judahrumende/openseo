import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/content")({
  component: ContentLayout,
});

const tabs = [
  {
    to: "/p/$projectId/content" as const,
    label: "Topic Research",
    exact: true,
  },
  { to: "/p/$projectId/content/briefs" as const, label: "Content Brief" },
  { to: "/p/$projectId/content/audit" as const, label: "Content Audit" },
];

function ContentLayout() {
  const { projectId } = Route.useParams();

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Content Marketing</h1>
          <p className="text-sm text-base-content/70">
            Plan topics, brief writers, and audit what&apos;s already published
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
