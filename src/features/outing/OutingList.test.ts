import { expect, test } from 'vitest'
import { outingWord } from './OutingList'

test('OUT-06: the outing count label is pluralized correctly', () => {
  expect(`1 ${outingWord(1)}`).toBe('1 outing')
  expect(`0 ${outingWord(0)}`).toBe('0 outings')
  expect(`2 ${outingWord(2)}`).toBe('2 outings')
})
