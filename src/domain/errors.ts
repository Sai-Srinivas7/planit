/** Refusal codes (spec §5). */

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'NOT_MEMBER',
  'NOT_HOST',
  'NOT_CREATOR',
  'NOT_AUTHOR',
  'OPTION_LOCKED',
  'NOT_FOUND',
  'OUTING_FINALIZED',
  'INVALID_STATE',
  'INVALID_INPUT',
  'INVITE_INVALID',
  'LIMIT_REACHED',
  'INTERNAL', // 500 only: unexpected failure inside the room
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export type CommandError = { code: ErrorCode; message: string }

export const refuse = (code: ErrorCode, message: string): CommandError => ({ code, message })

export const isCommandError = (v: unknown): v is CommandError =>
  typeof v === 'object' && v !== null && 'code' in v && 'message' in v
