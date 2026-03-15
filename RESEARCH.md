# Sounding

## Working thesis

Sounding is a testing framework for Sails applications and The Boring JavaScript Stack.

It should make it feel natural to test:
- helpers and business logic
- actions, endpoints, and JSON APIs
- Inertia responses
- authentication flows
- email flows
- browser journeys
- sockets, jobs, payments, uploads, and webhooks over time

The key idea is simple:

**Use the native Node.js test runner, use Playwright for browser work, and wrap both in a Sails-native runtime that makes realistic tests easy to write and easy to trust.**

This should feel less like "yet another framework" and more like the missing test home for everything TBJS already does.

## Why the name

Sounding is the act of measuring depth before you commit the ship.

It is how mariners probe unknown waters, verify what is safe, and learn what lies beneath the surface.

That maps naturally to testing.

Sounding suggests:
- probing the system
- measuring the unknown
- learning before committing
- confidence before open water

It is also:
- one word
- maritime without being too cute
- broad enough for unit, integration, endpoint, and browser testing
- broad enough to grow into the full Sails-native testing story

## The problem we are actually solving

The TBJS testing story is close, but still fragmented.

Today we have pieces:
- `node:test` for unit-style tests
- Playwright for browser flows
- `inertia-sails/test` for response assertions today
- `getSails()` patterns for loading the app in tests
- ad hoc seeding and fixture code per application

What we do **not** have yet is a coherent testing runtime that feels native to Sails.

Current pain points:
- tests often need too much setup ceremony
- data setup is repetitive and not expressive enough
- E2E and app boot orchestration can get ugly fast
- `sails-disk` and multi-process test setups collide in painful ways
- realistic auth, email, and payment flows are still too manual to test cleanly
- people are tempted to add app-code test hooks just to make tests possible

The missing thing is not just a test runner.

The missing thing is an **elegant testing story**.

## Product goals

Sounding should be:
- unmistakably Sails-native
- expressive enough for product-behavior tests
- boring to maintain
- delightful to write
- credible for API-only apps, Inertia apps, and browser-heavy apps

## Design principles

### 1. Native first
Sounding should build on the native Node.js test runner, not compete with it.

### 2. Hook first
Sounding should be a Sails hook first and a CLI second.

### 3. Sails-aware, not Sails-entangled
It should understand helpers, actions, policies, sessions, Waterline, Inertia, mail, sockets, uploads, and jobs.
But it should not force awkward test-only app code.

### 4. Tests own test data
Factories, traits, scenarios, and fixtures should live under `tests/`, not in the app runtime.

### 5. One live runtime per browser flow
For E2E, there should be one real app instance and one isolated test datastore. No shadow app instances fighting the same datastore.

### 6. Good datastore defaults
Sounding should respect normal Sails test configuration first.

By default, Sounding should manage a temporary `sails-sqlite` datastore under `.tmp/db`.
When teams want stronger isolation with less ceremony, Sounding should be able to manage a temporary `sails-sqlite` datastore per run or per worker.

The helper surface should mirror Sails itself: `sails.helpers.user.signupWithTeam(inputs)` should be the happy path.

### 7. Realistic over synthetic
The goal is not mocking everything. The goal is real flows with as little fake plumbing as possible.

### 8. Minimal magic
The best APIs should feel obvious. The framework should save time, not hide too much.

### 9. Great failure output
When a test fails, the developer should know:
- what world was created
- what request or browser step failed
- what actor was involved
- what the relevant app state was

## Hook-first architecture

Sounding should be a **Sails hook first** and a **CLI second**.

### Canonical runtime surfaces
- `sails.hooks.sounding` - internal hook runtime
- `sails.sounding` - ergonomic public alias for app and test usage
- `config/sounding.js` - the primary configuration surface

### What we should not do
- we should **not** split the mental model between `sails.test` and `sails.sounding`
- we should **not** use `config/test.js` as the main Sounding config namespace

