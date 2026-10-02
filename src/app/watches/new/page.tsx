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
            <p className="eyebrow">New watch</p>
            <h1>What should we watch?</h1>
          </div>
          <p className="hero-deck">
            Define the route, timing, and cabin comparison once. You can refine optional
            flight preferences after the essential monitoring question is clear.
          </p>
        </div>
      </header>
      <WatchBuilder />
    </div>
  );
}
