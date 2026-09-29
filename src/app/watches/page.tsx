import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";

export const metadata: Metadata = { title: "Watches" };

export default function WatchesPage() {
  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">Monitoring</p>
          <h1>Watches</h1>
        </div>
        <span className="quiet-badge">0 active</span>
      </header>
      <EmptyState
        eyebrow="No watches yet"
        title="Start with one route and let the evidence accumulate."
        body="A watch will define route, dates, cabins, and itinerary constraints. Search coverage and failures will be shown separately from any fares collected."
        actionHref="/watches/fixture"
        actionLabel="Open the fixture watch detail"
        note="Watch creation is intentionally deferred beyond this foundation."
      />
    </div>
  );
}
