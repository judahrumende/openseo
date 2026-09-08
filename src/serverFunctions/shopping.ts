import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { resolveMarket } from "@/shared/keyword-locations";
import { AppError } from "@/server/lib/errors";
import { ShoppingProductsService } from "@/server/features/shopping/services/ShoppingProductsService";
import { ShoppingOverviewService } from "@/server/features/shopping/services/ShoppingOverviewService";
import {
  getShoppingDomainOverviewInputSchema,
  getShoppingProductsSearchSchema,
  listShoppingDomainOverviewsSchema,
  listShoppingProductSearchesSchema,
  pollShoppingDomainOverviewSchema,
  searchShoppingProductsInputSchema,
} from "@/types/schemas/shopping";

// ---------------------------------------------------------------------------
// Product search (merchant/google/products)
// ---------------------------------------------------------------------------

export const searchShoppingProducts = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchShoppingProductsInputSchema)
  .handler(async ({ data, context }) =>
    ShoppingProductsService.search(
      {
        projectId: context.projectId,
        keyword: data.keyword,
        depth: data.depth,
        projectDomain: context.project.domain ?? null,
        userId: context.userId,
        ...resolveMarket(data, context.project),
      },
      context,
    ),
  );

export const getShoppingProductsSearch = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getShoppingProductsSearchSchema)
  .handler(async ({ data, context }) =>
    ShoppingProductsService.pollOnce(
      data.runId,
      context.projectId,
      context.project.domain ?? null,
    ),
  );

export const listShoppingProductSearches = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listShoppingProductSearchesSchema)
  .handler(async ({ context }) =>
    ShoppingProductsService.listSearches(context.projectId),
  );

// ---------------------------------------------------------------------------
// Domain overview (merchant/google/overview)
// ---------------------------------------------------------------------------

export const getShoppingDomainOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getShoppingDomainOverviewInputSchema)
  .handler(async ({ data, context }) => {
    const targetDomain = data.targetDomain ?? context.project.domain;
    if (!targetDomain) {
      throw new AppError(
        "VALIDATION_ERROR",
        "This project has no domain set — pass targetDomain or set a domain in project settings.",
      );
    }
    return ShoppingOverviewService.getOverview(
      {
        projectId: context.projectId,
        targetDomain,
        userId: context.userId,
        ...resolveMarket(data, context.project),
      },
      context,
    );
  });

export const pollShoppingDomainOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(pollShoppingDomainOverviewSchema)
  .handler(async ({ data, context }) =>
    ShoppingOverviewService.pollOnce(data.runId, context.projectId),
  );

export const listShoppingDomainOverviews = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listShoppingDomainOverviewsSchema)
  .handler(async ({ context }) =>
    ShoppingOverviewService.listOverviews(context.projectId),
  );
