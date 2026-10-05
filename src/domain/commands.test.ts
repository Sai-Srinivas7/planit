import { describe, expect, test } from 'vitest'
import { applyCommand, INVITE_INVALID_MESSAGE, type CommandResult } from './commands'
import type { CommandError } from './errors'
import { HOST, ids, makeOuting, MEMBER, NOW, OUTSIDER } from './make-outing'
import type { Outing } from './types'

const validCreate = { title: 'Friday dinner', location: 'Dallas, TX', date: '2030-01-05', time: '18:00', timezone: 'America/Chicago' }

const ok = (r: CommandResult | CommandError): CommandResult => {
  if ('code' in r) throw new Error(`expected success, got ${r.code}: ${r.message}`)
  return r
}
const code = (r: CommandResult | CommandError) => ('code' in r ? r.code : 'OK')
const run = (outing: Outing | null, userId: string, command: string, input: Record<string, unknown> = {}) =>
  applyCommand(outing, userId, command, input, NOW, { newId: ids() })

describe('createOuting', () => {
  test('OUT-02: missing or invalid title, location, date, time, or timezone, or a value over its limit, returns INVALID_INPUT', () => {
    expect(code(run(null, HOST, 'createOuting', validCreate))).toBe('OK')
    const cases: Record<string, unknown>[] = [
      ...(['title', 'location', 'date', 'time', 'timezone'] as const).map((k) => ({ ...validCreate, [k]: undefined })),
      { ...validCreate, title: '   ' },
      { ...validCreate, title: 'x'.repeat(81) },
      { ...validCreate, location: 'x'.repeat(121) },
      { ...validCreate, date: '2030-02-30' },
      { ...validCreate, date: '05/01/2030' },
      { ...validCreate, time: '24:00' },
      { ...validCreate, time: '6pm' },
      { ...validCreate, timezone: 'Mars/Olympus' },
      { ...validCreate, title: 42 },
    ]
    for (const input of cases) {
      const r = run(null, HOST, 'createOuting', input)
      expect(code(r), JSON.stringify(input)).toBe('INVALID_INPUT')
    }
    // Limits are inclusive.
    expect(code(run(null, HOST, 'createOuting', { ...validCreate, title: 'x'.repeat(80), location: 'y'.repeat(120) }))).toBe('OK')
  })

  test('OUT-04: a start time inside a DST gap returns INVALID_INPUT', () => {
    const r = applyCommand(null, HOST, 'createOuting', { ...validCreate, date: '2026-03-08', time: '02:30' }, new Date('2026-01-01T00:00:00Z'))
    expect(code(r)).toBe('INVALID_INPUT')
  })

  test('OUT-05: a start time in the past (in the outing timezone) returns INVALID_INPUT', () => {
    // NOW is 2030-01-01 12:00Z = 06:00 in Chicago.
    expect(code(run(null, HOST, 'createOuting', { ...validCreate, date: '2030-01-01', time: '05:59' }))).toBe('INVALID_INPUT')
    expect(code(run(null, HOST, 'createOuting', { ...validCreate, date: '2030-01-01', time: '06:00' }))).toBe('INVALID_INPUT')
    expect(code(run(null, HOST, 'createOuting', { ...validCreate, date: '2030-01-01', time: '06:01' }))).toBe('OK')
    // The same wall-clock time is still ahead in a zone further west.
    expect(code(run(null, HOST, 'createOuting', { ...validCreate, date: '2030-01-01', time: '05:30', timezone: 'America/Los_Angeles' }))).toBe('OK')
  })

  test('createOuting builds the spec §4.3 record with the caller as host and only member', () => {
    const r = ok(run(null, HOST, 'createOuting', { ...validCreate, title: '  Friday dinner  ', userId: OUTSIDER, hostId: OUTSIDER }))
    expect(r.data).toEqual({ id: 'id-1', inviteToken: 'id-2' })
    expect(r.outing).toEqual({
      title: 'Friday dinner',
      location: 'Dallas, TX',
      date: '2030-01-05',
      time: '18:00',
      timezone: 'America/Chicago',
      startAt: '2030-01-06T00:00:00.000Z',
      hostId: HOST,
      members: [HOST],
      inviteToken: 'id-2',
      state: 'open',
      selectedOptionId: null,
      finalizedAt: null,
      people: [{ userId: HOST, joinedAt: NOW.toISOString() }],
      options: [],
      responses: [],
      comments: [],
      suggestions: { status: 'idle', runs: 0, startedAt: null, message: null, weather: null, resolvedLocation: null },
    })
  })
})

describe('joinOuting', () => {
  test('INV-02: joining again returns alreadyMember and leaves exactly one members and one people entry', () => {
    const outing = makeOuting({ members: [HOST] })
    const first = ok(run(outing, MEMBER, 'joinOuting', { token: 'token-1' }))
    expect(first.data).toEqual({ alreadyMember: false })
    const second = ok(run(first.outing, MEMBER, 'joinOuting', { token: 'token-1' }))
    expect(second.data).toEqual({ alreadyMember: true })
    expect(second.outing!.members.filter((m) => m === MEMBER)).toHaveLength(1)
    expect(second.outing!.people.filter((p) => p.userId === MEMBER)).toHaveLength(1)
    // The host joining their own outing is a no-op too.
    expect(ok(run(outing, HOST, 'joinOuting', { token: 'token-1' })).data).toEqual({ alreadyMember: true })
  })

  test('INV-06: joining a finalized outing succeeds', () => {
    const outing = makeOuting({ members: [HOST], state: 'finalized', finalizedAt: NOW.toISOString() })
    const r = ok(run(outing, OUTSIDER, 'joinOuting', { token: 'token-1' }))
    expect(r.outing!.members).toContain(OUTSIDER)
    expect(r.outing!.state).toBe('finalized')
  })

  test('INV-07: the 51st join returns LIMIT_REACHED', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => (i === 0 ? HOST : `user-${i}`))
    expect(code(run(makeOuting({ members: fifty.slice(0, 49) }), OUTSIDER, 'joinOuting', { token: 'token-1' }))).toBe('OK')
    const full = makeOuting({ members: fifty })
    const r = run(full, OUTSIDER, 'joinOuting', { token: 'token-1' })
    expect(code(r)).toBe('LIMIT_REACHED')
    // An existing member re-joining a full outing is still a no-op, not a refusal.
    expect(code(run(full, 'user-7', 'joinOuting', { token: 'token-1' }))).toBe('OK')
  })

  test('an unknown token returns INVITE_INVALID', () => {
    expect(run(null, MEMBER, 'joinOuting', { token: 'nope' })).toEqual({ code: 'INVITE_INVALID', message: INVITE_INVALID_MESSAGE })
  })
})

describe('deleteOuting', () => {
  test('OUT-07: the host deletes the outing; a member gets NOT_HOST', () => {
    const outing = makeOuting()
    expect(ok(run(outing, HOST, 'deleteOuting')).outing).toBeNull()
    expect(code(run(outing, MEMBER, 'deleteOuting'))).toBe('NOT_HOST')
    expect(code(run(outing, OUTSIDER, 'deleteOuting'))).toBe('NOT_MEMBER')
    expect(code(run(null, HOST, 'deleteOuting'))).toBe('NOT_FOUND')
    // Finalized outings can be deleted by the host too (spec §6).
    expect(ok(run(makeOuting({ state: 'finalized' }), HOST, 'deleteOuting')).outing).toBeNull()
  })
})
