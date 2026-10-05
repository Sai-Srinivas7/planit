import { describe, expect, test } from 'vitest'
import { formatInZone, isValidTimeZone, toStartAt } from './time'

describe('time', () => {
  test('OUT-03: local date + time + IANA zone converts to one instant shown as the same local time in the outing zone', () => {
    expect(toStartAt('2030-01-05', '18:00', 'America/Chicago')).toBe('2030-01-06T00:00:00.000Z')
    expect(toStartAt('2030-07-05', '18:00', 'America/Chicago')).toBe('2030-07-05T23:00:00.000Z') // CDT
    expect(toStartAt('2030-07-05', '18:00', 'Asia/Kolkata')).toBe('2030-07-05T12:30:00.000Z')
    expect(toStartAt('2030-07-05', '00:15', 'Pacific/Auckland')).toBe('2030-07-04T12:15:00.000Z')

    const startAt = toStartAt('2030-01-05', '18:00', 'America/Chicago')!
    // Display uses the outing's zone explicitly, so it cannot depend on the viewer's (process) zone.
    expect(formatInZone(startAt, 'America/Chicago')).toBe('Sat, Jan 5, 2030, 6:00 PM CST')
    const originalTz = process.env.TZ
    for (const viewerTz of ['Asia/Tokyo', 'Europe/London', 'America/Los_Angeles']) {
      process.env.TZ = viewerTz
      expect(formatInZone(startAt, 'America/Chicago')).toBe('Sat, Jan 5, 2030, 6:00 PM CST')
    }
    process.env.TZ = originalTz
  })

  test('OUT-04: a local time inside a DST gap does not exist and converts to null', () => {
    expect(toStartAt('2026-03-08', '02:30', 'America/Chicago')).toBeNull()
    expect(toStartAt('2026-03-29', '02:30', 'Europe/Berlin')).toBeNull()
    // Just outside the gap is fine.
    expect(toStartAt('2026-03-08', '03:00', 'America/Chicago')).toBe('2026-03-08T08:00:00.000Z')
    // Overlap (fall back): the repeated hour resolves to the earlier instant.
    expect(toStartAt('2026-11-01', '01:30', 'America/Chicago')).toBe('2026-11-01T06:30:00.000Z')
  })

  test('timezone validation accepts IANA zones only', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })
})
