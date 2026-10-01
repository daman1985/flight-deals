/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
import type { Metadata } from "next";

import Link from "next/link";

import { ConfirmedAlertLedger } from "@/app/_components/confirmed-alert-ledger";
import { createClient } from "@/lib/supabase/server";
import { getConfirmedInAppAlerts } from "@/lib/supabase/confirmed-alerts";

export const metadata: Metadata = { title: "Briefing" };

export default async function DealFeedPage() {
  const supabase = await createClient();
  const [watchCountResult, confirmedAlertResult] = await Promise.all([
    supabase
      .from("watches")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    getConfirmedInAppAlerts(supabase, { limit: 12 }),
  ]);
  const liveWatchCount = watchCountResult.count ?? 0;
  const confirmedAlerts = confirmedAlertResult.entries;
  const alertCountLabel = confirmedAlertResult.error
    ? "—"
    : confirmedAlerts.length === 12
      ? "12+"
      : String(confirmedAlerts.length).padStart(2, "0");

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
        <div><dt>Recent alerts shown</dt><dd>{alertCountLabel}</dd></div>
        <div><dt>Provider state</dt><dd>Proven</dd></div>
        <div><dt>Scheduling</dt><dd>Pending</dd></div>
      </dl>

      <section className="quiet-feed confirmed-feed" aria-labelledby="confirmed-heading">
        <div className="section-number" aria-hidden="true">{alertCountLabel}</div>
        <div className="quiet-copy">
          <p className="eyebrow">Confirmed signal ledger</p>
          <h2 id="confirmed-heading">Confirmed fare relationships.</h2>
          <p className="confirmed-feed-intro">
            Only in-app alerts whose fare relationship has been reconfirmed appear here. Each
            entry keeps its route, travel dates, cabin prices, and confirmation time together.
          </p>
          <ConfirmedAlertLedger
            alerts={confirmedAlerts}
            emptyMessage={confirmedAlertResult.error
              ? "Confirmed in-app alerts could not be loaded right now."
              : "No confirmed in-app alerts yet. A signal appears here only after a fare relationship is reconfirmed."}
          />
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
