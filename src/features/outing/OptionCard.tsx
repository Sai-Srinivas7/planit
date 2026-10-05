/**
 * One shortlist entry: facts (unknown ones read "Unconfirmed", OPT-03),
 * responses with voter names (VOTE-05), and only the controls the caller may
 * use (OPT-09). Clicking your current response clears it (VOTE-07).
 */

import { Check, ExternalLink, HelpCircle, Pencil, Sparkles, Trash2, X } from 'lucide-react'
import { Badge, Button, cn } from '@/components/ui'
import { isLocked } from '../../domain/commands'
import type { OptionTally } from '../../domain/tally'
import type { Outing, ResponseValue } from '../../domain/types'
import { useCommand } from '../../lib/outing-api'

const RESPONSES: { value: ResponseValue; label: string; icon: typeof Check }[] = [
  { value: 'yes', label: 'Yes', icon: Check },
  { value: 'maybe', label: 'Maybe', icon: HelpCircle },
  { value: 'no', label: "Can't do", icon: X },
]

type Props = {
  outingId: string
  outing: Outing
  entry: OptionTally
  me: string
  nameOf: (id: string) => string
  onEdit: () => void
}

export function OptionCard({ outingId, outing, entry, me, nameOf, onEdit }: Props) {
  const { option, counts, voters } = entry
  const { run, pending, error } = useCommand()
  const open = outing.state === 'open'
  const isHost = outing.hostId === me
  const mine = outing.responses.find((r) => r.userId === me && r.optionId === option.id)?.value ?? null
  const locked = isLocked(outing, option)
  const canEdit = open && option.createdBy === me && !locked
  const canDelete = open && (isHost || (option.createdBy === me && !locked))
  const isSelected = outing.selectedOptionId === option.id

  const respond = (value: ResponseValue) =>
    run('setResponse', { id: outingId, input: { optionId: option.id, value: mine === value ? null : value } }, `respond-${value}`)

  return (
    <article
      data-testid="option-card"
      data-option-id={option.id}
      className={cn('grid gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]', isSelected && 'border-primary ring-1 ring-primary')}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h3 className="text-lg font-semibold" data-testid="option-name">{option.name}</h3>
          <p className="text-xs text-muted-foreground" data-testid="option-origin">
            {option.origin === 'suggested' ? (
              <span className="inline-flex items-center gap-1"><Sparkles size={12} aria-hidden /> Suggested place</span>
            ) : (
              <>Proposed by {nameOf(option.createdBy)}</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isSelected && open && <Badge variant="outline" data-testid="previous-pick">Previous pick</Badge>}
          {isSelected && !open && <Badge data-testid="selected-pick">Confirmed</Badge>}
          {open && isHost && (
            <Button
              size="sm"
              variant={isSelected ? 'default' : 'outline'}
              loading={pending === 'finalize'}
              onClick={() => run('finalize', { id: outingId, input: { optionId: option.id } })}
            >
              {pending === 'finalize' ? 'Confirming…' : 'Confirm this plan'}
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${option.name}`}><Pencil size={14} aria-hidden /> Edit</Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove ${option.name}`}
              loading={pending === 'deleteOption'}
              onClick={() => run('deleteOption', { id: outingId, input: { optionId: option.id } })}
            >
              <Trash2 size={14} aria-hidden /> Remove
            </Button>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm" data-testid="option-facts">
        <dt className="text-muted-foreground">Address</dt>
        <dd data-testid="fact-address">{option.address ?? 'Unconfirmed'}</dd>
        <dt className="text-muted-foreground">Price</dt>
        <dd data-testid="fact-price">Unconfirmed</dd>
        <dt className="text-muted-foreground">Hours</dt>
        <dd data-testid="fact-hours">Unconfirmed</dd>
        {(option.link || option.sourceUrl) && (
          <>
            <dt className="text-muted-foreground">{option.origin === 'suggested' ? 'Source' : 'Link'}</dt>
            <dd>
              <a className="inline-flex items-center gap-1 underline" href={(option.link ?? option.sourceUrl)!} target="_blank" rel="noopener noreferrer">
                {option.origin === 'suggested' ? 'View on Google Maps' : 'Open link'} <ExternalLink size={12} aria-hidden />
              </a>
            </dd>
          </>
        )}
      </dl>
      {option.note && <p className="text-sm">{option.note}</p>}
      {option.explanation && (
        <p className="rounded-md bg-muted p-2 text-sm" data-testid="option-explanation">
          <span className="font-medium">Why it might fit (AI): </span>{option.explanation}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label={`Responses for ${option.name}`}>
        {RESPONSES.map(({ value, label, icon: Icon }) => {
          const picked = mine === value
          const names = voters[value].map(nameOf)
          return (
            <div key={value} className="grid gap-1">
              <button
                type="button"
                data-testid={`respond-${value}`}
                aria-pressed={picked}
                disabled={!open || !!pending}
                onClick={() => respond(value)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  picked ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                  value === 'no' && counts.no > 0 && !picked && 'border-destructive text-destructive',
                )}
              >
                <span className="inline-flex items-center gap-1.5"><Icon size={14} aria-hidden /> {pending === `respond-${value}` ? 'Saving…' : label}</span>
                <span data-testid={`count-${value}`} className={cn('tabular-nums', value === 'no' && counts.no > 0 && 'text-base font-bold')}>
                  {counts[value]}
                </span>
              </button>
              <p className="min-h-4 text-xs text-muted-foreground" data-testid={`voters-${value}`}>{names.join(', ')}</p>
            </div>
          )
        })}
      </div>
      {open && option.createdBy === me && locked && (
        <p className="text-xs text-muted-foreground">Others have responded, so this place can no longer be edited.</p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </article>
  )
}
