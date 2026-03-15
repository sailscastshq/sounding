# Sounding 0.0.1

Sounding `0.0.1` is the first public release of a Sails-native testing framework for Sails applications and The Boring JavaScript Stack.

This release establishes the core shape of Sounding:

- one `test()` API
- a Sails-centered trial context
- request-level trials through `get()`, `post()`, and friends
- Inertia-aware trials through `visit()`
- browser-capable trials when `{ browser: true }` is present
- managed SQLite test datastores under `.tmp/db` by default
- real mail capture through the Sails mail path
- worlds, factories, scenarios, and actors as first-class testing concepts

## Highlights

### One testing story

Sounding keeps the native Node test runner feel, but gives Sails apps one coherent runtime:

- `sails` at the center of every trial
- `sails.helpers`, `sails.models`, `sails.config`, and `sails.hooks` where you expect them
- `sails.sounding` for Sounding-specific capabilities

### Native request and Inertia support

Sounding supports both fast virtual requests and real HTTP, while preserving one request API.

- `get()`, `post()`, `put()`, `patch()`, `del()`
- `visit()` for Inertia responses and page contracts
- transport switching when true HTTP parity matters

### Browser-capable trials

When the browser actually matters, Sounding can furnish browser context directly inside `test()`:

- `page`
- `browser`
- `browserContext`
- auth helpers and browser flows on the same test surface

### Built for Sails conventions

Sounding embraces Sails concepts instead of asking Sails apps to translate into a different testing mental model:

- trials
- trial context
- worlds
- actors
- scenarios
- datastores

### Convention over configuration

Most apps do not need a `config/sounding.js` file at all.

By default, Sounding will:

- manage a `sails-sqlite` datastore
- keep artifacts under `.tmp/db`
- clean up managed test artifacts automatically
- capture mail in-memory through the real mail flow

## Included in 0.0.1

- Sounding Sails hook runtime
- `test()` API
- request transport layer with virtual and HTTP support
- Inertia-oriented `visit()` API
- default managed datastore orchestration
- mail capture
- world engine foundations
- docs on Sailscasts
- Boring Stack testing skill and template alignment
- first real dogfood usage in The African Engineer

## Notes

- `0.0.1` is intentionally small, but real
- the API is coherent enough to dogfood in production apps
- some areas will keep evolving quickly as more apps adopt Sounding

## Install

```bash
npm install -D sounding
```

Then write trials with:

```js
const { test } = require('sounding')
```

And run:

```bash
npm run test
```

## Thanks

This release exists because we pushed beyond a pile of disconnected testing tools and insisted on one elegant story for Sails apps.
