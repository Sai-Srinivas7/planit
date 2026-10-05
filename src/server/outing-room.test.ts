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
