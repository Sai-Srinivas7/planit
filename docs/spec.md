# PlanIt — Spec v1.1.2

Status: approved design (2026-10-05). New build in its own folder (`~/planit`), deployed to the account's existing app `app_01M466GAC7Q1B8FQDTNRGN7Z96` under the name `planit`. The Codex prototype in `~/actually-go` shares that app ID, is a local-only reference, and is never deployed from.
This spec is the source of truth. Changes go through a version bump and a changelog line (Section 12) before any plan, task, or code change.

**How to read ACs**
- ID format: `AREA-NN`. Tests are named with the ID: `test('VOTE-02: ...')`.
- Test levels: `[unit]` Vitest · `[api]` api.spec.ts · `[collab]` collab.spec.ts (users fixture) · `[smoke]` smoke.spec.ts · `[manual]` browser/deploy check.
- `(D-xx)` marks the decision an AC comes from (Section 11).

---

## 1. Goal

Turn "we should go somewhere" into one confirmed outing for a small private group.

Core loop: create outing → invite → join → add places and preferences → respond Yes / Maybe / Can't do → discuss → host confirms one plan → copy details.

**Success:** host and one friend complete the loop on the deployed app, see each other's changes without refreshing, and can tell confirmed facts from unconfirmed ones. Manual planning works when every external provider is down.

It is a planning tool. It never implies a booking, reservation, or verified availability.

## 2. Scope

**In v1:** private outings, invite links, manual options (with creator edit/delete rules), per-option responses with tally, preferences, live conversation, host finalize/reopen, copy plan, host deletes outing, host-requested suggestions (up to 3 per run) with weather context and AI explanations, loading/error/empty states.

**Excluded from v1:** scheduling polls, bookings, payments, calendars, email/notifications, maps, AI chat, reminders, cron, background jobs, message editing, attachments, typing indicators, leaving or removing members (D-07), invite expiry or regeneration (D-08), providers outside the DeepSpace integration catalog.

**Known limitations (state in the writeup):**
- All outings share one serialized command queue (one RecordRoom for the app). Fine at this scale; a busy app would shard rooms per outing.
- The command room overrides `RecordRoom.fetch` to add the serialized endpoint; an SDK upgrade could change that method.
- A leaked invite link works for as long as the outing exists; members cannot leave.
- The prototype folder shares PlanIt's app ID; deploying from it would overwrite PlanIt.
- Forecasts cover only 5 days ahead (OpenWeather).
- A suggestion run executes inside the request; if the worker dies mid-run, the run is marked failed after 2 minutes.

## 3. Actors, states, identity

| Actor | Definition |
|---|---|
| Anonymous | Not signed in |
| Outsider | Signed in, not in the outing's `members` |
| Member | User ID is in the outing's `members` |
| Creator | Member who added the option in question |
| Author | Member who wrote the comment in question |
| Host | Member who created the outing (`hostId`) |

| Outing state | Mutable | Frozen |
|---|---|---|
| `open` | options, responses, preferences, comments, suggestions | — |
| `finalized` | comments, joining | options, responses, preferences, selection, suggestions |

Transitions: `open → finalized` (host, `finalize`) · `finalized → open` (host, `reopen`). Nothing finalizes automatically.

**Identity:** the user ID always comes from the verified JWT. **Display names** come from the DeepSpace user directory (`useUsers()` / `useUserLookup().getName`), never from user input. There is no name field anywhere (D-12). A missing directory entry renders as "Unknown".

## 4. Architecture and data model

### 4.1 One record per outing, one serialized command path

Each outing is one record in the `outings` collection. All business state lives in its `payload` JSON. Every change goes through one path:

```
browser → POST /api/outing/:command (Hono route, verifies JWT)
        → RecordRoom stub, internal path /internal/outing, X-User-Id = verified user
        → blockConcurrencyWhile: read record → applyCommand() → write record
        → realtime pushes the updated record to members only
```

`applyCommand(outing, userId, command, input, now)` is a **pure function** in its own module. It holds every rule in Sections 5–6 and returns the next outing or a refusal code. This is the main unit-test seam.

