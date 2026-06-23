# sounding-plugin-stress

Stress testing for Sounding.

The plugin keeps Sounding core light while still giving Sails apps a native
stress-testing surface. It owns the load engine dependency, while Sounding owns
the public API and result shape.

Install it in a Sails app that already uses Sounding:

```sh
npm install -D sounding-plugin-stress
```

Once installed, Sounding discovers the plugin automatically from `package.json`.
There is no `plugins` array and no `config/sounding.js` registration step.

The plugin adds:

- the `sounding stress` CLI command
- `test.stress(...)`
- a `{ stress }` trial context helper
- `stress:start` and `stress:done` lifecycle events on Sounding's plugin event bus

## Engine choice

The first engine is `autocannon`.

That choice is deliberate:

- it is a Node-native HTTP benchmarking tool
- it can be installed as a normal dev dependency through this plugin
- it has a programmatic API, so Sounding can wrap it instead of shelling out
- its core options map cleanly to Sounding concepts like duration, concurrency,
  method, headers, and body
- its result data includes request rate, latency, failures, and throughput, which
  Sounding normalizes into assertion-friendly metrics

Sounding does not expose `autocannon` directly. The public API is the Sounding
stress API, and `autocannon` is the current engine behind that API.

## CLI

Stress a local Sails route by passing a relative target:

```sh
sounding stress /api/health --duration=10 --concurrency=25
```

Stress an external or deployed URL directly:

```sh
sounding stress https://staging.example.com/api/health --duration=10 --concurrency=25
```

Stress a Sails-shaped path against a specific host:

```sh
sounding stress /api/health --base-url=https://staging.example.com
```

Use worlds and actor aliases for local Sails app stress runs:

```sh
sounding stress /api/billing/summary \
  --world=subscribed-creator \
  --as=owner \
  --duration=10 \
  --concurrency=20
```

Remote and `--base-url` targets should use headers or tokens for auth:

```sh
sounding stress https://staging.example.com/api/me \
  --header "Authorization: Bearer $TOKEN"
```

Send methods, JSON, raw bodies, and headers:

```sh
sounding stress /api/invoices \
  --post='{"plan":"pro"}' \
  --header "x-test-lane: stress" \
  --duration=5 \
  --concurrency=10

sounding stress /api/events \
  --method=POST \
  --json '{"name":"invoice.created"}'

sounding stress /api/upload-token \
  --put \
  --body raw-payload
```

CLI reference:

```txt
sounding stress <target> [options]

Targets:
  /api/health                         Lift the local Sails app and stress a route.
  https://example.com/api/health      Stress an external URL directly.
  /api/health --base-url=<url>        Stress a path on a chosen host.

Options:
  --duration <seconds>                Duration in seconds. Defaults to 10.
  --concurrency <requests>            Concurrent requests. Defaults to 1.
  --connections <requests>            Alias for --concurrency.
  --method <method>                   HTTP method.
  --get, --head, --options            Method shorthands.
  --post, --put, --patch, --delete    Method shorthands. Body-capable flags accept JSON.
  --header "Name: value"              Add a request header. May be repeated.
  --json '<payload>'                  Send a JSON body.
  --body <payload>                    Send a raw body.
  --base-url <url>                    Resolve a relative target against this host.
  --world <scenario>                  Load a Sounding world before stressing a local app.
  --as <actor>                        Use a world actor alias for local Sails auth/session.
```

## Trial API

Use `test.stress()` when the trial is specifically about real HTTP load:

```js
const { test } = require('sounding')

test.stress(
  'billing summary stays fast under creator load',
  { world: 'subscribed-creator' },
  async ({ stress, expect }) => {
    const result = await stress
      .get('/api/billing/summary')
      .as('owner')
      .concurrently(20)
      .for(10)
      .seconds()

    expect(result.requests.failed().count()).toBe(0)
    expect(result.requests.duration().p95()).toBeLessThan(250)
  }
)
```

`test.stress()` behaves like `test()` with `{ transport: 'http' }` as the
default, then adds the `stress` helper to the trial context.

You can also use the `stress` helper from any trial that opts into HTTP:

```js
test(
  'health endpoint has no failed requests',
  { transport: 'http' },
  async ({ stress, expect }) => {
    const result = await stress.get('/api/health').concurrently(25).for(10).seconds()

    expect(result.requests.failed().count()).toBe(0)
  }
)
```

The request API is chainable and promise-like. Awaiting a chain runs it:

```js
const result = await stress.get('/api/health')
```

Use `.run()` when you want the execution point to be explicit:

```js
const result = await stress.get('/api/health').concurrently(10).run()
```

POST JSON payloads and headers:

```js
const result = await stress
  .post('/api/invoices')
  .json({ plan: 'pro' })
  .headers({ 'x-test-lane': 'stress' })
  .concurrently(10)
  .for(5)
  .seconds()
```

Supported methods:

```js
stress.request(method, target, payload)
stress.get(target)
stress.head(target)
stress.options(target, payload)
stress.post(target, payload)
stress.put(target, payload)
stress.patch(target, payload)
stress.delete(target, payload)
```

Chain helpers:

```js
stress.get('/api/health')
  .baseUrl('https://staging.example.com')
  .as('owner')
  .header('x-test-lane', 'stress')
  .headers({ accept: 'application/json' })
  .json({ plan: 'pro' })
  .body('raw body')
  .concurrently(25)
  .for(10)
  .seconds()
```

`as(actor)` accepts:

- an actor object
- a world actor alias, such as `owner`
- an actor object with `headers` or `sounding.headers`
- an actor object whose identity can be converted into the configured auth session

For local Sails runs, actor aliases can create a real Sails session cookie before
the load run starts. Remote targets should use `.headers()` or CLI `--header`
instead.

## Metrics

The result is assertion-friendly:

```js
result.requests.count()
result.requests.rate()
result.requests.failed().count()
result.requests.failed().rate()
result.requests.duration().min()
result.requests.duration().med()
result.requests.duration().p90()
result.requests.duration().p95()
result.requests.duration().max()
result.requests.ttfb().duration().p95()
result.requests.download().data().count()
result.requests.download().data().rate()
result.requests.upload().data().count()
result.requests.upload().data().rate()
result.testRun.concurrency()
result.testRun.duration()
result.toJSON()
result.raw
```

## Engine

The first engine is `autocannon`, owned by this plugin so core Sounding stays light.
Sounding owns the public API and result model, so future engines can be added without
forcing test code to change.

## Events

Sounding's plugin host exposes an event bus for lifecycle and observability.
The stress plugin emits:

- `stress:start` with the normalized run options
- `stress:done` with the normalized result

Those events are useful for logs, dashboards, custom reporters, or future
streaming output. They are not required for normal usage.
