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
import { CAPS, type Option, type Outing } from './types'
import {
  addOptionInput,
  commentRefInput,
  createOutingInput,
  editOptionInput,
  joinOutingInput,
  optionRefInput,
  postCommentInput,
  setPreferenceInput,
  setResponseInput,
} from './validate'

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
      if (!outing) return notFound()
      if (!outing.members.includes(userId)) return notMember()
      if (outing.hostId !== userId) return refuse('NOT_HOST', 'Only the host can delete this outing.')
      return { outing: null, data: {} }
    }

    case 'addOption': {
      const v = parse(addOptionInput, input)
      if (isError(v)) return v
      if (!outing) return notFound()
      if (!outing.members.includes(userId)) return notMember()
      if (outing.state === 'finalized') return finalized()
      if (outing.options.length >= CAPS.options) return refuse('LIMIT_REACHED', 'This outing already has 30 places.')
      const option: Option = {
        id: newId(),
        createdBy: userId,
        createdAt: now.toISOString(),
        origin: 'manual',
        name: v.name,
        address: v.address ?? null,
        link: v.link ?? null,
        note: v.note ?? null,
        sourceUrl: null,
        providerPlaceId: null,
        explanation: null,
        fetchedAt: null,
      }
      const next = structuredClone(outing)
      next.options.push(option)
      return { outing: next, data: { optionId: option.id } }
    }

    case 'editOption': {
      const v = parse(editOptionInput, input)
      if (isError(v)) return v
      if (!outing) return notFound()
      if (!outing.members.includes(userId)) return notMember()
      const option = outing.options.find((o) => o.id === v.optionId)
      if (!option) return optionGone()
      // The host may edit only their own options, under the creator rule (D-02).
      if (option.createdBy !== userId) return refuse('NOT_CREATOR', 'Only the person who added this place can edit it.')
      if (outing.state === 'finalized') return finalized()
      if (isLocked(outing, option)) return locked()
      const next = structuredClone(outing)
      const target = next.options.find((o) => o.id === option.id)!
      if (v.name !== undefined) target.name = v.name
      if (v.address !== undefined) target.address = v.address
      if (v.link !== undefined) target.link = v.link
      if (v.note !== undefined) target.note = v.note
      return { outing: next, data: {} }
    }

    case 'deleteOption': {
      const v = parse(optionRefInput, input)
      if (isError(v)) return v
      if (!outing) return notFound()
      if (!outing.members.includes(userId)) return notMember()
      const option = outing.options.find((o) => o.id === v.optionId)
      if (!option) return optionGone()
      const isHost = outing.hostId === userId
      if (option.createdBy !== userId && !isHost) {
        return refuse('NOT_CREATOR', 'Only the person who added this place, or the host, can remove it.')
      }
      if (outing.state === 'finalized') return finalized()
      // The host may delete any option, locked or not (D-03).
      if (!isHost && isLocked(outing, option)) return locked()
      const next = structuredClone(outing)
      next.options = next.options.filter((o) => o.id !== option.id)
      next.responses = next.responses.filter((r) => r.optionId !== option.id)
      if (next.selectedOptionId === option.id) next.selectedOptionId = null
      return { outing: next, data: {} }
    }

    case 'setResponse': {
      const v = parse(setResponseInput, input)
      if (isError(v)) return v
      if (!outing) return notFound()
      if (!outing.members.includes(userId)) return notMember()
      if (!outing.options.some((o) => o.id === v.optionId)) return optionGone()
      if (outing.state === 'finalized') return finalized()
      const next = structuredClone(outing)
      next.responses = next.responses.filter((r) => !(r.userId === userId && r.optionId === v.optionId))
      if (v.value !== null) next.responses.push({ userId, optionId: v.optionId, value: v.value })
      return { outing: next, data: {} }
    }

    case 'setPreference': {
      const v = parse(setPreferenceInput, input)
      if (isError(v)) return v
      if (!outing) return notFound()
      if (!outing.members.includes(userId)) return notMember()
      if (outing.state === 'finalized') return finalized()
      const next = structuredClone(outing)
      const person = next.people.find((p) => p.userId === userId)
      if (person) person.preferences = v
      else next.people.push({ userId, joinedAt: now.toISOString(), preferences: v })
      return { outing: next, data: {} }
    }

    case 'finalize': {
      const v = parse(optionRefInput, input)
      if (isError(v)) return v
      if (!outing) return notFound()
      if (!outing.members.includes(userId)) return notMember()
      if (outing.hostId !== userId) return refuse('NOT_HOST', 'Only the host can confirm the plan.')
      if (!outing.options.some((o) => o.id === v.optionId)) return optionGone()
      if (outing.state === 'finalized') return refuse('INVALID_STATE', 'The plan is already confirmed.')
      const next = structuredClone(outing)
      next.state = 'finalized'
      next.selectedOptionId = v.optionId
      next.finalizedAt = now.toISOString()
      return { outing: next, data: {} }
    }

    case 'reopen': {
      if (!outing) return notFound()
      if (!outing.members.includes(userId)) return notMember()
      if (outing.hostId !== userId) return refuse('NOT_HOST', 'Only the host can reopen the plan.')
      if (outing.state !== 'finalized') return refuse('INVALID_STATE', 'The plan is not confirmed.')
      const next = structuredClone(outing)
      next.state = 'open'
      next.finalizedAt = null // responses and selectedOptionId are kept (D-05)
      return { outing: next, data: {} }
    }

    case 'postComment': {
      const v = parse(postCommentInput, input)
      if (isError(v)) return v
      if (!outing) return notFound()
      if (!outing.members.includes(userId)) return notMember()
      if (outing.comments.length >= CAPS.comments) return refuse('LIMIT_REACHED', 'This conversation has reached 200 messages.')
      const comment = { id: newId(), authorId: userId, body: v.body, createdAt: now.toISOString() }
      const next = structuredClone(outing)
      next.comments.push(comment)
      return { outing: next, data: { commentId: comment.id } }
    }

    case 'deleteComment': {
      const v = parse(commentRefInput, input)
      if (isError(v)) return v
      if (!outing) return notFound()
      if (!outing.members.includes(userId)) return notMember()
      const comment = outing.comments.find((c) => c.id === v.commentId)
      if (!comment) return refuse('NOT_FOUND', 'That message is already gone.')
      if (comment.authorId !== userId && outing.hostId !== userId) {
        return refuse('NOT_AUTHOR', 'Only the author or the host can delete this message.')
      }
      const next = structuredClone(outing)
      next.comments = next.comments.filter((c) => c.id !== comment.id) // hard delete (D-17)
      return { outing: next, data: {} }
    }

    default:
      // ponytail: suggestion commands arrive in Block 4.
      throw new Error(`${command} not implemented`)
  }
}

/** Locked once any member other than the creator has responded to it (D-02). */
export const isLocked = (outing: Outing, option: Option) =>
  outing.responses.some((r) => r.optionId === option.id && r.userId !== option.createdBy)

const notFound = () => refuse('NOT_FOUND', 'Outing not found.')
const optionGone = () => refuse('NOT_FOUND', 'That place is no longer on the shortlist.')
const finalized = () => refuse('OUTING_FINALIZED', 'The plan is confirmed. Ask the host to reopen it to make changes.')
const locked = () => refuse('OPTION_LOCKED', 'Someone else has responded to this place, so it can no longer be changed.')

const notMember = () => refuse('NOT_MEMBER', 'You are not part of this outing. Join with its invite link.')
