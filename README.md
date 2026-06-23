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
- upload trials use `FormData` over the HTTP transport so Sails can exercise real Skipper streams
- independent trials can opt into concurrent execution with `test('...', { concurrent: true }, ...)` or `test.concurrent(...)`
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

## Upload trials

Use HTTP request trials for Sails file uploads. Uploads in Sails are streaming
Skipper requests, so they need the HTTP stack that Sails uses for real multipart
forms.

```js
const { test } = require('sounding')

test(
  'creator can upload a receipt',
  { transport: 'http' },
  async ({ request, expect }) => {
    const form = new FormData()

    form.append('description', 'Home office monitor')
    form.append('amount', '1200')
    form.append(
      'receipt',
      new Blob(['receipt bytes'], { type: 'application/pdf' }),
      'receipt.pdf'
    )

    const response = await request.post('/expenses', form)

    expect(response).toRedirectTo('/expenses/new')
  }
)
```

When a multipart form mixes text fields and files, append the text fields before
the files. That matches Sails and Skipper's streaming model, where actions can
start while file streams are still arriving.

Do not use the virtual transport for upload behavior. Virtual requests are still
right for normal endpoints, JSON APIs, session assertions, redirects, and
Inertia contracts, but real `req.file()` uploads are HTTP-only in Sails.

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

## CLI test runner

Run a Sounding suite with the framework-level runner:

```sh
npx sounding test
```

The command discovers `.test.js` files under `tests/` and `test/`, then runs Node's native test runner with Sounding-friendly filters:

```sh
npx sounding test --grep "dashboard"
npx sounding test --file tests/sounding/examples.test.js
npx sounding test --lane browser
npx sounding test --shard=1/4
npx sounding test --parallel
npx sounding test --watch
```

Common Node test flags pass through, and CI reporters are available without memorizing the longer Node flag names:

```sh
npx sounding test --reporter spec
npx sounding test --junit reports/sounding-junit.xml
npx sounding test --json
npx sounding test --coverage
```

When no reporter is specified, `sounding test` uses Sounding's readable reporter. Failed response assertions group the request, response, body, file location, and code frame so the behavior is visible without digging through a raw stack trace. Use `--compact` for failure-focused output, `--profile` to print the slowest trials before the final summary, and `--slow=N` to control how many profiled trials are shown:

```sh
npx sounding test --compact
npx sounding test --profile --slow=10
```

For larger suites in CI, split the same discovered file list across matrix jobs with `--shard=part/total`. Sharding composes with lanes and explicit files:

```sh
npx sounding test --lane browser --shard=1/4
npx sounding test --file tests/sounding/examples.test.js --shard=2/4
```

```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]

steps:
  - run: npx sounding test --shard=${{ matrix.shard }}/4 --profile --slow=10
```

Use `--verbose` when you want full stacks and expanded Sounding diagnostics:

```sh
npx sounding test --verbose
```

Use `--raw-error` or `SOUNDING_RAW=1` when the formatted view hides something important. Raw mode keeps the pretty failure first, then prints the original Node test error, its `cause`, Sounding metadata, and the primary frame payload:

```sh
npx sounding test --raw-error
```

Use `--dry-run` to inspect the exact `node --test` command before running it.

The repository includes an intentionally failing reporter fixture that is useful for before/after screenshots:

```sh
node ./bin/sounding.js test --app examples/pretty-output-demo
```

There is also a small passing fixture for successful-output screenshots:

```sh
node ./bin/sounding.js test --app examples/pretty-output-success
```

## App lifecycle

Sounding keeps a warm Sails app by default. Virtual request trials load the app without opening an HTTP listener, while HTTP, socket, and browser-capable trials lift the app so the network stack exists.

The app manager makes those lanes explicit:

```js
const { createAppManager } = require('sounding')

const manager = createAppManager()

const virtualRuntime = await manager.runtime({ app: 'load' })
const httpRuntime = await manager.runtime({ app: 'lift' })
const alsoHttpRuntime = await manager.runtime({ transport: 'http' })
```

Use the warm default for most suites. When a trial mutates process-global app state and needs a fresh Sails instance, force a reload:

```js
const freshRuntime = await manager.runtime({ app: 'load', reload: true })
```

Lifecycle timings are available for diagnostics:

```js
console.log(manager.lifecycle.load.durationMs)
console.log(manager.lifecycle.lift.status)
```

