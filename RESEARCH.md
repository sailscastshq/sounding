# Sounding

## Working thesis

Sounding is a testing framework for Sails applications and The Boring JavaScript Stack.

It should make it feel natural to test:
- helpers and business logic
- actions and endpoints
- Inertia responses
- authentication flows
- email flows
- browser journeys
- sockets, jobs, payments, and webhooks over time

The key idea is simple:

**Use the native Node.js test runner, use Playwright for browser work, and wrap both in a Sails-aware runtime that makes realistic tests easy to write and easy to trust.**

This should feel less like "yet another framework" and more like the missing test home for everything TBJS already does.

## Why the name

Sounding is the act of measuring depth before you commit the ship.

It is how mariners probe unknown waters, verify what is safe, and learn what lies beneath the surface.

That maps naturally to testing.

Sounding gives us a name that suggests:
- probing the system
- measuring the unknown
- learning before committing
- confidence before open water

It is also:
- one word
- maritime without being too cute
- broad enough for unit, integration, endpoint, and browser testing
- distinct from Captain Vane, which can remain the data/scenario engine underneath

## The problem we are actually solving

The TBJS testing story is close, but still fragmented.

Today we have pieces:
- `node:test` for unit-style tests
- Playwright for browser flows
- `inertia-sails/test` for response assertions
- `getSails()` patterns for loading the app in tests
- ad hoc seeding and fixture code per application

What we do **not** have yet is a coherent testing runtime that feels native to Sails.

Current pain points:
- tests often need too much setup ceremony
- data setup is repetitive and not expressive enough
- E2E and app boot orchestration can get ugly fast
- `sails-disk` and multi-process test setups collide in painful ways
- realistic auth/email/payment flows are still too manual to test cleanly
- people are tempted to add app-code test hooks just to make tests possible

The missing thing is not just a test runner.

The missing thing is an **elegant testing story**.

## Design principles

### 1. Native first
Sounding should build on the native Node.js test runner, not compete with it.

### 2. Sails-aware, not Sails-entangled
It should understand helpers, actions, policies, sessions, Waterline, Inertia, mail, sockets, and jobs.
But it should not force awkward test-only app code.

### 3. Tests own test data
Factories, traits, scenarios, and fixtures should live under `tests/`, not in the app runtime.

### 4. One live runtime per browser flow
For E2E, there should be one real app instance and one isolated test database. No shadow app instances fighting the same datastore.

### 5. Disposable databases by default
For serious end-to-end or endpoint testing, the default should be a temporary SQLite database per run or per worker, stored under `/tmp`, not `sails-disk`.

### 6. Realistic over synthetic
The goal is not mocking everything. The goal is real flows with as little fake plumbing as possible.

### 7. Minimal magic
The best APIs should feel obvious. The framework should save time, not hide too much.

### 8. Great failure output
When a test fails, the developer should know:
- what world was created
- what request or browser step failed
- what the relevant app state was

## What Sounding should cover

### Unit / helper tests
- helpers
- pure business logic
- model-adjacent logic
- policies when run in isolation

### Endpoint / action tests
- guest vs authenticated access
- redirects
- JSON and HTML responses
- action inputs/exits
- policy interaction

### Inertia integration tests
- component name assertions
- prop assertions
- partial reload behavior
- validation and redirect behavior

### Browser / E2E tests
- sign in flows
- onboarding
- editor flows
- gated-content flows
- checkout and subscription handoff
- mobile navigation

### Mail tests
- magic link emails
- password reset emails
- invite emails
- webhook-triggered notifications

### Future layers
- sockets
- quest jobs
- webhook simulation
- uploads
- passkey/WebAuthn flows

## The core mental model

Sounding should feel like this:

- **App**: a booted Sails application under test
- **World**: a realistic set of data created for a test
- **Actor**: a user role in that world
- **Trial**: the test itself
- **Mailbox**: captured outbound mail for assertions
- **Browser**: Playwright page/context helpers

The tests should read like behavior, not setup plumbing.

## What Captain Vane should become

Captain Vane should not disappear.

Captain Vane should become the data and scenario engine that powers Sounding.

### Captain Vane should own
- factories
- traits / states
- sequences
- deterministic seeds
- build vs create APIs
- relationship graphs
- scenarios that return readable world objects

### Captain Vane v2 should support
- `tests/factories`
- `tests/scenarios`
- `build()`
- `buildMany()`
- `create()`
- `createMany()`
- `state()` / `trait()`
- `seed()`
- `afterBuild()` / `afterCreate()`

### Captain Vane should not own
- Sails app boot lifecycle
- request clients
- Playwright lifecycle
- mail capture runtime
- worker/database orchestration

That is Sounding’s job.

## What Sounding should own

### App lifecycle
- boot Sails once for the test mode being used
- manage ports and process lifecycle
- expose helpers for in-process and browser-driven testing

### Database lifecycle
- create one isolated SQLite database per run or per worker by default
- configure Sails to use it automatically in test mode
- tear it down cleanly
- support Postgres later for heavier projects

### Runtime adapters
- request client for endpoint/action tests
- Inertia assertion helpers
- Playwright integration for browser tests
- mailbox capture
- auth/session helpers
- socket client helpers later
- job helpers later

### Ergonomic API surface
The top-level API should make Sails concepts first-class without inventing a giant DSL.

## Proposed API direction

