# Project Instructions

This repository implements a private cross-cabin airfare anomaly monitor. The product and engineering source of truth is `CROSS_CABIN_FARE_RADAR_HANDOFF.md`, supplied outside the repository by the product owner. `docs/DESIGN_BRIEF.md` records the approved UI research direction but does not expand product scope.

## Product thesis

Detect unusual relationships between Economy, Premium Economy, Business, and eventually First through persistent monitoring. Do not turn this into a generic flight-search, booking, or itinerary-planning product.

## Stack

- Next.js App Router, React, and TypeScript
- Supabase/Postgres with migrations and RLS
- Vercel for the web application and preview deployments
- Isolated Python fare-search worker
- `fli` as the first provider, always behind an adapter

## Engineering rules

1. Provider-specific code stays behind adapters.
2. Domain models must not depend on `fli`.
3. Fare math must be deterministic and tested.
4. Do not use an LLM for anomaly scoring.
5. Missing or incomplete provider results are never price increases.
6. Search health is recorded independently from fare observations.
7. Preserve raw provider payloads when practical and keep them private.
8. Reconfirm high-severity anomalies before alerting in later milestones.
9. Prefer reviewed migrations over ad-hoc schema edits.
10. Keep secrets server-side and never commit `.env.local` or credentials.
11. Normal CI must use fixtures and must never call Google Flights.
12. Keep scope limited to the active milestone.

## UI direction

Use the Editorial Ledger direction documented in `docs/DESIGN_BRIEF.md`: premium, calm, editorial, precise, accessible, and highly scannable. Avoid generic SaaS dashboards, card grids, glass effects, neon/AI styling, trading-terminal conventions, low-contrast text, and unscoped claims.

Every deal must clearly answer: where, when, cabin, price, why unusual, confidence, and freshness/reconfirmation.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
