import { expect, test } from 'vitest'
import { HOST, NOW } from '../domain/make-outing'
import { runOutingCommand, type ExecuteTool } from './outing-room'

const create = { command: 'createOuting', input: { title: 'T', location: 'Dallas, TX', date: '2030-01-05', time: '18:00', timezone: 'America/Chicago' } }

test('§5: an unexpected failure inside the room returns 500 INTERNAL instead of throwing', async () => {
  // The storage call fails (I/O boundary), e.g. a records.create error.
  const failingStore: ExecuteTool = async () => ({ success: false, error: 'disk on fire' })
  const res = await runOutingCommand(failingStore, HOST, create, NOW)
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ success: false, error: 'INTERNAL', message: expect.any(String) })

  const throwingStore: ExecuteTool = async () => { throw new Error('boom') }
  const res2 = await runOutingCommand(throwingStore, HOST, { command: 'deleteOuting', id: 'x', input: {} }, NOW)
  expect(res2.status).toBe(500)
  expect(((await res2.json()) as { error: string }).error).toBe("INTERNAL")
})

/** Minimal in-memory record store behind the room's tool executor (the I/O boundary). */
function memoryStore() {
  const rows = new Map<string, Record<string, unknown>>()
  const exec: ExecuteTool = async (tool, params) => {
    const id = params.recordId as string
    if (tool === 'records.create' || tool === 'records.update') {
      rows.set(id, { ...(rows.get(id) ?? {}), ...(params.data as object) })
      return { success: true }
    }
    if (tool === 'records.get') return rows.has(id) ? { success: true, data: { record: { recordId: id, data: rows.get(id) } } } : { success: false, error: 'not found' }
    return { success: false, error: `unsupported ${tool}` }
  }
  return exec
}

test('D-16: only billable runs count toward the app-wide daily cap; fixture runs leave it alone', async () => {
  let today = 30
  const counter = { get: async () => today, increment: async () => { today += 1 } }
  const exec = memoryStore()
  const created = (await (await runOutingCommand(exec, HOST, create, NOW)).json()) as { data: { id: string } }
  const id = created.data.id

  // Live (billable) run at the cap → refused, counter unchanged.
  const live = await runOutingCommand(exec, HOST, { command: 'requestSuggestions', id, input: {}, billable: true }, NOW, {}, counter)
  expect(((await live.json()) as { error: string }).error).toBe('LIMIT_REACHED')
  expect(today).toBe(30)

  // Fixture run at the cap → allowed, counter not incremented.
  const fixture = await runOutingCommand(exec, HOST, { command: 'requestSuggestions', id, input: {}, billable: false }, NOW, {}, counter)
  expect(((await fixture.json()) as { data: { reused: boolean } }).data.reused).toBe(false)
  expect(today).toBe(30)

  // Below the cap a billable run increments it exactly once.
  today = 5
  const other = (await (await runOutingCommand(exec, HOST, create, NOW)).json()) as { data: { id: string } }
  await runOutingCommand(exec, HOST, { command: 'requestSuggestions', id: other.data.id, input: {}, billable: true }, NOW, {}, counter)
  expect(today).toBe(6)
})
