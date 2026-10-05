/**
 * Public command route (spec §5): POST /api/outing/:command.
 *
 * Check order: authentication (401) → command allowlist (404) → body size and
 * shape → room. Authentication comes first for every command name, so an
 * unauthenticated caller learns nothing about which commands exist.
 */

import type { Hono } from 'hono'
import type { AppContext, Env } from '../../worker.js'
import { isPublicCommand } from '../domain/commands.js'
import { resolveAuth } from './http-routes.js'

const MAX_BODY_BYTES = 12 * 1024

export function registerOutingRoutes(app: Hono<AppContext>): void {
  app.post('/api/outing/:command', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) {
      return c.json({ success: false, error: 'UNAUTHENTICATED', message: 'Sign in to plan with your friends.' }, 401)
    }
    const command = c.req.param('command')
    if (!isPublicCommand(command)) {
      return c.json({ success: false, error: 'NOT_FOUND', message: 'Unknown command.' }, 404)
    }
    const raw = await c.req.text()
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return c.json({ success: false, error: 'INVALID_INPUT', message: 'Request too large.' }, 400)
    }
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return c.json({ success: false, error: 'INVALID_INPUT', message: 'Invalid request.' }, 400)
    }
    if (!isObject(body) || (body.input !== undefined && !isObject(body.input))) {
      return c.json({ success: false, error: 'INVALID_INPUT', message: 'Invalid request.' }, 400)
    }
    return roomCall(c.env, auth.userId, { command, id: body.id, input: body.input ?? {} })
  })
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A fresh request: no client header (X-User-Id included) ever reaches the room. */
function roomCall(env: Env, userId: string, body: unknown): Promise<Response> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
  return stub.fetch(
    new Request('https://internal/internal/outing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify(body),
    }),
  )
}
