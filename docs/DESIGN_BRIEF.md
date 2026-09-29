# Design Brief — Editorial Ledger

This brief synthesizes the product handoff and the September 2026 design review supplied by the product owner. It guides implementation without changing milestone scope.

## Product expression

The interface should read like a well-edited fare intelligence briefing, not a dashboard or booking engine. Every anomaly is a sentence first: what changed, why the cabin relationship is unusual, how fresh the evidence is, and which constraints define the comparison.

## Durable principles

1. Use a warm-paper canvas, restrained serif headlines, grotesk UI text, and tabular numerals.
2. Structure feed content with hierarchy and hairlines rather than repetitive cards.
3. Reserve one signal color for unusual value. Never use green/red market semantics.
4. Show freshness, completeness, scope, and reconfirmation directly on the surface.
5. Prefer derived cabin-spread visuals over multi-cabin price charts on a shared dollar axis.
6. Direct-label charts and provide accessible table equivalents.
7. Use plain-language trust states: checked, reconfirmed, partial, stale, and ended.
8. Gate alerts in product logic so calmness comes from signal quality, not decorative minimalism.

## Initial shell

Milestone 0 includes only:

- a navigation shell;
- a Deal Feed empty state;
- a Watches empty state;
- one Watch Detail example clearly marked as fixture data.

The shell may establish tokens and responsive structure, but it must not imply that anomaly detection, alerting, historical confidence, or complete horizon scanning already works.

## Core visualization direction

- Primary: a premium-spread strip comparing today’s premium percentage with a typical band and median.
- Secondary: a typographic cabin ladder with exact adjacent deltas.
- Historical: one claim per chart, followed later by per-cabin small multiples.

## Accessibility baseline

- WCAG 2.2 AA.
- Text contrast of at least 4.5:1 and meaningful non-text marks at least 3:1.
- Status is never communicated by color alone.
- Visible focus, keyboard navigation, reduced motion, 44px product-standard targets, and table fallbacks for charts.

## Explicit exclusions

No translucent data surfaces, card-grid feed, neon gradients, AI badges, ticker motion, Buy/Wait forecasts, oversized hero charts, merged cabin categories, or hidden freshness metadata.
