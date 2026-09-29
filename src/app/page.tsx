import type { Metadata } from "next";

import { EmptyState } from "@/app/_components/empty-state";

export const metadata: Metadata = { title: "Deal Feed" };

export default function DealFeedPage() {
  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cross-cabin intelligence</p>
          <h1>Deal Feed</h1>
        </div>
        <p className="header-status" aria-live="polite">
          No live monitoring connected
        </p>
      </header>
      <div className="digest-line">
        <span>Since you last looked</span>
        <strong>No verified anomalies yet</strong>
      </div>
      <EmptyState
        eyebrow="Quiet by design"
        title="The feed begins when a cabin relationship earns your attention."
        body="Once monitoring is connected, this page will show only verified relationships—such as Premium Economy unusually close to Economy—with freshness and search health kept visible."
        actionHref="/watches"
        actionLabel="View watches"
        note="No provider search is triggered from this fixture shell."
      />
    </div>
  );
}
