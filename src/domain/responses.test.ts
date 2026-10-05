import { describe, expect, test } from 'vitest'
import { applyCommand, type CommandResult } from './commands'
import type { CommandError } from './errors'
import { HOST, makeOption, makeOuting, MEMBER, MEMBER2, NOW } from './make-outing'
import { planText, NOTHING_BOOKED } from './summary'
import { tally } from './tally'
import type { Outing } from './types'

const run = (outing: Outing, userId: string, command: string, input: Record<string, unknown> = {}) =>
  applyCommand(outing, userId, command, input, NOW)
const code = (r: CommandResult | CommandError) => ('code' in r ? r.code : 'OK')
const ok = (r: CommandResult | CommandError): Outing => {
  if ('code' in r) throw new Error(`expected success, got ${r.code}`)
  return r.outing!
}
const withOptions = () => makeOuting({ options: [makeOption({ id: 'o1' }), makeOption({ id: 'o2' })] })

describe('responses', () => {
  test('VOTE-01: yes then maybe on one option leaves exactly one response with the latest value', () => {
    const a = ok(run(withOptions(), MEMBER, 'setResponse', { optionId: 'o1', value: 'yes' }))
    const b = ok(run(a, MEMBER, 'setResponse', { optionId: 'o1', value: 'maybe' }))
    expect(b.responses.filter((r) => r.userId === MEMBER && r.optionId === 'o1')).toEqual([{ userId: MEMBER, optionId: 'o1', value: 'maybe' }])
    // Other options and other members are independent.
    const c = ok(run(ok(run(b, MEMBER, 'setResponse', { optionId: 'o2', value: 'no' })), MEMBER2, 'setResponse', { optionId: 'o1', value: 'yes' }))
    expect(c.responses).toHaveLength(3)
  })

  test("VOTE-03: an optionId that doesn't exist in this outing returns NOT_FOUND", () => {
    expect(code(run(withOptions(), MEMBER, 'setResponse', { optionId: 'nope', value: 'yes' }))).toBe('NOT_FOUND')
    expect(code(run(withOptions(), MEMBER, 'setResponse', { optionId: 'o1', value: 'definitely' }))).toBe('INVALID_INPUT')
  })

  test("VOTE-07: setResponse with null removes the caller's response", () => {
    const a = ok(run(withOptions(), MEMBER, 'setResponse', { optionId: 'o1', value: 'yes' }))
    const b = ok(run(a, MEMBER2, 'setResponse', { optionId: 'o1', value: 'no' }))
    const cleared = ok(run(b, MEMBER, 'setResponse', { optionId: 'o1', value: null }))
    expect(cleared.responses).toEqual([{ userId: MEMBER2, optionId: 'o1', value: 'no' }])
    // Clearing when there is nothing to clear is harmless.
    expect(ok(run(cleared, MEMBER, 'setResponse', { optionId: 'o1', value: null })).responses).toHaveLength(1)
  })

  test('VOTE-04: tally counts each value per option; sort is Yes desc, Maybe desc, then older option first', () => {
    const t0 = '2030-01-01T00:00:00.000Z'
    const older = makeOption({ id: 'older', createdAt: t0 })
    const newer = makeOption({ id: 'newer', createdAt: '2030-01-01T00:00:01.000Z' })
    const top = makeOption({ id: 'top', createdAt: '2030-01-01T00:00:02.000Z' })
    const maybes = makeOption({ id: 'maybes', createdAt: '2030-01-01T00:00:03.000Z' })
    const o = makeOuting({
      options: [newer, older, top, maybes],
      responses: [
        { userId: HOST, optionId: 'top', value: 'yes' },
        { userId: MEMBER, optionId: 'top', value: 'yes' },
        { userId: MEMBER2, optionId: 'top', value: 'no' },
        { userId: HOST, optionId: 'older', value: 'yes' },
        { userId: HOST, optionId: 'newer', value: 'yes' },
        { userId: MEMBER, optionId: 'maybes', value: 'yes' },
        { userId: MEMBER2, optionId: 'maybes', value: 'maybe' },
      ],
    })
    const t = tally(o)
    expect(t.map((x) => x.option.id)).toEqual(['top', 'maybes', 'older', 'newer'])
    expect(t[0].counts).toEqual({ yes: 2, maybe: 0, no: 1 })
    expect(t[0].voters).toEqual({ yes: [HOST, MEMBER], maybe: [], no: [MEMBER2] })
    expect(t[1].counts).toEqual({ yes: 1, maybe: 1, no: 0 })
    // Ties (older vs newer: 1 yes each, 0 maybe) → older option first.
    expect(tally(makeOuting({ options: [newer, older] })).map((x) => x.option.id)).toEqual(['older', 'newer'])
  })
})

