/**
 * The conversation (COM-04): author names from the directory, delete for the
 * author or the host, hard delete (COM-05). Stays open while finalized.
 */

import { useState, type FormEvent } from 'react'
import { MessageCircle, Trash2 } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import type { Outing } from '../../domain/types'
import { useCommand } from '../../lib/outing-api'

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export function Conversation({ outingId, outing, me, nameOf }: { outingId: string; outing: Outing; me: string; nameOf: (id: string) => string }) {
  const post = useCommand()
  const remove = useCommand()
  const [body, setBody] = useState('')
  const isHost = outing.hostId === me

  async function submit(e: FormEvent) {
    e.preventDefault()
    const outcome = await post.run('postComment', { id: outingId, input: { body } })
    if (outcome.ok) setBody('')
  }

  return (
    <section className="grid gap-3 rounded-lg border bg-card p-4" aria-labelledby="conversation-heading" data-testid="conversation">
      <h2 id="conversation-heading" className="flex items-center gap-2 text-lg font-semibold">
        <MessageCircle size={18} aria-hidden /> Conversation
      </h2>
      <ol className="grid max-h-96 gap-3 overflow-y-auto" aria-live="polite">
        {outing.comments.length === 0 && <li className="text-sm text-muted-foreground">No messages yet. Say what you think.</li>}
        {outing.comments.map((c) => (
          <li key={c.id} className="grid gap-0.5" data-testid="comment" data-comment-id={c.id}>
            <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground" data-testid="comment-author">{nameOf(c.authorId)}</span> · {timeLabel(c.createdAt)}
              </span>
              {(c.authorId === me || isHost) && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete message"
                  loading={remove.pending === c.id}
                  onClick={() => remove.run('deleteComment', { id: outingId, input: { commentId: c.id } }, c.id)}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              )}
            </span>
            <p className="whitespace-pre-wrap break-words text-sm" data-testid="comment-body">{c.body}</p>
          </li>
        ))}
      </ol>
      {remove.error && <p role="alert" className="text-sm text-destructive">{remove.error}</p>}
      <form onSubmit={submit} className="grid gap-2">
        <label className="sr-only" htmlFor="comment-input">Message</label>
        <Textarea id="comment-input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="Write a message…" required />
        {post.error && <p role="alert" className="text-sm text-destructive">{post.error}</p>}
        <div><Button type="submit" loading={!!post.pending}>{post.pending ? 'Sending…' : 'Send'}</Button></div>
      </form>
    </section>
  )
}
