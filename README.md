# Sounding

Sounding is a testing framework for Sails applications and The Boring JavaScript Stack.

It is designed to be:
- a Sails hook first
- a CLI second
- powered by the native Node.js test runner
- integrated with Playwright for browser testing
- elegant for helper, endpoint, JSON API, Inertia, mail, and browser trials

The canonical Sails-native surface is:
- optional `config/sounding.js` when you need overrides
- `sails.sounding`
- `sails.helpers.user.signupWithTeam(...)` inside trials
- `get('/api/issues')` or `sails.sounding.request.get('/api/issues')` inside endpoint-style trials
- `await auth.login.withPassword('creator@example.com', page, { password: 'secret123' })` inside browser trials
- `await auth.request.withPassword('creator@example.com', { password: 'secret123' })` inside request trials
- `test('...', { world: 'signed-in-user' }, async ({ request }) => {})` can auto-load named worlds before the handler runs
- `request.as('owner')` and `visit.as('owner')` can resolve actor aliases from the current world
- `test('...', { browser: 'mobile' }, async ({ page }) => {})` can select a named browser project without extra ceremony
- failed browser trials capture the current URL and a full-page screenshot under `.tmp/sounding/artifacts`
- request helpers default to Sails virtual requests powered by `sails.request()`
- virtual request responses expose the final `req.session` snapshot as `response.session`; HTTP responses leave it undefined
- request assertions can check auth/session state with `expect(response).toHaveSession('userId', user.id)` and flash messages with `expect(response).toHaveFlash('info', /welcome/i)`
- failed response assertions include concise request/response diagnostics; set `SOUNDING_DIAGNOSTICS=verbose` for full response excerpts
- Inertia-style visits can use `visit('/pricing')` and partial reload options like `{ component, only }`
- mail assertions can check captured emails with `expect(mailbox).toHaveSentMail({ to, subject })` and `expect(mailbox.latest()).toHaveCtaUrl(/magic-link/)`
- a trial can opt into stricter parity with `test('...', { transport: 'http' }, ...)`
- any trial can also scope a request client with `sails.sounding.request.using('http')`

Sounding also owns its own built-in world engine, so the same package can:
- define factories under `tests/factories`
- define scenarios under `tests/scenarios`
- auto-load named worlds for endpoint, Inertia, socket, and browser trials
- compose world records with fluent builders like `await create('user').trait('admin').with({ email })`
- merge repeated builder `.with()` calls, with `.withOnly()` available when you want to use only the next overrides
- capture outgoing mail by wrapping `sails.helpers.mail.send` and storing normalized messages in `sails.sounding.mailbox`

Request-level Inertia trials can assert page contracts without launching a browser:

```js
const { test } = require('sounding')

test('dashboard shows the signed-in creator', { world: 'signed-in-user' }, async ({ visit, expect }) => {
  const page = await visit.as('owner')('/dashboard')

  expect(page).toBeInertiaPage('dashboard/index')
  expect(page).toHaveInertiaProps({
    'auth.user.email': 'owner@example.com',
    'stats.projects': 2,
    projects: [{ name: 'Launch Plan' }],
  })
  expect(page).toHaveNoInertiaErrors()
})

test('dashboard partial reload returns only notifications', async ({ visit, expect }) => {
  const page = await visit('/dashboard', {
    component: 'dashboard/index',
    only: ['notifications'],
    reset: ['sidebar'],
  })

  expect(page).toBeInertiaPage('dashboard/index')
  expect(page).toHaveInertiaPartialReload({
    component: 'dashboard/index',
    only: ['notifications'],
    reset: ['sidebar'],
  })
  expect(page).toHaveOnlyInertiaProps(['notifications'])
})
```

The default configuration story is intentionally calm:
- Sounding only enables its hook in the environments listed under `sounding.environments`
- the default is `['test']`, so non-test boot paths stay dark unless you opt in explicitly
- if you intentionally need Sounding in another environment, add that environment name to the list
- auth conventions auto-detect `User`/`userId` and `Creator`/`creatorId`, with `sounding.auth` available for overrides
- Sounding manages a temporary `sails-sqlite` datastore by default
- managed SQLite artifacts live under `.tmp/db`
- the default datastore identity is `default`
- browser projects start with `desktop`
- browser projects can be strings or named project objects with `type`, `device`, `viewport`, `contextOptions`, and `launchOptions`
- browser failure artifacts store screenshots and current URLs by default, while traces and videos are opt-in
- mail capture previews use the `mail` layout by default, matching the current `sails-hook-mail` convention
- apps with a different mail layout can set `sounding.mail.layout`, for example `layout-email`
- `inherit` remains available when an app already has a serious test datastore story