Set `SOUNDING_LIFECYCLE=verbose` or `SOUNDING_DIAGNOSTICS=verbose` to print app load/lift timing messages while the suite runs.

## Concurrent trials

Sounding runs trials serially by default. That keeps shared Sails app state boring while request sessions, worlds, mailboxes, sockets, and browser sessions continue to reset between trials.

Independent trials can opt into Node test concurrency:

```js
test.concurrent('health check is isolated', async ({ get, expect }) => {
  const response = await get('/health')

  expect(response).toHaveStatus(200)
})

test('dashboard contract is isolated too', { concurrent: true }, async ({ visit, expect }) => {
  const page = await visit('/dashboard')

  expect(page).toBeInertiaPage('dashboard/index')
})
```

Concurrent Sounding trials bypass the global serial queue and receive isolated runtime state. Their request session, mailbox, world, sockets, and browser manager are separate from other concurrent trials. Managed SQLite datastore paths remain isolated by worker using `.tmp/db/<identity>/worker-<token>.db`, where the worker token comes from `SOUNDING_WORKER_INDEX`, `PLAYWRIGHT_WORKER_INDEX`, `TEST_WORKER_INDEX`, or the process id.

Use concurrent mode for trials that do not mutate process-global app state. If you build a custom `createTestApi({ runtime })`, pass a runtime factory such as `() => createRuntime(sails)` for concurrent trials; a single shared runtime object stays serial-only.

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
test('subscriber can read a gated issue', { browser: true }, async ({ visit, expect }) => {
  const page = await visit('/issues/the-nerve-to-build')

  await expect(page).toSee('The rest of the story')
  expect(page).toHaveNoSmoke()
})
```

Use a string when a trial needs a named project:

```js
test('mobile navigation opens the account menu', { browser: 'mobile' }, async ({ visit, expect }) => {
  const page = await visit('/dashboard').inDarkMode()

  await page.click('Account')
  await expect(page).toSee('Settings')
})
```

Browser `page` is a Sounding wrapper around the Playwright page. It keeps common
actions fluent while assertions stay under `expect(page)`:

```js
await page
  .click('@send-link')
  .type('email', 'creator@example.com')
  .press('Send link')

await expect(page).toSee('Check your email')
await expect(page).not.toSee('Invalid email')
expect(page).toHavePath('/check-email')
```

### Browser test handles

Use `@name` for stable test handles. This is a Sounding convention inspired by
Pest's browser-testing ergonomics: the `@` prefix does not mean CSS, id, or a
JavaScript decorator. It means "find this element by its test handle."

Sounding maps `@send-link` to elements with `data-test="send-link"` or
`data-testid="send-link"`:

```html
<button data-test="send-link">Email me a link</button>
```

```js
await page.click('@send-link')
```

Prefer test handles for controls whose visible copy may change, repeated UI, or
elements that do not have a natural accessible label. Plain text and normal CSS
selectors still work:

```js
await page.click('Email me a link')
await page.click('#send-link')
await page.fill('input[name="email"]', 'creator@example.com')
```

### Host-aware browser visits

Use `withHost()` when the host matters to the app:

```js
const page = await visit('/dashboard')
  .withHost('app.test')
  .inDarkMode()
```

That resolves the relative visit target to `http://app.test/dashboard`. If the
host includes a scheme, Sounding preserves it:

```js
await visit('/dashboard').withHost('https://creator.example.com')
```

This is useful for tenant domains, custom host routing, signed-link hosts, and
apps that branch on the request `Host` header.

Use the trial option for browser projects:

```js
test('mobile nav works', { browser: 'mobile' }, async ({ visit }) => {
  await visit('/dashboard')
})
```

Use `visit().on()` when one visit inside a browser trial needs a different
project before navigation:

```js
test('mobile nav works', { browser: true }, async ({ visit }) => {
  await visit('/dashboard').onMobile()
  await visit('/dashboard').on('safari')
})
```

For a whole trial, prefer `{ browser: 'mobile' }`. For one specific visit,
`visit('/path').onMobile()` closes the current browser session, opens the named
project, then applies actor login, color scheme, locale, host, and other setup
before it navigates.

The wrapper also includes common browser journey verbs:

