/**
 * Provider adapter interfaces (spec §7). Each has a live implementation
 * (DeepSpace `integrations.call` from worker code, `live.ts`) and a fixture
 * implementation (recorded JSON, `fixture.ts`). Tests mock only here.
 */

/** Explainer model, set explicitly (BASE-05: the endpoint default is an expensive model). */
export const EXPLAINER_MODEL = 'claude-haiku-4-5'

export type GeoCandidate = { name: string; state?: string; country: string; lat: number; lon: number }

export type ForecastEntry = { dt: number; temp: number; description: string }

/** The subset of a SerpApi `local_results` item the normalizer reads. */
export type PlaceResult = {
  title?: string
  place_id?: string
  address?: string
  website?: string
  type?: string
}

export type ExplainerRequest = { system: string; user: string }

export interface Geocoder {
  geocode(query: string): Promise<GeoCandidate[]>
}
export interface Forecast {
  forecast(query: string): Promise<ForecastEntry[]>
}
export interface Places {
  search(params: { q: string; ll?: string }): Promise<PlaceResult[]>
}
export interface Explainer {
  /** Returns the model's raw text; parsing and validation happen in explain.ts. */
  explain(request: ExplainerRequest): Promise<string>
}

export type Adapters = { geocoder: Geocoder; forecast: Forecast; places: Places; explainer: Explainer }

/** A normalized place candidate, before it becomes an Option. */
export type Candidate = {
  candidateId: string
  name: string
  address: string | null
  link: string | null
  sourceUrl: string
  providerPlaceId: string
  type: string | null
}

export type SuggestedPlace = Candidate & { explanation: string | null }
