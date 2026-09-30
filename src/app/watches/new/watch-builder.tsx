"use client";

import { useActionState, useState } from "react";

import {
  createWatch,
  type WatchActionState,
  type WatchFormValues,
} from "@/app/watches/new/actions";

const initialValues: WatchFormValues = {
  name: "",
  originAirports: "",
  destinationAirports: "",
  dateMode: "ANYTIME",
  exactDepartureDate: "",
  exactReturnDate: "",
  windowDepartureStart: "",
  windowDepartureEnd: "",
  minTripNights: "4",
  maxTripNights: "10",
  rollingHorizonDays: "180",
  cabins: ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS"],
  passengers: "1",
  maxStops: "1",
  maxDurationHours: "",
  peNearInversionPct: "15",
  businessVsPePct: "30",
};

const initialState: WatchActionState = { attempt: 0, message: "" };

const dateModes = [
  {
    value: "ANYTIME",
    label: "Anytime",
    note: "Keep scanning forward",
  },
  {
    value: "FLEXIBLE_WINDOW",
    label: "Window",
    note: "Depart within a date range",
  },
  {
    value: "EXACT",
    label: "Exact",
    note: "One known round trip",
  },
] as const;

const cabins = [
  { value: "ECONOMY", code: "Y", label: "Economy" },
  { value: "PREMIUM_ECONOMY", code: "W", label: "Premium Economy" },
  { value: "BUSINESS", code: "J", label: "Business" },
  { value: "FIRST", code: "F", label: "First" },
] as const;

type DateMode = (typeof dateModes)[number]["value"];

function asDateMode(value: string | undefined): DateMode {
  return dateModes.some((mode) => mode.value === value) ? (value as DateMode) : "ANYTIME";
}

function FieldError({
  errors,
  field,
}: {
  errors: WatchActionState["errors"];
  field: string;
}) {
  const message = errors?.[field]?.[0];
  return message ? <p className="builder-field-error">{message}</p> : null;
}

