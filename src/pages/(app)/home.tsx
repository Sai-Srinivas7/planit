/**
 * PlanIt home. Routes by query string: ?invite=<token> → invite gate,
 * ?outing=<id> → outing page, otherwise the caller's outings.
 */

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AuthOverlay, useAuth } from 'deepspace'
import { Button } from '@/components/ui'
import { InviteGate } from '../../features/outing/InviteGate'
import { LiveIndicator } from '../../features/outing/LiveIndicator'
import { OutingList } from '../../features/outing/OutingList'
import { OutingPage } from '../../features/outing/OutingPage'

export default function HomePage() {
  const { isLoaded, isSignedIn } = useAuth()
  const [params, setParams] = useSearchParams()
  const invite = params.get('invite')
  const outingId = params.get('outing')

  if (!isLoaded) return <p role="status" className="p-8 text-center text-muted-foreground">Loading…</p>
  if (invite) return <InviteGate token={invite} signedIn={isSignedIn} onJoined={(id) => setParams({ outing: id })} />
  if (!isSignedIn) return <SignedOutHome />
  return (
    <>
      <div className="mx-auto flex w-full max-w-5xl justify-end px-4 pt-3">
        <LiveIndicator />
      </div>
      {outingId ? <OutingPage id={outingId} onBack={() => setParams({})} /> : <OutingList onOpen={(id) => setParams({ outing: id })} />}
    </>
  )
}

function SignedOutHome() {
  const [signingIn, setSigningIn] = useState(false)
  return (
    <section className="mx-auto grid max-w-lg gap-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Turn &ldquo;we should&rdquo; into a plan</h1>
      <p className="text-muted-foreground">Create a private outing, invite friends, and agree on one place together.</p>
      <div><Button onClick={() => setSigningIn(true)}>Sign in to start planning</Button></div>
      {signingIn && <AuthOverlay onClose={() => setSigningIn(false)} />}
    </section>
  )
}
