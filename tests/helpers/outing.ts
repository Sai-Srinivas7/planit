import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

// Same app id the worker uses for its record room (`app:${DEEPSPACE_APP_ID}`).
const APP_ID = /DEEPSPACE_APP_ID\s*=\s*"([^"]+)"/.exec(
  readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8'),
)![1]

export type OutingRecord = {
  recordId: string
  data: { hostId: string; members: string[]; inviteToken: string; payload: Record<string, unknown> }
}

export const testTitle = (label: string) => `__test-${Date.now()}__ ${label}`

async function onApp(page: Page) {
  if (!page.url().startsWith('http')) await page.goto('/home')
}

/**
 * POST /api/outing/:command as the page's signed-in user (bearer JWT from the
 * session, as the client will send it). `headers` lets a test add forged ones.
 */
export async function command(
  page: Page,
  name: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  await onApp(page)
  return page.evaluate(
    async ({ name, body, headers }) => {
      const tokenRes = await fetch('/api/auth/token', { method: 'POST', credentials: 'include' })
      const { token } = await tokenRes.json()
      const res = await fetch(`/api/outing/${name}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      return { status: res.status, body: await res.json().catch(() => null) }
    },
    { name, body, headers },
  )
}

/**
 * Every `outings` record the page's user receives over their own realtime
 * socket — exactly what that user's client can see.
 */
export async function readOutings(page: Page): Promise<OutingRecord[]> {
  await onApp(page)
  const records = await page.evaluate(async (appId) => {
    const tokenRes = await fetch('/api/auth/token', { method: 'POST', credentials: 'include' })
    const { token } = await tokenRes.json()
    const url = new URL(`/ws/${encodeURIComponent(`app:${appId}`)}`, location.href)
    url.protocol = url.protocol.replace('http', 'ws')
    url.searchParams.set('token', token)
    const ws = new WebSocket(url)
    const subscriptionId = `test-${Math.random()}`
    return new Promise<unknown[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no query_result within 10s')), 10_000)
      ws.onopen = () =>
        ws.send(JSON.stringify({ type: 'core.subscribe', payload: { subscriptionId, query: { collection: 'outings' } } }))
      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data))
        if (msg.type === 'core.query_result' && msg.payload?.subscriptionId === subscriptionId) {
          clearTimeout(timer)
          ws.close()
          resolve(msg.payload.records)
        }
      }
      ws.onerror = () => reject(new Error('websocket error'))
    })
  }, APP_ID)
  const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v)
  return (records as OutingRecord[]).map((r) => ({
    ...r,
    data: { ...r.data, members: parse(r.data.members), payload: parse(r.data.payload) },
  }))
}

/** A valid createOuting input a week ahead, titled per plan §3. */
export function outingInput(label: string, over: Record<string, unknown> = {}) {
  const date = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  return { title: testTitle(label), location: 'Dallas, TX', date, time: '18:00', timezone: 'America/Chicago', ...over }
}

/** Creates an outing as the page's user; returns { id, inviteToken }. */
export async function createOuting(page: Page, label: string, over: Record<string, unknown> = {}) {
  const res = await command(page, 'createOuting', { input: outingInput(label, over) })
  if (res.body?.success !== true) throw new Error(`createOuting failed: ${JSON.stringify(res.body)}`)
  return res.body.data as { id: string; inviteToken: string }
}

/** Best-effort cleanup for `finally` blocks. */
export async function deleteOuting(page: Page, id: string | undefined) {
  if (id) await command(page, 'deleteOuting', { id, input: {} }).catch(() => undefined)
}

/** One outing's payload as the page's user receives it, or undefined. */
export async function readOuting(page: Page, id: string): Promise<any> {
  return (await readOutings(page)).find((r) => r.recordId === id)?.data.payload
}

/** Host creates an outing, member joins it. */
export async function outingWithMember(host: Page, member: Page, label: string) {
  const created = await createOuting(host, label)
  const joined = await command(member, 'joinOuting', { input: { token: created.inviteToken } })
  if (joined.body?.success !== true) throw new Error(`join failed: ${JSON.stringify(joined.body)}`)
  return created
}

export async function addOption(page: Page, id: string, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await command(page, 'addOption', { id, input: { name, ...extra } })
  if (res.body?.success !== true) throw new Error(`addOption failed: ${JSON.stringify(res.body)}`)
  return res.body.data.optionId
}
