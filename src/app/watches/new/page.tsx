import type { Metadata } from "next";
import Link from "next/link";

import { WatchBuilder } from "@/app/watches/new/watch-builder";

export const metadata: Metadata = { title: "New Watch" };

export default function NewWatchPage() {
  return (
    <div className="page-frame builder-page">
      <header className="builder-hero">
        <p className="breadcrumb">
          <Link href="/watches">Watches</Link>
          <span aria-hidden="true">/</span>
          <span>New watch</span>
        </p>
        <div className="builder-hero-grid">
          <div>
            <p className="folio">Watch builder / New dossier</p>
            <p className="eyebrow">Define the question</p>
            <h1>What should the radar keep watching?</h1>
          </div>
          <p className="hero-deck">
            Set the route once. Fare Radar will preserve cabin boundaries, date scope,
            and itinerary quality so every later comparison means the same thing.
          </p>
        </div>
      </header>
      <WatchBuilder />
    </div>
  );
}
