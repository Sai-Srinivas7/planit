import { useState, type FormEvent } from 'react'
import { Button, Input, Modal } from '@/components/ui'
import { useCommand } from '../../lib/outing-api'

const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone')
  } catch {
    return []
  }
})()
const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  )
}

export const selectClass =
  'h-10 w-full rounded-md border border-input bg-transparent px-3 text-base md:text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/** No name field: names come from the account directory (OUT-08, D-12). */
export function CreateOutingDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { run, pending, error, clearError } = useCommand()
  const [timezone, setTimezone] = useState(LOCAL_ZONE)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = Object.fromEntries(new FormData(e.currentTarget).entries())
    const outcome = await run<{ id: string }>('createOuting', { input })
    if (outcome.ok) onCreated(outcome.data.id)
  }

  return (
    <Modal open={open} onClose={() => { clearError(); onClose() }}>
      <Modal.Header>
        <Modal.Title>Plan an outing</Modal.Title>
        <Modal.Description>Pick the when and where. Work out the rest together.</Modal.Description>
      </Modal.Header>
      <form onSubmit={submit} className="contents" data-testid="create-outing-form">
        <Modal.Body className="grid gap-4">
          <Field label="Title">
            <Input name="title" required maxLength={80} autoFocus placeholder="Friday dinner" />
          </Field>
          <Field label="Where (city or area)">
            <Input name="location" required maxLength={120} placeholder="Dallas, TX" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input name="date" type="date" required />
            </Field>
            <Field label="Time">
              <Input name="time" type="time" required />
            </Field>
          </div>
          <Field label="Timezone">
            <select name="timezone" className={selectClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {(ZONES.includes(LOCAL_ZONE) ? ZONES : [LOCAL_ZONE, ...ZONES]).map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onClose} disabled={!!pending}>Cancel</Button>
          <Button type="submit" loading={!!pending}>{pending ? 'Creating…' : 'Create outing'}</Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