`config/sounding.js` is the Sails-native answer because it behaves like every other serious subsystem in the ecosystem:
- `config/mail.js`
- `config/quest.js`
- `config/clearance.js`
- `config/shipwright.js`

### Config shape

```js
// config/sounding.js
module.exports.sounding = {
  world: {
    factories: 'tests/factories',
    scenarios: 'tests/scenarios',
    seed: 1337,
  },

  datastore: {
    mode: 'managed',
    identity: 'default',

    managed: {
      adapter: 'sails-sqlite',
      isolation: 'worker',
    },
  },

  browser: {
    enabled: true,
    baseUrl: 'http://127.0.0.1:3333',
    projects: ['desktop'],
  },

  mail: {
    capture: true,
  },

  request: {
    transport: 'virtual',
  },

  auth: {
    defaultActor: 'guest',
  },
}
```

### Default behavior

Sounding should ship with calm, predictable defaults:
- `datastore.mode = 'managed'`
- `datastore.identity = 'default'`
- `datastore.adapter = 'sails-sqlite'`
- `datastore.isolation = 'worker'`
- `world.factories = 'tests/factories'`
- `world.scenarios = 'tests/scenarios'`
- `mail.capture = true`
- `request.transport = 'virtual'`
- `browser.projects = ['desktop']`

Environment-specific overrides should still live in `config/env/test.js`, but `config/sounding.js` should be the home of the Sounding subsystem itself.

## The core mental model

Sounding should feel like this:

- **App**: a booted Sails application under test
- **World**: a realistic, named set of data created for a test
- **Actor**: a user role in that world
- **Trial**: the test itself
- **Mailbox**: captured outbound mail for assertions
- **Browser**: Playwright page and context helpers

The tests should read like behavior, not setup plumbing.


## What a trial means

A **trial** is the smallest meaningful behavior Sounding asks your app to prove.

It is one named claim about how the product should behave in a real Sails runtime.

Examples:

- a guest is redirected from the dashboard
- a subscriber can read a members-only issue
- a publisher can save a draft
- requesting a magic link sends a usable email

This stays close to the mental model developers already know from Jest, Pest, and the native Node test runner: one file groups related checks, and each named check proves one thing.

Sounding keeps the familiar `test()` API, but uses **trial** as the conceptual word because the framework is designed around product behaviors, worlds, actors, and realistic runtime conditions.

A good trial should be:

- named after behavior, not implementation
- small enough to understand quickly
- real enough to trust
- written at the right layer for what it is proving

## What a trial context means

A **trial context** is the single object passed into `test()`.

It should always have one clear center of gravity: `sails`.

That means:
- `sails` is the primary runtime object
- app-native surfaces stay where Sails developers expect them
- Sounding capabilities live under `sails.sounding`
- a few top-level aliases like `get()` and `post()` can exist for convenience
- `expect` is always present

This is important because Sounding should not invent a second pretend app model.
The trial context should feel like a real Sails app that has been furnished for testing.

## Design patterns for Sounding

These are the patterns that should keep Sounding elegant as it grows.

### 1. Runtime-rooted context

Every trial should start from the real app runtime:

- `sails` is the primary object
- `sails.helpers`, `sails.models`, `sails.config`, and `sails.hooks` stay canonical
- Sounding-specific capabilities hang off `sails.sounding`

This keeps Sounding from inventing a second fake app model.

### 2. Capability aliases, not parallel abstractions

Top-level helpers like `get()`, `post()`, and `visit()` should exist as ergonomic shortcuts.

But they should always map back to a canonical home like:

- `sails.sounding.request.get()`
- `sails.sounding.request.post()`
- `sails.sounding.visit()`

That gives us convenience without splitting the mental model.

### 3. Worlds as business situations

Worlds should describe business state, not just rows in a datastore.

That means:

- scenarios should read like product situations
- actors should be role-based
- tests should load a world instead of assembling ten unrelated records

### 4. Calm defaults, explicit escalation

Sounding should respect the app before it tries to be clever:

- manage a temporary `sails-sqlite` datastore by default
- use `config/env/test.js` as the app's truth
- let teams opt into `inherit` or `external` only when they truly need them

