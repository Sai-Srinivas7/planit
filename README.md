# PlanIt

A small group planner for turning "we should hang out sometime" into one confirmed plan.

**Live:** https://planit.app.space

Group chats are bad at decisions. Suggestions get buried, nobody knows who already said no, and the plan quietly dies. PlanIt gives each outing one shared page: a shortlist of places, everyone's Yes / Maybe / Can't do on each one, the group's preferences, and a conversation. When it's clear what works, the host confirms a plan and everyone can copy the details.

## Features

- **Private outings.** Create an outing with a place, date, time, and timezone, then share an invite link. Only people who join can see it.
- **Shortlist and responses.** Anyone can add a place. Everyone marks each one Yes, Maybe, or Can't do, and sees who said what. Places sort by Yes, then Maybe.
- **Preferences.** Each person sets a budget range, interests, and indoor/outdoor preference, visible to the group.
- **Live conversation.** Comments and every other change show up for the whole group instantly, with no refresh.
- **Confirm and reopen.** The host locks in one place. Voting freezes, the conversation stays open, and anyone can copy a plain-text summary. The host can reopen if plans change.
- **Suggestions.** The host can ask for up to three nearby places that fit the group's interests, with the forecast for the outing time and a short explanation of why each one fits.
- **Honest about what it doesn't know.** Price, hours, and address show as "Unconfirmed" unless there's a source, and a confirmed plan says plainly that nothing is booked.

## How it works

```
Browser ──POST /api/outing/:command──▶ Worker route
                                        verifies the session, allowlists the command
                                        │
                                        ▼
                             Record room (Durable Object)
                             one command at a time:
                             read outing → apply rules → save
                                        │
                                        ▼
                             realtime update to members only
```

Built on [DeepSpace](https://docs.deep.space), which runs the app on Cloudflare Workers and Durable Objects and provides auth, realtime records, permissions, and an integration proxy.

**One record per outing, one command at a time.** Each outing is a single record. Every change (a vote, a new place, a confirm) goes through one route into the record room, which applies it inside `blockConcurrencyWhile`. Changes to the app's data never interleave, so a vote and a confirm can't race: either the vote lands first and counts, or it's refused because the plan is already confirmed. The tradeoff is that all outings share one queue. That's fine for small groups, and the fix at scale is one room per outing.

**Rules as pure functions.** Everything about who can do what lives in `src/domain/` as plain TypeScript with no I/O. `applyCommand(outing, userId, command, input, now)` returns the next state or a typed error such as `NOT_HOST` or `OUTING_FINALIZED`. The full permission matrix (every role × every action × open/confirmed) is one table-driven unit test.

**Identity comes from the session only.** User IDs sent by the browser are ignored, and there are no name fields: names come from each person's account. Clients can't write to the database directly; the collection only allows reads, and only for members.

**Suggestions pipeline.** Four steps, each a DeepSpace integration called from server code:

| Step | Integration | Behavior |
|---|---|---|
| Find the location | OpenWeather geocoding | If the location is ambiguous ("Dallas"), the host is asked to be more specific instead of guessing |
| Weather | OpenWeather forecast | The forecast entry closest to the start time, or "Forecast unavailable" |
| Places | SerpApi Google Maps search | Near the location, based on the group's interests; deduplicated, at most 3 |
| Why it fits | Anthropic Claude Haiku | Short explanations tied to each place; output is validated, and venue text is treated as data, not instructions |

Provider keys never touch the app: calls go through DeepSpace's integration proxy from server code only, and the browser can't reach the proxy. If any step fails, the rest of the app keeps working. No forecast means no weather line, and a failed explanation means places without explanations. Runs are capped at 3 per outing and 30 per day.

## Running locally

Requires Node 22.15+ and npm 11.6+.

```sh
npm install
npx deepspace auth login
npx deepspace dev start
```

Locally, suggestions replay recorded provider responses from `src/domain/suggestions/fixtures/`, so development and tests are free and repeatable. Set `PROVIDERS=live` in `.dev.vars` to make real calls.

## Tests

```sh
npx deepspace test run unit    # rules, permission matrix, suggestion pipeline (Vitest)
npx deepspace test run all     # plus API, UI, and multi-user realtime tests (Playwright)
npx tsc --noEmit && npm run lint
```

The multi-user tests need three test accounts named `Host`, `Member`, and `Outsider`:

```sh
npx deepspace test accounts create --email <name>@deepspace.test --name "<Name>" --password-stdin
```

Security and concurrency tests were checked by breaking the guard they protect and confirming they fail. For example, without the one-at-a-time room, only 6 of 20 simultaneous votes survive.

## Project layout

| Path | Contents |
|---|---|
| `src/domain/` | Business rules, validation, time handling, tally, plan summary |
| `src/domain/suggestions/` | Suggestion pipeline, live and recorded providers |
| `src/server/outing-routes.ts`, `src/server/outing-room.ts`, `worker.ts` | Command route and the serialized room |
| `src/schemas/outings-schema.ts` | The `outings` collection and its permissions |
| `src/features/outing/` | UI components, one per panel |
| `tests/`, `src/**/*.test.ts` | Playwright and Vitest tests |
| `docs/` | Specification, design decisions, and development log |

Auth, realtime, and proxy routes, the UI primitives, and the prerender setup come from the DeepSpace starter.

## Limitations and next steps

- Members can't leave an outing, and invite links don't expire.
- Forecasts only reach about 5 days ahead.
- One shared command queue for all outings; shard per outing if usage grows.
- The record room overrides one SDK method (`RecordRoom.fetch`), so SDK upgrades need a check.
- Ideas: multiple date options, invite revocation, reminders.
