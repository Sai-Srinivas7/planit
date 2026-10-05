import { describe, expect, test } from 'vitest'
import { applyCommand, CONFIRMED_BEFORE_SUGGESTIONS, type CommandResult } from './commands'
import type { CommandError } from './errors'
import { HOST, ids, makeOption, makeOuting, MEMBER, NOW } from './make-outing'
import type { Outing } from './types'

const code = (r: CommandResult | CommandError) => ('code' in r ? r.code : 'OK')
const ok = (r: CommandResult | CommandError): CommandResult => {
  if ('code' in r) throw new Error(`expected success, got ${r.code}: ${r.message}`)
  return r
}
const request = (o: Outing, appRunsToday = 0, now = NOW, userId = HOST) =>
  applyCommand(o, userId, 'requestSuggestions', {}, now, { appRunsToday, newId: ids() })
const place = (n: number, over: Record<string, unknown> = {}) => ({
  name: `Suggested ${n}`,
  address: `${n} Elm St`,
  link: null,
  sourceUrl: `https://www.google.com/maps/place/?q=place_id:p${n}`,
  providerPlaceId: `p${n}`,
  explanation: `Because ${n}.`,
  ...over,
})
const publish = (o: Outing, places: unknown[], weather: unknown = 'unavailable') =>
  applyCommand(o, HOST, 'publishSuggestions', { places, weather, resolvedLocation: 'Dallas, Texas, US' }, NOW, { newId: ids() })

describe('suggestion commands', () => {
  test('SUG-01: requestSuggestions while a run is running returns reused: true and does not increment counters', () => {
    const first = ok(request(makeOuting()))
    expect(first.data).toEqual({ status: 'running', reused: false })
    expect(first.outing!.suggestions).toMatchObject({ status: 'running', runs: 1, startedAt: NOW.toISOString() })
    const again = ok(request(first.outing!, 1, new Date(NOW.getTime() + 60_000)))
    expect(again.data).toEqual({ status: 'running', reused: true })
    expect(again.outing).toBe(first.outing) // unchanged record → no write, runs still 1
  })

  test('SUG-02: a 4th run for one outing, or a run after 30 app-wide runs today, returns LIMIT_REACHED', () => {
    const done = (runs: number) => makeOuting({ suggestions: { status: 'done', runs, startedAt: NOW.toISOString(), message: null, weather: null, resolvedLocation: null } })
    expect(code(request(done(2)))).toBe('OK')
    expect(code(request(done(3)))).toBe('LIMIT_REACHED')
    expect(code(request(done(0), 29))).toBe('OK')
    expect(code(request(done(0), 30))).toBe('LIMIT_REACHED')
    // Reuse is checked before limits: an active run is still reused at the cap.
    const running = makeOuting({ suggestions: { status: 'running', runs: 3, startedAt: NOW.toISOString(), message: null, weather: null, resolvedLocation: null } })
    expect(ok(request(running, 30)).data).toEqual({ status: 'running', reused: true })
  })

  test('SUG-15: a run stuck in running for more than 2 minutes counts as failed and a new request is allowed', () => {
    const stuck = makeOuting({ suggestions: { status: 'running', runs: 1, startedAt: NOW.toISOString(), message: null, weather: null, resolvedLocation: null } })
    expect(ok(request(stuck, 1, new Date(NOW.getTime() + 120_000))).data).toEqual({ status: 'running', reused: true })
    const fresh = ok(request(stuck, 1, new Date(NOW.getTime() + 120_001)))
    expect(fresh.data).toEqual({ status: 'running', reused: false })
    expect(fresh.outing!.suggestions.runs).toBe(2)
  })

  test('FIN-03: requestSuggestions while finalized returns OUTING_FINALIZED; only the host may request', () => {
    expect(code(request(makeOuting({ state: 'finalized' })))).toBe('OUTING_FINALIZED')
    expect(code(request(makeOuting(), 0, NOW, MEMBER))).toBe('NOT_HOST')
  })

  test('SUG-10: publishSuggestions on a finalized outing discards results and leaves options untouched', () => {
    const existing = makeOption({ id: 'keep' })
    const o = makeOuting({ state: 'finalized', options: [existing], suggestions: { status: 'running', runs: 1, startedAt: NOW.toISOString(), message: null, weather: null, resolvedLocation: null } })
    const r = ok(publish(o, [place(1), place(2)]))
    expect(r.outing!.options).toEqual([existing])
    expect(r.outing!.suggestions).toMatchObject({ status: 'failed', message: CONFIRMED_BEFORE_SUGGESTIONS })
  })

  test('SUG-12: a second completed run appends new options and skips places already in the outing; nothing is removed', () => {
    const manual = makeOption({ id: 'manual', name: 'Suggested 3' })
    // "Suggested 3" matches the manual option's name → skipped.
    const first = ok(publish(makeOuting({ options: [manual] }), [place(1), place(2), place(3)], { forecastAt: NOW.toISOString(), tempC: 14, description: 'clear sky' }))
    expect(first.outing!.options.map((o) => o.name)).toEqual(['Suggested 3', 'Suggested 1', 'Suggested 2'])
    expect(first.outing!.options[1]).toMatchObject({
      origin: 'suggested',
      createdBy: HOST,
      fetchedAt: NOW.toISOString(),
      explanation: 'Because 1.',
      providerPlaceId: 'p1',
      sourceUrl: 'https://www.google.com/maps/place/?q=place_id:p1',
    })
    expect(first.outing!.suggestions).toMatchObject({ status: 'done', weather: { tempC: 14 }, resolvedLocation: 'Dallas, Texas, US' })

    const second = ok(publish(first.outing!, [place(1, { name: 'Renamed but same place' }), place(4, { name: 'suggested 2!' }), place(5)]))
    // p1 (same place ID) and "suggested 2!" (same normalized name) skipped; nothing removed.
    expect(second.outing!.options.map((o) => o.name)).toEqual(['Suggested 3', 'Suggested 1', 'Suggested 2', 'Suggested 5'])
    expect(second.data).toEqual({ status: 'done', added: 1 })
  })

  test('failSuggestions stores the message and status failed without touching options', () => {
    const o = makeOuting({ options: [makeOption({ id: 'a' })] })
    const r = ok(applyCommand(o, HOST, 'failSuggestions', { message: 'Place search is unavailable right now.' }, NOW))
    expect(r.outing!.suggestions).toMatchObject({ status: 'failed', message: 'Place search is unavailable right now.' })
    expect(r.outing!.options).toEqual(o.options)
  })
})
