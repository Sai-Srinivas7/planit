/**
 * Live adapters (PROVIDERS=live). `call` is
 * `buildCronContext(env, env.OWNER_USER_ID).integrations.call`, passed in by
 * worker code: billed to the app owner, never reachable from the browser.
 */

import { EXPLAINER_MODEL, type Adapters, type ForecastEntry, type GeoCandidate, type PlaceResult } from './adapters'

export type IntegrationCall = (endpoint: string, params: Record<string, unknown>) => Promise<unknown>

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export function makeLiveAdapters(call: IntegrationCall): Adapters {
  return {
    geocoder: {
      async geocode(query) {
        return asArray<GeoCandidate>(await call('openweathermap/geocoding', { q: query, limit: 5 }))
      },
    },
    forecast: {
      async forecast(query) {
        return asArray<ForecastEntry>(await call('openweathermap/forecast', { q: query, units: 'metric' }))
      },
    },
    places: {
      async search({ q, ll }) {
        const data = (await call('serpapi/places-search', ll ? { q, ll } : { q })) as { local_results?: unknown } | null
        return asArray<PlaceResult>(data?.local_results)
      },
    },
    explainer: {
      async explain({ system, user }) {
        const data = (await call('anthropic/chat-completion', {
          model: EXPLAINER_MODEL,
          max_tokens: 600,
          temperature: 0,
          system,
          messages: [{ role: 'user', content: user }],
        })) as { content?: { type: string; text?: string }[] } | null
        const text = data?.content?.find((c) => c.type === 'text')?.text
        if (typeof text !== 'string') throw new Error('explainer returned no text')
        return text
      },
    },
  }
}
