import { test, expect } from 'deepspace/testing'
import { createOuting, deleteOuting, testTitle } from './helpers/outing'
import { captureConsoleErrors } from './helpers/errors'

/**
 * Smoke tests covering both page kinds this template ships:
 *   - '/'      → the static landing (top level of src/pages/): no providers,
 *                so no auth fetch and no records WebSocket on load.
 *   - '/home'  → a dynamic page (under src/pages/(app)/): the providers mount,
 *                the nav shell renders, and the records WebSocket connects.
 *
 * The "static contract" test is the guardrail for the per-page opt-out: if
 * someone moves the providers back up into _app.tsx, it fails.
 */

/** Wait for the React app shell (present on every page). */
async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="app-root"]', { timeout: 15000 })
}

test.describe('Smoke tests', () => {
  test('static landing loads without JS errors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByTestId('static-landing')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('landing carries one title, one description, one canonical', async ({ page }) => {
    // <Seo> (src/pages/index.tsx, values from src/seo.ts) hoists these into
    // <head>. Exactly one of each: index.html ships no static description or
    // canonical, because React 19 would not dedupe against them on mount.
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await expect(page).toHaveTitle(/\S/)
    expect(await page.locator('head meta[name="description"]').count()).toBe(1)
    expect(await page.locator('head link[rel="canonical"]').count()).toBe(1)
  })

  test('static contract: landing fires no auth request, opens no websocket', async ({ page }) => {
    const offenders: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/')) offenders.push(req.url())
    })
    // Only the DO room route counts — vite's own HMR socket is a dev artifact.
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname.startsWith('/ws/')) offenders.push(`ws: ${ws.url()}`)
    })
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await page.waitForTimeout(1500)
    expect(offenders).toEqual([])
  })

  test('dynamic app boundary mounts on /home', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('app-navigation')).toBeVisible({ timeout: 15000 })
  })

  test('sign-in button visible when logged out', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('nav-user-name')).toHaveCount(0)
  })

  test('unknown route shows 404', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await waitForApp(page)
    await expect(page.locator('text=404')).toBeVisible()
  })
})

test('OUT-06: home lists only the caller\'s outings with title, location, date/time with timezone, state, and a pluralized count', async ({ users }) => {
  const [host, member] = await users(['Host', 'Member'])
  const { id } = await createOuting(host.page, 'out06')
  try {
    await host.page.goto('/home')
    const card = host.page.getByTestId('outing-card').filter({ has: host.page.getByTestId('outing-title').filter({ hasText: 'out06' }) })
    await expect(card).toHaveCount(1, { timeout: 15_000 })
    await expect(card).toContainText('Dallas, TX')
    await expect(card.getByTestId('outing-when')).toHaveText(/6:00 PM C[SD]T · America\/Chicago$/)
    await expect(card.getByTestId('outing-state')).toHaveText('Planning')

    const n = Number(await host.page.getByTestId('outing-count').textContent())
    await expect(host.page.getByTestId('outing-count-label')).toHaveText(`${n} ${n === 1 ? 'outing' : 'outings'}`)

    await member.page.goto('/home')
    await expect(member.page.getByTestId('outing-count')).toHaveText(/\d+/, { timeout: 15_000 })
    await expect(member.page.getByTestId('outing-title').filter({ hasText: 'out06' })).toHaveCount(0)
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('OUT-08: there is no name field on create or join', async ({ users }) => {
  const [host, member] = await users(['Host', 'Member'])
  const { id, inviteToken } = await createOuting(host.page, 'out08')
  try {
    await host.page.goto('/home')
    await host.page.getByRole('button', { name: 'New outing' }).click()
    const form = host.page.getByTestId('create-outing-form')
    await expect(form).toBeVisible()
    const names = await form.locator('input, select, textarea').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).name))
    expect(names.sort()).toEqual(['date', 'location', 'time', 'timezone', 'title'])
    await expect(form.getByLabel(/\bname\b/i)).toHaveCount(0)

    await member.page.goto(`/home?invite=${inviteToken}`)
    const gate = member.page.getByTestId('invite-gate')
    await expect(gate.getByRole('button', { name: 'Join outing' })).toBeVisible({ timeout: 15_000 })
    await expect(gate.locator('input, select, textarea')).toHaveCount(0)
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('INV-04: the signed-out invite page shows no outing details and renders identically for valid and invalid tokens', async ({ page, users }) => {
  const [host] = await users(['Host'])
  const { id, inviteToken } = await createOuting(host.page, 'inv04 secret title')
  try {
    const render = async (token: string) => {
      await page.goto(`/home?invite=${token}`)
      const gate = page.getByTestId('invite-gate')
      await expect(gate).toBeVisible({ timeout: 15_000 })
      return gate.innerHTML()
    }
    const valid = await render(inviteToken)
    const invalid = await render('00000000-0000-4000-8000-000000000000')
    expect(valid).toBe(invalid)
    await expect(page.getByText('inv04 secret title')).toHaveCount(0)
    await expect(page.getByText('Dallas')).toHaveCount(0)
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('INV-05: any member sees Copy invite and the link contains the outing token', async ({ users }) => {
  const [host, member] = await users(['Host', 'Member'])
  const { id, inviteToken } = await createOuting(host.page, 'inv05')
  try {
    await member.page.goto(`/home?invite=${inviteToken}`)
    await member.page.getByRole('button', { name: 'Join outing' }).click()
    await expect(member.page.getByTestId('outing-page')).toBeVisible({ timeout: 15_000 })
    for (const user of [member, host]) {
      if (user === host) await host.page.goto(`/home?outing=${id}`)
      await user.page.getByRole('button', { name: 'Copy invite' }).click()
      await expect(user.page.getByTestId('invite-link')).toBeVisible()
      expect(await user.page.getByTestId('invite-link').inputValue()).toBe(`${new URL(user.page.url()).origin}/home?invite=${inviteToken}`)
    }
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('UX-01: create and join show a pending state; a refusal shows its message and nothing appears saved', async ({ users }) => {
  const [host] = await users(['Host'])
  await host.page.goto('/home')
  await expect(host.page.getByTestId('outing-count')).toHaveText(/\d+/, { timeout: 15_000 })
  const title = testTitle('ux01 refused')

  // Pending: hold the request briefly so the in-flight state is observable.
  await host.page.route('**/api/outing/createOuting', async (route) => {
    await new Promise((r) => setTimeout(r, 800))
    await route.continue()
  })
  await host.page.getByRole('button', { name: 'New outing' }).click()
  const form = host.page.getByTestId('create-outing-form')
  await form.getByLabel('Title').fill(title)
  await form.getByLabel('Where (city or area)').fill('Dallas, TX')
  await form.getByLabel('Date').fill('2020-01-01') // in the past → INVALID_INPUT
  await form.getByLabel('Time', { exact: true }).fill('18:00')
  await form.getByRole('button', { name: 'Create outing' }).click()
  await expect(form.getByRole('button', { name: 'Creating…' })).toBeDisabled()

  await expect(form.getByRole('alert')).toHaveText('Pick a start time in the future.', { timeout: 15_000 })
  await expect(form).toBeVisible() // dialog stays open on refusal
  await host.page.keyboard.press('Escape')
  await expect(host.page.getByTestId('outing-title').filter({ hasText: title })).toHaveCount(0)

  // Join refusal: an unknown invite shows the server's message.
  await host.page.goto('/home?invite=not-a-real-token')
  await host.page.getByRole('button', { name: 'Join outing' }).click()
  await expect(host.page.getByRole('alert')).toHaveText('This invite link is not valid.')
})
