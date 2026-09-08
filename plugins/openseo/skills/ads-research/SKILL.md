---
name: ads-research
description: "See which advertisers run Google Ads on a keyword, read their actual ad copy via the Ads Transparency Center, and draft your own AI-generated headline/description variants."
---

# OpenSEO Advertising Research

## Goal

Two related but separate jobs: find who is paying to advertise on a keyword and what their ads actually say, then optionally draft original ad copy informed by that. Don't skip straight to drafting — competitor research and AI drafting are deliberately two different tools so a draft can cite what it was inspired by.

Use this for paid-search competitive intelligence. For Shopping/PLA competitors, use the Shopping Research skill. For organic competitors, use `competitor-analysis`.

## Required inputs

- `projectId`
- A keyword to check (e.g. "sim racing pedals")

If `projectId` is missing, use `list_projects` first.

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first — the business and its keywords decide what's worth checking.
2. Before spending credits, check the research log. If the same keyword was researched within the last 30 days, reuse that result and say so instead of re-buying it.
3. On finish, write back what is durable — advertisers seen repeatedly via `addCompetitors`, and a research log entry: `{ appendResearchLog: { summary: "Ad research: <keyword>. Verdict: <conclusion>" } }`.

## OpenSEO MCP tools

- `research_ad_advertisers`: keyword in, advertisers running Google Ads on it out (via Google's Ads Transparency Center) — advertiser id, name, domain, verification status where DataForSEO provides them. Returns a `searchId`. This alone does not return ad text — it's the input to `get_ad_copy`, not a substitute for it. Charges credits.
- `get_ad_copy`: advertiser ids in (from `research_ad_advertisers`, plus its `searchId` so the two stay linked), actual running ad headline/description text out where DataForSEO returns it. Returns its own `searchId` — pass that as `inspirationSearchId` to `generate_ad_copy`. Charges credits.
- `generate_ad_copy`: target keyword in, 3-5 Google Ads-style headline (<=30 chars) / description (<=90 chars) variants out, optionally grounded in real competitor copy via `inspirationSearchId`. Requires `OPENROUTER_API_KEY` configured for the deployment — a missing key fails with `AI_FEATURE_NOT_CONFIGURED`; tell the user to set that up rather than retrying or hand-writing a substitute. Charges credits for the LLM generation only (no DataForSEO cost). Does not call the two research tools itself — run them first for real inspiration.

## Workflow

1. Resolve `projectId` and ground the request in project context.
2. Call `research_ad_advertisers` for the target keyword. Present who's advertising — this alone often answers "are we facing paid competition here" even before pulling copy.
3. Pick the 2-5 advertisers actually worth reading (skip anything clearly irrelevant to the query) and call `get_ad_copy` with their advertiser ids and the `searchId` from step 2.
4. Read the copy for patterns: what angle each advertiser leads with (price, urgency, benefit, trust), and what nobody is saying yet — that gap is the opening for a draft.
5. Only call `generate_ad_copy` when the user wants a draft, passing the `get_ad_copy` call's `searchId` as `inspirationSearchId` when real competitor copy was gathered. Without prior research, drafting still works but has nothing concrete to differentiate against — say so.
6. Present variants as a starting point for the user's own review, not finished ad copy to ship unedited.

## Output format

- Advertiser list: name/domain, verification status where known.
- Ad copy sample: one block per advertiser — headline, description, the angle it's playing.
- If drafted: the variants in a table (headline | description), each with a one-phrase note on its angle, and which competitor pattern (if any) it responds to.

## Guardrails

- `generate_ad_copy` needs `OPENROUTER_API_KEY` configured — do not hand-write a substitute outline when it reports `AI_FEATURE_NOT_CONFIGURED`; tell the user how to fix it.
- Field names on advertiser/ad rows are unverified against a live DataForSEO response — read them cautiously and don't invent structure that isn't there.
- Never present a drafted variant as already-approved copy; it's a starting point, not a finished ad.
- Don't copy competitor ad text verbatim into a draft — use it as inspiration for angle and structure only.
