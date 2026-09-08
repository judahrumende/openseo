---
name: content-marketing
description: "Plan, brief, and audit content: topic clusters with search intent, an SEO content brief with a competitor-derived word count and outline, and a content-health audit of existing pages."
---

# OpenSEO Content Marketing Toolkit

## Goal

Take a project from "what should we write about" through "here's the brief" to "is our existing content still working" using OpenSEO's Content Marketing tools. The three stages compose but also stand alone — use whichever the user actually needs.

## Required inputs

- `projectId`
- A seed keyword/topic (for topic research or a brief) or nothing (for an audit, which defaults to the project's saved key pages)

If `projectId` is missing, use `list_projects` first.

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first — the business, goal, and existing key pages/competitors shape which subtopics and briefs actually matter.
2. Before spending credits on topic research, check the research log. If the same seed was researched within the last 30 days, reuse that result and say so instead of re-buying it.
3. On finish, write back what is durable — key pages the brief is meant to fill via `addKeyPages`, and a research log entry: `{ appendResearchLog: { summary: "Content <topic research|brief|audit>: <seed/keyword/scope>. Verdict: <conclusion>" } }`.

## OpenSEO MCP tools

- `research_content_topics`: seed keyword in, subtopic clusters (grouped by shared theme and dominant search intent) out, plus a People-Also-Ask question list and Google's related searches. Charges credits (~30-100). Returns a `runId` — pass it to `generate_content_brief`'s `topicResearchRunId` to ground the brief in this research instead of a fresh single-keyword SERP lookup.
- `generate_content_brief`: target keyword in, a full brief out — title options, a target word count derived from live competitor page word counts (not guessed), an H2/H3 outline, entities to cover, and a target reading level. Requires `OPENROUTER_API_KEY` to be configured on the deployment; if it fails with `AI_FEATURE_NOT_CONFIGURED`, tell the user to set that up (self-hosted deployments only — hosted OpenSEO always has it) rather than retrying. Charges credits for one SERP lookup plus the LLM generation cost.
- `run_content_audit`: scores a project's pages (explicit URLs, or the project's saved key pages when omitted) for thin content, whether the target keyword is in the title/H1, and a decay signal (Search Console clicks/impressions, last 90 days vs the prior 90). Free — no DataForSEO credits. Decay and keyword-source-from-Search-Console both need GSC connected; without it those checks report "unavailable" rather than failing.
- `get_project_context` / `update_project_context`, `list_saved_keywords` / `save_keywords`: shared project memory and keyword bank — reuse before re-researching.

## Workflow

1. Resolve `projectId` and ground the request in project context.
2. **Topic planning**: call `research_content_topics` with the seed. Present the clusters ranked by combined search volume, each with its dominant intent, plus the standout PAA questions. Ask the user which cluster(s) to write for before generating briefs — do not generate a brief per cluster unprompted.
3. **Brief**: for the chosen target keyword, call `generate_content_brief`, passing the topic-research `runId` when one exists so the outline and entities are grounded in the fuller research rather than a single SERP snapshot. Before calling it, check `run_content_audit` (or the project's key pages) for a page that might already cover this keyword — flag it instead of silently recommending a duplicate article.
4. **Audit**: call `run_content_audit` when the user wants to know whether existing content is working, before recommending new content, or after a brief has shipped and enough time has passed to check performance. With no explicit URLs it uses the project's saved key pages — if that list is empty, ask for URLs or suggest adding key pages first (`update_project_context`).
5. Turn flags into next actions: `thin_content` → expand toward the brief's word count; `missing_keyword_in_title`/`missing_keyword_in_h1` → a specific rewrite, quoted; `declining_performance` → treat as a refresh candidate, and consider running `generate_content_brief` for that same keyword to see what changed in the SERP.

## Output format

- **Topic research**: a short table of clusters (label, intent, combined volume, sample keywords), then the top PAA questions.
- **Brief**: title options, target word count with the competitor sample size it came from, the outline as a nested list, entities to cover, target reading level.
- **Audit**: one row per page — word count, target keyword and its source (manual vs. Search Console), title/H1 match, decay status, flags. Lead with the flagged pages, not the clean ones.
- Always end with a clear next action, not just the raw data.

## Guardrails

- Do not invent metrics or word counts — if a value comes back null (e.g. no competitor pages could be fetched, or GSC isn't connected), say so plainly instead of estimating.
- Do not generate a content brief for a keyword the content audit shows is already well covered by a healthy, non-declining page — surface that instead.
- Content Brief needs a configured OpenRouter key; do not attempt to substitute a hand-written outline when the tool reports it isn't configured — tell the user how to fix it (`OPENROUTER_API_KEY`, see the in-app setup guide).
- Content audits are capped at 20 pages per run — for a larger set, run it in batches and say so.
