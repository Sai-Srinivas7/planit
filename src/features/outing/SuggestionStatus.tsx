/**
 * Suggestions (SUG-14, SUG-11): the button is for the host of an open outing
 * only and is disabled while a run is active; every member sees run status.
 */

import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui'
import { isRunActive, SUGGESTION_LIMITS } from '../../domain/commands'
import { formatInZone } from '../../domain/time'
import type { Outing } from '../../domain/types'
import { useCommand } from '../../lib/outing-api'

export function SuggestionStatus({ outingId, outing, isHost }: { outingId: string; outing: Outing; isHost: boolean }) {
  const { run, pending, error } = useCommand()
  const s = outing.suggestions
  const active = isRunActive(outing, new Date())
  const runsLeft = Math.max(0, SUGGESTION_LIMITS.perOuting - s.runs)
  const showButton = isHost && outing.state === 'open'

  if (!showButton && s.status === 'idle') return null
  return (
    <section className="grid gap-2 rounded-lg border border-dashed bg-card p-4" data-testid="suggestions">
      {showButton && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Sparkles size={18} className="mt-0.5 text-primary" aria-hidden />
            <div>
              <p className="font-medium">Need ideas?</p>
              <p className="text-sm text-muted-foreground">
                Up to 3 places near {s.resolvedLocation ?? outing.location}, picked with the group&apos;s preferences. {runsLeft} of 3 runs left.
              </p>
            </div>
          </div>
          <Button onClick={() => run('requestSuggestions', { id: outingId, input: {} })} disabled={active || !!pending || runsLeft === 0} data-testid="suggest-button">
            {active || pending ? 'Finding places…' : 'Find suggestions'}
          </Button>
        </div>
      )}
      <p role="status" className="text-sm text-muted-foreground" data-testid="suggestion-status" data-status={active ? 'running' : s.status}>
        {active ? 'Finding places…' : s.status === 'running' ? 'The last run did not finish. You can try again.' : (s.message ?? '')}
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}

/** Header weather (D-13): from the last completed run, with its forecast time. */
export function WeatherLine({ outing }: { outing: Outing }) {
  const w = outing.suggestions.weather
  if (w === null) return null
  return (
    <span className="text-sm text-muted-foreground" data-testid="outing-weather">
      {w === 'unavailable'
        ? 'Forecast unavailable'
        : `Forecast for ${formatInZone(w.forecastAt, outing.timezone)}: ${Math.round(w.tempC)}°C, ${w.description}`}
    </span>
  )
}
