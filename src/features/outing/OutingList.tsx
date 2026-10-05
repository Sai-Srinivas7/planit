/**
 * Home list of the caller's outings. The `outings` read policy is
 * 'collaborator', so the realtime socket only ever delivers outings the
 * caller is a member of.
 */

import { useQuery } from 'deepspace'
import type { Outing } from '../../domain/types'

type OutingRow = { hostId: string; members: string[]; inviteToken: string; payload: Outing }

export function OutingList() {
  const { records, status } = useQuery<OutingRow>('outings')

  // ponytail: count only for T0.6; cards, pluralized label and states arrive in T1.9 (OUT-06).
  if (status !== 'ready') return <p className="text-sm text-muted-foreground">Loading outings…</p>
  return (
    <p className="text-sm text-muted-foreground">
      <span data-testid="outing-count">{records.length}</span> outings
    </p>
  )
}
