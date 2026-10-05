/**
 * In-room command handler (spec §4.1). Runs inside AppRecordRoom's
 * blockConcurrencyWhile, so read → applyCommand → write never interleaves.
 * Writes go through the room's own tool executor as an app action, because
 * the `outings` schema denies every client write.
 */

import { applyCommand } from '../domain/commands.js'
import { isCommandError } from '../domain/errors.js'

type ToolResult = { success: boolean; data?: unknown; error?: string }
export type ExecuteTool = (tool: string, params: Record<string, unknown>) => Promise<ToolResult>

export type RoomCommand = { command: string; id?: unknown; input: Record<string, unknown> }

export async function runOutingCommand(
  exec: ExecuteTool,
  userId: string,
  body: RoomCommand,
  now: Date,
): Promise<Response> {
  // ponytail: only createOuting so far; record lookup by id / invite token arrives with T1.7–T1.8.
  const result = applyCommand(null, userId, body.command, body.input, now)
  if (isCommandError(result)) {
    return Response.json({ success: false, error: result.code, message: result.message }, { status: 400 })
  }
  const { outing, data } = result
  if (outing) {
    const saved = await exec('records.create', {
      collection: 'outings',
      recordId: data.id,
      data: { hostId: outing.hostId, members: outing.members, inviteToken: outing.inviteToken, payload: outing },
    })
    if (!saved.success) throw new Error(`records.create failed: ${saved.error}`)
  }
  return Response.json({ success: true, data })
}
