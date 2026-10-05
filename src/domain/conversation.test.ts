import { describe, expect, test } from 'vitest'
import { applyCommand, type CommandResult } from './commands'
import type { CommandError } from './errors'
import { HOST, ids, makeOuting, MEMBER, MEMBER2, NOW, OUTSIDER } from './make-outing'
import type { Outing } from './types'

const run = (outing: Outing, userId: string, command: string, input: Record<string, unknown> = {}) =>
  applyCommand(outing, userId, command, input, NOW, { newId: ids() })
const code = (r: CommandResult | CommandError) => ('code' in r ? r.code : 'OK')
const ok = (r: CommandResult | CommandError): Outing => {
  if ('code' in r) throw new Error(`expected success, got ${r.code}`)
  return r.outing!
}
const pref = { budget: '20_50', interests: ['coffee', 'art'], setting: 'indoor' }

describe('preferences', () => {
  test('PREF-01: a member sets preferences on their people entry; setting again replaces it', () => {
    const a = ok(run(makeOuting(), MEMBER, 'setPreference', pref))
    expect(a.people.find((p) => p.userId === MEMBER)!.preferences).toEqual(pref)
    const b = ok(run(a, MEMBER, 'setPreference', { budget: 'flexible', interests: [], setting: 'either' }))
    expect(b.people.find((p) => p.userId === MEMBER)!.preferences).toEqual({ budget: 'flexible', interests: [], setting: 'either' })
    expect(b.people.filter((p) => p.userId === MEMBER)).toHaveLength(1)
    // Other members are untouched; a userId in the input is ignored.
    const c = ok(run(b, MEMBER2, 'setPreference', { ...pref, userId: MEMBER }))
    expect(c.people.find((p) => p.userId === MEMBER)!.preferences!.budget).toBe('flexible')
    expect(c.people.find((p) => p.userId === MEMBER2)!.preferences).toEqual(pref)
  })

  test('PREF-03: budget, setting, and every interest must come from the fixed values', () => {
    const o = makeOuting()
    for (const input of [
      { ...pref, budget: 'cheap' },
      { ...pref, budget: '$20' },
      { ...pref, setting: 'rooftop' },
      { ...pref, interests: ['coffee', 'karaoke'] },
      { ...pref, interests: 'coffee' },
      { budget: 'flexible', setting: 'either' },
      {},
    ]) {
      expect(code(run(o, MEMBER, 'setPreference', input)), JSON.stringify(input)).toBe('INVALID_INPUT')
    }
    // Every fixed value is accepted; duplicates collapse.
    for (const budget of ['flexible', 'under_20', '20_50', '50_plus']) {
      expect(code(run(o, MEMBER, 'setPreference', { ...pref, budget }))).toBe('OK')
    }
    const all = ['food', 'coffee', 'drinks', 'outdoors', 'art', 'music', 'games', 'shopping']
    expect(ok(run(o, MEMBER, 'setPreference', { ...pref, interests: [...all, 'food'] })).people.find((p) => p.userId === MEMBER)!.preferences!.interests).toEqual(all)
  })
})

describe('conversation', () => {
  test('COM-01: postComment stores the trimmed body with authorId = caller and a server timestamp; the 201st returns LIMIT_REACHED', () => {
    const r = run(makeOuting(), MEMBER, 'postComment', { body: '  see you there!  ', authorId: HOST, createdAt: '1999-01-01' })
    if ('code' in r) throw new Error(r.code)
    expect(r.data).toEqual({ commentId: 'id-1' })
    expect(r.outing!.comments).toEqual([{ id: 'id-1', authorId: MEMBER, body: 'see you there!', createdAt: NOW.toISOString() }])
    for (const body of ['', '   ', 'x'.repeat(1001)]) expect(code(run(makeOuting(), MEMBER, 'postComment', { body }))).toBe('INVALID_INPUT')
    expect(code(run(makeOuting(), MEMBER, 'postComment', { body: 'x'.repeat(1000) }))).toBe('OK')

    const comments = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, authorId: HOST, body: 'hi', createdAt: NOW.toISOString() }))
    expect(code(run(makeOuting({ comments: comments.slice(0, 199) }), MEMBER, 'postComment', { body: '200th' }))).toBe('OK')
    expect(code(run(makeOuting({ comments }), MEMBER, 'postComment', { body: '201st' }))).toBe('LIMIT_REACHED')
  })

  test('COM-02: the author deletes their own comment; the host deletes any; another member gets NOT_AUTHOR', () => {
    const o = makeOuting({ comments: [{ id: 'c1', authorId: MEMBER, body: 'hi', createdAt: NOW.toISOString() }] })
    expect(ok(run(o, MEMBER, 'deleteComment', { commentId: 'c1' })).comments).toEqual([])
    expect(ok(run(o, HOST, 'deleteComment', { commentId: 'c1' })).comments).toEqual([])
    expect(code(run(o, MEMBER2, 'deleteComment', { commentId: 'c1' }))).toBe('NOT_AUTHOR')
    expect(code(run(o, MEMBER, 'deleteComment', { commentId: 'nope' }))).toBe('NOT_FOUND')
  })

  test('COM-05: a deleted comment is removed from the payload; no placeholder remains', () => {
    const o = makeOuting({
      comments: [
        { id: 'c1', authorId: MEMBER, body: 'first', createdAt: NOW.toISOString() },
        { id: 'c2', authorId: MEMBER2, body: 'secret', createdAt: NOW.toISOString() },
        { id: 'c3', authorId: MEMBER, body: 'third', createdAt: NOW.toISOString() },
      ],
    })
    const after = ok(run(o, HOST, 'deleteComment', { commentId: 'c2' }))
    expect(after.comments.map((c) => c.id)).toEqual(['c1', 'c3'])
    expect(JSON.stringify(after)).not.toContain('secret')
  })

  test('INV-06: a member who joins a finalized outing can post comments', () => {
    const finalized = makeOuting({ members: [HOST], state: 'finalized', finalizedAt: NOW.toISOString() })
    const joined = ok(run(finalized, OUTSIDER, 'joinOuting', { token: 'token-1' }))
    const posted = ok(run(joined, OUTSIDER, 'postComment', { body: 'Count me in' }))
    expect(posted.comments).toEqual([{ id: 'id-1', authorId: OUTSIDER, body: 'Count me in', createdAt: NOW.toISOString() }])
  })
})
