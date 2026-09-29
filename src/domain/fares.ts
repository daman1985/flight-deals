export const CABINS = [
  "ECONOMY",
  "PREMIUM_ECONOMY",
  "BUSINESS",
  "FIRST",
] as const;

export type Cabin = (typeof CABINS)[number];

export const SEARCH_STATUSES = [
  "VALID_RESULT",
  "NO_RESULT",
  "INCOMPLETE_RESULT",
  "PROVIDER_FAILURE",
  "THROTTLED",
] as const;

export type SearchStatus = (typeof SEARCH_STATUSES)[number];

export type FareSearchRequest = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  cabin: Cabin;
  passengers: number;
  maxStops?: number;
  currency?: string;
};

export type FareOffer = {
  provider: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  cabin: Cabin;
  totalPrice: number;
  currency: string;
  airline?: string;
  flightNumbers?: string[];
  stopsOutbound?: number;
  stopsReturn?: number;
  durationOutboundMinutes?: number;
  durationReturnMinutes?: number;
  bookingUrl?: string;
  observedAt: string;
  rawPayload?: unknown;
};

export type SearchHealth = {
  status: SearchStatus;
  resultCount: number;
  completeness: number;
  retries: number;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  latencyMs: number;
};

export type FareSearchResponse = {
  request: FareSearchRequest;
  offers: FareOffer[];
  health: SearchHealth;
};

export interface FareProvider {
  readonly name: string;
  search(request: FareSearchRequest): Promise<FareSearchResponse>;
}
