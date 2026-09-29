const cabinRows = [
  { code: "Y", cabin: "Economy", price: "$914", delta: null },
  {
    code: "W",
    cabin: "Premium Economy",
    price: "$982",
    delta: "+$68 · +7.4%",
    typical: "typical +48%",
    unusual: true,
  },
  {
    code: "J",
    cabin: "Business",
    price: "$2,940",
    delta: "+$1,958 · ×3.0",
    typical: "typical ×3.6",
  },
] as const;

export function CabinLadder() {
  return (
    <section className="data-section" aria-labelledby="cabin-ladder-heading">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Cabin ladder / 02</p>
          <h2 id="cabin-ladder-heading">The premium step is unusually small.</h2>
        </div>
        <p className="section-scope">Fixture prices · CAD · round trip</p>
      </div>
      <ol className="cabin-ladder" aria-label="Fixture fares by cabin">
        {cabinRows.map((row) => (
          <li key={row.cabin}>
            {row.delta ? (
              <p
                className={
                  "unusual" in row && row.unusual
                    ? "ladder-delta is-unusual"
                    : "ladder-delta"
                }
              >
                <span aria-hidden="true">↳</span> {row.delta}
                <small>{row.typical}</small>
              </p>
            ) : null}
            <div className="cabin-row">
              <span className="ladder-code" aria-hidden="true">{row.code}</span>
              <span className="ladder-name">{row.cabin}</span>
              <strong>{row.price}</strong>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
