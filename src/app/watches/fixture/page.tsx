import type { Metadata } from "next";
import Link from "next/link";

import { CabinLadder } from "@/app/_components/cabin-ladder";
import { SpreadStrip } from "@/app/_components/spread-strip";

export const metadata: Metadata = { title: "YVR to SNA fixture" };

export default function FixtureWatchPage() {
  return (
    <div className="page-frame detail-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/watches">Watches</Link>
        <span aria-hidden="true">/</span>
        <span>YVR → SNA</span>
      </nav>
      <header className="watch-hero">
        <div>
          <p className="fixture-label">Fixture data · not a live fare</p>
          <p className="eyebrow">Exact-date development watch</p>
          <h1>YVR <span aria-hidden="true">→</span> SNA</h1>
          <p className="watch-dates">Nov 12–16, 2026 · 4 nights · Economy / PE / Business</p>
        </div>
        <div className="trust-block" aria-label="Fixture trust status">
          <strong>Not connected</strong>
          <span>Illustrative values only</span>
        </div>
      </header>

      <section className="state-sentence" aria-labelledby="state-heading">
        <p className="eyebrow">Example relationship</p>
        <h2 id="state-heading">
          Premium Economy is only <span>$68 more</span> than Economy in this fixture.
        </h2>
        <p>
          The comparison is intentionally scoped to the same route, dates, and stop
          constraint. Live evidence has not been collected yet.
        </p>
      </section>

      <CabinLadder />

      <section className="data-section" aria-labelledby="spread-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Premium spread</p>
            <h2 id="spread-heading">Today’s fixture sits well below the typical band.</h2>
          </div>
          <p className="section-scope">Illustrative band · no historical sample</p>
        </div>
        <SpreadStrip
          current={7.4}
          median={48}
          p25={38}
          p75={58}
          label="Premium Economy premium over Economy"
        />
      </section>

      <section className="scan-health" aria-labelledby="health-heading">
        <div>
          <p className="eyebrow">Search health</p>
          <h2 id="health-heading">Waiting for the controlled acquisition proof.</h2>
        </div>
        <dl>
          <div><dt>Provider</dt><dd>fli · not run</dd></div>
          <div><dt>Coverage</dt><dd>0 of 3 cabins</dd></div>
          <div><dt>Last successful scan</dt><dd>None</dd></div>
        </dl>
      </section>
    </div>
  );
}
