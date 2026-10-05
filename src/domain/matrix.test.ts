/**
 * Spec §6 authorization matrix, cell by cell, on applyCommand.
 * Columns: Outsider · Member (open) · Member (finalized) · Host (open) · Host (finalized).
 * The Anonymous column is [api] (SEC-01); the read row is [collab] (BASE-03).
 */

import { describe, expect, test } from 'vitest'
import { applyCommand } from './commands'
import { HOST, ids, makeOption, makeOuting, MEMBER, MEMBER2, NOW, OUTSIDER } from './make-outing'
import type { Outing } from './types'

type Actor = 'outsider' | 'member' | 'host'
type Kind = 'own' | 'own-locked' | 'others' | 'none'
const OK = 'OK'
const COLUMNS: [Actor, Outing['state']][] = [
  ['outsider', 'open'],
  ['member', 'open'],
  ['member', 'finalized'],
  ['host', 'open'],
  ['host', 'finalized'],
]
const userOf = { outsider: OUTSIDER, member: MEMBER, host: HOST }

/** An outing in `state` with one option and one comment whose ownership depends on `kind`. */
function scenario(state: Outing['state'], actor: Actor, kind: Kind) {
  const me = userOf[actor]
  const owner = kind === 'own' || kind === 'own-locked' ? (actor === 'outsider' ? MEMBER2 : me) : MEMBER2
  const option = makeOption({ id: 'opt-x', createdBy: owner })
  const other = owner === MEMBER2 ? MEMBER : MEMBER2
  const outing = makeOuting({
    state,
    finalizedAt: state === 'finalized' ? NOW.toISOString() : null,
    selectedOptionId: state === 'finalized' ? 'opt-x' : null,
    options: [option, makeOption({ id: 'opt-y', createdBy: MEMBER2 })],
    responses: kind === 'own-locked' ? [{ userId: other, optionId: 'opt-x', value: 'yes' }] : [],
    comments: [{ id: 'c-x', authorId: owner, body: 'hi', createdAt: NOW.toISOString() }],
  })
  return { outing, me }
}

const inputs: Record<string, Record<string, unknown>> = {
  createOuting: { title: 'T', location: 'Dallas, TX', date: '2030-01-05', time: '18:00', timezone: 'America/Chicago' },
  joinOuting: { token: 'token-1' },
  deleteOuting: {},
  addOption: { name: 'New place' },
  editOption: { optionId: 'opt-x', name: 'Renamed' },
  deleteOption: { optionId: 'opt-x' },
  setResponse: { optionId: 'opt-y', value: 'yes' },
  setPreference: { budget: 'flexible', interests: ['food'], setting: 'either' },
  postComment: { body: 'hello' },
  deleteComment: { commentId: 'c-x' },
  finalize: { optionId: 'opt-y' },
  reopen: {},
}

// [row label, command, kind, expected per column]
const ROWS: [string, string, Kind, string[]][] = [
  ['createOuting', 'createOuting', 'none', [OK, OK, OK, OK, OK]],
  ['joinOuting (valid token)', 'joinOuting', 'none', [OK, OK, OK, OK, OK]],
  ['deleteOuting', 'deleteOuting', 'none', ['NOT_MEMBER', 'NOT_HOST', 'NOT_HOST', OK, OK]],
  ['addOption', 'addOption', 'none', ['NOT_MEMBER', OK, 'OUTING_FINALIZED', OK, 'OUTING_FINALIZED']],
  ['editOption (own, unlocked)', 'editOption', 'own', ['NOT_MEMBER', OK, 'OUTING_FINALIZED', OK, 'OUTING_FINALIZED']],
  ['editOption (own, locked)', 'editOption', 'own-locked', ['NOT_MEMBER', 'OPTION_LOCKED', 'OUTING_FINALIZED', 'OPTION_LOCKED', 'OUTING_FINALIZED']],
  ["editOption (other's)", 'editOption', 'others', ['NOT_MEMBER', 'NOT_CREATOR', 'NOT_CREATOR', 'NOT_CREATOR', 'NOT_CREATOR']],
  ['deleteOption (own, unlocked)', 'deleteOption', 'own', ['NOT_MEMBER', OK, 'OUTING_FINALIZED', OK, 'OUTING_FINALIZED']],
  ['deleteOption (own, locked)', 'deleteOption', 'own-locked', ['NOT_MEMBER', 'OPTION_LOCKED', 'OUTING_FINALIZED', OK, 'OUTING_FINALIZED']],
  ["deleteOption (other's)", 'deleteOption', 'others', ['NOT_MEMBER', 'NOT_CREATOR', 'NOT_CREATOR', OK, 'OUTING_FINALIZED']],
  ['setResponse (incl. clear)', 'setResponse', 'none', ['NOT_MEMBER', OK, 'OUTING_FINALIZED', OK, 'OUTING_FINALIZED']],
  ['setPreference (own)', 'setPreference', 'none', ['NOT_MEMBER', OK, 'OUTING_FINALIZED', OK, 'OUTING_FINALIZED']],
  ['postComment', 'postComment', 'none', ['NOT_MEMBER', OK, OK, OK, OK]],
  ['deleteComment (own)', 'deleteComment', 'own', ['NOT_MEMBER', OK, OK, OK, OK]],
  ["deleteComment (other's)", 'deleteComment', 'others', ['NOT_MEMBER', 'NOT_AUTHOR', 'NOT_AUTHOR', OK, OK]],
  ['finalize', 'finalize', 'none', ['NOT_MEMBER', 'NOT_HOST', 'NOT_HOST', OK, 'INVALID_STATE']],
  ['reopen', 'reopen', 'none', ['NOT_MEMBER', 'NOT_HOST', 'NOT_HOST', 'INVALID_STATE', OK]],
]

describe('§6 authorization matrix', () => {
  for (const [label, command, kind, expected] of ROWS) {
    COLUMNS.forEach(([actor, state], i) => {
      test(`§6 ${label}: ${actor} (${state}) → ${expected[i]}`, () => {
        const { outing, me } = scenario(state, actor, kind)
        const target = command === 'createOuting' ? null : outing
        const r = applyCommand(target, me, command, inputs[command], NOW, { newId: ids() })
        expect('code' in r ? r.code : OK).toBe(expected[i])
      })
    })
  }

  test('§6 setResponse clear (null) follows the same row', () => {
    for (const [i, [actor, state]] of COLUMNS.entries()) {
      const { outing, me } = scenario(state, actor, 'none')
      const r = applyCommand(outing, me, 'setResponse', { optionId: 'opt-y', value: null }, NOW)
      expect('code' in r ? r.code : OK).toBe(ROWS.find((row) => row[1] === 'setResponse')![3][i])
    }
  })
})
