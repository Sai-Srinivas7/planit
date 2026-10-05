/**
 * SerpApi place results → candidates (SUG-03, D-14, D-15). Dedupe by provider
 * place ID and by normalized name, within the results and against existing
 * options; drop anything without a name or source; keep the first `limit`.
 * No other filtering.
 */

import type { Option } from '../types'
import type { Candidate, PlaceResult } from './adapters'

export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** The Google Maps listing a SerpApi result came from: the source of its facts. */
export const mapsUrl = (placeId: string) => `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`

const httpUrl = (v: string | undefined) => (v && /^https?:\/\/\S+$/i.test(v) && v.length <= 2000 ? v : null)

export function normalizePlaces(results: PlaceResult[], existing: Pick<Option, 'name' | 'providerPlaceId'>[], limit = 3): Candidate[] {
  const seenIds = new Set(existing.map((o) => o.providerPlaceId).filter((v): v is string => !!v))
  const seenNames = new Set(existing.map((o) => normalizeName(o.name)))
  const out: Candidate[] = []
  for (const r of results) {
    const name = r.title?.trim()
    const placeId = r.place_id?.trim()
    if (!name || !placeId) continue
    const key = normalizeName(name)
    if (!key || seenIds.has(placeId) || seenNames.has(key)) continue
    seenIds.add(placeId)
    seenNames.add(key)
    out.push({
      candidateId: `c${out.length + 1}`,
      name: name.slice(0, 120),
      address: r.address?.trim().slice(0, 200) || null,
      link: httpUrl(r.website),
      sourceUrl: mapsUrl(placeId),
      providerPlaceId: placeId,
      type: r.type?.trim().slice(0, 80) || null,
    })
    if (out.length === limit) break
  }
  return out
}
