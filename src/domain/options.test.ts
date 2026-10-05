import { describe, expect, test } from 'vitest'
import { applyCommand, type CommandResult } from './commands'
import type { CommandError } from './errors'
import { HOST, ids, makeOption, makeOuting, MEMBER, MEMBER2, NOW } from './make-outing'
import type { Outing } from './types'

const run = (outing: Outing, userId: string, command: string, input: Record<string, unknown>) =>
  applyCommand(outing, userId, command, input, NOW, { newId: ids() })
const code = (r: CommandResult | CommandError) => ('code' in r ? r.code : 'OK')
const ok = (r: CommandResult | CommandError): Outing => {
  if ('code' in r) throw new Error(`expected success, got ${r.code}`)
  return r.outing!
}

describe('options', () => {
  test('OPT-01: a member adds an option with only a name: createdBy = caller, origin manual, unknown facts null', () => {
    const r = run(makeOuting(), MEMBER, 'addOption', { name: '  Houndstooth Coffee ', createdBy: HOST, origin: 'suggested' })
    if ('code' in r) throw new Error(r.code)
    expect(r.data).toEqual({ optionId: 'id-1' })
    expect(r.outing!.options).toEqual([
      {
        id: 'id-1',
        createdBy: MEMBER,
        createdAt: NOW.toISOString(),
        origin: 'manual',
        name: 'Houndstooth Coffee',
        address: null,
        link: null,
        note: null,
        sourceUrl: null,
        providerPlaceId: null,
        explanation: null,
        fetchedAt: null,
      },
    ])
  })

  test('OPT-02: missing name, any field over its limit, or a non-http(s) link returns INVALID_INPUT; the 31st option returns LIMIT_REACHED', () => {
    const o = makeOuting()
    for (const input of [
      {},
      { name: '   ' },
      { name: 'x'.repeat(121) },
      { name: 'ok', address: 'x'.repeat(201) },
      { name: 'ok', note: 'x'.repeat(281) },
      { name: 'ok', link: 'javascript:alert(1)' },
      { name: 'ok', link: 'ftp://example.com' },
      { name: 'ok', link: 'example.com' },
    ]) {
      expect(code(run(o, MEMBER, 'addOption', input)), JSON.stringify(input)).toBe('INVALID_INPUT')
    }
    expect(code(run(o, MEMBER, 'addOption', { name: 'x'.repeat(120), address: 'a'.repeat(200), note: 'n'.repeat(280), link: 'https://example.com/x' }))).toBe('OK')
    // Editing applies the same limits.
    const withOption = makeOuting({ options: [makeOption({ id: 'o1', createdBy: MEMBER })] })
    expect(code(run(withOption, MEMBER, 'editOption', { optionId: 'o1', link: 'mailto:a@b.c' }))).toBe('INVALID_INPUT')

    const thirty = makeOuting({ options: Array.from({ length: 30 }, () => makeOption()) })
    expect(code(run(makeOuting({ options: thirty.options.slice(0, 29) }), MEMBER, 'addOption', { name: '30th' }))).toBe('OK')
    expect(code(run(thirty, MEMBER, 'addOption', { name: '31st' }))).toBe('LIMIT_REACHED')
  })

  test('OPT-05: the creator edits and deletes their own option while no other member has responded', () => {
    const o = makeOuting({ options: [makeOption({ id: 'o1', createdBy: MEMBER, name: 'Old' })] })
    const edited = ok(run(o, MEMBER, 'editOption', { optionId: 'o1', name: 'New', address: '1 Main St', link: 'https://x.test', note: 'cozy' }))
    expect(edited.options[0]).toMatchObject({ name: 'New', address: '1 Main St', link: 'https://x.test', note: 'cozy', createdBy: MEMBER })
    // Clearing a field sets it back to null; omitted fields are unchanged.
    expect(ok(run(edited, MEMBER, 'editOption', { optionId: 'o1', address: '' })).options[0]).toMatchObject({ name: 'New', address: null, note: 'cozy' })
    expect(ok(run(o, MEMBER, 'deleteOption', { optionId: 'o1' })).options).toEqual([])
  })

  test("OPT-06: after another member responds the creator's edit and delete return OPTION_LOCKED; the creator's own response does not lock", () => {
    const option = makeOption({ id: 'o1', createdBy: MEMBER })
    const ownOnly = makeOuting({ options: [option], responses: [{ userId: MEMBER, optionId: 'o1', value: 'yes' }] })
    expect(code(run(ownOnly, MEMBER, 'editOption', { optionId: 'o1', name: 'still fine' }))).toBe('OK')
    expect(code(run(ownOnly, MEMBER, 'deleteOption', { optionId: 'o1' }))).toBe('OK')

    for (const value of ['yes', 'maybe', 'no'] as const) {
      const locked = makeOuting({ options: [option], responses: [{ userId: MEMBER2, optionId: 'o1', value }] })
      expect(code(run(locked, MEMBER, 'editOption', { optionId: 'o1', name: 'x' }))).toBe('OPTION_LOCKED')
      expect(code(run(locked, MEMBER, 'deleteOption', { optionId: 'o1' }))).toBe('OPTION_LOCKED')
    }
  })

  test("OPT-07: the host deletes another member's option, locked or not, removing its responses; host editing it returns NOT_CREATOR", () => {
    const option = makeOption({ id: 'o1', createdBy: MEMBER })
    const keep = makeOption({ id: 'o2', createdBy: MEMBER2 })
    const responses = [
      { userId: MEMBER2, optionId: 'o1', value: 'yes' as const },
      { userId: MEMBER, optionId: 'o1', value: 'maybe' as const },
      { userId: MEMBER2, optionId: 'o2', value: 'no' as const },
    ]
    const o = makeOuting({ options: [option, keep], responses })
    const after = ok(run(o, HOST, 'deleteOption', { optionId: 'o1' }))
    expect(after.options.map((x) => x.id)).toEqual(['o2'])
    expect(after.responses).toEqual([{ userId: MEMBER2, optionId: 'o2', value: 'no' }])
    expect(ok(run(makeOuting({ options: [option] }), HOST, 'deleteOption', { optionId: 'o1' })).options).toEqual([])
    expect(code(run(o, HOST, 'editOption', { optionId: 'o1', name: 'x' }))).toBe('NOT_CREATOR')
  })

  test('OPT-08: a non-creator, non-host member gets NOT_CREATOR for edit and delete', () => {
    const o = makeOuting({ options: [makeOption({ id: 'o1', createdBy: MEMBER2 })] })
    expect(code(run(o, MEMBER, 'editOption', { optionId: 'o1', name: 'x' }))).toBe('NOT_CREATOR')
    expect(code(run(o, MEMBER, 'deleteOption', { optionId: 'o1' }))).toBe('NOT_CREATOR')
  })

  test('deleting an option that was the previous pick (after reopen) clears selectedOptionId', () => {
    const o = makeOuting({ options: [makeOption({ id: 'o1', createdBy: HOST })], selectedOptionId: 'o1' })
    expect(ok(run(o, HOST, 'deleteOption', { optionId: 'o1' })).selectedOptionId).toBeNull()
  })
})
