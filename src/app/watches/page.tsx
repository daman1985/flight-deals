import type { Metadata } from "next";
import Link from "next/link";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Watches" };

type WatchRow = Pick<
  Database["public"]["Tables"]["watches"]["Row"],
  | "id"
  | "name"
  | "origin_airports"
  | "destination_airports"
  | "date_mode"
  | "exact_departure_date"
  | "exact_return_date"
  | "window_departure_start"
  | "window_departure_end"
  | "min_trip_nights"
  | "max_trip_nights"
  | "rolling_horizon_days"
  | "cabins"
  | "active"
>;

const cabinCodes: Record<string, string> = {
  ECONOMY: "Y",
  PREMIUM_ECONOMY: "W",
  BUSINESS: "J",
  FIRST: "F",
};

const shortDate = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(date: string | null) {
  return date ? shortDate.format(new Date(`${date}T00:00:00Z`)) : "Date pending";
}

function scopeFor(watch: WatchRow) {
  if (watch.date_mode === "EXACT") {
    return {
      headline: `${formatDate(watch.exact_departure_date)} – ${formatDate(watch.exact_return_date)}`,
      detail: "Exact dates",
    };
  }

  if (watch.date_mode === "FLEXIBLE_WINDOW") {
    return {
      headline: `${formatDate(watch.window_departure_start)} – ${formatDate(watch.window_departure_end)}`,
      detail: `${watch.min_trip_nights}–${watch.max_trip_nights} nights / departure window`,
    };
  }

  return {
    headline: `Next ${watch.rolling_horizon_days} days`,
    detail: `${watch.min_trip_nights}–${watch.max_trip_nights} nights / rolling horizon`,
  };
}

function airportSet(airports: string[]) {
  return airports.length > 1 ? `${airports[0]} +${airports.length - 1}` : airports[0];
}

export default async function WatchesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("watches")
    .select(
      "id,name,origin_airports,destination_airports,date_mode,exact_departure_date,exact_return_date,window_departure_start,window_departure_end,min_trip_nights,max_trip_nights,rolling_horizon_days,cabins,active",
    )
    .order("updated_at", { ascending: false });

  const watches = (data ?? []) as WatchRow[];
  const activeCount = watches.filter((watch) => watch.active).length;
  const displayCount = String(activeCount).padStart(2, "0");

  return (
    <div className="page-frame watches-page">
      <header className="registry-header">
        <div>
          <p className="folio">
            Registry / {displayCount} live {activeCount === 1 ? "dossier" : "dossiers"}
          </p>
          <p className="eyebrow">Monitoring desk</p>
          <h1>Route dossiers</h1>
          <p className="hero-deck">
            One route, one date scope, every requested cabin. Search failures stay
            visible instead of masquerading as fare changes.
          </p>
          <Link className="primary-link registry-create-link" href="/watches/new">
            Create a watch <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="registry-count" aria-label={`${activeCount} active watches`}>
          <strong>{displayCount}</strong><span>active</span>
        </div>
      </header>

      <section className="registry" aria-labelledby="live-registry-heading">
        <div className="registry-rule">
          <h2 id="live-registry-heading">Live registry</h2>
          <span>{error ? "Connection unavailable" : "Private / RLS protected"}</span>
        </div>
        {watches.map((watch, index) => {
          const scope = scopeFor(watch);
          return (
            <article className="watch-entry watch-entry-live" key={watch.id}>
              <span className="entry-index">{String(index + 1).padStart(3, "0")}</span>
              <span className="entry-route-block">
                <span className="entry-route">
                  <strong>{airportSet(watch.origin_airports)}</strong>
                  <i>to</i>
                  <strong>{airportSet(watch.destination_airports)}</strong>
                </span>
                <small>{watch.name}</small>
              </span>
              <span className="entry-scope">
                {scope.headline}<small>{scope.detail}</small>
              </span>
              <span className="entry-cabins">
                {watch.cabins.map((cabin) => cabinCodes[cabin] ?? cabin).join(" · ")}
                <small>{watch.cabins.length} requested cabins</small>
              </span>
              <span className="entry-state" data-paused={!watch.active || undefined}>
                {watch.active ? "Watching" : "Paused"}
                <small>{watch.active ? "Ready for coverage" : "Not scanning"}</small>
              </span>
              <span className="entry-arrow" aria-hidden="true">—</span>
            </article>
          );
        })}
      </section>

      {watches.length === 0 ? (
        <section className="registry-empty" aria-labelledby="empty-registry-heading">
          <div className="section-number" aria-hidden="true">—</div>
          <div>
            <p className="eyebrow">Live registry</p>
            <h2 id="empty-registry-heading">
              {error ? "The registry could not be read." : "No active watches yet."}
            </h2>
          </div>
          <p>
            {error
              ? "The session is intact, but the watch registry is temporarily unavailable. Try refreshing before creating a duplicate."
              : "Create an Exact, Window, or Anytime watch. The saved definition will become the contract for every later scan and comparison."}
          </p>
        </section>
      ) : null}

      <section className="registry fixture-registry" aria-labelledby="fixture-heading">
        <div className="registry-rule">
          <h2 id="fixture-heading">Development fixture</h2>
          <span>Sample data / non-live</span>
        </div>
        <Link className="watch-entry" href="/watches/fixture">
          <span className="entry-index">F01</span>
          <span className="entry-route"><strong>YVR</strong><i>to</i><strong>SNA</strong></span>
          <span className="entry-scope">Nov 12–16, 2026<small>4 nights / exact dates</small></span>
          <span className="entry-cabins">Y · W · J<small>3 requested cabins</small></span>
          <span className="entry-state">Fixture<small>not connected</small></span>
          <span className="entry-arrow" aria-hidden="true">↗</span>
        </Link>
      </section>
    </div>
  );
}
