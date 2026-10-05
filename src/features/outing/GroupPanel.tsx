/**
 * The group (PREF-04): every member by directory name, the host marked, and
 * each person's stated preferences. Budget is a preference, never a price.
 */

import { useState, type FormEvent } from 'react'
import { Crown, Users } from 'lucide-react'
import { Badge, Button, Modal } from '@/components/ui'
import { BUDGETS, INTERESTS, SETTINGS, type Budget, type Interest, type Outing, type Preference, type Setting } from '../../domain/types'
import { useCommand } from '../../lib/outing-api'
import { Field, selectClass } from './CreateOutingDialog'

export const BUDGET_LABEL: Record<Budget, string> = { flexible: 'Flexible', under_20: 'Under $20', '20_50': '$20–50', '50_plus': '$50+' }
export const SETTING_LABEL: Record<Setting, string> = { indoor: 'Indoor', outdoor: 'Outdoor', either: 'Either' }
export const INTEREST_LABEL = (i: Interest) => i[0].toUpperCase() + i.slice(1)

export function describePreference(p: Preference | undefined) {
  if (!p) return 'No preferences yet'
  const interests = p.interests.length ? p.interests.map(INTEREST_LABEL).join(', ') : 'any interests'
  return `${BUDGET_LABEL[p.budget]} per person · ${SETTING_LABEL[p.setting]} · ${interests}`
}

export function GroupPanel({ outingId, outing, me, nameOf }: { outingId: string; outing: Outing; me: string; nameOf: (id: string) => string }) {
  const [editing, setEditing] = useState(false)
  const mine = outing.people.find((p) => p.userId === me)?.preferences

  return (
    <section className="grid gap-3 rounded-lg border bg-card p-4" aria-labelledby="group-heading" data-testid="group-panel">
      <h2 id="group-heading" className="flex items-center gap-2 text-lg font-semibold">
        <Users size={18} aria-hidden /> Group <span className="text-muted-foreground">{outing.members.length}</span>
      </h2>
      <ul className="grid gap-2">
        {outing.people.map((p) => (
          <li key={p.userId} className="grid gap-0.5" data-testid="group-person" data-user-id={p.userId}>
            <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              <span data-testid="person-name">{nameOf(p.userId)}</span>
              {p.userId === me && <span className="text-muted-foreground">(you)</span>}
              {p.userId === outing.hostId && (
                <Badge variant="secondary" data-testid="host-badge"><Crown size={12} aria-hidden /> Host</Badge>
              )}
            </span>
            <span className="text-xs text-muted-foreground" data-testid="person-preferences">{describePreference(p.preferences)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground" data-testid="budget-note">
        Budget is a stated preference, not a verified venue price.
      </p>
      {outing.state === 'open' && (
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          {mine ? 'Edit my preferences' : 'Add my preferences'}
        </Button>
      )}
      {editing && <PreferencesDialog outingId={outingId} current={mine} onClose={() => setEditing(false)} />}
    </section>
  )
}

function PreferencesDialog({ outingId, current, onClose }: { outingId: string; current: Preference | undefined; onClose: () => void }) {
  const { run, pending, error } = useCommand()

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const outcome = await run('setPreference', {
      id: outingId,
      input: { budget: form.get('budget'), setting: form.get('setting'), interests: form.getAll('interests') },
    })
    if (outcome.ok) onClose()
  }

  return (
    <Modal open onClose={onClose}>
      <Modal.Header>
        <Modal.Title>Your preferences</Modal.Title>
        <Modal.Description>Shared with the group and used for suggestions. Budget is per person.</Modal.Description>
      </Modal.Header>
      <form onSubmit={submit} className="contents" data-testid="preferences-form">
        <Modal.Body className="grid gap-4">
          <Field label="Budget per person">
            <select name="budget" className={selectClass} defaultValue={current?.budget ?? 'flexible'}>
              {BUDGETS.map((b) => <option key={b} value={b}>{BUDGET_LABEL[b]}</option>)}
            </select>
          </Field>
          <Field label="Setting">
            <select name="setting" className={selectClass} defaultValue={current?.setting ?? 'either'}>
              {SETTINGS.map((s) => <option key={s} value={s}>{SETTING_LABEL[s]}</option>)}
            </select>
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Interests</legend>
            <div className="grid grid-cols-2 gap-2">
              {INTERESTS.map((i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="interests" value={i} defaultChecked={current?.interests.includes(i)} className="h-4 w-4" />
                  {INTEREST_LABEL(i)}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onClose} disabled={!!pending}>Cancel</Button>
          <Button type="submit" loading={!!pending}>{pending ? 'Saving…' : 'Save preferences'}</Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