**Why this design (main tradeoff):** DeepSpace server-action `tools` calls are separate, non-transactional writes, so "check the outing is open, then store the vote" can interleave with a finalize. Serializing read-modify-write per command makes every command atomic: a vote and a finalize cannot overlap. The cost is one app-wide queue and an override of one SDK method (Section 2).

### 4.2 Schema

| Collection | Columns | Permissions (all roles) |
|---|---|---|
| `outings` | `hostId` (text, userBound), `members` (json, `collaboratorsField`), `inviteToken` (text), `payload` (json) | `read: 'collaborator'`, `create/update/delete: false` |

`ownerField: 'hostId'`. Outsiders receive nothing over the realtime socket; direct client writes are refused. Only the command path (app-level `X-App-Action` tool calls) writes.

### 4.3 Payload shape

```ts
type Outing = {
  title: string; location: string; date: string; time: string; timezone: string
  startAt: string                       // ISO instant computed from date + time + timezone
  hostId: string; members: string[]; inviteToken: string
  state: 'open' | 'finalized'; selectedOptionId: string | null; finalizedAt: string | null
  people: { userId: string; joinedAt: string; preferences?: Preference }[]
  options: Option[]; responses: { userId: string; optionId: string; value: 'yes' | 'maybe' | 'no' }[]
  comments: { id: string; authorId: string; body: string; createdAt: string }[]
  suggestions: { status: 'idle' | 'running' | 'done' | 'failed'; runs: number; startedAt: string | null
                 message: string | null; weather: Weather | 'unavailable' | null; resolvedLocation: string | null }
}
type Preference = { budget: Budget; interests: Interest[]; setting: 'indoor' | 'outdoor' | 'either' }
type Option = { id: string; createdBy: string; createdAt: string; origin: 'manual' | 'suggested'
                name: string; address: string | null; link: string | null; note: string | null
                sourceUrl: string | null; providerPlaceId: string | null; explanation: string | null; fetchedAt: string | null }
type Weather = { forecastAt: string; tempC: number; description: string }
```

**Fixed values**
- `Budget`: `flexible` · `under_20` · `20_50` · `50_plus` (per person, USD). A stated preference, never compared to venue prices.
- `Interest`: any of `food` · `coffee` · `drinks` · `outdoors` · `art` · `music` · `games` · `shopping` (D-11).
- Caps: 50 members, 30 options, 200 comments per outing.

**Invariants enforced by `applyCommand`** (replacing `uniqueOn`): at most one `people` entry per user; at most one response per (user, option); every response and `selectedOptionId` points at an existing option in the same outing.

**Invite token:** random UUID, stored on the record, readable by members (any member can copy the link). Outsiders can't read the record. Lookup by token happens only inside the command room. Never expires (D-08).

## 5. Command contracts

Public route: `POST /api/outing/:command`, body `{ id?, input }`, max 12 KB. Commands not in the public list return 404. Internal commands (`publishSuggestions`, `failSuggestions`) are callable only by worker code.

Response: `{ success: true, data }` or `{ success: false, error: <CODE>, message }`. HTTP 401 for missing/invalid JWT, 400 for every refusal. The UI shows `message` and branches on `error`.

**Check order (first failure wins):** authentication (401) → input validation (INVALID_INPUT) → record lookup (NOT_FOUND / INVITE_INVALID) → membership (NOT_MEMBER) → role (NOT_HOST / NOT_CREATOR / NOT_AUTHOR) → outing state (OUTING_FINALIZED / INVALID_STATE) → option lock (OPTION_LOCKED) → limits (LIMIT_REACHED).

**Error codes:** `UNAUTHENTICATED` · `NOT_MEMBER` · `NOT_HOST` · `NOT_CREATOR` · `NOT_AUTHOR` · `OPTION_LOCKED` · `NOT_FOUND` · `OUTING_FINALIZED` · `INVALID_STATE` · `INVALID_INPUT` · `INVITE_INVALID` · `LIMIT_REACHED`

