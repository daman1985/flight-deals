import type { Metadata } from "next";

import Link from "next/link";

export const metadata: Metadata = { title: "Watches" };

export default function WatchesPage() {
  return (
    <div className="page-frame watches-page">
      <header className="registry-header">
        <div>
          <p className="folio">Registry / 00 live dossiers</p>
          <p className="eyebrow">Monitoring desk</p>
          <h1>Route dossiers</h1>
          <p className="hero-deck">
            One route, one date scope, every requested cabin. Search failures stay
            visible instead of masquerading as fare changes.
          </p>
        </div>
        <div className="registry-count" aria-label="Zero active watches">
          <strong>00</strong><span>active</span>
        </div>
      </header>

      <section className="registry" aria-labelledby="registry-heading">
        <div className="registry-rule">
          <h2 id="registry-heading">Development fixture</h2>
          <span>Sample data / non-live</span>
        </div>
        <Link className="watch-entry" href="/watches/fixture">
          <span className="entry-index">001</span>
          <span className="entry-route"><strong>YVR</strong><i>to</i><strong>SNA</strong></span>
          <span className="entry-scope">Nov 12–16, 2026<small>4 nights / exact dates</small></span>
          <span className="entry-cabins">Y · W · J<small>3 requested cabins</small></span>
          <span className="entry-state">Fixture<small>not connected</small></span>
          <span className="entry-arrow" aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className="registry-empty" aria-labelledby="empty-registry-heading">
        <div className="section-number" aria-hidden="true">—</div>
        <div>
          <p className="eyebrow">Live registry</p>
          <h2 id="empty-registry-heading">No active watches yet.</h2>
        </div>
        <p>
          Watch creation is intentionally deferred beyond this foundation. The row above
          is a design fixture for inspecting the future dossier experience.
        </p>
      </section>
    </div>
  );
}