This keeps the first experience simple and the advanced experience deliberate.

### 5. Progressive disclosure

The beginner path should be tiny:

- `test()`
- `sails`
- `expect`

Then as the need grows, the trial can reach for:

- `get()` / `post()`
- `sails.sounding.world`
- `sails.sounding.mailbox`
- `page`

We should not force complexity on the first test.

### 6. Lazy heavyweight surfaces

The heaviest tools should only boot when a trial really needs them.

That includes:

- Playwright browser state
- mailbox capture integrations
- richer Inertia helpers

This keeps helper and endpoint trials fast without creating a separate API universe.

### 7. One assertion style

`expect` should be the primary assertion API everywhere.

That means the same mental style for:

- helpers
- JSON APIs
- Inertia responses
- mail
- browser assertions

## What is a world?

A world should be documented and taught as one of Sounding's signature ideas, not a side feature.

The docs need to make these distinctions obvious:

- a **factory** builds one kind of record
- a **scenario** composes factories into a named business situation
- an **actor** is the role a trial operates through inside that situation
- the resulting **world** is the readable state the trial uses

The best worlds should feel like product language, not seed-script language.


A **world** is the named, deterministic business state that a trial lives inside.

A world includes:
- actors such as guests, publishers, subscribers, or admins
- records like issues, subscriptions, teams, unlocks, invoices, or comments
- the relationships between those records
- the current business situation the trial cares about

A world is not just a fixture.

It is a reusable description of a product situation.

That lets tests say:
- "load the subscriber who has access to a gated issue"
- "load the publisher with a draft issue"
- "load the guest who requested a magic link"

instead of rewriting ten lines of setup every time.

## The built-in world engine

Sounding should own its own world engine.

That means factories, traits, states, scenarios, seeds, and world composition should live inside Sounding itself.

This keeps the testing story elegant:
- one package
- one mental model
- one configuration surface
- one documentation story
- one runtime that understands app boot, data setup, mail capture, and browser execution together

### The world engine should own
- factories
- traits and states
- sequences
- deterministic seeds
- build vs create APIs
- relationship graphs
- scenarios that return readable world objects

### The world engine should support
- `tests/factories`
- `tests/scenarios`
- `defineFactory()`
- `defineScenario()`
- `build()`
- `buildMany()`
- `create()`
- `createMany()`
- `trait()` / `state()`
- `seed()`
- `afterBuild()` / `afterCreate()`
- `world.use()`

### The world engine should not own
- Sails app boot lifecycle
- request clients
- Playwright lifecycle
- mail capture runtime
- worker and datastore orchestration

Those remain the job of the Sounding runtime around it.

## What Sounding should cover

### Helper trials
- helpers
- pure business logic
- policy-like checks in isolation
- model-adjacent rules

### Endpoint and action trials
- guest vs authenticated access
- redirects
- JSON and HTML responses
- status codes and headers
- action inputs and exits
- policy interaction
- webhooks and provider callbacks

### Inertia trials
- component name assertions
- prop assertions
- nested prop paths
- shared props
- validation and redirect behavior
- partial reload behavior

### Browser trials
- sign in flows
- onboarding
- editor flows
- gated-content flows
- checkout and subscription handoff
- mobile navigation

### Mail trials
- magic link emails
- password reset emails
- invite emails
- billing and transactional notifications

### Future layers
- sockets
- quest jobs
- uploads
- passkey/WebAuthn flows
- payment simulation

## The API surface we want

### Core
- `defineConfig()`
- `test()`
- `describe()`
- `beforeEach()`
- `afterEach()`
- `beforeAll()`
- `afterAll()`
- `dataset()`
- `expect()`

### One trial API
- `test()` is the primary public entrypoint
- the callback receives a single context object
- `sails` is the canonical runtime surface
- transport aliases like `get()`, `post()`, and later `visit()` are convenience helpers
- browser-capable trials can additionally destructure `page` when needed

