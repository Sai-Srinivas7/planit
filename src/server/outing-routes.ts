/**
 * Public command route (spec §5): POST /api/outing/:command.
 *
 * Check order: authentication (401) → command allowlist (404) → body size and
 * shape → room. Authentication comes first for every command name, so an
 * unauthenticated caller learns nothing about which commands exist.
 */

import type { Hono } from 'hono'
import { buildCronContext } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import { isPublicCommand } from '../domain/commands.js'
import type { Adapters } from '../domain/suggestions/adapters.js'
import { makeFixtureAdapters } from '../domain/suggestions/fixture.js'
import { makeLiveAdapters } from '../domain/suggestions/live.js'
import { runPipeline, type PipelineResult } from '../domain/suggestions/pipeline.js'
import type { Outing } from '../domain/types.js'
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
    if (command === 'requestSuggestions') return requestSuggestions(c.env, auth.userId, body.id)
    return roomCall(c.env, auth.userId, { command, id: body.id, input: body.input ?? {} })
  })
}

/** Fixture providers unless configured otherwise; local dev/test default to fixtures so tests never pay. */
export const providerMode = (env: Env) => env.PROVIDERS ?? (env.ALLOW_DEBUG_ROUTES === 'true' ? 'fixture' : 'live')

export function adaptersFor(env: Env, location: string): Adapters {
  if (providerMode(env) === 'fixture') return makeFixtureAdapters(location)
  const ctx = buildCronContext(env, env.OWNER_USER_ID)
  return makeLiveAdapters((endpoint, params) => ctx.integrations.call(endpoint, params))
}

/**
 * Spec §7: reserve in the room (exact limits, reuse while running), fetch
 * outside the room, then publish or fail back in the room. Runs inside the
 * request; a dead worker leaves the run to go stale after 2 minutes (SUG-15).
 */
async function requestSuggestions(env: Env, userId: string, id: unknown): Promise<Response> {
  const reserve = await roomCall(env, userId, { command: 'requestSuggestions', id, input: {}, billable: providerMode(env) !== 'fixture' })
  const reserved = (await reserve.json()) as { success: boolean; data?: { status: string; reused: boolean; outing?: Outing } }
  if (!reserved.success || !reserved.data || reserved.data.reused || !reserved.data.outing) {
    return Response.json(reserved, { status: reserve.status })
  }

  const outing = reserved.data.outing
  let result: PipelineResult
  try {
    result = await runPipeline(adaptersFor(env, outing.location), outing)
  } catch (err) {
    console.error('[suggestions] pipeline failed:', err instanceof Error ? err.message : String(err))
    result = { ok: false, message: 'Suggestions failed. Try again later, or add places yourself.' }
  }

  const finish = result.ok
    ? await roomCall(env, userId, {
        command: 'publishSuggestions',
        id,
        input: { places: result.places, weather: result.weather, resolvedLocation: result.resolvedLocation },
      })
    : await roomCall(env, userId, { command: 'failSuggestions', id, input: { message: result.message } })
  const finished = (await finish.json()) as { success: boolean; data?: { status: string } }
  if (!finished.success || !finished.data) return Response.json(finished, { status: finish.status })
  return Response.json({ success: true, data: { status: finished.data.status, reused: false } })
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
