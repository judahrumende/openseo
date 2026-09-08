---
name: shopping-research
description: "See who's visible in Google Shopping for a product keyword, how prices compare, and whether the project's own domain appears — and get an aggregate Shopping visibility snapshot for a domain."
---

# OpenSEO Shopping Research

## Goal

Answer "are we showing up in Google Shopping, and how are we priced against who does" for an ecommerce project. This is keyword-driven, not a product-feed audit — it reads live Google Shopping results, it does not ingest or manage a merchant feed.

Use this for PLA/Shopping visibility questions. For organic or paid text-ad competitors on the same keyword, use `competitor-analysis` or the Advertising Research skill instead.

## Required inputs

- `projectId`
- A product keyword or category term (e.g. "sim racing wheel", not the brand name)

If `projectId` is missing, use `list_projects` first.

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first — the business and its products decide which keywords are worth checking.
2. Before spending credits, check the research log. If the same keyword was researched within the last 30 days, reuse that result and say so instead of re-buying it.
3. On finish, write back what is durable — Shopping competitors seen repeatedly via `addCompetitors`, and a research log entry: `{ appendResearchLog: { summary: "Shopping research: <keyword>. Verdict: <conclusion>" } }`.

## OpenSEO MCP tools

- `research_shopping_products`: keyword in, current Google Shopping listings out — title, seller, price, rating, position — plus a min/max/median price-band summary and whether the project's own domain appears (and where). Backed by DataForSEO's Merchant API, which crawls asynchronously: most calls complete within the one request, but a slow crawl can return `status: "processing"` with a `runId` — call the tool again with that `runId` (no new keyword) to resume for free. Charges credits on the initial call only.
- `get_shopping_domain_overview`: an aggregate Shopping visibility snapshot for one domain (defaults to the project's own). This endpoint's exact response shape was not verified against a live call while this tool was built, so it returns an unshaped object rather than named fields — read it for whatever DataForSEO actually sends. Prefer `research_shopping_products` for anything you plan to compare or reason about field-by-field; use this only when the user specifically wants a domain-level rollup rather than a keyword-level listing comparison. Same async pattern and per-call charging as above.

## Workflow

1. Resolve `projectId` and ground the request in project context — which product lines actually matter to this business.
2. Call `research_shopping_products` for each keyword the user cares about (or the project's top product terms if none were given). If a call comes back `"processing"`, call it again with the returned `runId` after 30-60 seconds rather than starting a new search.
3. Read the price-band summary against the project's own listing (if it appears) or against where the user says their price sits: below the min is a race-to-the-bottom risk worth flagging, above the max means the listing likely isn't converting on price alone.
4. Note who repeats across keywords — a seller showing up on every product term is the real Shopping competitor, not whoever happened to rank #1 once.
5. If the project's own domain never appears across the keywords checked, say so plainly — that is itself the finding, not a null result to skip past.
6. Only reach for `get_shopping_domain_overview` when the user wants a single domain-level snapshot rather than a per-keyword comparison.

## Output format

- One row per keyword: top 3-5 listings (seller, price, rating, position), the price band (min/median/max), and whether/where the project's own domain appears.
- A one-line verdict per keyword: visible and competitively priced / visible but mispriced / not visible.
- Close with the sellers that repeat across keywords — the actual Shopping competitive set.

## Guardrails

- Do not present `get_shopping_domain_overview`'s raw object as a curated table — its field names are unverified; quote it or summarize cautiously, and say so if a field looks unfamiliar.
- Depth (how many listings to collect) trades off against cost — start at the default and only raise it if the user needs deeper coverage than the top results.
- A `"processing"` result is not a failure — resume it with the returned `runId`, don't restart the search (that spends credits twice).
- Don't conflate Shopping/PLA visibility with organic ranking — a domain can win organic and be entirely absent from Shopping, or the reverse.