```js
await visit('/settings')
  .as('owner')
  .inDarkMode()
  .withGeolocation(6.5244, 3.3792)
  .click('@avatar')
  .attach('@avatar-file', 'fixtures/avatar.png')
  .typeSlowly('@display-name', 'Kelvin')
  .clear('@tagline')
  .append('@tagline', 'Building in public')
  .key('Enter')

await page.withinFrame('@billing-frame', async (frame) => {
  await frame.click('@save-card')
})

await page.screenshotElement('@receipt', '.tmp/receipt.png')

expect(page).toHaveNoConsoleErrors()
expect(page).toHaveNoSmoke()
```

Supported browser page actions:

| API | Purpose |
| --- | --- |
| `page.click(target)` | Click visible text, a test handle, or selector. |
| `page.type(target, value)` / `page.fill(target, value)` | Fill an input by label, test handle, or selector. |
| `page.typeSlowly(target, value)` | Type with a small delay for search boxes, masks, and key-driven UI. |
| `page.append(target, value)` | Add text to the current input value. |
| `page.clear(target)` | Empty an input. |
| `page.press(target, key)` | Press a key while focused on a target. |
| `page.select(target, value)` | Select an option. |
| `page.check(target)` / `page.uncheck(target)` | Toggle checkboxes and radios. |
| `page.hover(target)` | Hover over a target. |
| `page.attach(target, files)` | Attach one or more files to an upload input. |
| `page.drag(source, target)` | Drag one target onto another. |
| `page.scroll(target)` | Scroll an element into view, or scroll the page with numeric coordinates. |
| `page.wait(target)` | Wait for a timeout, selector, test handle, or load state. |
| `page.resize(width, height)` | Resize the page viewport. |
| `page.key(key)` / `page.keys(keys)` | Press keyboard shortcuts. |
| `page.back()` / `page.forward()` / `page.reload()` | Navigate browser history or reload. |
| `page.debug()` | Pause in Playwright when the runtime supports it. |
| `page.withinFrame(target, callback)` | Scope actions to an iframe. |

Supported browser setup helpers:

| API | Purpose |
| --- | --- |
| `visit('/path').as(actor)` | Log in as a world actor before navigation. |
| `visit('/path').on(project)` / `onMobile()` | Open a named browser project before navigation. |
| `visit('/path').withHost(host)` | Resolve relative paths against a specific host. |
| `visit('/path').inDarkMode()` / `inLightMode()` | Emulate color scheme before navigation. |
| `visit('/path').withLocale(locale)` | Override browser locale signals where possible. |
| `visit('/path').withTimezone(timezone)` | Store timezone intent for browser metadata and future context support. |
| `visit('/path').withUserAgent(userAgent)` | Set the page user-agent header where possible. |
| `visit('/path').withGeolocation(lat, lon)` | Grant geolocation permission and set coordinates where possible. |

Supported browser read and capture helpers:

| API | Purpose |
| --- | --- |
| `page.url()` | Read the current URL. |
| `page.text()` / `page.text(target)` | Read full-page text or target text. |
| `page.html()` / `page.content()` | Read the page HTML. |
| `page.script(fn, arg)` | Evaluate code in the browser. |
| `page.screenshot(pathOrOptions)` | Capture a page screenshot. |
| `page.screenshotElement(target, pathOrOptions)` | Capture one element. |

Supported browser expectations:

| API | Purpose |
| --- | --- |
| `expect(page).toSee(text)` | Assert page text is visible in the document text. |
| `expect(page).not.toSee(text)` | Assert page text is absent. |
| `expect(page).toHaveUrl(url)` | Assert the full URL, or path when the expected value starts with `/`. |
| `expect(page).toHavePath(path)` | Assert path, query, and hash. |
| `expect(page).toHaveTitle(title)` | Assert document title. |
| `expect(page).toHaveNoJavascriptErrors()` | Fail on browser runtime errors. |
| `expect(page).toHaveNoConsoleLogs()` | Fail on any console message, including `log`, `warn`, `info`, and `error`. |
| `expect(page).toHaveNoConsoleErrors()` | Fail only on `console.error`. |
| `expect(page).toHaveNoSmoke()` | Fail on JavaScript errors or console errors. |

Raw Playwright access remains available through `page.raw` or
`page.playwrightPage` when a browser flow needs a lower-level escape hatch.

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

    await expect(page).toSee('Your cart')
    expect(page).toHaveNoSmoke()
  }
)
```

Use `false` as a concise off switch:

```js
test('fast smoke flow', { browser: { artifacts: false } }, async ({ visit, expect }) => {
  const page = await visit('/health')

  await expect(page).toSee('OK')
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