### Runtime surfaces
- `sails.sounding.boot()`
- `sails.sounding.lower()`
- `sails.sounding.world.use()`
- `sails.helpers.user.signupWithTeam()`
- `sails.sounding.mailbox.latest()`
- `sails.sounding.mailbox.clear()`

## Assertion style

Sounding should prefer `expect` as the primary assertion API.

That choice matters because it gives the framework one clear, readable style across helper, endpoint, Inertia, mail, and browser trials.

`assert` from Node can remain available as an escape hatch, but it should not be the main story.

### Core matchers
- `toBe()`
- `toEqual()`
- `toContain()`
- `toMatch()`
- `toBeTruthy()`
- `toBeFalsy()`
- `toBeDefined()`

### Sails-native matchers
- `toHaveStatus()`
- `toRedirectTo()`
- `toHaveJsonPath()`
- `toHaveHeader()`
- `toExit()`
- `toBeInertiaPage()`
- `toHaveProp()`
- `toHaveValidationError()`
- `toHaveSentMail()`

## The API-only testing story

Sounding has to be excellent for JSON and endpoint-heavy apps.

This is not a side quest.
It is part of the core product.

### One API, multiple transports

Sounding should keep one public request story while supporting more than one transport underneath.

That means `get()`, `post()`, `visit()`, and `sails.sounding.request` should feel stable even if the underlying transport changes.

The two important transports are:

- **virtual** requests, powered by `sails.request()`
- **HTTP** requests, powered by a real listening app over the network

### Why `sails.request()` matters

`sails.request()` is one of the most interesting native building blocks Sounding can lean on.

It already gives Sails a virtual request interpreter, and its documented sweet spot is faster-running unit and integration tests.

That makes it a strong fit for:

- fast endpoint trials
- action-like request flows
- Inertia response assertions that care about server-side contracts
- situations where lifting a full HTTP server is unnecessary

### Where virtual requests should not be the whole story

The Sails docs are also clear that virtual requests are not identical to true HTTP requests.

That matters because:

- body parsing is simpler
- Express HTTP middleware is not fully in play
- static assets are not involved
- some middleware-sensitive behaviors need real HTTP parity

So Sounding should not pretend `sails.request()` is the answer to everything.

### The right transport strategy

The elegant answer is:

- keep one request API
- choose the transport underneath based on the kind of trial
- let the app or the trial opt into stricter parity when needed
- make the override order obvious and boring

A good switching story looks like:

1. per-call override, such as `get('/health', { transport: 'http' })`
2. per-trial override, such as `test('...', { transport: 'http' }, ...)`
3. the default from `config/sounding.js`
4. a scoped client when a trial wants to stay explicit: `sails.sounding.request.using('http')`

So a good default would be:

- use **virtual transport** for fast app-aware endpoint and Inertia-style trials when that is sufficient
- use **HTTP transport** for browser flows and for endpoint trials that need true HTTP behavior

That gives Sounding speed without lying about what is actually being exercised.

### `test()` for endpoint behavior
Use `test()` for endpoint behavior:
- status codes
- headers
- redirects
- JSON bodies
- policy interaction
- guest vs authenticated access

```js
import { test } from 'sounding'

test('guest gets 401 on a private JSON endpoint', async ({
  get,
  expect,
}) => {
  const response = await get('/api/issues')

  expect(response).toHaveStatus(401)
})
```

### `test()` for action contracts
Use `test()` when the action contract matters more than raw HTTP.

```js
import { test } from 'sounding'

test('issues/publish rejects incomplete drafts', async ({
  action,
  expect,
}) => {
  const result = await action('issues/publish', { id: 12 })

  expect(result).toExit('invalid')
})
```

## The Inertia testing story

Inertia responses deserve their own first-class lane.

They are not just JSON and not just browser pages.

### `test()` for Inertia responses
Use `test()` with `visit()` and Inertia-aware matchers for:
- component assertions
- prop assertions
- nested prop paths
- shared props
- validation and redirect behavior
- partial reloads

