/**
 * Home list of the caller's outings (OUT-06). The `outings` read policy is
 * 'collaborator', so the realtime socket only ever delivers outings the
 * caller is a member of.
 */

import { useState } from 'react'
import { CalendarDays, MapPin, Plus } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { formatInZone } from '../../domain/time'
import { CreateOutingDialog } from './CreateOutingDialog'
import { useOutings } from './useOuting'

/** "1 outing", "2 outings" (OUT-06). */
export const outingWord = (n: number) => (n === 1 ? 'outing' : 'outings')

export function OutingList({ onOpen }: { onOpen: (id: string) => void }) {
  const { outings, status } = useOutings()
  const [creating, setCreating] = useState(false)

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your outings</h1>
          {status === 'ready' ? (
            <p className="text-sm text-muted-foreground" data-testid="outing-count-label">
              <span data-testid="outing-count">{outings.length}</span>{' '}{outingWord(outings.length)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">Loading outings…</p>
          )}
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden /> New outing
        </Button>
      </header>

      {status === 'ready' && outings.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No outings yet. Start one and share the invite link with your friends.
        </p>
      )}

      <ul className="grid gap-3">
        {outings.map(({ id, outing }) => (
          <li key={id}>
            <button
              data-testid="outing-card"
              onClick={() => onOpen(id)}
              className="grid w-full gap-1 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-lg font-semibold" data-testid="outing-title">{outing.title}</span>
                <Badge variant={outing.state === 'finalized' ? 'default' : 'secondary'} data-testid="outing-state">
                  {outing.state === 'finalized' ? 'Confirmed' : 'Planning'}
                </Badge>
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin size={14} aria-hidden /> {outing.location}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="outing-when">
                <CalendarDays size={14} aria-hidden /> {formatInZone(outing.startAt, outing.timezone)} · {outing.timezone}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <CreateOutingDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); onOpen(id) }} />
    </section>
  )
}
