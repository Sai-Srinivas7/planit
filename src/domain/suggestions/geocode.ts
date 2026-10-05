/** Geocoding candidates → one resolved location, or a message (SUG-09). Never picks a city silently. */

import type { GeoCandidate } from './adapters'

export type Resolved = { ok: true; label: string; lat: number; lon: number } | { ok: false; message: string }

export const LOCATION_NOT_FOUND = 'Location not found. Add the city and state.'
export const LOCATION_AMBIGUOUS = 'Location is ambiguous. Add the state or country.'

export function resolveLocation(candidates: GeoCandidate[]): Resolved {
  const distinct = new Map<string, GeoCandidate>()
  for (const c of candidates) distinct.set(`${c.name}|${c.state ?? ''}|${c.country}`, c)
  if (distinct.size === 0) return { ok: false, message: LOCATION_NOT_FOUND }
  if (distinct.size > 1) return { ok: false, message: LOCATION_AMBIGUOUS }
  const [c] = distinct.values()
  return { ok: true, label: [c.name, c.state, c.country].filter(Boolean).join(', '), lat: c.lat, lon: c.lon }
}