```js
import { test } from 'sounding'

test('pricing page returns the correct component and props', async ({
  visit,
  expect,
}) => {
  const page = await visit('/pricing')

  expect(page).toBeInertiaPage('billing/pricing')
  expect(page).toHaveProp('plans')
  expect(page).toHaveProp('auth.user', null)
})
```

And for partial reloads:

```js
test('dashboard can reload only notifications', async ({ visit, expect }) => {
  const page = await visit('/dashboard', {
    component: 'dashboard/index',
    only: ['notifications'],
    reset: ['sidebar'],
  })

  expect(page).toBeInertiaPage('dashboard/index')
  expect(page).toHaveProp('notifications')
})
```

## The mail testing story

Sounding should integrate cleanly with the Sails mail story and make mailbox capture feel native.

For `0.0.1`, the right implementation is simple and honest:
- wrap `sails.helpers.mail.send` when a trial boots
- capture the real inputs that flow through `sails-hook-mail`
- render the template preview when a template is used
- store normalized messages in `sails.sounding.mailbox`
- restore the original helper when the trial ends

That keeps the story Sails-native without inventing a fake mail subsystem.

A mail trial should let a developer say:

```js
import { test } from 'sounding'

test('magic link sends a usable email', async ({
  sails,
  auth,
  expect,
}) => {
  await auth.requestMagicLink('reader@example.com')

  const email = await sails.sounding.mailbox.latest()

  expect(email.to).toContain('reader@example.com')
  expect(email.subject).toContain('Sign in')
  expect(email.html).toContain('/magic-link/')
})
```

That is the level of clarity we want.

And the captured message should be rich enough to assert on:
- `to`, `cc`, and `bcc`
- `subject`, `from`, and `replyTo`
- rendered `html` and `text`
- `template` and `templateData`
- extracted links like `ctaUrl`
- `status` for sent vs failed deliveries
- `error` details when delivery fails

## The browser testing story

Sounding should use Playwright for browser work, but it should make browser trials feel like the natural top layer of the same testing story.

A browser trial should have access to:
- Playwright `page`
- app-aware auth helpers like `login.as()`
- worlds and actors
- mobile projects as first-class citizens

## What we borrow from Pest

The best thing to borrow from Pest is not PHP syntax.
It is the product feel.

We should borrow:
- one beautiful home for testing
- low ceremony
- coherent configuration
- first-class datasets and hooks
- browser testing as part of the same product, not a bolt-on
- reporting that feels like a feature

We should not borrow:
- too much syntax sugar
- magic that fights the host language
- abstractions that hide Node so much that debugging gets harder

Sounding should feel like:
- Pest philosophy
- Node honesty
- Sails-native ergonomics

## The first credible release

`0.0.1` should prove the story is real, elegant, and useful.

It should include:
- hook loading and `sails.sounding`
- `config/sounding.js`
- datastore inheritance and managed `sails-sqlite` orchestration
- `test()` for helpers, endpoints, JSON, Inertia, and mail
- `test()` with `page` when the browser matters
- a built-in world engine
- mailbox capture
- a small example app and docs

It does not need to do everything at once.
It does need to make developers believe the rest of the vision is inevitable.

## Migration bar: replace the African Engineer test suite

Sounding should be able to replace the current test story in `/Users/koo/Gringotts/687/africanengineer.com` without asking the app to invent more test plumbing.

### What the current suite looks like

The current African Engineer test setup includes:

- unit helper tests using `node:test` + `getSails()`
- Playwright page smoke tests for public pages
- guest protection tests for login redirects
- magic-link browser tests that manually issue tokens through a test helper module
- issue-access browser tests that seed users, subscriptions, unlocks, and bookmarks through a custom support file
- publisher editor tests that seed a draft issue and then drive the browser editor

Today, that setup relies on:

- `tests/util/get-sails.js`
- `tests/e2e/support/test-db.cjs`
- Playwright web-server orchestration in `playwright.config.js`
- custom fixture builders and explicit database cleanup

Sounding should absorb that burden.

### What Sounding must provide to replace it cleanly

