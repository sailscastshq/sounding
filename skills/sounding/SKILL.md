---
name: sounding
description: >
  Sounding testing framework for Sails.js applications and The Boring JavaScript Stack — use this
  skill when writing or reviewing Sounding-powered trials, configuring `config/sounding.js`,
  working with worlds, request or visit helpers, mailbox assertions, browser-capable flows, or
  auth helpers like `login.as()`, `login.withPassword()`, and
  `auth.request.withPassword()`.
---

# Sounding

Use this skill when the task is specifically about **Sounding itself**, not just generic app testing.

Typical triggers:

- writing or reviewing tests that import `test` from `sounding`
- configuring `config/sounding.js` or `config/env/test.js` for Sounding
- using `world`, `request`, `visit`, `mailbox`, `auth`, or `login`
- migrating app-specific test glue to Sounding
- working with auth flows in Sounding-powered trials, including `User` / `userId` and `Creator` / `creatorId` apps

## Core rules

- Prefer Sounding's public surface:
  - `const { test } = require('sounding')`
  - `test('...', async ({ sails, get, visit, auth, login, page, expect }) => {})`
  - `test('...', { world: 'signed-in-user' }, async ({ request, world }) => {})`
  - `request.as(actor)`
  - `request.as('owner')` or `visit.as('owner')` after a world has loaded actor aliases
  - `auth.request.withPassword(...)`
  - `login.withPassword(...)`
  - `login.as(...)`
- Prefer fluent world builders when setup is record-shaped:
  - inside scenarios: `await create('user').trait('admin').with({ email })`
  - top-level persisted records: `await world.create('user').trait('admin').with({ email })`
  - repeated `.with()` calls merge overrides; use `.withOnly()` only when you intentionally want to use only the next overrides
- Treat hook activation as explicit and test-first. By default, Sounding only enables its Sails hook in the environments listed under `sounding.environments`, which starts as `['test']`.
- Use the app's real auth flow when auth behavior matters. If `/login` or `/magic-link` is the behavior, do not replace it with fake session plumbing.
- Use `request` for JSON and endpoint behavior, `visit()` for Inertia contracts, and browser trials only when the DOM or navigation is the behavior under test.
- Treat worlds and actors as product language, not just setup helpers. Prefer `{ world: 'scenario-name' }` when a trial has one obvious setup scenario, and use manual `await world.use()` only when the trial needs dynamic setup or multiple worlds.
- Function-based trait patches merge into the base record. Return only the fields the trait changes unless the trait genuinely needs to derive values from the base.
- Prefer Sounding factories over repeated inline model creation. If more than one test file creates the same kind of record by hand, repeated uniqueness helpers, or repeated setup vocabulary, stop and add or reuse a `tests/factories` factory before writing more ad hoc setup.
- Use `sequence()` in factories for deterministic unique emails, slugs, tokens, invoice numbers, and similar values. Do not keep reintroducing `Date.now()` plus random helpers in test bodies.
- Use traits for meaningful variants such as `admin`, `subscriber`, `unverified`, or `published`. Use scenarios when the setup is a business situation, not just a record shape.
- Follow the current factory-builder shape: `world.create('user').trait('admin')` is fluent and persisted; `world.build('user', {}, { traits: ['admin'] })` returns an immediate preview object.

## Factory Guardrails

Use this graduation path when test data starts to repeat:

- One-off setup may stay inline while it belongs to one trial.
- Repeated primitive record shape belongs in `tests/factories`.
- Repeated business situation belongs in `tests/scenarios`.
- Repeated uniqueness belongs in `sequence()`, not in test-body helpers.
- Repeated auth record setup belongs in a factory, while auth behavior should still use the app's real `login` or `auth` flow.

When repeated setup appears, move the primitive record shape into a factory first:

```js
// tests/factories/creator.js
module.exports = ({ defineFactory }) =>
  defineFactory('creator', ({ sequence }) => ({
    email: sequence('creator-email', (n) => `creator-${n}@example.com`),
    fullName: 'Test Creator',
    emailStatus: 'verified'
  })).trait('unverified', {
    emailStatus: 'unverified'
  }).trait('withValidVerificationCode', () => ({
    emailVerificationCode: '111111'
  }))
```

Then trials and scenarios should speak in product terms:

```js
const creator = await create('creator').trait('unverified')
```

For top-level world usage, persisted creation is fluent too:

```js
const creator = await world.create('creator')
  .trait('unverified')
  .trait('withValidVerificationCode')
```

Do not repeat raw auth-shaped setup like this across files:

```js
const creator = await sails.models.creator.create({
  email: `creator-${Date.now()}-${Math.random()}@example.com`,
  fullName: 'Test Creator',
  emailStatus: 'verified'
}).fetch()
```

Put the record shape and deterministic uniqueness in the factory, then let the trial focus on behavior:

```js
const creator = await create('creator')
await login.as(creator)
```

## Read next

Read only the page that matches the work:

- Getting started and suite shape:
  `/Users/koo/Gringotts/687/docs.sailscasts.com/docs/sounding/getting-started.md`
- Auth helpers and actor conventions:
  `/Users/koo/Gringotts/687/docs.sailscasts.com/docs/sounding/auth-and-actors.md`
- JSON and endpoint trials:
  `/Users/koo/Gringotts/687/docs.sailscasts.com/docs/sounding/testing-json-apis.md`
- Browser-capable trials:
  `/Users/koo/Gringotts/687/docs.sailscasts.com/docs/sounding/browser-testing.md`
- Runtime and configuration:
  `/Users/koo/Gringotts/687/docs.sailscasts.com/docs/sounding/how-it-works.md`
  `/Users/koo/Gringotts/687/docs.sailscasts.com/docs/sounding/configuration.md`
