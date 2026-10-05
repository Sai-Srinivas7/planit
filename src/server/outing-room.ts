/**
 * In-room command handler (spec §4.1). Runs inside AppRecordRoom's
 * blockConcurrencyWhile, so read → applyCommand → write never interleaves.
 * Writes go through the room's own tool executor as an app action, because
 * the `outings` schema denies every client write.
 */

import { applyCommand, type CommandContext } from '../domain/commands.js'
import { isCommandError } from '../domain/errors.js'
import type { Outing } from '../domain/types.js'

type ToolResult = { success: boolean; data?: any; error?: string }
export type ExecuteTool = (tool: string, params: Record<string, unknown>) => Promise<ToolResult>

export type RoomCommand = { command: string; id?: unknown; input: Record<string, unknown> }

/** App-wide suggestion runs for the current UTC day, in room storage (D-16). */
export type DailyCounter = { get(): Promise<number>; increment(): Promise<void> }

type StoredRecord = { recordId: string; data: { payload: Outing | string } }

const parsePayload = (r: StoredRecord): Outing =>
  typeof r.data.payload === 'string' ? JSON.parse(r.data.payload) : r.data.payload

async function load(exec: ExecuteTool, body: RoomCommand): Promise<{ recordId: string | null; outing: Outing | null }> {
  if (body.command === 'createOuting') return { recordId: null, outing: null }
  if (body.command === 'joinOuting') {
    const token = body.input.token
    if (typeof token !== 'string' || !token) return { recordId: null, outing: null }
    const found = await exec('records.query', { collection: 'outings', where: { inviteToken: token }, limit: 1 })
    const record = found.success ? (found.data?.records?.[0] as StoredRecord | undefined) : undefined
    return record ? { recordId: record.recordId, outing: parsePayload(record) } : { recordId: null, outing: null }
  }
  if (typeof body.id !== 'string' || !body.id) return { recordId: null, outing: null }
  const got = await exec('records.get', { collection: 'outings', recordId: body.id })
  const record = got.success ? (got.data?.record as StoredRecord | undefined) : undefined
  return record ? { recordId: record.recordId, outing: parsePayload(record) } : { recordId: null, outing: null }
}

const columns = (o: Outing) => ({ hostId: o.hostId, members: o.members, inviteToken: o.inviteToken, payload: o })

function must(result: ToolResult, what: string) {
  if (!result.success) throw new Error(`${what} failed: ${result.error}`)
}

/**
 * Never throws (spec §5): a throw inside blockConcurrencyWhile resets the room
 * for every user, so unexpected failures become 500 INTERNAL.
 */
export async function runOutingCommand(
  exec: ExecuteTool,
  userId: string,
  body: RoomCommand,
  now: Date,
  ctx: CommandContext = {},
  counter?: DailyCounter,
): Promise<Response> {
  try {
    return await execute(exec, userId, body, now, ctx, counter)
  } catch (err) {
    console.error(`[outing-room] ${body.command} failed:`, err instanceof Error ? err.message : String(err))
    return Response.json(
      { success: false, error: 'INTERNAL', message: 'Something went wrong. Nothing was changed. Try again.' },
      { status: 500 },
    )
  }
}

async function execute(
  exec: ExecuteTool,
  userId: string,
  body: RoomCommand,
  now: Date,
  ctx: CommandContext,
  counter?: DailyCounter,
): Promise<Response> {
  const { recordId, outing } = await load(exec, body)
  const isRequest = body.command === 'requestSuggestions'
  if (isRequest && counter) ctx = { ...ctx, appRunsToday: await counter.get() }
  const result = applyCommand(outing, userId, body.command, body.input, now, ctx)
  if (isCommandError(result)) {
    return Response.json({ success: false, error: result.code, message: result.message }, { status: 400 })
  }

  const { outing: next, data } = result
  if (!recordId) {
    if (next) must(await exec('records.create', { collection: 'outings', recordId: data.id, data: columns(next) }), 'records.create')
    return Response.json({ success: true, data })
  }
  if (next === null) {
    must(await exec('records.delete', { collection: 'outings', recordId }), 'records.delete')
  } else if (next !== outing) {
    must(await exec('records.update', { collection: 'outings', recordId, data: columns(next) }), 'records.update')
  }
  if (isRequest && data.reused === false) {
    await counter?.increment()
    // The route runs the fetch phase outside the room from this snapshot; it is stripped before responding.
    return Response.json({ success: true, data: { ...data, outing: next } })
  }
  return Response.json({ success: true, data: body.command === 'joinOuting' ? { id: recordId, ...data } : data })
}
