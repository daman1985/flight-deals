# `fli` Provider Investigation

Investigated against `punitarani/fli` commit `881aee5ff4321e81ea2157cb44be94ce6a21dc1b` and package version `0.10.0` on 2026-09-28.

## Confirmed capabilities

- Cabin values: Economy, Premium Economy, Business, and First.
- Exact one-way and round-trip searches.
- Flexible-date searches through `SearchDates`, capped at 93 dates.
- Stop filters: any, nonstop, one stop or fewer, and two stops or fewer.
- Adult passenger counts and additional child/infant categories.
- Locale and currency controls.
- A global token-bucket rate limiter targeting Google’s 10 requests/second ceiling.
- Automatic retries for transient missing-page payloads.

## Round-trip structure

`SearchFlights.search()` returns `list[FlightResult | tuple[FlightResult, ...]] | None`. Current round-trip examples iterate `(outbound, return_flight)` tuples. The combined price is surfaced on the outbound result in the documented example. A round trip costs one outbound page fetch plus one fetch for each expanded outbound candidate; `top_n` defaults to 5 and is capped at 10.

The adapter uses `top_n=1` for the controlled proof to minimize load. It handles both tuple and single-result shapes defensively and rejects unpriced or structurally incomplete rows.

## Reliability and completeness limits

- Current searches read inline data from Google’s public Flights page. The older RPC path requires a browser-generated header.
- Expect fewer results than the previous RPC transport, typically roughly 20–45 itineraries before client-side filters.
- Some filters are applied client-side, so filtering can produce an empty list even when the fetched page contained flights.
- An occasional HTTP 200 page lacks the expected data blob; `fli` retries this case twice with short backoff before raising `SearchParseError`.
- Consent pages, transport failures, response-shape changes, and sparse passenger/cabin combinations can all produce missing data.
- Children and infants can substantially thin premium-cabin results.
- Multi-city and provider booking-option retrieval are currently unsupported by the public-page transport.

An empty response is therefore classified as incomplete unless the provider gives an explicit no-inventory signal. It is never treated as a price observation.

## Errors used by the adapter

- `SearchTimeoutError`
- `SearchConnectionError` / `SearchCertificateError`
- `SearchHTTPError` with an optional status code
- `SearchRejectedError` with an optional gRPC-style code
- `SearchUnsupportedError`
- `SearchParseError`

HTTP 429 and rejected code 8 (`RESOURCE_EXHAUSTED`) map to `THROTTLED`. Other typed errors map to `PROVIDER_FAILURE` while retaining a bounded error code/message for health reporting.

## Vercel suitability

Vercel supports Python Functions, but this provider’s network behavior is a material risk: round trips require multiple page fetches, retry latency is external, IP reputation/consent behavior may vary, and flexible-date sweeps can consume substantial memory and requests. A single low-concurrency exact-date proof is reasonable for Preview. Persistent scans should remain isolated and move to a dedicated worker runtime if Preview testing shows blocked responses, unstable latency, or duration pressure.

## Sources

- https://github.com/punitarani/fli
- https://github.com/punitarani/fli/blob/main/README.md
- https://github.com/punitarani/fli/blob/main/fli/search/exceptions.py
- https://github.com/punitarani/fli/blob/main/fli/models/google_flights/base.py
- https://vercel.com/docs/functions/runtimes/python
