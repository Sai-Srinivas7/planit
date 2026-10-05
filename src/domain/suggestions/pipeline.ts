/**
 * Fetch phase of a suggestion run (spec §7 step 2), outside the room.
 * Geocode → forecast (optional) → places → explain (optional).
 * Any required step failing ends the run with a readable message; nothing
 * existing is touched here, the room applies the result.
 */

import type { Outing, Preference, Weather } from '../types'
import type { Adapters, SuggestedPlace } from './adapters'
import { buildExplainRequest, parseExplanations } from './explain'
import { pickWeather } from './forecast'
import { resolveLocation } from './geocode'
import { normalizePlaces } from './normalize'

export type PipelineResult =
  | { ok: true; places: SuggestedPlace[]; weather: Weather | 'unavailable'; resolvedLocation: string }
  | { ok: false; message: string }

export const PLACES_UNAVAILABLE = 'Place search is unavailable right now. You can still add places yourself.'
export const GEOCODE_UNAVAILABLE = 'Could not look up the location right now. Try again later.'
export const NO_NEW_PLACES = 'No new places found. Try different interests, or add places yourself.'

export const CALL_TIMEOUT_MS = 15_000

/** Per-call timeout: a slow provider fails its step instead of hanging the request. */
export function withTimeout<T>(p: Promise<T>, ms = CALL_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

/** Most common interest tags (up to 2) and the majority setting, from fixed values only. */
export function placesQuery(preferences: Preference[], resolvedLocation: string): string {
  const counts = new Map<string, number>()
  for (const p of preferences) for (const i of p.interests) counts.set(i, (counts.get(i) ?? 0) + 1)
  const interests = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([i]) => i)
  const settings = preferences.map((p) => p.setting).filter((s) => s !== 'either')
  const indoor = settings.filter((s) => s === 'indoor').length
  const outdoor = settings.length - indoor
  const setting = indoor > outdoor ? 'indoor' : outdoor > indoor ? 'outdoor' : ''
  return [interests.length ? interests.join(' ') : 'things to do', setting, resolvedLocation].filter(Boolean).join(' ')
}

export async function runPipeline(adapters: Adapters, outing: Outing): Promise<PipelineResult> {
  const preferences = outing.people.map((p) => p.preferences).filter((p): p is Preference => !!p)

  let candidates
  try {
    candidates = await withTimeout(adapters.geocoder.geocode(outing.location))
  } catch {
    return { ok: false, message: GEOCODE_UNAVAILABLE }
  }
  const resolved = resolveLocation(candidates)
  if (!resolved.ok) return resolved

  let weather: Weather | 'unavailable' = 'unavailable'
  try {
    weather = pickWeather(await withTimeout(adapters.forecast.forecast(resolved.label)), outing.startAt)
  } catch {
    weather = 'unavailable'
  }

  let results
  try {
    const ll = `@${resolved.lat.toFixed(4)},${resolved.lon.toFixed(4)},14z`
    results = await withTimeout(adapters.places.search({ q: placesQuery(preferences, resolved.label), ll }))
  } catch {
    return { ok: false, message: PLACES_UNAVAILABLE }
  }
  const found = normalizePlaces(Array.isArray(results) ? results : [], outing.options)
  if (found.length === 0) return { ok: false, message: NO_NEW_PLACES }

  let explanations: Map<string, string> | null = null
  try {
    const raw = await withTimeout(adapters.explainer.explain(buildExplainRequest(found, weather, preferences)))
    explanations = parseExplanations(raw, found.map((c) => c.candidateId))
  } catch {
    explanations = null
  }

  return {
    ok: true,
    places: found.map((c) => ({ ...c, explanation: explanations?.get(c.candidateId) ?? null })),
    weather,
    resolvedLocation: resolved.label,
  }
}
