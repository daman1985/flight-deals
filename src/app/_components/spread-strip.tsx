type SpreadStripProps = {
  current: number;
  median: number;
  p25: number;
  p75: number;
  label: string;
};

const MIN = -20;
const MAX = 100;

function position(value: number) {
  const bounded = Math.max(MIN, Math.min(MAX, value));
  return ((bounded - MIN) / (MAX - MIN)) * 100;
}

export function SpreadStrip({ current, median, p25, p75, label }: SpreadStripProps) {
  const description = `${label}: today ${current.toFixed(1)} percent, typical median ${median.toFixed(0)} percent, typical range ${p25.toFixed(0)} to ${p75.toFixed(0)} percent.`;

  return (
    <figure className="spread-figure">
      <figcaption>{label}</figcaption>
      <div className="spread-track" role="img" aria-label={description}>
        <span className="spread-zero" style={{ left: `${position(0)}%` }} />
        <span
          className="spread-band"
          style={{
            left: `${position(p25)}%`,
            width: `${position(p75) - position(p25)}%`,
          }}
        />
        <span className="spread-median" style={{ left: `${position(median)}%` }} />
        <span className="spread-current" style={{ left: `${position(current)}%` }} />
      </div>
      <div className="spread-labels" aria-hidden="true">
        <span>Same price</span>
        <span>Typical {median.toFixed(0)}%</span>
        <strong>Fixture today +{current.toFixed(1)}%</strong>
      </div>
    </figure>
  );
}
