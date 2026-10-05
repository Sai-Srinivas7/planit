/**
 * Local date + time + IANA timezone ↔ instant (spec §4.3 `startAt`, OUT-03/04/05).
 * Pure Intl; no date library.
 */

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 80) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Wall-clock parts of `instant` in `tz`, as a UTC millisecond value ("local as if UTC"). */
function wallClockMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
}

/**
 * The instant at which the clock in `tz` reads `date` `time`, as an ISO string.
 * Returns null when that wall-clock time does not exist there (DST gap).
 * In a DST overlap (the hour repeats) the earlier instant wins.
 */
export function toStartAt(date: string, time: string, tz: string): string | null {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const target = Date.UTC(y, mo - 1, d, h, mi)
  // Try the zone offsets a day either side; a real wall time matches one of them.
  const candidates = [target - 864e5, target + 864e5]
    .map((probe) => target - (wallClockMs(probe, tz) - probe))
    .filter((c) => wallClockMs(c, tz) === target)
    .sort((a, b) => a - b)
  return candidates.length ? new Date(candidates[0]).toISOString() : null
}

/** The outing's start, shown in the outing's own timezone whatever the viewer's zone is. */
export function formatInZone(startAt: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(startAt))
}
