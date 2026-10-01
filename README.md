# Flight Deals — Cross-Cabin Fare Radar

A private airfare monitor for detecting unusual relationships between Economy, Premium Economy, and Business fares. It is intentionally not a booking platform or a general flight-search engine.

## Current scope

This repository covers Milestone 0 through the bounded Milestone 4 rotation loop:

- Next.js application foundation
- provider-neutral fare/search contracts
- Supabase migration files with RLS
- an isolated Python `fli` adapter
- search-health and fare-observation separation
- deterministic spread calculations
- fixture-based tests with no live Google dependency
- a controlled YVR → SNA cross-cabin proof script
- deterministic cabin-inversion and near-inversion detection
- authenticated Exact, Window, and Anytime watch creation
- cursor-based candidate generation and priority bands
- atomic, lease-backed due-work claims for low-concurrency workers
- a 15-minute GitHub Actions rotation with manual dispatch
- a live watch dossier backed by RLS-protected Supabase evidence

Historical anomaly modeling, alerts, booking, AI features, and additional providers are out of scope.

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
- Rotation bounds: `FARE_PLANNING_LIMIT_PER_WATCH`, `FARE_SCAN_BATCH_SIZE`

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
python -m pip install './worker[dev]'
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

One bounded live rotation can be run manually with:

```bash
source .venv/bin/activate
PYTHONPATH=worker python -m fare_worker.rotating_flow
```

Recurring execution is defined in `.github/workflows/fare-worker-rotation.yml` and starts
after that workflow reaches the repository's default branch with these GitHub Actions
secrets configured:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `FLI_SOCS_COOKIE` (optional)

The workflow also supports manual dispatch. Each invocation plans a bounded batch, claims
due candidates with leases, scans sequentially, and records detector output.
