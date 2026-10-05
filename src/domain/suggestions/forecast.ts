/** The forecast entry within 90 minutes of the start, or 'unavailable' (SUG-07, D-13). Never current weather. */

import type { Weather } from '../types'
import type { ForecastEntry } from './adapters'

export const FORECAST_WINDOW_MS = 90 * 60 * 1000

export function pickWeather(entries: ForecastEntry[], startAt: string): Weather | 'unavailable' {
  const start = Date.parse(startAt)
  let best: ForecastEntry | null = null
  for (const e of entries) {
    const distance = Math.abs(e.dt * 1000 - start)
    if (distance <= FORECAST_WINDOW_MS && (!best || distance < Math.abs(best.dt * 1000 - start))) best = e
  }
  if (!best || typeof best.temp !== 'number' || typeof best.description !== 'string') return 'unavailable'
  return { forecastAt: new Date(best.dt * 1000).toISOString(), tempC: Math.round(best.temp * 10) / 10, description: best.description.slice(0, 80) }
}