| Command | Input | Success data | Refusals (besides UNAUTHENTICATED) |
|---|---|---|---|
| `createOuting` | title, location, date, time, timezone | id, inviteToken | INVALID_INPUT |
| `joinOuting` | token | id, alreadyMember | INVITE_INVALID, LIMIT_REACHED |
| `deleteOuting` | id | — | NOT_FOUND, NOT_MEMBER, NOT_HOST |
| `addOption` | id, name, address?, link?, note? | optionId | NOT_MEMBER, OUTING_FINALIZED, INVALID_INPUT, LIMIT_REACHED |
| `editOption` | id, optionId, name?, address?, link?, note? | — | NOT_MEMBER, NOT_CREATOR, OPTION_LOCKED, NOT_FOUND, OUTING_FINALIZED, INVALID_INPUT |
| `deleteOption` | id, optionId | — | NOT_MEMBER, NOT_CREATOR, OPTION_LOCKED, NOT_FOUND, OUTING_FINALIZED |
| `setResponse` | id, optionId, value: yes \| maybe \| no \| null | — | NOT_MEMBER, NOT_FOUND, OUTING_FINALIZED, INVALID_INPUT |
| `setPreference` | id, budget, interests, setting | — | NOT_MEMBER, OUTING_FINALIZED, INVALID_INPUT |
| `finalize` | id, optionId | — | NOT_MEMBER, NOT_HOST, NOT_FOUND, INVALID_STATE |
| `reopen` | id | — | NOT_MEMBER, NOT_HOST, INVALID_STATE |
| `postComment` | id, body | commentId | NOT_MEMBER, INVALID_INPUT, LIMIT_REACHED |
| `deleteComment` | id, commentId | — | NOT_MEMBER, NOT_AUTHOR, NOT_FOUND |
| `requestSuggestions` | id | status, reused | NOT_MEMBER, NOT_HOST, OUTING_FINALIZED, LIMIT_REACHED |

**Option edit/delete rule (D-02, D-03):** an option is *locked* once any member other than its creator has a response on it. Creator, unlocked: may edit and delete. Creator, locked: OPTION_LOCKED. Host: may delete any option; may edit only their own, under the creator rule. Anyone else: NOT_CREATOR. Deleting an option deletes its responses; deleting the selected option is refused while finalized (frozen).

**setResponse:** `null` removes the caller's response (D-04). The UI sends `null` when the caller clicks their current choice.

**finalize / reopen (D-05):** finalize sets `state: finalized`, `selectedOptionId`, `finalizedAt`. Reopen sets `state: open` and clears `finalizedAt`; responses and `selectedOptionId` are kept, and the previous pick shows as pre-selected.

**Input limits:** title 1–80, location 1–120, option name 1–120, address ≤ 200, note ≤ 280, comment 1–1000 (trimmed), link `http(s)://` only, timezone a valid IANA zone, start time must exist in the timezone (no DST gap) and must not be in the past (D-10), interests ⊆ fixed list.

## 6. Authorization matrix

✓ allowed · ✗ refused (code)

