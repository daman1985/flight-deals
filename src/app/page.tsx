import type { Metadata } from "next";

import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Briefing" };

export default async function DealFeedPage() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("watches")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  const liveWatchCount = count ?? 0;

  return (
    <div className="page-frame briefing-page">
      <header className="briefing-hero">
        <div className="briefing-copy">
          <p className="folio">Private cross-cabin monitoring</p>
          <p className="eyebrow">The daily briefing</p>
          <h1>The upgrade is sometimes the deal.</h1>
          <p className="hero-deck">
            Fare Radar watches the distance between cabins—not just the lowest
            number on the page—so a strangely small premium cannot hide in plain sight.
          </p>
          <Link className="primary-link" href="/watches">
            Open live watches <span aria-hidden="true">→</span>
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
        <div><dt>Live watches</dt><dd>{String(liveWatchCount).padStart(2, "0")}</dd></div>
        <div><dt>Verified signals</dt><dd>00</dd></div>
        <div><dt>Provider state</dt><dd>Proven</dd></div>
        <div><dt>Scheduling</dt><dd>Pending</dd></div>
      </dl>

      <section className="quiet-feed" aria-labelledby="quiet-heading">
        <div className="section-number" aria-hidden="true">00</div>
        <div className="quiet-copy">
          <p className="eyebrow">Signal ledger</p>
          <h2 id="quiet-heading">Nothing has earned the front page yet.</h2>
          <p>
            That is the honest state: live acquisition works, while unattended scheduling
            and alerts are still being connected. Every watch keeps freshness, missing fares,
            and search health visible instead of implying certainty the data cannot support.
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