### Helper test
```js
import { test } from 'drydock'

test.helper('signupWithTeam creates a team and membership', async ({ helper, expect }) => {
  const result = await helper('user.signupWithTeam', {
    fullName: 'Kelvin O',
    email: 'kelvin@example.com',
    tosAcceptedByIp: '127.0.0.1',
  })

  expect(result.user.email).toBe('kelvin@example.com')
})
```

### Endpoint test
```js
import { test } from 'drydock'

test.endpoint('guest is redirected from dashboard', async ({ request, expect }) => {
  const response = await request.get('/dashboard')
  expect(response).toRedirectTo('/login')
})
```

### Inertia test
```js
import { test } from 'drydock'

test.inertia('pricing page returns the expected component and props', async ({ visit, expect }) => {
  const page = await visit('/pricing')
  expect(page).toBeInertiaPage('billing/pricing')
})
```

### Browser test
```js
import { test } from 'drydock'

test.browser('subscriber can read a members-only issue', async ({ page, world, login, expect }) => {
  await world.use('issue-access')
  await login.as('subscriber', page)

  await page.goto(world.issues.gated.url)

  await expect(page.getByText(world.issues.gated.fullText)).toBeVisible()
})
```

### Mail test
```js
import { test } from 'drydock'

test.mail('magic link sends a usable email', async ({ mailbox, expect }) => {
  const email = await mailbox.latest()
  expect(email.subject).toContain('Sign in')
  expect(email.ctaUrl).toMatch(/magic-link/)
})
```

## Database strategy

This is the most important runtime choice.

### What we should avoid
- `sails-disk` for serious endpoint/E2E tests
- multi-process setups that touch the same datastore files
- test-only HTTP routes just for seeding state

### Recommended default
For `0.0.1`, Sounding should default to:
- **temporary SQLite**
- one database file per run or per worker
- stored under something like `/tmp/drydock/<run-id>/<worker-id>.sqlite`

Why SQLite first:
- TBJS already leans on SQLite as a sensible default
- no external services required
- much more realistic than `sails-disk`
- transactions and relational behavior are available
- dramatically better for E2E orchestration

Later, Sounding can support Postgres for teams that want parity with production.

## Test data location

A strong rule:

**All test data definitions live under `tests/`.**

Suggested structure:

```text
tests/
  factories/
    user.js
    issue.js
    subscription.js
  scenarios/
    issue-access.js
    publisher-editor.js
    reader-dashboard.js
  e2e/
  integration/
  unit/
```

This keeps product code clean and keeps the testing world owned by the tests.

## What 0.0.1 should actually ship

The first release should be sharp, not huge.

### 0.0.1 goals
- native Node test runner integration
- Playwright browser integration
- Sails app boot manager
- temporary SQLite database lifecycle
- `test.helper()`
- `test.endpoint()`
- `test.browser()`
- basic auth helpers for common roles
- mailbox capture for log mailers / test mailers
- Captain Vane adapter for factories/scenarios
- one reference TBJS example app

### 0.0.1 non-goals
- custom assertion engine from scratch
- sockets and jobs on day one
- full payment/webhook simulation on day one
- WebAuthn passkey coverage on day one
- every possible Sails hook abstraction immediately

The 0.0.1 bar is: **credible, elegant, useful, and real.**

## What a good 0.0.1 feels like

A developer should be able to:
- install Sounding
- point it at a Sails app
- define factories and scenarios under `tests/`
- run helper tests, endpoint tests, and browser tests with one coherent mental model
- avoid touching product code to make tests possible

If we achieve that, the story is already strong.

## Roadmap after 0.0.1

### 0.1.x
- richer Captain Vane trait/state system
- `test.inertia()`
- storage-state auth helpers
- mobile/browser project presets
- better response and redirect assertions

### 0.2.x
- sockets
- quest jobs
- webhooks
- upload helpers
- payment flow harnesses

### 0.3.x
- passkey/WebAuthn helpers
- scenario debugger / world inspector
- better watch mode and failure reports
- richer CI output

## Risks and sharp edges

### 1. Too much magic
If Sounding tries to hide too much, it will become hard to trust.

### 2. App boot complexity
Sails boot and teardown need to be extremely predictable.

### 3. Database abstraction drift
We should not pretend SQLite and Postgres are identical. We should be honest about the tradeoffs.

### 4. Overcoupling to one stack shape
It should be opinionated for TBJS, but still flexible enough for real Sails apps.

### 5. Captain Vane boundary blur
If Sounding and Captain Vane overlap too much, both products get muddy.

## Success criteria

Sounding is working if:
- a new TBJS user can write meaningful tests quickly
- endpoint and E2E tests do not require test-only app routes
- browser tests can run against one isolated app + one isolated database cleanly
- data setup reads like business scenarios, not SQL dumps
- failures are easier to understand than today

## Short naming shortlist

### Chosen: Sounding
Best balance of elegance, meaning, and distinctiveness.

### Alternatives considered
- **Drydock** — strong and concrete, but more about environment than probing behavior
- **Seatrial** — very direct, but less elegant as a brand
- **Harbor** — strong, but feels more like infra than testing
- **Trials** — clear, but less distinctive

## Final take

Sounding should become the elegant testing story for TBJS.

Captain Vane should power the world-building underneath it.

If we get the boundaries right, we do not just end up with a nicer API.
We end up with a testing system that actually matches how Sails applications are built.