| Command | Anonymous | Outsider | Member (open) | Member (finalized) | Host (open) | Host (finalized) |
|---|---|---|---|---|---|---|
| Read outing (realtime) | ✗ | ✗ receives nothing | ✓ | ✓ | ✓ | ✓ |
| createOuting | ✗ 401 | ✓ | ✓ | ✓ | ✓ | ✓ |
| joinOuting (valid token) | ✗ 401 | ✓ | ✓ no-op | ✓ no-op | ✓ no-op | ✓ no-op |
| deleteOuting | ✗ 401 | ✗ NOT_MEMBER | ✗ NOT_HOST | ✗ NOT_HOST | ✓ | ✓ |
| addOption | ✗ 401 | ✗ NOT_MEMBER | ✓ | ✗ OUTING_FINALIZED | ✓ | ✗ OUTING_FINALIZED |
| editOption (own, unlocked) | ✗ 401 | ✗ NOT_MEMBER | ✓ | ✗ OUTING_FINALIZED | ✓ | ✗ OUTING_FINALIZED |
| editOption (own, locked) | ✗ 401 | ✗ NOT_MEMBER | ✗ OPTION_LOCKED | ✗ OUTING_FINALIZED | ✗ OPTION_LOCKED | ✗ OUTING_FINALIZED |
| editOption (other's) | ✗ 401 | ✗ NOT_MEMBER | ✗ NOT_CREATOR | ✗ NOT_CREATOR | ✗ NOT_CREATOR | ✗ NOT_CREATOR |
| deleteOption (own, unlocked) | ✗ 401 | ✗ NOT_MEMBER | ✓ | ✗ OUTING_FINALIZED | ✓ | ✗ OUTING_FINALIZED |
| deleteOption (own, locked) | ✗ 401 | ✗ NOT_MEMBER | ✗ OPTION_LOCKED | ✗ OUTING_FINALIZED | ✓ | ✗ OUTING_FINALIZED |
| deleteOption (other's) | ✗ 401 | ✗ NOT_MEMBER | ✗ NOT_CREATOR | ✗ NOT_CREATOR | ✓ | ✗ OUTING_FINALIZED |
| setResponse (incl. clear) | ✗ 401 | ✗ NOT_MEMBER | ✓ | ✗ OUTING_FINALIZED | ✓ | ✗ OUTING_FINALIZED |
| setPreference (own) | ✗ 401 | ✗ NOT_MEMBER | ✓ | ✗ OUTING_FINALIZED | ✓ | ✗ OUTING_FINALIZED |
| postComment | ✗ 401 | ✗ NOT_MEMBER | ✓ | ✓ | ✓ | ✓ |
| deleteComment (own) | ✗ 401 | ✗ NOT_MEMBER | ✓ | ✓ | ✓ | ✓ |
| deleteComment (other's) | ✗ 401 | ✗ NOT_MEMBER | ✗ NOT_AUTHOR | ✗ NOT_AUTHOR | ✓ | ✓ |
| finalize | ✗ 401 | ✗ NOT_MEMBER | ✗ NOT_HOST | ✗ NOT_HOST | ✓ | ✗ INVALID_STATE |
| reopen | ✗ 401 | ✗ NOT_MEMBER | ✗ NOT_HOST | ✗ NOT_HOST | ✗ INVALID_STATE | ✓ |
| requestSuggestions | ✗ 401 | ✗ NOT_MEMBER | ✗ NOT_HOST | ✗ NOT_HOST | ✓ | ✗ OUTING_FINALIZED |

**Coverage rule:** every ✗ cell except the Anonymous column is a `[unit]` test on `applyCommand` (table-driven). Each command also has at least one `[api]` test proving the route, JWT, and room wiring return the same code. The Anonymous column is `[api]` (SEC-01). The read row is `[collab]` (BASE-03).

## 7. Suggestion pipeline

Integrations are called from worker code with `buildCronContext(env, env.OWNER_USER_ID).integrations.call(endpoint, body)`, billed to the app owner. `src/integrations.ts` lists `serpapi`, `openweathermap`, `anthropic` as `'developer'`. The public `/api/integrations/*` route stays blocked (403) so browsers can never trigger paid calls directly.

**Phases**
1. **Reserve (in the room):** host, open, `suggestions.status !== 'running'` (or running for more than 2 minutes, which counts as failed), `runs < 3` per outing, app-wide runs today `< 30` (counter in room storage, keyed by UTC date). Sets `status: running`, increments both counters. A second request while running returns `{ status: 'running', reused: true }` with no provider call. Because this runs in the serialized room, both limits are exact (D-16).
2. **Fetch (outside the room, in the worker route):**

| Step | Endpoint | Rule |
|---|---|---|
| Resolve location | `openweathermap/geocoding` (`q` = location, `limit` 5) | 0 results → fail "Location not found. Add the city and state." More than one distinct candidate (name + state + country) → fail "Location is ambiguous. Add the state or country." Exactly one → resolved name and coordinates. |
| Forecast | `openweathermap/forecast` (`q` = resolved name, `units: metric`) | Use the entry whose `dt` is within 90 minutes of `startAt`. None, or call failed → `'unavailable'`. Never substitute current weather. |
| Places | `serpapi/places-search` (`q` from the group's most common interest tags + setting + resolved name; `ll` if Block 0 confirms it) | Normalize; dedupe by `providerPlaceId` and by normalized name against existing options (D-15); drop results without a name or source URL; keep the first 3. No other filters (D-14). |
| Explain | `anthropic/chat-completion` through the `Explainer` adapter | `system` holds instructions; candidates (ID, name, provider facts), weather, and the group's fixed-value preferences go in the user message as JSON. Expected output `{ "explanations": [{ "candidateId": string, "text": string }] }`. |

3. **Publish (in the room, `publishSuggestions`):** recheck host and `state === 'open'`. If finalized meanwhile, discard results and set `status: 'failed'` with "Plan was confirmed before suggestions finished." Otherwise append up to 3 options (`origin: suggested`, `fetchedAt`, explanation if valid), store `weather` and `resolvedLocation`, set `status: done`.

Any fetch-phase failure calls `failSuggestions` with a readable message; existing options, votes, and comments are untouched.

**Adapters:** `Places`, `Geocoder`, `Forecast`, and `Explainer` interfaces, each with a real implementation (DeepSpace integration) and a `fixture` implementation (recorded JSON from Block 0). Selected by `PROVIDERS=fixture|live`. The Explainer model name is set explicitly in config (`EXPLAINER_MODEL`), not left to the endpoint default. No automatic fallback between providers.

**Weather display (D-13):** the outing header shows `weather` from the last completed run with its forecast time, or "Forecast unavailable", or nothing before any run.

## 8. Acceptance criteria

### BASE — platform verification (Block 0)
- **BASE-01** [collab] The users fixture signs in three distinct accounts: host, member, outsider.
- **BASE-02** [unit] The `outings` schema denies client `create`, `update`, and `delete` for every role (the platform enforces schema permissions in the room; the test pins the schema so a change can't slip in).
- **BASE-03** [collab] The outsider's connection receives no outing records, including after new writes to an outing they don't belong to.
- **BASE-04** [api] (runs in Block 2, once `setResponse` exists) 20 concurrent `setResponse` commands from two members on different options of one outing all land: the final record has exactly 20 responses and no lost updates.
- **BASE-05** [manual] Fixtures recorded with `npx deepspace integrations invoke` for `openweathermap/geocoding`, `openweathermap/forecast`, `serpapi/places-search`, and `anthropic/chat-completion`, saved under `src/domain/suggestions/fixtures/`; whether `places-search` accepts `ll`, the chosen `EXPLAINER_MODEL`, and its price are recorded in the development log. (D-01)
- **BASE-06** [api] The internal `/internal/outing` path is not reachable from any public route, and an `X-User-Id` header sent by a client is ignored.

### OUT — create, home, delete (Block 1)
- **OUT-01** [api] Valid `createOuting` stores one record: caller is `hostId` and the only member, state `open`, a fresh invite token, computed `startAt`.
- **OUT-02** [unit] Missing or invalid title, location, date, time, or timezone, or a value over its limit, returns INVALID_INPUT.
- **OUT-03** [unit] Local date + time + IANA timezone converts to one `startAt` instant and displays as the same local time in the outing's timezone, whatever the viewer's timezone.
- **OUT-04** [unit] A local time that doesn't exist in the timezone (DST gap) returns INVALID_INPUT.
- **OUT-05** [unit] A start time in the past (in the outing's timezone) returns INVALID_INPUT. (D-10)
- **OUT-06** [smoke] Home lists only the caller's outings, each with title, location, date/time **with timezone**, and state. Count label is pluralized correctly.
- **OUT-07** [unit] Host deletes the outing; a member gets NOT_HOST. [api] After deletion, its invite link returns INVITE_INVALID.
- **OUT-08** [smoke] There is no name field on create or join.

### INV — invite and join (Block 1)
- **INV-01** [api] A signed-in non-member with a valid token joins: added to `members` and `people`; the outing becomes readable to them.
- **INV-02** [unit] Joining again returns `alreadyMember: true` and leaves exactly one `members` and one `people` entry.
- **INV-03** [api] An unknown token and a token for a deleted outing return identical INVITE_INVALID responses.
- **INV-04** [smoke] Signed-out invite page shows no outing details and renders identically for valid and invalid tokens.
- **INV-05** [smoke] Any member sees a Copy invite control; the link contains the outing's token.
- **INV-06** [unit] Joining a finalized outing succeeds; the new member can post comments. (D-09)
- **INV-07** [unit] The 51st join returns LIMIT_REACHED.

### OPT — options (Block 2)
- **OPT-01** [unit] A member adds an option with only a name: `createdBy` = caller, `origin: manual`, unknown facts null.
- **OPT-02** [unit] Name missing, any field over its limit, or a non-http(s) link returns INVALID_INPUT; the 31st option returns LIMIT_REACHED.
- **OPT-03** [smoke] Every unknown fact (price, hours, address) renders as "Unconfirmed". No fact renders without a source.
- **OPT-04** [collab] Member adds an option; host sees it without refreshing.
- **OPT-05** [unit] Creator edits and deletes their own option while no other member has responded to it. (D-02, D-03)
- **OPT-06** [unit] After another member responds, the creator's edit and delete both return OPTION_LOCKED; the creator's own response does not lock it.
- **OPT-07** [unit] Host deletes another member's option, locked or not; its responses are removed. Host editing another member's option returns NOT_CREATOR.
- **OPT-08** [unit] A non-creator, non-host member's edit or delete returns NOT_CREATOR.
- **OPT-09** [smoke] Edit and delete controls appear only when the caller is allowed to use them.

### VOTE — responses and tally (Block 2)
- **VOTE-01** [unit] A member sets yes, then maybe, on one option: exactly one response for (option, caller), with the latest value.
- **VOTE-02** [api] A `userId` in the input naming another user is ignored; the response belongs to the caller.
- **VOTE-03** [unit] An optionId that doesn't exist in this outing returns NOT_FOUND.
- **VOTE-04** [unit] Tally counts each value per option; sort is Yes desc, then Maybe desc, then option `createdAt` asc. (D-06)
- **VOTE-05** [smoke] Each option shows counts and the display names of who responded each way. The caller's own response is highlighted. Can't do counts are visually prominent.
- **VOTE-06** [collab] Member responds; host's counts update without refreshing.
- **VOTE-07** [unit] `setResponse` with `null` removes the caller's response. [smoke] Clicking the current choice sends `null`. (D-04)

### FIN — finalize, reopen, copy (Block 2)
- **FIN-01** [unit] Host finalizes with an option from this outing: state `finalized`, `selectedOptionId` and `finalizedAt` set.
- **FIN-02** [unit] Unknown option returns NOT_FOUND; finalizing an already finalized outing returns INVALID_STATE.
- **FIN-03** [unit] While finalized, addOption, editOption, deleteOption, setResponse, setPreference, and requestSuggestions return OUTING_FINALIZED; postComment and deleteComment succeed.
- **FIN-04** [api] A `setResponse` and a `finalize` sent concurrently (20 repetitions): every time, either the response is stored and `finalizedAt` is later, or the response is refused with OUTING_FINALIZED. No response is ever stored after finalization.
- **FIN-05** [smoke] Confirmed view shows title, place, address/link, date/time with timezone, and a note that nothing is booked.
- **FIN-06** [unit] Copy-plan text contains those same fields; unknown facts are written as "unconfirmed".
- **FIN-07** [unit] Host reopens: state `open`, `finalizedAt` cleared; all responses and `selectedOptionId` kept. [smoke] Previous pick shows as pre-selected. (D-05)
- **FIN-08** [collab] Host finalizes; member sees the confirmed view without refreshing.

### PREF — preferences (Block 3)
- **PREF-01** [unit] A member sets preferences: stored on their `people` entry; setting again replaces it.
- **PREF-02** [api] A `userId` in the input naming another user is ignored.
- **PREF-03** [unit] Budget, setting, and every interest must come from the fixed values; anything else returns INVALID_INPUT. (D-11)
- **PREF-04** [smoke] Group panel shows each member's display name and preferences, marks the host, and states that budget is a stated preference, not a verified venue price.
- **PREF-05** [collab] Member edits preferences; host sees the change live.

### COM — conversation (Block 3)
- **COM-01** [unit] postComment stores the trimmed body with `authorId` = caller and a server-set timestamp; the 201st comment returns LIMIT_REACHED.
- **COM-02** [unit] Author deletes own comment; host deletes any comment; another member gets NOT_AUTHOR.
- **COM-03** [collab] Member posts; host sees it live. A deleted comment disappears live.
- **COM-04** [smoke] Every name shown (group, votes, comments, "Proposed by") is the account display name from the user directory. (D-12)
- **COM-05** [unit] A deleted comment is removed from the payload; no placeholder remains. (D-17)

### SUG — suggestions (Block 4)
- **SUG-01** [unit] `requestSuggestions` while a run is `running` returns `reused: true` and does not increment counters. [api] Two concurrent requests trigger provider calls once.
- **SUG-02** [unit] A 4th run for one outing, or a run after 30 app-wide runs in the current UTC day, returns LIMIT_REACHED. (D-16)
- **SUG-03** [unit] Place results normalize to the option shape, dedupe by provider place ID and by normalized name against existing options, drop candidates without a name and source URL, and keep at most 3. No other filtering. (D-14, D-15)
- **SUG-04** [unit] Explainer output is accepted only if it parses as the schema and every `candidateId` exists; unknown IDs or malformed output are rejected; each explanation ≤ 240 chars.
- **SUG-05** [unit] The explainer request contains no user IDs, emails, names, comments, or free text from members. Venue text containing instructions is passed as data inside the user message and does not change output structure (fixture test).
- **SUG-06** [api] Places failure: run ends `failed` with a readable message; existing options, responses, and comments unchanged.
- **SUG-07** [unit] Forecast failure, or no entry within 90 minutes of `startAt`, stores `weather: 'unavailable'` and the run completes. When available, the stored weather is passed to the explainer. [smoke] Header shows the forecast with its time, or "Forecast unavailable". (D-13)
- **SUG-08** [unit] Explainer failure or rejected output: options saved without explanations.
- **SUG-09** [unit] Geocoding with 0 results or more than one distinct candidate ends the run with a message asking the host to make the location more specific; no city is silently chosen.
- **SUG-10** [unit] `publishSuggestions` on a finalized outing discards the results and leaves options untouched.
- **SUG-11** [collab] Run status (`running`, `done`, `failed` + message) is visible live to members of that outing; the outsider receives nothing.
- **SUG-12** [unit] A second completed run appends new options and skips places already in the outing; nothing existing is removed. (D-15)
- **SUG-13** [unit] With `PROVIDERS=fixture`, the full pipeline runs with no network calls; the live Explainer adapter passes the same SUG-04 and SUG-05 tests against its recorded fixture.
- **SUG-14** [smoke] The suggestion button is shown only to the host of an open outing and is disabled while a run is `running`.
- **SUG-15** [unit] A run stuck in `running` for more than 2 minutes is treated as failed, and a new request is allowed.
- **SUG-16** [manual] One suggestion run through the live adapters (`integrations.call` from worker code) succeeds on local dev before the first deployed run (REL-04).

### UX — cross-cutting (part of every block's done check)
- **UX-01** [smoke] Every command shows a pending state. On refusal the UI shows the message and the view stays on server state; a refused change never appears saved.
- **UX-02** [smoke] First load shows a loading state, not a blank page.
- **UX-03** [smoke] The "Live" indicator shows only while signed in and the realtime connection is up.
- **UX-04** [manual] Usable at 390px width with no horizontal scroll; all controls reachable by keyboard and labeled.
- **UX-05** [manual] After reconnect, the page shows current server state.

### SEC — security (cross-cutting)
- **SEC-01** [api] Every public command without a valid JWT returns 401.
- **SEC-02** [api] `/api/integrations/*` returns 403 for browser calls. All provider calls go through `integrations.call` in worker code; the client bundle contains no provider URLs.
- **SEC-03** [manual] No secrets in the repo or client bundle; `.dev.vars` is git-ignored.
- **SEC-04** [api] No route returns raw `users` rows (no emails).

### REL — release (Block 6)
- **REL-01** [manual] `test run unit`, `test run api`, and `test run e2e` all pass with nonzero test counts; typecheck, lint, and production build pass.
- **REL-02** [manual] On the deployed app with two accounts: create, invite, join, preferences, options, responses, live comments, finalize, reopen, copy.
- **REL-03** [manual] On the deployed app: the outsider and the non-host are refused on the paths in Section 6.
- **REL-04** [manual] One live suggestion run on the deployed app completes within the D-16 limits; result and cost noted in the writeup.

## 9. Reference: what to port from the prototype

The prototype (`~/actually-go`, tag it before use) is read-only reference. Anything ported arrives through a failing test first, and the commit message says it was ported.

| Port (rewrite to this spec) | Source | Notes |
|---|---|---|
| Serialized command endpoint | `worker.ts:49-82` (`AppRecordRoom.fetch` + `blockConcurrencyWhile`) | Keep the pattern; replace thrown strings with error codes |
| Public route with command allowlist and 12 KB cap | `src/server/outing-routes.ts` | Add new commands; remove the inline provider call |
| Integration proxy block | `src/server/http-routes.ts:230-234` | Keep as is |
| Rule structure | `src/outing.ts changeOuting()` | Becomes `applyCommand()` returning codes |
| Plan summary | `src/outing.ts summary()` | Add "nothing is booked" |
| Two-user journey test | `tests/outing.spec.ts` | Split into AC-named collab tests |
| UI layout and styles | `src/pages/(app)/home.tsx`, `src/planner.css` | Remove name fields; add the controls this spec adds |

**Do not port:** `src/server/suggestions.ts` (Photon, Overpass, Open-Meteo, DeepSeek), name inputs, per-user daily suggestion counter, scaffold extras with no AC (`src/ai/*`, cron, jobs, products, api-status page).

## 10. Definition of done (per block)

1. Every AC in the block has a test that was seen failing for the intended reason.
2. All three suites pass with nonzero counts; typecheck and lint pass.
3. Manual two-browser check of the block's flows.
4. Deployed and checked on the live URL.
5. Traceability updated; development log entry written; committed.

## 11. Decision log

| ID | Decision | Resolution |
|---|---|---|
| A-01 | Data design | One record per outing; serialized command room (Section 4) |
| A-02 | Product and app name | PlanIt, new folder `~/planit`; reuses app `app_01M466GAC7Q1B8FQDTNRGN7Z96` (the account's one active slot), subdomain `planit`. Prototype stays local-only. |
| — | Outing layout | Single page: shortlist, group, conversation |
| — | Invite sharing | Any member can copy the link |
| D-01 | Providers | `serpapi/places-search`, `openweathermap/geocoding` + `/forecast`, `anthropic/chat-completion`, via `integrations.call` from worker code |
| D-02 / D-03 | Option edit/delete | Creator until another member responds; then locked. Host deletes any option. |
| D-04 | Clearing a response | Allowed; clicking current choice clears |
| D-05 | On reopen | Keep responses and previous selection |
| D-06 | Tally tie-break | Older option first |
| D-07 | Leaving / removal | Excluded from v1 |
| D-08 | Invite lifetime | Never expires |
| D-09 | Join when finalized | Allowed |
| D-10 | Past dates | Rejected |
| D-11 | Interests | Fixed tags |
| D-12 | Display names | Account name from user directory; no name field |
| D-13 | Weather placement | Outing header + explainer input |
| D-14 | Extra filters | None |
| D-15 | Re-request | Append, skip duplicates |
| D-16 | Limits | 3 runs per outing, 30 app-wide per UTC day, enforced in the room |
| D-17 | Comment deletion | Hard delete |

## 12. Changelog

- **v1.1.2 (2026-10-05):** From plan review: BASE-05 records fixtures with the CLI in Block 0; the worker integration path is proven by new SUG-16 in Block 4. BASE-04 runs in Block 2. BASE-02 is a schema unit test (client writes go over the realtime socket, which has no test hook; the room enforces schema permissions).
- **v1.1.1 (2026-10-05):** A-02 updated: account has one active app slot (`app list`), so PlanIt deploys to the prototype's registered app ID with `name = "planit"`; prototype is never deployed.
- **v1.1 (2026-10-05):** Renamed to PlanIt; new app and folder (A-02). Adopted the prototype's one-record, serialized-command design (A-01): replaced the 8-collection model, server actions, `uniqueOn`, snapshot, and lock row. Commands replace actions; same error codes. Added `deleteOuting`, member/option/comment caps, SUG-15 stale-run recovery, BASE-04 (no lost updates), BASE-06 (internal path not public), OUT-07/08, INV-07. FIN-04 rewritten for serialized commands. Integrations now called with `buildCronContext(...).integrations.call` (confirmed exported by `deepspace/worker` 0.37.0). Authorization matrix mostly tested at `[unit]` on `applyCommand`. Added Section 9 (porting guide). App-wide daily limit is now exact.
- **v1.0 (2026-10-05):** All decisions closed.
- **v0.1 (2026-10-05):** Draft from build plan.
