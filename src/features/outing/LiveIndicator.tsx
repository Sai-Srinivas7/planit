/** UX-03: "Live" only while signed in and the realtime connection is up. */

import { useAuth, useRecordContext } from 'deepspace'

export function LiveIndicator() {
  const { isSignedIn } = useAuth()
  const { status } = useRecordContext()
  if (!isSignedIn) return null
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground" data-testid="live-indicator">
        <span className="h-2 w-2 rounded-full bg-green-600" aria-hidden /> Live
      </span>
    )
  }
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="connection-status">
      <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden /> {status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </span>
  )
}
