/** Confirmed view (FIN-05): the chosen place, when, and a clear "nothing is booked". */

import { useState } from 'react'
import { CheckCircle2, Clipboard } from 'lucide-react'
import { Button } from '@/components/ui'
import { NOTHING_BOOKED, planText } from '../../domain/summary'
import { formatInZone } from '../../domain/time'
import type { Outing } from '../../domain/types'
import { useCommand } from '../../lib/outing-api'

export function ConfirmedPlan({ outingId, outing, isHost }: { outingId: string; outing: Outing; isHost: boolean }) {
  const place = outing.options.find((o) => o.id === outing.selectedOptionId)
  const { run, pending, error } = useCommand()
  const [copy, setCopy] = useState<'idle' | 'copied' | 'blocked'>('idle')
  const text = planText(outing)

  async function copyPlan() {
    try {
      await navigator.clipboard.writeText(text)
      setCopy('copied')
    } catch {
      setCopy('blocked')
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border border-primary bg-card p-5" data-testid="confirmed-plan" aria-labelledby="confirmed-heading">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 size={18} aria-hidden /> Plan confirmed</p>
      <h2 id="confirmed-heading" className="text-2xl font-bold" data-testid="confirmed-title">{outing.title}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Place</dt>
        <dd data-testid="confirmed-place">{place?.name ?? 'Unconfirmed'}</dd>
        <dt className="text-muted-foreground">Address</dt>
        <dd data-testid="confirmed-address">{place?.address ?? 'Unconfirmed'}</dd>
        <dt className="text-muted-foreground">Link</dt>
        <dd data-testid="confirmed-link">
          {place?.link || place?.sourceUrl ? (
            <a className="underline" href={(place.link ?? place.sourceUrl)!} target="_blank" rel="noopener noreferrer">{place.link ?? place.sourceUrl}</a>
          ) : 'Unconfirmed'}
        </dd>
        <dt className="text-muted-foreground">When</dt>
        <dd data-testid="confirmed-when">{formatInZone(outing.startAt, outing.timezone)} · {outing.timezone}</dd>
      </dl>
      <p className="rounded-md bg-muted p-2 text-sm font-medium" data-testid="nothing-booked">{NOTHING_BOOKED}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={copyPlan}><Clipboard size={16} aria-hidden /> Copy plan</Button>
        {isHost && (
          <Button variant="outline" loading={pending === 'reopen'} onClick={() => run('reopen', { id: outingId, input: {} })}>
            {pending === 'reopen' ? 'Reopening…' : 'Reopen planning'}
          </Button>
        )}
      </div>
      {copy === 'copied' && <p role="status" className="text-sm text-muted-foreground">Plan copied.</p>}
      {copy === 'blocked' && (
        <textarea readOnly aria-label="Plan text" className="min-h-40 w-full rounded-md border p-2 text-sm" value={text} data-testid="plan-text" />
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
