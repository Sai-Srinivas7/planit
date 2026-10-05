/** Per-option counts and voter lists, sorted Yes desc, Maybe desc, older first (VOTE-04, D-06). */

import type { Option, Outing, ResponseValue } from './types'

export type OptionTally = {
  option: Option
  counts: Record<ResponseValue, number>
  voters: Record<ResponseValue, string[]>
}

export function tally(outing: Outing): OptionTally[] {
  return outing.options
    .map((option) => {
      const voters: Record<ResponseValue, string[]> = { yes: [], maybe: [], no: [] }
      for (const r of outing.responses) if (r.optionId === option.id) voters[r.value].push(r.userId)
      const counts = { yes: voters.yes.length, maybe: voters.maybe.length, no: voters.no.length }
      return { option, counts, voters }
    })
    .sort(
      (a, b) =>
        b.counts.yes - a.counts.yes ||
        b.counts.maybe - a.counts.maybe ||
        a.option.createdAt.localeCompare(b.option.createdAt),
    )
}
