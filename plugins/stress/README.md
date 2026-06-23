# sounding-plugin-stress

Stress testing for Sounding.

Install it in a Sails app that already uses Sounding:

```sh
npm install -D sounding-plugin-stress
```

Once installed, Sounding discovers the plugin automatically.

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
result.requests.download().data().count()
result.requests.download().data().rate()
result.testRun.concurrency()
result.testRun.duration()
```

## Engine

The first engine is `autocannon`, owned by this plugin so core Sounding stays light.
Sounding owns the public API and result model, so future engines can be added without
forcing test code to change.
