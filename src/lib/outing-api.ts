/**
 * Client side of the command route (spec §5). The UI never writes outing
 * records itself and never updates them optimistically: it sends a command,
 * shows a pending state, and renders whatever the realtime socket delivers.
 * A refused command therefore never appears saved (UX-01).
 */

import { useCallback, useState } from 'react'
import { getAuthToken } from 'deepspace'

export type CommandOutcome<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string }

export type CommandBody = { id?: string; input?: Record<string, unknown> }

export async function callCommand<T = Record<string, unknown>>(command: string, body: CommandBody): Promise<CommandOutcome<T>> {
  const token = await getAuthToken()
  if (!token) return { ok: false, code: 'UNAUTHENTICATED', message: 'Sign in to plan with your friends.' }
  try {
    const res = await fetch(`/api/outing/${command}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: body.id, input: body.input ?? {} }),
    })
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: unknown; error?: unknown; message?: string } | null
    if (json?.success === true) return { ok: true, data: json.data as T }
    if (json && typeof json.error === 'string') return { ok: false, code: json.error, message: json.message ?? 'That did not work.' }
    return { ok: false, code: 'SERVER', message: 'Something went wrong. Nothing was changed. Try again.' }
  } catch {
    return { ok: false, code: 'NETWORK', message: 'Could not reach PlanIt. Check your connection and try again.' }
  }
}

/**
 * One command at a time per component: `pending` names the command in flight
 * (for button labels and disabling), `error` holds the last refusal message.
 */
export function useCommand() {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async <T = Record<string, unknown>>(command: string, body: CommandBody, key = command) => {
    setPending(key)
    setError(null)
    const outcome = await callCommand<T>(command, body)
    setPending(null)
    if (!outcome.ok) setError(outcome.message)
    return outcome
  }, [])

  return { run, pending, error, clearError: () => setError(null) }
}