export function WatchBuilder() {
  const [state, formAction, pending] = useActionState(createWatch, initialState);
  const [dateMode, setDateMode] = useState<DateMode>(() => asDateMode(state.values?.dateMode));
  const values = state.values ?? initialValues;

  return (
    <form action={formAction} className="watch-builder" key={state.attempt}>
      <section className="builder-step" aria-labelledby="builder-where">
        <div className="builder-step-heading">
          <span aria-hidden="true">01</span>
          <div>
            <p className="eyebrow">Scope</p>
            <h2 id="builder-where">Where?</h2>
          </div>
          <p>Name the dossier and define both sides of the route.</p>
        </div>
        <div className="builder-fields builder-fields-three">
          <div className="builder-field builder-field-wide">
            <label htmlFor="name">Watch name</label>
            <input
              aria-describedby="name-note"
              id="name"
              maxLength={120}
              name="name"
              placeholder="West Coast winter escape"
              required
              type="text"
              defaultValue={values.name}
            />
            <small id="name-note">A private label to help you recognize this watch.</small>
            <FieldError errors={state.errors} field="name" />
          </div>
          <div className="builder-field">
            <label htmlFor="originAirports">From</label>
            <input
              autoCapitalize="characters"
              id="originAirports"
              name="originAirports"
              placeholder="YVR"
              required
              spellCheck={false}
              type="text"
              defaultValue={values.originAirports}
            />
            <small>Separate alternatives with commas.</small>
            <FieldError errors={state.errors} field="originAirports" />
          </div>
          <div className="builder-field">
            <label htmlFor="destinationAirports">To</label>
            <input
              autoCapitalize="characters"
              id="destinationAirports"
              name="destinationAirports"
              placeholder="SNA, LAX"
              required
              spellCheck={false}
              type="text"
              defaultValue={values.destinationAirports}
            />
            <small>Three-letter IATA airport codes.</small>
            <FieldError errors={state.errors} field="destinationAirports" />
          </div>
        </div>
      </section>

      <fieldset className="builder-step">
        <legend className="sr-only">When should Fare Radar look?</legend>
        <div className="builder-step-heading">
          <span aria-hidden="true">02</span>
          <div>
            <p className="eyebrow">Timing</p>
            <h2>When?</h2>
          </div>
          <p>Choose an ongoing horizon, a flexible departure window, or one exact trip.</p>
        </div>
        <div className="mode-selector">
          {dateModes.map((mode) => (
            <label className="mode-option" data-selected={dateMode === mode.value} key={mode.value}>
              <input
                checked={dateMode === mode.value}
                name="dateMode"
                onChange={() => setDateMode(mode.value)}
                type="radio"
                value={mode.value}
              />
              <strong>{mode.label}</strong>
              <small>{mode.note}</small>
            </label>
          ))}
        </div>
        <FieldError errors={state.errors} field="dateMode" />

        {dateMode === "EXACT" ? (
          <div className="builder-fields builder-fields-two mode-fields">
            <div className="builder-field">
              <label htmlFor="exactDepartureDate">Departure</label>
              <input
                defaultValue={values.exactDepartureDate}
                id="exactDepartureDate"
                name="exactDepartureDate"
                required
                type="date"
              />
              <FieldError errors={state.errors} field="exactDepartureDate" />
            </div>
            <div className="builder-field">
              <label htmlFor="exactReturnDate">Return</label>
              <input
                defaultValue={values.exactReturnDate}
                id="exactReturnDate"
                name="exactReturnDate"
                required
                type="date"
              />
              <FieldError errors={state.errors} field="exactReturnDate" />
            </div>
          </div>
        ) : null}

        {dateMode === "FLEXIBLE_WINDOW" ? (
          <div className="builder-fields builder-fields-two mode-fields">
            <div className="builder-field">
              <label htmlFor="windowDepartureStart">Window starts</label>
              <input
                id="windowDepartureStart"
                name="windowDepartureStart"
                required
                type="date"
                defaultValue={values.windowDepartureStart}
              />
              <FieldError errors={state.errors} field="windowDepartureStart" />
            </div>
            <div className="builder-field">
              <label htmlFor="windowDepartureEnd">Window ends</label>
              <input
                id="windowDepartureEnd"
                name="windowDepartureEnd"
                required
                type="date"
                defaultValue={values.windowDepartureEnd}
              />
              <FieldError errors={state.errors} field="windowDepartureEnd" />
            </div>
          </div>
        ) : null}

        {dateMode === "ANYTIME" ? (
          <div className="builder-fields mode-fields">
            <div className="builder-field">
              <label htmlFor="rollingHorizonDays">Rolling horizon</label>
              <select defaultValue={values.rollingHorizonDays} id="rollingHorizonDays" name="rollingHorizonDays">
                <option value="30">Next 30 days</option>
                <option value="90">Next 90 days</option>
                <option value="180">Next 180 days</option>
                <option value="300">Next 300 days</option>
                <option value="365">Next 365 days</option>
              </select>
              <small>New dates enter automatically as the calendar advances.</small>
              <FieldError errors={state.errors} field="rollingHorizonDays" />
            </div>
          </div>
        ) : null}
      </fieldset>

      <section className="builder-step" aria-labelledby="builder-duration">
        <div className="builder-step-heading">
          <span aria-hidden="true">03</span>
          <div>
            <p className="eyebrow">Duration</p>
            <h2 id="builder-duration">How long?</h2>
          </div>
          <p>
            {dateMode === "EXACT"
              ? "The selected outbound and return dates determine trip length."
              : "Set the acceptable stay range for generated date pairs."}
          </p>
        </div>
        {dateMode === "EXACT" ? (
          <p className="builder-derived-note">Trip length will be calculated from the exact dates above.</p>
        ) : (
          <div className="builder-fields builder-fields-two">
            <div className="builder-field">
              <label htmlFor="minTripNights">Minimum nights</label>
              <input
                defaultValue={values.minTripNights}
                id="minTripNights"
                max="60"
                min="1"
                name="minTripNights"
                required
                type="number"
              />
              <FieldError errors={state.errors} field="minTripNights" />
            </div>
            <div className="builder-field">
              <label htmlFor="maxTripNights">Maximum nights</label>
              <input
                defaultValue={values.maxTripNights}
                id="maxTripNights"
                max="60"
                min="1"
                name="maxTripNights"
                required
                type="number"
              />
              <FieldError errors={state.errors} field="maxTripNights" />
            </div>
          </div>
        )}
      </section>

      <fieldset className="builder-step">
        <legend className="sr-only">Which cabins should Fare Radar compare?</legend>
        <div className="builder-step-heading">
          <span aria-hidden="true">04</span>
          <div>
            <p className="eyebrow">Comparison set</p>
            <h2>Which cabins?</h2>
          </div>
          <p>Economy stays selected as the reference; choose the premium cabins to compare against it.</p>
        </div>
        <div className="cabin-selector">
          {cabins.map((cabin) => (
            <label className="cabin-option" data-locked={cabin.value === "ECONOMY" || undefined} key={cabin.value}>
              {cabin.value === "ECONOMY" ? (
                <>
                  <input aria-label="Economy, required reference cabin" defaultChecked disabled type="checkbox" />
                  <input name="cabins" type="hidden" value={cabin.value} />
                </>
              ) : (
                <input
                  defaultChecked={values.cabins.includes(cabin.value)}
                  name="cabins"
                  type="checkbox"
                  value={cabin.value}
                />
              )}
              <span aria-hidden="true">{cabin.code}</span>
              <strong>{cabin.label}</strong>
            </label>
          ))}
        </div>
        <FieldError errors={state.errors} field="cabins" />
      </fieldset>

      <section className="builder-step" aria-labelledby="builder-quality">
        <div className="builder-step-heading">
          <span aria-hidden="true">05</span>
          <div>
            <p className="eyebrow">Comparability</p>
            <h2 id="builder-quality">Trip quality</h2>
          </div>
          <p>Keep the cabin comparison honest by excluding poor itineraries.</p>
        </div>
        <div className="builder-fields builder-fields-three">
          <div className="builder-field">
            <label htmlFor="passengers">Passengers</label>
            <input
              defaultValue={values.passengers}
              id="passengers"
              max="9"
              min="1"
              name="passengers"
              required
              type="number"
            />
            <FieldError errors={state.errors} field="passengers" />
          </div>
          <div className="builder-field">
            <label htmlFor="maxStops">Maximum stops</label>
            <select defaultValue={values.maxStops} id="maxStops" name="maxStops">
              <option value="">Any</option>
              <option value="0">Nonstop only</option>
              <option value="1">Up to one stop</option>
              <option value="2">Up to two stops</option>
            </select>
            <FieldError errors={state.errors} field="maxStops" />
          </div>
          <div className="builder-field">
            <label htmlFor="maxDurationHours">Maximum duration</label>
            <input
              id="maxDurationHours"
              max="72"
              min="1"
              name="maxDurationHours"
              placeholder="Optional hours"
              type="number"
              defaultValue={values.maxDurationHours}
            />
            <small>Applies to each direction.</small>
            <FieldError errors={state.errors} field="maxDurationHours" />
          </div>
        </div>
      </section>

      <section className="builder-step" aria-labelledby="builder-sensitivity">
        <div className="builder-step-heading">
          <span aria-hidden="true">06</span>
          <div>
            <p className="eyebrow">Signal threshold</p>
            <h2 id="builder-sensitivity">Sensitivity</h2>
          </div>
          <p>Start with calm defaults; narrow them later when you know the route.</p>
        </div>
        <div className="builder-fields builder-fields-two">
          <div className="builder-field">
            <label htmlFor="peNearInversionPct">Premium Economy near Economy</label>
            <div className="input-suffix">
              <input
                defaultValue={values.peNearInversionPct}
                id="peNearInversionPct"
                max="100"
                min="0"
                name="peNearInversionPct"
                required
                step="0.5"
                type="number"
              />
              <span>%</span>
            </div>
            <small>Flag when PE is within this percentage of Economy.</small>
            <FieldError errors={state.errors} field="peNearInversionPct" />
          </div>
          <div className="builder-field">
            <label htmlFor="businessVsPePct">Business near Premium Economy</label>
            <div className="input-suffix">
              <input
                defaultValue={values.businessVsPePct}
                id="businessVsPePct"
                max="500"
                min="0"
                name="businessVsPePct"
                required
                step="0.5"
                type="number"
              />
              <span>%</span>
            </div>
            <small>Flag when Business is within this percentage of PE.</small>
            <FieldError errors={state.errors} field="businessVsPePct" />
          </div>
        </div>
      </section>

      <div className="builder-submit-block">
        <div>
          <p className="eyebrow">Ready to monitor</p>
          <p>
            Saving creates the watch and its search candidates. Until unattended scheduling
            is deployed, new scans run only when the worker is started.
          </p>
          <p className="builder-submit-error" aria-live="polite">
            {state.message || "\u00a0"}
          </p>
        </div>
        <button className="builder-submit" disabled={pending} type="submit">
          <span>{pending ? "Starting watch…" : "Start this watch"}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