describe('finalize / reopen', () => {
  test('FIN-01: the host finalizes with an option from this outing: state finalized, selectedOptionId and finalizedAt set', () => {
    const f = ok(run(withOptions(), HOST, 'finalize', { optionId: 'o2' }))
    expect(f).toMatchObject({ state: 'finalized', selectedOptionId: 'o2', finalizedAt: NOW.toISOString() })
  })

  test('FIN-02: unknown option returns NOT_FOUND; finalizing an already finalized outing returns INVALID_STATE', () => {
    expect(code(run(withOptions(), HOST, 'finalize', { optionId: 'nope' }))).toBe('NOT_FOUND')
    const f = ok(run(withOptions(), HOST, 'finalize', { optionId: 'o1' }))
    expect(code(run(f, HOST, 'finalize', { optionId: 'o2' }))).toBe('INVALID_STATE')
  })

  test('FIN-03: while finalized, option, response, and preference commands return OUTING_FINALIZED; postComment and deleteComment succeed', () => {
    const base = makeOuting({
      options: [makeOption({ id: 'o1', createdBy: MEMBER }), makeOption({ id: 'o2', createdBy: MEMBER })],
      comments: [{ id: 'c1', authorId: MEMBER, body: 'hi', createdAt: NOW.toISOString() }],
    })
    const f = ok(run(base, HOST, 'finalize', { optionId: 'o1' }))
    const frozen: [string, Record<string, unknown>][] = [
      ['addOption', { name: 'x' }],
      ['editOption', { optionId: 'o2', name: 'x' }],
      ['deleteOption', { optionId: 'o2' }],
      ['setResponse', { optionId: 'o1', value: 'yes' }],
      ['setResponse', { optionId: 'o1', value: null }],
      ['setPreference', { budget: 'flexible', interests: [], setting: 'either' }],
    ]
    for (const [command, input] of frozen) expect(code(run(f, MEMBER, command, input)), command).toBe('OUTING_FINALIZED')
    expect(code(run(f, HOST, 'deleteOption', { optionId: 'o1' }))).toBe('OUTING_FINALIZED') // selected option is frozen too
    expect(code(run(f, MEMBER, 'postComment', { body: 'see you there' }))).toBe('OK')
    expect(code(run(f, MEMBER, 'deleteComment', { commentId: 'c1' }))).toBe('OK')
  })

  test('FIN-07: the host reopens: state open, finalizedAt cleared, responses and selectedOptionId kept', () => {
    const voted = ok(run(withOptions(), MEMBER, 'setResponse', { optionId: 'o1', value: 'yes' }))
    const f = ok(run(voted, HOST, 'finalize', { optionId: 'o1' }))
    const r = ok(run(f, HOST, 'reopen'))
    expect(r).toMatchObject({ state: 'open', finalizedAt: null, selectedOptionId: 'o1' })
    expect(r.responses).toEqual(voted.responses)
  })
})

describe('copy plan', () => {
  test('FIN-06: copy-plan text has title, place, address/link, date/time with timezone, "nothing is booked", and unknown facts as "unconfirmed"', () => {
    const o = makeOuting({
      options: [makeOption({ id: 'o1', name: 'Houndstooth Coffee', link: 'https://houndstooth.test' })],
      state: 'finalized',
      selectedOptionId: 'o1',
    })
    const text = planText(o)
    expect(text.split('\n')).toEqual([
      'Friday dinner',
      'When: Sat, Jan 5, 2030, 6:00 PM CST (America/Chicago)',
      'Where: Houndstooth Coffee',
      'Address: unconfirmed',
      'Link: https://houndstooth.test',
      'Price and opening hours: unconfirmed',
      NOTHING_BOOKED,
    ])
    expect(text).toContain('Nothing is booked')
    const full = planText(makeOuting({ options: [makeOption({ id: 'o1', name: 'X', address: '1 Main St', note: 'Back room' })], selectedOptionId: 'o1' }))
    expect(full).toContain('Address: 1 Main St')
    expect(full).toContain('Link: unconfirmed')
    expect(full).toContain('Note: Back room')
  })
})
