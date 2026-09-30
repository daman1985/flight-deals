"use client";

import { useEffect, useState } from "react";

import { evidenceFreshness, type FreshnessState } from "@/domain/trust";

export function RelativeTime({
  initialLabel,
  initialState,
  timestamp,
}: {
  initialLabel: string;
  initialState: FreshnessState;
  timestamp: string;
}) {
  const [freshness, setFreshness] = useState(() => ({
    label: initialLabel,
    state: initialState,
  }));

  useEffect(() => {
    const update = () => {
      const next = evidenceFreshness(timestamp);
      setFreshness({ label: next.label, state: next.state });
    };

    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, [timestamp]);

  return <span data-freshness={freshness.state}>{freshness.label}</span>;
}
