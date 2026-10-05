/** Outings the caller can see, straight from the realtime socket (members only). */

import { useQuery } from 'deepspace'
import type { Outing } from '../../domain/types'

type OutingRow = { hostId: string; members: string[] | string; inviteToken: string; payload: Outing | string }

export type OutingEntry = { id: string; outing: Outing }

const parse = <T,>(v: T | string): T => (typeof v === 'string' ? (JSON.parse(v) as T) : v)

export function useOutings(): { outings: OutingEntry[]; status: 'loading' | 'ready' | 'error' } {
  const { records, status } = useQuery<OutingRow>('outings')
  const outings = records
    .map((r) => ({ id: r.recordId, outing: parse(r.data.payload) }))
    .sort((a, b) => a.outing.startAt.localeCompare(b.outing.startAt))
  return { outings, status }
}

export function useOuting(id: string | null) {
  const { outings, status } = useOutings()
  return { entry: outings.find((o) => o.id === id) ?? null, status }
}
