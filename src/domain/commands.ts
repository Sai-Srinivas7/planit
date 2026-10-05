/**
 * applyCommand (spec §4.1): every business rule, as a pure function.
 * Returns the next outing (null when deleted) plus success data, or a CommandError.
 * The caller's userId always comes from the verified JWT, never from `input`.
 */

import type { CommandError } from './errors'
import type { Outing } from './types'

/** Spec §5 public command list. Anything else is 404 at the route. */
export const PUBLIC_COMMANDS = [
  'createOuting',
  'joinOuting',
  'deleteOuting',
  'addOption',
  'editOption',
  'deleteOption',
  'setResponse',
  'setPreference',
  'finalize',
  'reopen',
  'postComment',
  'deleteComment',
  'requestSuggestions',
] as const

export type PublicCommand = (typeof PUBLIC_COMMANDS)[number]

export const isPublicCommand = (c: string): c is PublicCommand =>
  (PUBLIC_COMMANDS as readonly string[]).includes(c)

export type CommandResult = { outing: Outing | null; data: Record<string, unknown> }

export function applyCommand(
  outing: Outing | null,
  userId: string,
  command: string,
  input: Record<string, unknown>,
  now: Date,
  // Ids are injected so tests stay deterministic; the room uses the default.
  newId: () => string = () => crypto.randomUUID(),
): CommandResult | CommandError {
  switch (command) {
    case 'createOuting': {
      // ponytail: minimal record for T0.5; validation lands in T1.4 (OUT-02), startAt in T1.1 (OUT-03).
      const text = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
      const id = newId()
      const inviteToken = newId()
      const next: Outing = {
        title: text('title'),
        location: text('location'),
        date: text('date'),
        time: text('time'),
        timezone: text('timezone'),
        startAt: '',
        hostId: userId,
        members: [userId],
        inviteToken,
        state: 'open',
        selectedOptionId: null,
        finalizedAt: null,
        people: [{ userId, joinedAt: now.toISOString() }],
        options: [],
        responses: [],
        comments: [],
        suggestions: { status: 'idle', runs: 0, startedAt: null, message: null, weather: null, resolvedLocation: null },
      }
      return { outing: next, data: { id, inviteToken } }
    }
    default:
      // ponytail: remaining §5 commands arrive task by task (Blocks 1–4).
      throw new Error(`${command} not implemented`)
  }
}
