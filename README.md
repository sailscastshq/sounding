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
- request helpers default to Sails virtual requests powered by `sails.request()`
- Inertia-style visits can use `visit('/pricing')` and partial reload options like `{ component, only }`
- a trial can opt into stricter parity with `test('...', { transport: 'http' }, ...)`
- any trial can also scope a request client with `sails.sounding.request.using('http')`

Sounding also owns its own built-in world engine, so the same package can:
- define factories under `tests/factories`
- define scenarios under `tests/scenarios`
- load named worlds for endpoint and browser trials
- capture outgoing mail by wrapping `sails.helpers.mail.send` and storing normalized messages in `sails.sounding.mailbox`

The default configuration story is intentionally calm:
- Sounding only enables its hook in the environments listed under `sounding.environments`
- the default is `['test']`, so non-test boot paths stay dark unless you opt in explicitly
- if you intentionally need Sounding in another environment, add that environment name to the list
- auth conventions auto-detect `User`/`userId` and `Creator`/`creatorId`, with `sounding.auth` available for overrides
- Sounding manages a temporary `sails-sqlite` datastore by default
- managed SQLite artifacts live under `.tmp/db`
- the default datastore identity is `default`
- browser projects start with `desktop`
- `inherit` remains available when an app already has a serious test datastore story

For example:

```js
module.exports.sounding = {
  environments: ['test'],
}
```

If you intentionally want Sounding during another boot path, widen the list explicitly, for example `['test', 'console']` or `['test', 'production']`.

This repository starts with docs-driven product research and the first hook/runtime scaffolding for that vision.

See `RESEARCH.md`.
