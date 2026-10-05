/** Test builder: an outing in any state (plan §3). Not used by app code. */

import type { Option, Outing } from './types'

export const HOST = 'user-host'
export const MEMBER = 'user-member'
export const MEMBER2 = 'user-member-2'
export const OUTSIDER = 'user-outsider'
export const NOW = new Date('2030-01-01T12:00:00.000Z')

let seq = 0
export const ids = () => {
  let n = 0
  return () => `id-${++n}`
}

export function makeOption(over: Partial<Option> = {}): Option {
  seq += 1
  return {
    id: `opt-${seq}`,
    createdBy: MEMBER,
    createdAt: new Date(NOW.getTime() + seq * 1000).toISOString(),
    origin: 'manual',
    name: `Place ${seq}`,
    address: null,
    link: null,
    note: null,
    sourceUrl: null,
    providerPlaceId: null,
    explanation: null,
    fetchedAt: null,
    ...over,
  }
}

export function makeOuting(over: Partial<Outing> = {}): Outing {
  const members = over.members ?? [HOST, MEMBER, MEMBER2]
  return {
    title: 'Friday dinner',
    location: 'Dallas, TX',
    date: '2030-01-05',
    time: '18:00',
    timezone: 'America/Chicago',
    startAt: '2030-01-06T00:00:00.000Z',
    hostId: HOST,
    members,
    inviteToken: 'token-1',
    state: 'open',
    selectedOptionId: null,
    finalizedAt: null,
    people: members.map((userId) => ({ userId, joinedAt: NOW.toISOString() })),
    options: [],
    responses: [],
    comments: [],
    suggestions: { status: 'idle', runs: 0, startedAt: null, message: null, weather: null, resolvedLocation: null },
    ...over,
  }
}
