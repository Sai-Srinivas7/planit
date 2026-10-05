/**
 * Copy-plan text (FIN-06): the same facts as the confirmed view. Anything the
 * app doesn't know is written as "unconfirmed"; nothing implies a booking.
 */

import { formatInZone } from './time'
import type { Outing } from './types'

export const NOTHING_BOOKED = 'Nothing is booked. Check with the venue before you go.'

export function planText(outing: Outing): string {
  const place = outing.options.find((o) => o.id === outing.selectedOptionId) ?? null
  return [
    outing.title,
    `When: ${formatInZone(outing.startAt, outing.timezone)} (${outing.timezone})`,
    `Where: ${place ? place.name : 'not chosen yet'}`,
    `Address: ${place?.address ?? 'unconfirmed'}`,
    `Link: ${place?.link ?? place?.sourceUrl ?? 'unconfirmed'}`,
    'Price and opening hours: unconfirmed',
    ...(place?.note ? [`Note: ${place.note}`] : []),
    NOTHING_BOOKED,
  ].join('\n')
}
