import { test, expect } from 'deepspace/testing'
import { command, readOutings, testTitle } from './helpers/outing'

test.describe('API tests', () => {
  test('auth proxy forwards to auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })

  test('WebSocket endpoint exists', async ({ page }) => {
    // /home is a dynamic page (under src/pages/(app)/), so mounting it boots
    // the providers and auto-connects the records WebSocket. The static
    // landing at '/' deliberately does neither — see smoke.spec.ts.
    await page.goto('/home')
    // Wait for the app to connect its WebSocket (it auto-connects on mount)
    await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 15000 })
    // If the app loaded and connected, the WS endpoint works
  })
})

// Spec §5 public command list.
const PUBLIC_COMMANDS = [
  'createOuting', 'joinOuting', 'deleteOuting', 'addOption', 'editOption', 'deleteOption',
  'setResponse', 'setPreference', 'finalize', 'reopen', 'postComment', 'deleteComment',
  'requestSuggestions',
]

const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url')
// Well-formed but unsigned (alg "none") token naming a user — must not be trusted.
const forgedJwt = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: 'forged-user', exp: 4102444800 })}.`

const NO_VALID_JWT: Record<string, Record<string, string>> = {
  'no Authorization header': {},
  'malformed bearer token': { Authorization: 'Bearer not-a-jwt' },
  'unsigned forged JWT': { Authorization: `Bearer ${forgedJwt}` },
}

test('SEC-01: every public command without a valid JWT returns 401 UNAUTHENTICATED', async ({ request }) => {
  for (const command of PUBLIC_COMMANDS) {
    for (const [variant, headers] of Object.entries(NO_VALID_JWT)) {
      const res = await request.post(`/api/outing/${command}`, {
        headers,
        data: { id: 'any-outing', input: {} },
      })
      const where = `${command} with ${variant}`
      expect(res.status(), where).toBe(401)
      const body = await res.json().catch(() => null)
      expect(body, where).toMatchObject({ success: false, error: 'UNAUTHENTICATED' })
      expect(typeof body.message, where).toBe('string')
    }
  }
})

test('BASE-06: /internal/outing is not publicly reachable and a client X-User-Id is ignored', async ({ users }) => {
  const [host, member] = await users(['Host', 'Member'])
  const hostId = host.userId!
  const memberId = member.userId!
  const title = testTitle('base06')
  const forged = { 'X-User-Id': memberId, 'X-App-Action': 'true' }

  // 1. The internal path, hit from outside with forged identity headers, never runs a command.
  await host.page.goto('/home')
  for (const path of ['/internal/outing', '/api/internal/outing']) {
    const res = await host.page.request.post(path, {
      headers: forged,
      data: { command: 'createOuting', input: { title: `${title} direct` } },
    })
    const json = await res.json().catch(() => null)
    expect(json?.success, `${path} must not execute a command`).not.toBe(true)
  }

  // 2. Internal and unknown command names are not public (spec §5): 404.
  for (const name of ['publishSuggestions', 'failSuggestions', 'noSuchCommand']) {
    const res = await command(host.page, name, { input: {} })
    expect(res.status, name).toBe(404)
    expect(res.body, name).toMatchObject({ success: false, error: 'NOT_FOUND' })
  }

  // 3. A spoofed X-User-Id (and user IDs in the input) on the public route are ignored.
  const created = await command(
    host.page,
    'createOuting',
    { input: { title, location: 'Dallas, TX', date: '2030-01-01', time: '18:00', timezone: 'America/Chicago', userId: memberId, hostId: memberId } },
    forged,
  )
  expect(created.status).toBe(200)
  expect(created.body).toMatchObject({ success: true, data: { id: expect.any(String), inviteToken: expect.any(String) } })

  const hostView = await readOutings(host.page)
  const record = hostView.find((r) => r.recordId === created.body.data.id)
  expect(record, 'host receives the outing they created').toBeDefined()
  expect(record!.data.hostId).toBe(hostId)
  expect(record!.data.members).toEqual([hostId])
  expect(record!.data.payload).toMatchObject({ hostId, members: [hostId], title })

  // The member whose ID was forged is not the host, not a member, and receives nothing.
  const memberView = await readOutings(member.page)
  expect(memberView.some((r) => r.recordId === created.body.data.id)).toBe(false)
  expect(memberView.some((r) => r.data.payload.title === `${title} direct`)).toBe(false)
  expect(hostView.some((r) => r.data.payload.title === `${title} direct`)).toBe(false)
})

// Spec §7 / D-01 provider endpoints. These must never be reachable from a browser.
const PROVIDER_ENDPOINTS = [
  'openweathermap/geocoding',
  'openweathermap/forecast',
  'serpapi/places-search',
  'anthropic/chat-completion',
]

test('SEC-02: browser calls to /api/integrations/* return 403, signed in or not', async ({ request, users }) => {
  const [host] = await users(['Host'])
  await host.page.goto('/home')
  const token = await host.page.evaluate(async () => {
    const res = await fetch('/api/auth/token', { method: 'POST', credentials: 'include' })
    return (await res.json()).token as string
  })

  for (const endpoint of PROVIDER_ENDPOINTS) {
    for (const [who, headers] of [['anonymous', {}], ['signed-in', { Authorization: `Bearer ${token}` }]] as const) {
      for (const method of ['GET', 'POST'] as const) {
        const where = `${method} ${endpoint} (${who})`
        const res = await request.fetch(`/api/integrations/${endpoint}`, {
          method,
          headers,
          data: method === 'POST' ? { q: 'Dallas', limit: 5 } : undefined,
        })
        expect(res.status(), where).toBe(403)
        expect(await res.json(), where).toEqual({ error: expect.any(String) })
      }
    }
  }
})
