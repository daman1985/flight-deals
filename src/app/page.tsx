import type { Metadata } from "next";

import Link from "next/link";

export const metadata: Metadata = { title: "Briefing" };

export default function DealFeedPage() {
  return (
    <div className="page-frame briefing-page">
      <header className="briefing-hero">
        <div className="briefing-copy">
          <p className="folio">Private fare intelligence / Issue 00</p>
          <p className="eyebrow">The daily briefing</p>
          <h1>The upgrade is sometimes the deal.</h1>
          <p className="hero-deck">
            Fare Radar watches the distance between cabins—not just the lowest
            number on the page—so a strangely small premium cannot hide in plain sight.
          </p>
          <Link className="primary-link" href="/watches/fixture">
            Read the sample dossier <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <aside className="relationship-board" aria-label="Illustrative cabin relationship">
          <div className="board-heading">
            <span>Relationship study</span>
            <strong>Fixture / 001</strong>
          </div>
          <div className="fare-line">
            <span className="cabin-code">Y</span>
            <span><strong>Economy</strong><small>reference cabin</small></span>
            <b>$914</b>
          </div>
          <div className="fare-step is-signal">
            <span>upgrade gap</span><strong>+$68 / +7.4%</strong>
          </div>
          <div className="fare-line is-signal">
            <span className="cabin-code">W</span>
            <span><strong>Premium Economy</strong><small>unusual proximity</small></span>
            <b>$982</b>
          </div>
          <div className="fare-step">
            <span>next cabin</span><strong>+$1,958 / ×3.0</strong>
          </div>
          <div className="fare-line">
            <span className="cabin-code">J</span>
            <span><strong>Business</strong><small>comparison cabin</small></span>
            <b>$2,940</b>
          </div>
          <p className="board-caption">Illustrative CAD round-trip fares. Not live.</p>
        </aside>
      </header>

      <dl className="briefing-ledger" aria-label="Monitoring summary">
        <div><dt>Live watches</dt><dd>00</dd></div>
        <div><dt>Verified signals</dt><dd>00</dd></div>
        <div><dt>Provider state</dt><dd>Offline</dd></div>
        <div><dt>Display mode</dt><dd>Fixture</dd></div>
      </dl>

      <section className="quiet-feed" aria-labelledby="quiet-heading">
        <div className="section-number" aria-hidden="true">00</div>
        <div className="quiet-copy">
          <p className="eyebrow">Signal ledger</p>
          <h2 id="quiet-heading">Nothing has earned the front page yet.</h2>
          <p>
            That is the honest state: monitoring is not connected, so there are no
            verified anomalies to publish. When evidence arrives, each entry will show
            the route, cabin gap, comparison scope, freshness, and search health together.
          </p>
        </div>
        <div className="reading-key" aria-label="How to read a future signal">
          <p className="eyebrow">Reading key</p>
          <ol>
            <li><span>01</span><strong>Relationship</strong><small>Which cabin gap moved?</small></li>
            <li><span>02</span><strong>Evidence</strong><small>Against what typical range?</small></li>
            <li><span>03</span><strong>Trust</strong><small>How fresh and complete?</small></li>
          </ol>
          <Link className="text-link" href="/watches">View watch registry →</Link>
        </div>
      </section>
    </div>
  );
}