#### 1. One primary `test()` API

The public entrypoint should stay:

- `test()`

And the trial context should be able to power:

- helper tests
- endpoint tests
- Inertia tests
- mail assertions
- browser flows when `page` is needed

#### 2. A Sails-centered trial context

Every trial should be able to reach for:

- `sails`
- `expect`
- `get()`, `post()`, `put()`, `patch()`, `del()`
- `visit()`
- browser-capable trials should additionally be able to destructure `page`

The canonical app surfaces should remain:

- `sails.helpers`
- `sails.models`
- `sails.config`
- `sails.hooks`

And Sounding-specific surfaces should remain under:

- `sails.sounding.world`
- `sails.sounding.request`
- `sails.sounding.mailbox`

#### 3. Virtual request transport by default

For non-browser trials, Sounding should default to a request transport powered by `sails.request()`.

That gives us a Sails-native replacement for most current endpoint-style and Inertia-style needs without bringing in `supertest`.

It must normalize responses well enough for:

- `toHaveStatus()`
- `toRedirectTo()`
- `toHaveHeader()`
- `toHaveJsonPath()`
- `toBeInertiaPage()`
- `toHaveProp()`

#### 4. True HTTP/browser capability when parity matters

Sounding still needs real browser support for the flows that genuinely require it:

- login journeys
- gated issue reading in the browser
- editor interactions
- mobile navigation

That means browser-capable trials need:

- `page`
- web-server orchestration
- a clear way to combine browser behavior with worlds and actors

#### 5. A built-in world engine strong enough to replace `tests/e2e/support/test-db.cjs`

Sounding should support factories and scenarios under `tests/` that can express the current African Engineer fixtures, including:

- users with roles like publisher, subscriber, unlocked reader, and guest
- teams and memberships
- subscriptions
- issue unlocks
- bookmarks
- published and draft issues

Concrete scenarios Sounding should be able to express early:

- `issue-access`
- `publisher-editor`
- `guest-protection`
- `magic-link-auth`

#### 6. Mailbox capture that removes the need for manual magic-link token helpers

African Engineer currently issues magic-link tokens by reaching into app internals from `tests/e2e/support/test-db.cjs`.

Sounding should replace that with a better story:

- request the magic link through the real app behavior
- capture the resulting mail through `sails.sounding.mailbox`
- extract the sign-in URL from the captured message
- continue the browser flow from there

That is more realistic and removes custom token-plumbing from app tests.

#### 7. Simple auth helpers for browser and endpoint trials

To replace the current repeated login setup, Sounding should offer lightweight auth helpers built around real app behavior.

At minimum, it should support:

- login via captured magic link
- acting as a known seeded actor in request-driven trials

#### 8. Enough ergonomics to replace the current unit helper tests too

The helper tests in African Engineer should become straightforward Sounding trials like:

```js
const { test } = require('sounding')

test('capitalize helper works', async ({ sails, expect }) => {
  expect(sails.helpers.capitalize('hello')).toBe('Hello')
})
```

That means Sounding should feel just as good for tiny tests as for browser journeys.

### The concrete migration target

Sounding is ready to replace the current African Engineer suite when we can remove or obsolete:

- `/Users/koo/Gringotts/687/africanengineer.com/tests/util/get-sails.js`
- `/Users/koo/Gringotts/687/africanengineer.com/tests/e2e/support/test-db.cjs`
- the app-specific seeding and magic-link plumbing around Playwright
- the idea that helper, endpoint, Inertia, mail, and browser tests need separate mental models

### The first migration phases

#### Phase 1

Replace:

- unit helper tests
- guest-protection endpoint-style tests
- public page smoke tests that do not need rich browser fixtures

#### Phase 2

Replace:

- issue-access tests
- magic-link auth tests
- basic dashboard/member flows

#### Phase 3

Replace:

- publisher editor tests
- the remaining browser-heavy flows
- mobile navigation coverage

If Sounding can carry that migration, then it is not just a nice idea.
It is a credible testing framework for real Sails applications.
