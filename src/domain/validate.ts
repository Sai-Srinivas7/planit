/**
 * Command input schemas (spec §5 input limits). Unknown keys — including any
 * `userId` a client sends — are stripped, never read.
 */

import { z } from 'zod'
import { isValidTimeZone } from './time'
import { BUDGETS, INTERESTS, SETTINGS } from './types'

const text = (min: number, max: number) => z.string().trim().min(min).max(max)
/** Optional free text: '' and null both mean "not set". */
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v ? v : v === undefined ? undefined : null))
const link = z
  .union([z.string().trim().max(2000), z.null()])
  .optional()
  .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), 'Links must start with http:// or https://')
  .transform((v) => (v ? v : v === undefined ? undefined : null))
const ref = z.string().min(1).max(100)

const isRealDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export const createOutingInput = z.object({
  title: text(1, 80),
  location: text(1, 120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, 'Not a real date'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().refine(isValidTimeZone, 'Unknown timezone'),
})

export const joinOutingInput = z.object({ token: z.string().max(100) })

export const addOptionInput = z.object({
  name: text(1, 120),
  address: optionalText(200),
  link,
  note: optionalText(280),
})

export const editOptionInput = z.object({
  optionId: ref,
  name: text(1, 120).optional(),
  address: optionalText(200),
  link,
  note: optionalText(280),
})

export const optionRefInput = z.object({ optionId: ref })

export const setResponseInput = z.object({
  optionId: ref,
  value: z.enum(['yes', 'maybe', 'no']).nullable(),
})

export const setPreferenceInput = z.object({
  budget: z.enum(BUDGETS),
  interests: z.array(z.enum(INTERESTS)).max(32).transform((v) => [...new Set(v)]),
  setting: z.enum(SETTINGS),
})

export const postCommentInput = z.object({ body: text(1, 1000) })

export const commentRefInput = z.object({ commentId: ref })
