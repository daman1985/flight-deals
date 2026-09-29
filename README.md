# Flight Deals — Cross-Cabin Fare Radar

A private airfare monitor for detecting unusual relationships between Economy, Premium Economy, and Business fares. It is intentionally not a booking platform or a general flight-search engine.

## Current scope

This repository covers Milestone 0 and the minimum technical foundation for Milestone 1:

- Next.js application foundation
- provider-neutral fare/search contracts
- Supabase migration files with RLS
- an isolated Python `fli` adapter
- search-health and fare-observation separation
- deterministic spread calculations
- fixture-based tests with no live Google dependency
- a controlled YVR → SNA cross-cabin proof script

Historical anomaly modeling, broad date scanning, alerts, booking, AI features, and additional providers are out of scope.

## Repository layout

```text
src/                 Next.js app and provider-neutral TypeScript domain
worker/              Isolated Python fare-search worker and tests
supabase/migrations/ Reviewed database migrations
docs/                Architecture, provider research, and design direction
tests/               TypeScript unit tests and fixtures
```

## Environment variables

Copy `.env.example` to `.env.local` for local development and fill values through a secure channel. Never commit real values.

- Browser-safe: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Next.js server-only: `SUPABASE_SECRET_KEY`, `FARE_WORKER_URL`, `FARE_WORKER_SHARED_SECRET`
- Worker/provider: `FLI_SOCS_COOKIE`, `FLI_CA_BUNDLE`
- Controlled proof: `TEST_USER_ID`, `TEST_WATCH_ID`, `TEST_DEPARTURE_DATE`, `TEST_RETURN_DATE`
- Scheduler: `CRON_SECRET`

The Supabase secret key, worker secret, and cron secret must never use a `NEXT_PUBLIC_` prefix.

## Local development

```bash
npm install
npm run dev
```

For the Python worker:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e './worker[dev]'
python -m pytest worker/tests
```

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
python -m pytest worker/tests
```

Normal verification is fully offline after dependencies are installed. The controlled live acquisition flow is opt-in and documented in `docs/ARCHITECTURE.md`.
