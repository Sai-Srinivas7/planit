import type { FormEvent } from 'react'
import { Button, Input, Modal, Textarea } from '@/components/ui'
import type { Option } from '../../domain/types'
import { useCommand } from '../../lib/outing-api'
import { Field } from './CreateOutingDialog'

/** Add a place, or edit one the caller created (OPT-01, OPT-05). */
export function OptionDialog({ outingId, option, onClose }: { outingId: string; option: Option | null; onClose: () => void }) {
  const { run, pending, error } = useCommand()

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input: Record<string, unknown> = Object.fromEntries(new FormData(e.currentTarget).entries())
    const outcome = option
      ? await run('editOption', { id: outingId, input: { ...input, optionId: option.id } })
      : await run('addOption', { id: outingId, input })
    if (outcome.ok) onClose()
  }

  return (
    <Modal open onClose={onClose}>
      <Modal.Header>
        <Modal.Title>{option ? 'Edit place' : 'Add a place'}</Modal.Title>
        <Modal.Description>Only the name is required. Leave anything you are not sure about empty.</Modal.Description>
      </Modal.Header>
      <form onSubmit={submit} className="contents" data-testid="option-form">
        <Modal.Body className="grid gap-4">
          <Field label="Place name">
            <Input name="name" required maxLength={120} defaultValue={option?.name} autoFocus />
          </Field>
          <Field label="Address">
            <Input name="address" maxLength={200} defaultValue={option?.address ?? ''} />
          </Field>
          <Field label="Link">
            <Input name="link" type="url" maxLength={2000} placeholder="https://" defaultValue={option?.link ?? ''} />
          </Field>
          <Field label="Note">
            <Textarea name="note" maxLength={280} defaultValue={option?.note ?? ''} />
          </Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onClose} disabled={!!pending}>Cancel</Button>
          <Button type="submit" loading={!!pending}>{pending ? 'Saving…' : option ? 'Save' : 'Add place'}</Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
