/**
 * applyCommand (spec §4.1): every business rule, as a pure function.
 * Returns the next outing (null when deleted) plus success data, or a CommandError.
 * The caller's userId always comes from the verified JWT, never from `input`.
 *
 * Check order (spec §5, first failure wins): input validation → record lookup →
 * membership → role → outing state → option lock → limits.
 */

import type { z } from 'zod'
import { type CommandError, isCommandError as isError, refuse } from './errors'
import { toStartAt } from './time'
import { CAPS, type Outing } from './types'
import { createOutingInput, joinOutingInput } from './validate'

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

export type CommandContext = {
  /** Id generator; injected by tests for determinism. */
  newId?: () => string
}

/** Same response for an unknown token and a deleted outing's token (INV-03). */
export const INVITE_INVALID_MESSAGE = 'This invite link is not valid.'

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> | CommandError {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const field = issue.path.join('.')
  return refuse('INVALID_INPUT', field ? `${field}: ${issue.message}` : issue.message)
}

export function applyCommand(
  outing: Outing | null,
  userId: string,
  command: string,
  input: Record<string, unknown>,
  now: Date,
  ctx: CommandContext = {},
): CommandResult | CommandError {
  const newId = ctx.newId ?? (() => crypto.randomUUID())

  switch (command) {
    case 'createOuting': {
      const v = parse(createOutingInput, input)
      if (isError(v)) return v
      const startAt = toStartAt(v.date, v.time, v.timezone)
      if (!startAt) return refuse('INVALID_INPUT', 'That time does not exist in this timezone (the clocks change then).')
      if (Date.parse(startAt) <= now.getTime()) return refuse('INVALID_INPUT', 'Pick a start time in the future.')
      const id = newId()
      const inviteToken = newId()
      const next: Outing = {
        ...v,
        startAt,
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

    case 'joinOuting': {
      const v = parse(joinOutingInput, input)
      if (isError(v)) return v
      if (!outing) return refuse('INVITE_INVALID', INVITE_INVALID_MESSAGE)
      if (outing.members.includes(userId)) return { outing, data: { alreadyMember: true } }
      if (outing.members.length >= CAPS.members) return refuse('LIMIT_REACHED', 'This outing is full (50 people).')
      const next = structuredClone(outing)
      next.members.push(userId)
      next.people.push({ userId, joinedAt: now.toISOString() })
      return { outing: next, data: { alreadyMember: false } }
    }

    case 'deleteOuting': {
      if (!outing) return refuse('NOT_FOUND', 'Outing not found.')
      if (!outing.members.includes(userId)) return notMember()
      if (outing.hostId !== userId) return refuse('NOT_HOST', 'Only the host can delete this outing.')
      return { outing: null, data: {} }
    }

    default:
      // ponytail: remaining §5 commands arrive task by task (Blocks 2–4).
      throw new Error(`${command} not implemented`)
  }
}

const notMember = () => refuse('NOT_MEMBER', 'You are not part of this outing. Join with its invite link.')
