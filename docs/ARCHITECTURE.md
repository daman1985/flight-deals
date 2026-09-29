# Architecture

## Scope

This foundation proves that one exact YVR → SNA round trip can be searched independently in Economy, Premium Economy, and Business, normalized into provider-neutral offers, and persisted without confusing provider health with price movement.

## Components

```text
Next.js App Router
  ├─ provider-neutral TypeScript domain
  ├─ Supabase server client
  └─ future authenticated product UI
             │
             ▼
Supabase/Postgres
  ├─ watches and search candidates
  ├─ search runs (health)
  ├─ fare observations (valid prices only)
  ├─ anomalies
  └─ alerts
             ▲
             │ normalized responses
Python worker
  ├─ provider-neutral request/response models
  ├─ FareProvider protocol
  ├─ FliProvider adapter
  └─ controlled sequential acquisition flow
```

The Next.js/domain layer never imports `fli`. Provider-specific structures are converted inside `worker/fare_worker/providers/fli_adapter.py`.

## Day-one spread detection

The worker evaluates only the latest quality-eligible observation batch for each
route, date pair, cabin, and currency. Comparisons require matching outbound and
return stop buckets and respect the watch's optional duration cap. Missing cabins,
incomplete results, and provider failures produce no comparison and cannot resolve
an existing anomaly.

The detector implements configurable Economy → Premium Economy near-inversions
and Premium Economy → Business value spreads. Strict inversions are high severity;
threshold matches are medium severity until the later reconfirmation milestone.
Stable UUIDv5 comparison IDs make anomaly persistence idempotent through the
existing primary key without adding a race-prone read-before-insert flow.

## Search outcomes

Every provider call produces exactly one health outcome:

- `VALID_RESULT`: at least one complete, priced offer was normalized.
- `NO_RESULT`: the provider explicitly returned no matching inventory.
- `INCOMPLETE_RESULT`: the response was empty, partially parseable, or contained unpriced/invalid rows; it must not influence price history.
- `PROVIDER_FAILURE`: transport, parsing, unsupported-search, or unexpected provider failure.
- `THROTTLED`: HTTP 429 or provider resource-exhaustion signal.

`search_runs` records all five outcomes. `fare_observations` receives rows only for valid normalized offers. This makes an empty or broken response incapable of appearing as a fare increase.

## Controlled Milestone 1 flow

The development-only script runs one search at a time:

1. Load the exact YVR → SNA dates from environment variables.
2. Search Economy, Premium Economy, and Business sequentially with `top_n=1`.
3. Persist a `search_runs` row for every attempt.
4. Persist only complete offers for valid results.
5. Print a health summary without treating missing cabins as prices.

Run it only after the dedicated Supabase project has been migrated and environment values are present:

```bash
python -m fare_worker.controlled_flow
```

It is deliberately excluded from normal CI.

## Database security

- Every public table has RLS enabled.
- `anon` has no table privileges.
- Authenticated access is scoped to `watches.user_id = auth.uid()` through direct or parent-watch policies.
- The worker uses a server-only Supabase secret key and never sends it to browser code.
- Raw provider payloads remain behind the same ownership policy and are not rendered by the client.
- Schema changes are represented by migration files.

## Deployment boundary

The Next.js application is intended for Vercel. The Python worker stays isolated because `fli` performs external page fetches, applies retries, and can require more execution time and network consistency than a normal web request. Milestone 1 will test a low-concurrency Preview deployment only; repeated scans should move to a dedicated worker runtime if Vercel proves unreliable.
