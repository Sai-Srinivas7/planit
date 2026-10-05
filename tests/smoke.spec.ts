import { test, expect } from 'deepspace/testing'
import { addOption, command, createOuting, deleteOuting, outingWithMember, testTitle } from './helpers/outing'
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

const card = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('option-card').filter({ has: page.getByTestId('option-name').getByText(name, { exact: true }) })

test('OPT-03: every unknown fact (price, hours, address) renders as "Unconfirmed"; no fact renders without a source', async ({ users }) => {
  const [host] = await users(['Host'])
  const { id } = await createOuting(host.page, 'opt03')
  try {
    await addOption(host.page, id, 'Bare place')
    await addOption(host.page, id, 'Known place', { address: '1 Main St', link: 'https://known.test' })
    await host.page.goto(`/home?outing=${id}`)
    const bare = card(host.page, 'Bare place')
    await expect(bare.getByTestId('fact-address')).toHaveText('Unconfirmed', { timeout: 15_000 })
    await expect(bare.getByTestId('fact-price')).toHaveText('Unconfirmed')
    await expect(bare.getByTestId('fact-hours')).toHaveText('Unconfirmed')
    await expect(bare.getByRole('link')).toHaveCount(0)
    // A known address is shown with its source: who proposed it.
    const known = card(host.page, 'Known place')
    await expect(known.getByTestId('fact-address')).toHaveText('1 Main St')
    await expect(known.getByTestId('option-origin')).toHaveText('Proposed by Host')
    await expect(known.getByTestId('fact-price')).toHaveText('Unconfirmed')
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('OPT-09: edit and delete controls appear only when the caller may use them', async ({ users }) => {
  const [host, member] = await users(['Host', 'Member'])
  const { id } = await outingWithMember(host.page, member.page, 'opt09')
  try {
    await addOption(member.page, id, 'Member place')
    const locked = await addOption(member.page, id, 'Locked place')
    await addOption(host.page, id, 'Host place')
    await command(host.page, 'setResponse', { id, input: { optionId: locked, value: 'yes' } })

    await member.page.goto(`/home?outing=${id}`)
    const m = (name: string) => card(member.page, name)
    await expect(m('Member place').getByRole('button', { name: /^Edit/ })).toBeVisible({ timeout: 15_000 })
    await expect(m('Member place').getByRole('button', { name: /^Remove/ })).toBeVisible()
    await expect(m('Locked place').getByRole('button', { name: /^(Edit|Remove)/ })).toHaveCount(0)
    await expect(m('Host place').getByRole('button', { name: /^(Edit|Remove)/ })).toHaveCount(0)
    await expect(m('Host place').getByRole('button', { name: 'Confirm this plan' })).toHaveCount(0)

    await host.page.goto(`/home?outing=${id}`)
    const h = (name: string) => card(host.page, name)
    await expect(h('Host place').getByRole('button', { name: /^Edit/ })).toBeVisible({ timeout: 15_000 })
    await expect(h('Member place').getByRole('button', { name: /^Edit/ })).toHaveCount(0)
    await expect(h('Member place').getByRole('button', { name: /^Remove/ })).toBeVisible()
    await expect(h('Locked place').getByRole('button', { name: /^Remove/ })).toBeVisible()

    // Finalized: nobody gets edit/delete controls.
    await command(host.page, 'finalize', { id, input: { optionId: locked } })
    await expect(host.page.getByTestId('confirmed-plan')).toBeVisible({ timeout: 15_000 })
    await expect(host.page.getByRole('button', { name: /^(Edit|Remove) / })).toHaveCount(0)
  } finally {
    await deleteOuting(host.page, id)
  }
})

test("VOTE-05: each option shows counts and voter names; the caller's response is highlighted; Can't do counts are prominent", async ({ users }) => {
  const [host, member] = await users(['Host', 'Member'])
  const { id } = await outingWithMember(host.page, member.page, 'vote05')
  try {
    const optionId = await addOption(host.page, id, 'Taco place')
    await command(host.page, 'setResponse', { id, input: { optionId, value: 'yes' } })
    await command(member.page, 'setResponse', { id, input: { optionId, value: 'no' } })
    await member.page.goto(`/home?outing=${id}`)
    const c = card(member.page, 'Taco place')
    await expect(c.getByTestId('count-yes')).toHaveText('1', { timeout: 15_000 })
    await expect(c.getByTestId('count-maybe')).toHaveText('0')
    await expect(c.getByTestId('count-no')).toHaveText('1')
    await expect(c.getByTestId('voters-yes')).toHaveText('Host')
    await expect(c.getByTestId('voters-no')).toHaveText('Member')
    await expect(c.getByTestId('respond-no')).toHaveAttribute('aria-pressed', 'true')
    await expect(c.getByTestId('respond-yes')).toHaveAttribute('aria-pressed', 'false')
    // A nonzero Can't do count is emphasized for everyone else.
    await host.page.goto(`/home?outing=${id}`)
    const hc = card(host.page, 'Taco place')
    await expect(hc.getByTestId('respond-no')).toHaveClass(/text-destructive/, { timeout: 15_000 })
    await expect(hc.getByTestId('count-no')).toHaveClass(/font-bold/)
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('VOTE-07: clicking your current choice sends null and clears it', async ({ users }) => {
  const [host] = await users(['Host'])
  const { id } = await createOuting(host.page, 'vote07')
  try {
    await addOption(host.page, id, 'Pizza')
    await host.page.goto(`/home?outing=${id}`)
    const c = card(host.page, 'Pizza')
    const sent: unknown[] = []
    host.page.on('request', (r) => {
      if (r.url().endsWith('/api/outing/setResponse')) sent.push(JSON.parse(r.postData()!).input.value)
    })
    await c.getByTestId('respond-maybe').click()
    await expect(c.getByTestId('respond-maybe')).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 })
    await expect(c.getByTestId('count-maybe')).toHaveText('1')
    await c.getByTestId('respond-maybe').click()
    await expect(c.getByTestId('respond-maybe')).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 })
    await expect(c.getByTestId('count-maybe')).toHaveText('0')
    expect(sent).toEqual(['maybe', null])
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('FIN-05: the confirmed view shows title, place, address/link, date/time with timezone, and that nothing is booked', async ({ users }) => {
  const [host] = await users(['Host'])
  const { id } = await createOuting(host.page, 'fin05')
  try {
    await addOption(host.page, id, 'Final spot', { link: 'https://final.test' })
    await host.page.goto(`/home?outing=${id}`)
    await card(host.page, 'Final spot').getByRole('button', { name: 'Confirm this plan' }).click()
    const plan = host.page.getByTestId('confirmed-plan')
    await expect(plan).toBeVisible({ timeout: 15_000 })
    await expect(plan.getByTestId('confirmed-title')).toContainText('fin05')
    await expect(plan.getByTestId('confirmed-place')).toHaveText('Final spot')
    await expect(plan.getByTestId('confirmed-address')).toHaveText('Unconfirmed')
    await expect(plan.getByTestId('confirmed-link')).toHaveText('https://final.test')
    await expect(plan.getByTestId('confirmed-when')).toHaveText(/6:00 PM C[SD]T · America\/Chicago/)
    await expect(plan.getByTestId('nothing-booked')).toHaveText(/Nothing is booked/)
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('FIN-07: after reopen the previous pick shows as pre-selected', async ({ users }) => {
  const [host] = await users(['Host'])
  const { id } = await createOuting(host.page, 'fin07')
  try {
    const picked = await addOption(host.page, id, 'Picked')
    await addOption(host.page, id, 'Other')
    await command(host.page, 'finalize', { id, input: { optionId: picked } })
    await host.page.goto(`/home?outing=${id}`)
    await host.page.getByRole('button', { name: 'Reopen planning' }).click()
    await expect(host.page.getByTestId('confirmed-plan')).toHaveCount(0, { timeout: 15_000 })
    await expect(card(host.page, 'Picked').getByTestId('previous-pick')).toBeVisible()
    await expect(card(host.page, 'Other').getByTestId('previous-pick')).toHaveCount(0)
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('UX-01: option commands show pending; a refused edit shows its message and the card keeps the server value', async ({ users }) => {
  const [host, member] = await users(['Host', 'Member'])
  const { id } = await outingWithMember(host.page, member.page, 'ux01 options')
  try {
    const optionId = await addOption(member.page, id, 'Original name')
    await member.page.goto(`/home?outing=${id}`)
    await card(member.page, 'Original name').getByRole('button', { name: /^Edit/ }).click()
    const form = member.page.getByTestId('option-form')
    await form.getByLabel('Place name').fill('Renamed')
    // Someone else responds while the dialog is open, so the option locks.
    await command(host.page, 'setResponse', { id, input: { optionId, value: 'yes' } })
    await member.page.route('**/api/outing/editOption', async (route) => {
      await new Promise((r) => setTimeout(r, 600))
      await route.continue()
    })
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(form.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await expect(form.getByRole('alert')).toHaveText(/no longer be changed/, { timeout: 15_000 })
    await member.page.keyboard.press('Escape')
    await expect(card(member.page, 'Original name')).toBeVisible()
    await expect(member.page.getByTestId('option-name').getByText('Renamed', { exact: true })).toHaveCount(0)
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('PREF-04: the group panel shows each member by display name with preferences, marks the host, and says budget is not a venue price', async ({ users }) => {
  const [host, member] = await users(['Host', 'Member'])
  const { id } = await outingWithMember(host.page, member.page, 'pref04')
  try {
    await command(member.page, 'setPreference', { id, input: { budget: '20_50', interests: ['coffee', 'art'], setting: 'indoor' } })
    await host.page.goto(`/home?outing=${id}`)
    const panel = host.page.getByTestId('group-panel')
    const person = (uid: string) => panel.locator(`[data-user-id="${uid}"]`)
    await expect(person(member.userId!).getByTestId('person-name')).toHaveText('Member', { timeout: 15_000 })
    await expect(person(member.userId!).getByTestId('person-preferences')).toHaveText('$20–50 per person · Indoor · Coffee, Art')
    await expect(person(member.userId!).getByTestId('host-badge')).toHaveCount(0)
    await expect(person(host.userId!).getByTestId('person-name')).toHaveText('Host')
    await expect(person(host.userId!).getByTestId('host-badge')).toBeVisible()
    await expect(person(host.userId!).getByTestId('person-preferences')).toHaveText('No preferences yet')
    await expect(panel.getByTestId('budget-note')).toHaveText('Budget is a stated preference, not a verified venue price.')

    // Setting preferences through the dialog.
    await panel.getByRole('button', { name: 'Add my preferences' }).click()
    const form = host.page.getByTestId('preferences-form')
    await form.getByLabel('Budget per person').selectOption('under_20')
    await form.getByLabel('Food').check()
    await form.getByRole('button', { name: 'Save preferences' }).click()
    await expect(person(host.userId!).getByTestId('person-preferences')).toHaveText('Under $20 per person · Either · Food', { timeout: 15_000 })
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('COM-04: every name shown (group, votes, comments, "Proposed by") is the account display name from the directory', async ({ users }) => {
  const [host, member] = await users(['Host', 'Member'])
  const { id } = await outingWithMember(host.page, member.page, 'com04')
  try {
    const optionId = await addOption(member.page, id, 'Named place')
    await command(member.page, 'setResponse', { id, input: { optionId, value: 'maybe' } })
    await command(member.page, 'postComment', { id, input: { body: 'Hello from Member' } })
    await command(host.page, 'postComment', { id, input: { body: 'Hello from Host' } })
    await host.page.goto(`/home?outing=${id}`)
    const c = card(host.page, 'Named place')
    await expect(c.getByTestId('option-origin')).toHaveText('Proposed by Member', { timeout: 15_000 })
    await expect(c.getByTestId('voters-maybe')).toHaveText('Member')
    await expect(host.page.getByTestId('group-panel').getByTestId('person-name')).toHaveText(['Host', 'Member'])
    const comments = host.page.getByTestId('comment')
    await expect(comments.getByTestId('comment-author')).toHaveText(['Member', 'Host'])
    await expect(comments.getByTestId('comment-body')).toHaveText(['Hello from Member', 'Hello from Host'])
    await expect(host.page.getByText('Unknown')).toHaveCount(0)
  } finally {
    await deleteOuting(host.page, id)
  }
})

test('UX-01: posting a comment shows a pending state', async ({ users }) => {
  const [host] = await users(['Host'])
  const { id } = await createOuting(host.page, 'ux01 comment')
  try {
    await host.page.goto(`/home?outing=${id}`)
    await host.page.route('**/api/outing/postComment', async (route) => {
      await new Promise((r) => setTimeout(r, 600))
      await route.continue()
    })
    await host.page.getByLabel('Message', { exact: true }).fill('On my way')
    await host.page.getByRole('button', { name: 'Send' }).click()
    await expect(host.page.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    await expect(host.page.getByTestId('comment-body')).toHaveText(['On my way'], { timeout: 15_000 })
    await expect(host.page.getByLabel('Message', { exact: true })).toHaveValue('')
  } finally {
    await deleteOuting(host.page, id)
  }
})
