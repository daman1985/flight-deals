import type { Metadata } from "next";
import Link from "next/link";

import { CabinLadder } from "@/app/_components/cabin-ladder";
import { SpreadStrip } from "@/app/_components/spread-strip";

export const metadata: Metadata = { title: "YVR to SNA fixture" };

export default function FixtureWatchPage() {
  return (
    <div className="page-frame detail-page">
      <header className="watch-hero">
        <div className="watch-topline">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/watches">Watches</Link>
            <span aria-hidden="true">/</span>
            <span>Dossier 001</span>
          </nav>
          <p className="fixture-label">Fixture data / not a live fare</p>
        </div>
        <div className="route-lockup">
          <div>
            <p className="folio">Exact-date watch / 4 nights</p>
            <h1><span>YVR</span><i aria-hidden="true">→</i><span>SNA</span></h1>
            <p className="route-names">Vancouver <span aria-hidden="true">—</span> Orange County</p>
          </div>
          <dl className="route-facts">
            <div><dt>Outbound</dt><dd>12 Nov 2026</dd></div>
            <div><dt>Return</dt><dd>16 Nov 2026</dd></div>
            <div><dt>Cabins</dt><dd>Y / W / J</dd></div>
            <div><dt>Currency</dt><dd>CAD</dd></div>
          </dl>
          <div className="trust-block" aria-label="Fixture trust status">
            <span className="system-dot" aria-hidden="true" />
            <strong>Not connected</strong>
            <small>Illustrative values only</small>
          </div>
        </div>
      </header>

      <section className="signal-brief" aria-labelledby="state-heading">
        <div className="signal-story">
          <p className="eyebrow">Example relationship / 01</p>
          <h2 id="state-heading">Premium Economy is only <em>$68 more</em> than Economy.</h2>
          <p>
            Same route, dates, and stop constraint. The relationship is the story;
            these particular fares are fixture values, not collected evidence.
          </p>
        </div>
        <div className="signal-metric">
          <span>Fixture premium</span>
          <strong>+7.4%</strong>
          <small>Illustrative median +48%</small>
        </div>
      </section>

      <CabinLadder />

      <section className="data-section" aria-labelledby="spread-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Premium spread / 03</p>
            <h2 id="spread-heading">The fixture sits well below its reference band.</h2>
          </div>
          <p className="section-scope">Illustrative range / no historical sample</p>
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
          <p className="eyebrow">Search health / 04</p>
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
