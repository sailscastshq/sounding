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
  - `request.as(actor)`
  - `auth.request.withPassword(...)`
  - `login.withPassword(...)`
  - `login.as(...)`
- Treat hook activation as explicit and test-first. By default, Sounding only enables its Sails hook in the environments listed under `sounding.environments`, which starts as `['test']`.
- Use the app's real auth flow when auth behavior matters. If `/login` or `/magic-link` is the behavior, do not replace it with fake session plumbing.
- Use `request` for JSON and endpoint behavior, `visit()` for Inertia contracts, and browser trials only when the DOM or navigation is the behavior under test.
- Treat worlds and actors as product language, not just setup helpers.

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