For example:

```js
module.exports.sounding = {
  environments: ['test'],
}
```

If you intentionally want Sounding during another boot path, widen the list explicitly, for example `['test', 'console']` or `['test', 'production']`.

## Project init

Use the initializer from a Sails app to add the first Sounding test lane:

```sh
npx sounding init
```

It updates `package.json`, creates `tests/factories`, `tests/scenarios`, and `tests/sounding`, and writes starter examples without overwriting existing files. The default setup relies on Sounding's built-in conventions, so it skips `config/sounding.js` unless you ask for an editable config scaffold:

```sh
npx sounding init --config
```

Typical output looks like:

```txt
Sounding initialized /path/to/my-sails-app
Auth convention: User
~ Updated package.json (added `npm test`, added `sounding` devDependency, added `sails-sqlite` devDependency)
+ Created tests
+ Created tests/factories
+ Created tests/scenarios
+ Created tests/sounding
+ Created tests/factories/user.js
+ Created tests/scenarios/signed-in-user.js
+ Created tests/sounding/examples.test.js
- Skipped config/sounding.js because Sounding defaults are enough

Next: run npm install, then npm test.
```

## Typing and editor support

Sounding is JSDoc-first today. The public API types live beside the CommonJS source, with shared typedefs in `lib/types.js`, so JavaScript Sails apps get autocomplete and inline docs without a separate hand-maintained declaration surface.

The type smoke test in `typecheck/public-api-smoke.js` checks the exported API that consumers use: `test()`, request and visit clients, worlds, mail, auth, browser, socket helpers, runtime factories, and default config. Run it with:

```sh
npm run typecheck
```

Sounding does not ship hand-written `.d.ts` files right now. If TypeScript consumers need declaration files later, they should be generated from the JSDoc source of truth and verified against the same public API smoke test.

## Browser projects

Browser trials start on the `desktop` project:

```js
test('subscriber can read a gated issue', { browser: true }, async ({ page }) => {
  await page.goto('/issues/the-nerve-to-build')
})
```

Use a string when a trial needs a named project:

```js
test('mobile navigation opens the account menu', { browser: 'mobile' }, async ({ page }) => {
  await page.goto('/dashboard')
})
```

Configure named projects in `config/sounding.js` when an app needs mobile devices, WebKit, or custom context options:

```js
module.exports.sounding = {
  browser: {
    projects: {
      desktop: {},
      mobile: {
        device: 'iPhone 13'
      },
      safari: {
        type: 'webkit',
        viewport: {
          width: 1280,
          height: 720
        }
      }
    }
  }
}
```

The object form stays Sails-simple while still passing through to Playwright where it matters.

## Browser failure artifacts

Browser-capable trials should be easy to debug without turning every run into a heavyweight recording session.

By default, a failed `{ browser: true }` trial writes:

- `current-url.txt`
- `screenshot.png`

under a stable, readable directory:

```txt
.tmp/sounding/artifacts/<trial-name>/<browser-project>/
```

For a trial named `dashboard shows owner stats` on the default `desktop` project, that becomes:

```txt
.tmp/sounding/artifacts/dashboard-shows-owner-stats/desktop/
```

When a failure happens, Sounding appends the current URL and artifact paths to the thrown error so the terminal output points straight at the evidence.

Traces and videos are intentionally off by default because they cost more disk and time. Turn them on for a whole app:

```js
module.exports.sounding = {
  browser: {
    artifacts: {
      trace: true,
      video: true
    }
  }
}
```

Or scope them to one suspicious trial:

```js
test(
  'checkout keeps the cart after refresh',
  {
    browser: {
      artifacts: {
        trace: true,
        video: true
      }
    }
  },
  async ({ page, expect }) => {
    await page.goto('/checkout')
    await page.reload()

    await expect(page.getByText('Your cart')).toBeVisible()
  }
)
```

Use `false` as a concise off switch:

```js
test('fast smoke flow', { browser: { artifacts: false } }, async ({ page }) => {
  await page.goto('/health')
})
```

For artifact settings, `true` means “keep this when the trial fails.” If you need an artifact on successful browser trials too, use `on` instead:

```js
module.exports.sounding = {
  browser: {
    artifacts: {
      trace: 'on'
    }
  }
}
```

This repository starts with docs-driven product research and the first hook/runtime scaffolding for that vision.

See `RESEARCH.md`.
