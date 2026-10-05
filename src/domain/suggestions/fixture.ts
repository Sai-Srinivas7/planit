/**
 * Fixture adapters (PROVIDERS=fixture): recorded responses from Block 0, no
 * network. Failure scenarios are chosen by flags in the outing's location
 * that only these adapters read, e.g. "__fail_places__ Dallas, TX".
 *   __fail_geocode__ · __fail_forecast__ · __fail_places__ · __fail_explain__ · __bad_explain__
 * Server-only: never import from client code (the places fixture contains provider URLs).
 */

import chatCompletion from './fixtures/chat-completion-haiku.json'
import forecastDallas from './fixtures/forecast-dallas.json'
import geoDallas from './fixtures/geocoding-dallas.json'
import geoDallasTx from './fixtures/geocoding-dallas-tx-us.json'
import placesDallas from './fixtures/places-dallas-ll.json'
import type { Adapters, ForecastEntry, GeoCandidate, PlaceResult } from './adapters'

const FLAG = /__[a-z_]+__/g

export const RECORDED_EXPLAINER_TEXT: string = (chatCompletion.data.content as { type: string; text: string }[]).find((c) => c.type === 'text')!.text

export function makeFixtureAdapters(location: string, now: Date = new Date()): Adapters {
  const flags = new Set(location.match(FLAG) ?? [])
  const fail = (flag: string) => {
    if (flags.has(flag)) throw new Error(`fixture failure ${flag}`)
  }

  return {
    geocoder: {
      async geocode(query) {
        fail('__fail_geocode__')
        const q = query.replace(FLAG, '').trim().toLowerCase()
        if (/dallas/.test(q) && /\b(tx|texas)\b/.test(q)) return geoDallasTx.data as GeoCandidate[]
        if (q === 'dallas') return geoDallas.data as GeoCandidate[]
        return []
      },
    },
    forecast: {
      async forecast() {
        fail('__fail_forecast__')
        // A real forecast starts now: shift the recorded 3-hour steps so the first entry is the current hour.
        const entries = forecastDallas.data as ForecastEntry[]
        const base = Math.floor(now.getTime() / 3_600_000) * 3600
        return entries.map((e) => ({ ...e, dt: base + (e.dt - entries[0].dt) }))
      },
    },
    places: {
      async search() {
        fail('__fail_places__')
        return placesDallas.data.local_results as PlaceResult[]
      },
    },
    explainer: {
      async explain(request) {
        fail('__fail_explain__')
        if (flags.has('__bad_explain__')) return 'Sorry, I cannot help with that.'
        // Echo one explanation per candidate, fenced the way the recorded Haiku reply was.
        const { candidates } = JSON.parse(request.user) as { candidates: { candidateId: string; name: string }[] }
        const explanations = candidates.map((c) => ({ candidateId: c.candidateId, text: `Fixture explanation: ${c.name} could suit the group.` }))
        return '```json\n' + JSON.stringify({ explanations }, null, 2) + '\n```'
      },
    },
  }
}
