/** Outing payload and fixed values (spec §4.3). */

export const BUDGETS = ['flexible', 'under_20', '20_50', '50_plus'] as const
export const INTERESTS = ['food', 'coffee', 'drinks', 'outdoors', 'art', 'music', 'games', 'shopping'] as const
export const SETTINGS = ['indoor', 'outdoor', 'either'] as const

export type Budget = (typeof BUDGETS)[number]
export type Interest = (typeof INTERESTS)[number]
export type Setting = (typeof SETTINGS)[number]

export const CAPS = { members: 50, options: 30, comments: 200 } as const

export type Preference = { budget: Budget; interests: Interest[]; setting: Setting }

export type Weather = { forecastAt: string; tempC: number; description: string }

export type Option = {
  id: string
  createdBy: string
  createdAt: string
  origin: 'manual' | 'suggested'
  name: string
  address: string | null
  link: string | null
  note: string | null
  sourceUrl: string | null
  providerPlaceId: string | null
  explanation: string | null
  fetchedAt: string | null
}

export type ResponseValue = 'yes' | 'maybe' | 'no'

export type Outing = {
  title: string
  location: string
  date: string
  time: string
  timezone: string
  startAt: string
  hostId: string
  members: string[]
  inviteToken: string
  state: 'open' | 'finalized'
  selectedOptionId: string | null
  finalizedAt: string | null
  people: { userId: string; joinedAt: string; preferences?: Preference }[]
  options: Option[]
  responses: { userId: string; optionId: string; value: ResponseValue }[]
  comments: { id: string; authorId: string; body: string; createdAt: string }[]
  suggestions: {
    status: 'idle' | 'running' | 'done' | 'failed'
    runs: number
    startedAt: string | null
    message: string | null
    weather: Weather | 'unavailable' | null
    resolvedLocation: string | null
  }
}
