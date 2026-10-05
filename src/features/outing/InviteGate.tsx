/**
 * Invite page (INV-04). Before joining, nobody — signed in or not — can read
 * the outing, so this page shows the same thing for every token: valid,
 * unknown, or deleted. Only the join attempt reveals whether it worked.
 */

import { useState } from 'react'
import { AuthOverlay } from 'deepspace'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { useCommand } from '../../lib/outing-api'

export function InviteGate({ token, signedIn, onJoined }: { token: string; signedIn: boolean; onJoined: (id: string) => void }) {
  const { run, pending, error } = useCommand()
  const [signingIn, setSigningIn] = useState(false)

  async function join() {
    const outcome = await run<{ id: string }>('joinOuting', { input: { token } })
    if (outcome.ok) onJoined(outcome.data.id)
  }

  return (
    <section className="mx-auto grid w-full max-w-lg gap-4 px-4 py-16 text-center" data-testid="invite-gate">
      <Link2 className="mx-auto text-primary" size={32} aria-hidden />
      <h1 className="text-3xl font-bold tracking-tight">You&apos;re invited to an outing</h1>
      <p className="text-muted-foreground">
        {signedIn
          ? 'Join to see the plan, add places, and respond with the group.'
          : 'Sign in to see the plan and join the group.'}
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div>
        {signedIn ? (
          <Button onClick={join} loading={!!pending}>{pending ? 'Joining…' : 'Join outing'}</Button>
        ) : (
          <Button onClick={() => setSigningIn(true)}>Sign in to join</Button>
        )}
      </div>
      {signingIn && <AuthOverlay onClose={() => setSigningIn(false)} />}
    </section>
  )
}
