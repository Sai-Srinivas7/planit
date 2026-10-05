/**
 * Multi-user collaboration spec — verifies two users sign in into
 * separate browser contexts and the app distinguishes them.
 *
 * `users(2)` takes any two accounts from your pool, so this spec passes on a
 * fresh app with no setup beyond having two test accounts:
 *   npx deepspace test accounts list
 *   npx deepspace test accounts create --email a@deepspace.test --name "A" --password-stdin
 *
 * Ask for accounts *by name* (`users(['Alice', 'Bob'])`) only when the
 * behaviour under test depends on which identity acts — otherwise naming them
 * couples the spec to one machine's pool.
 *
 * The `users` fixture handles sign-in caching (per-account storageState
 * persisted to `~/.deepspace/playwright-states/`), context creation, and
 * cleanup. No need to manage browser contexts manually.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { command, deleteOuting, outingWithMember, readOutings, testTitle } from './helpers/outing'

// A machine that has never created test accounts is the normal state of a
// fresh checkout, and there `users()` throws — turning "you have no pool yet"
// into three red tests about the app, which it is not. Skip the file instead
// and say what creates the pool. The count is of accounts usable HERE: the
// pool is global per developer, but passwords live only on the machine that
// created the account.
const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" ' +
    '--password-stdin`, or fetch existing pool accounts with `npx deepspace test accounts recover --all`.',
)

test('each browser renders its own signed-in account', async ({ users }) => {
  const [a, b] = await users(2)

  // /home is dynamic (under src/pages/(app)/), so it mounts the nav shell;
  // '/' is the static landing and has no navigation.
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  // Email, not name. The page renders the *session's* `name || email`, while
  // `user.name` here comes from the LOCAL account registry — and the two are
  // not the same fact: a display name is optional, and an account recovered on
  // another machine has none stored locally at all. The email is the credential
  // the context signed in with, so it is the one identity both sides agree on,
  // and asserting it proves the page is showing THIS browser's account.
  // The two accounts are distinct, so two exact matches is also the proof that
  // the contexts are not sharing one session.
  for (const user of [a, b]) {
    await expect(user.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })

    // The identity chip shows `name || email`. Its text is not predictable, but
    // its presence is: something must be there once the profile has loaded.
    // (It is `hidden sm:inline` in some templates, so assert text, not
    // visibility.)
    await expect(user.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })

    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(user.email, {
      timeout: 15_000,
    })
  }
})

test('BASE-01: the users fixture signs in three distinct accounts: host, member, outsider', async ({ users }) => {
  const trio = await users(['Host', 'Member', 'Outsider'])
  expect(new Set(trio.map((u) => u.userId)).size).toBe(3)
  for (const user of trio) {
    await user.page.goto('/home')
    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(user.email, { timeout: 15_000 })
  }
})

test('BASE-03: the outsider receives no outing records, including after new writes', async ({ users }) => {
  const [host, outsider] = await users(['Host', 'Outsider'])
  await Promise.all([host.page.goto('/home'), outsider.page.goto('/home')])
  const hostCount = host.page.getByTestId('outing-count')
  const outsiderCount = outsider.page.getByTestId('outing-count')
  await expect(outsiderCount).toHaveText('0', { timeout: 15_000 })
  await expect(hostCount).toHaveText(/\d+/, { timeout: 15_000 })

  // Two writes while both sockets are open.
  const ids: string[] = []
  const titles: string[] = []
  for (const label of ['base03 a', 'base03 b']) {
    const title = testTitle(label)
    const res = await command(host.page, 'createOuting', {
      input: { title, location: 'Dallas, TX', date: '2030-01-01', time: '18:00', timezone: 'America/Chicago' },
    })
    expect(res.body).toMatchObject({ success: true })
    ids.push(res.body.data.id)
    titles.push(title)
  }

  // Positive control: the host's live list picks up both writes without a reload
  // (titles, not a count: other parallel tests create Host outings too)…
  for (const title of titles) {
    await expect(host.page.getByTestId('outing-title').filter({ hasText: title })).toBeVisible({ timeout: 15_000 })
  }
  // …while the outsider's live list, and a fresh subscription on their socket, get nothing.
  await expect(outsiderCount).toHaveText('0')
  const outsiderView = await readOutings(outsider.page)
  expect(outsiderView.filter((r) => ids.includes(r.recordId))).toEqual([])
  expect(outsiderView).toEqual([])
  for (const id of ids) await deleteOuting(host.page, id)
})

test('OPT-04, VOTE-06, FIN-08: member adds and responds, host sees it live; host finalizes, member sees the confirmed view live', async ({ users }) => {
  const [host, member] = await users(['Host', 'Member'])
  const { id } = await outingWithMember(host.page, member.page, 'block2 live')
  try {
    await Promise.all([host.page.goto(`/home?outing=${id}`), member.page.goto(`/home?outing=${id}`)])
    await expect(host.page.getByTestId('option-count')).toHaveText('0', { timeout: 15_000 })
    await expect(member.page.getByTestId('option-count')).toHaveText('0', { timeout: 15_000 })
    const hostCard = host.page.getByTestId('option-card').filter({ hasText: 'Live place' })

    // OPT-04: member adds through the UI; host sees it without a reload.
    await member.page.getByRole('button', { name: 'Add place' }).click()
    await member.page.getByTestId('option-form').getByLabel('Place name').fill('Live place')
    await member.page.getByTestId('option-form').getByRole('button', { name: 'Add place' }).click()
    await expect(hostCard).toBeVisible({ timeout: 15_000 })
    await expect(host.page.getByTestId('option-count')).toHaveText('1')

    // VOTE-06: member responds; host's counts update live.
    await member.page.getByTestId('option-card').filter({ hasText: 'Live place' }).getByTestId('respond-yes').click()
    await expect(hostCard.getByTestId('count-yes')).toHaveText('1', { timeout: 15_000 })
    await expect(hostCard.getByTestId('voters-yes')).toHaveText('Member')

    // FIN-08: host confirms; member sees the confirmed view live.
    await hostCard.getByRole('button', { name: 'Confirm this plan' }).click()
    await expect(member.page.getByTestId('confirmed-plan')).toBeVisible({ timeout: 15_000 })
    await expect(member.page.getByTestId('confirmed-place')).toHaveText('Live place')
  } finally {
    await deleteOuting(host.page, id)
  }
})
