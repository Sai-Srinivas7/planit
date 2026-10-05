/**
 * One outing: header, invite, and (in later blocks) shortlist, group and
 * conversation. Everything renders from the server record; controls only
 * send commands.
 */

import { useState } from 'react'
import { useAuth } from 'deepspace'
import { ArrowLeft, CalendarDays, Link2, MapPin, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmModal, Input, Modal } from '@/components/ui'
import { formatInZone } from '../../domain/time'
import { useCommand } from '../../lib/outing-api'
import { useOuting } from './useOuting'

export function OutingPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { userId } = useAuth()
  const { entry, status } = useOuting(id)
  const del = useCommand()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!entry) {
    return (
      <section className="mx-auto grid max-w-lg gap-3 px-4 py-16 text-center" role="status">
        <h1 className="text-2xl font-semibold">{status === 'ready' ? 'Outing not available' : 'Loading your outing…'}</h1>
        {status === 'ready' && (
          <p className="text-muted-foreground">It may have been deleted, or you haven&apos;t joined it. Ask the host for the invite link.</p>
        )}
        <div><Button variant="outline" onClick={onBack}>Back to your outings</Button></div>
      </section>
    )
  }

  const { outing } = entry
  const isHost = outing.hostId === userId
  const inviteLink = `${location.origin}/home?invite=${outing.inviteToken}`

  async function deleteOuting() {
    const outcome = await del.run('deleteOuting', { id, input: {} })
    if (outcome.ok) onBack()
  }

  return (
    <article className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6" data-testid="outing-page">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16} aria-hidden /> Your outings</Button>
      </div>
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={outing.state === 'finalized' ? 'default' : 'secondary'} data-testid="outing-state">
            {outing.state === 'finalized' ? 'Confirmed' : 'Planning'}
          </Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="outing-title">{outing.title}</h1>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><MapPin size={14} aria-hidden /> {outing.location}</span>
          <span className="flex items-center gap-1.5" data-testid="outing-when">
            <CalendarDays size={14} aria-hidden /> {formatInZone(outing.startAt, outing.timezone)} · {outing.timezone}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setInviteOpen(true)}><Link2 size={16} aria-hidden /> Copy invite</Button>
          {isHost && (
            <Button variant="outline" onClick={() => setConfirmDelete(true)} loading={del.pending === 'deleteOuting'}>
              <Trash2 size={16} aria-hidden /> Delete outing
            </Button>
          )}
        </div>
        {del.error && <p role="alert" className="text-sm text-destructive">{del.error}</p>}
      </header>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} link={inviteLink} />
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); void deleteOuting() }}
        title="Delete this outing?"
        description="This removes the plan, responses, and conversation for everyone. The invite link stops working."
        confirmText="Delete outing"
        variant="destructive"
      />
    </article>
  )
}

function InviteDialog({ open, onClose, link }: { open: boolean; onClose: () => void; link: string }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'blocked'>('idle')
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied('copied')
    } catch {
      setCopied('blocked')
    }
  }
  return (
    <Modal open={open} onClose={() => { setCopied('idle'); onClose() }}>
      <Modal.Header>
        <Modal.Title>Invite your friends</Modal.Title>
        <Modal.Description>Anyone with this link can join after signing in. It works until the outing is deleted.</Modal.Description>
      </Modal.Header>
      <Modal.Body className="grid gap-2">
        <Input readOnly value={link} aria-label="Invite link" data-testid="invite-link" onFocus={(e) => e.currentTarget.select()} />
        {copied === 'copied' && <p role="status" className="text-sm text-muted-foreground">Copied to clipboard.</p>}
        {copied === 'blocked' && <p role="status" className="text-sm text-muted-foreground">Clipboard is blocked. Select the link and copy it.</p>}
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={copy}>Copy link</Button>
      </Modal.Footer>
    </Modal>
  )
}
