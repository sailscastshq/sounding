# Sounding hook fixtures — unpublished local MVP

This package is local work for [issue #101](https://github.com/sailscastshq/sounding/issues/101).
It requires the matching local Sounding build with plugin preparation support.
Released Sounding 0.2.0 does not contain that support. Neither package was published.
The exact core package name is `sounding`; the plugin is `sounding-plugin-hook`.

## Minimum setup

In the hook package, retain its normal `sails.isHook`, optional `sails.hookName`,
package name and entry point. Install the matching **local core and plugin** plus
Sails as development dependencies. For example, use the locally packed artifacts:

```sh
npm install -D /absolute/path/sounding-0.2.0.tgz /absolute/path/sounding-plugin-hook-0.0.0.tgz sails@1.5.18
```

Do not substitute the registry's current `sounding@0.2.0` for this unpublished build.
The plugin must appear in the hook package's `package.json` dependencies or
`devDependencies`; Sounding discovers it automatically. No config registration
array and no `test` import from the plugin are required. The test import stays:

```js
const { test } = require('sounding')

test('furnishes fetch', async ({ sails, hook, expect }) => {
  expect(hook.name).toBe('node-fetch')
  expect(hook).toBe(sails.hooks['node-fetch'])
  expect(sails.helpers.fetch.with).toBeDefined()
})
```

This test runs from the real node-fetch hook package. A generic hook can instead
assert its own config, furnished helpers or public hook methods.

## Config and isolation

Root config is optional. It belongs in the hook package at `config/sounding.js`:

```js
module.exports.sounding = {
  hook: {
    config: { demo: { enabled: true } },
    files: {
      'config/routes.js': "module.exports.routes={'GET /health':(req,res)=>res.json({ok:true})}"
    }
  }
}
```

Per-trial overrides retain the same test grammar:

```js
test('applies fixture config', {
  hook: { config: { demo: { enabled: false } } }
}, async ({ sails, hook, expect }) => {
  expect(sails.config.demo.enabled).toBe(false)
  expect(hook).toBe(sails.hooks[hook.identity])
})

test('serves the fixture route', { transport: 'http' }, async ({ get, expect }) => {
  expect(await get('/health')).toHaveStatus(200)
})
```

Each trial gets a fresh temporary fixture and Sails/hook instance. The plugin
uses load by default; HTTP, browser/socket options or `hook.app: 'lift'` request
lift. HTTP fixtures bind to loopback and an ephemeral port by default. The added
integration tests verify HTTP promotion. Real browser/socket hook variants still
need their packages and hook dependencies plus separate integration proof; this
MVP makes no new coverage claim for them.

Concurrent hook trials are rejected with `E_SOUNDING_HOOK_CONCURRENCY`. Sails and
Sounding still use process globals; a fresh fixture is not proof of safe parallel
app lifecycles in one process. Use separate test processes where needed.

`hook` is the actual `sails.hooks[hook.identity]`. `hook.name` is a read-only alias,
and a conflicting factory-provided name rejects. `hookApp` supplies identity,
package root, package name, generated app path and direct mount metadata.

## Supported fixture inputs

- `name`: explicit identity; otherwise installed-hook name config, package
  `sails.hookName`, or the scoped/prefixed package name determines it.
- `module`: a hook factory or project-relative module path; default package entry.
- `config`: Sails boot config overrides, including `sounding` runtime overrides.
- `files`: relative fixture file paths and string contents. Escaping the fixture
  or writing into `.git`/`node_modules` rejects.
- `app`: `load` or `lift`.
- `loadHooks`: dependencies to select before Sails boot. The target, moduleloader,
  userconfig and Sounding are always included; HTTP adds its request/response hooks.
- `appPath`: existing fixture content copied to a new temp directory. Source files
  are untouched; `.git`, `.tmp` and `node_modules` are excluded, source symlinks
  reject, and the generated package/config are recreated for this hook harness.
- `mount`: only `direct` is supported; package and `api/hooks` mounts reject.

Defaults select only moduleloader, userconfig, helpers, the target and Sounding.
Hooks needing views, ORM or other services must supply those hook dependencies
and config explicitly. The datastore-free default excludes ORM and supplies a
placeholder datastore config to satisfy today's Sounding runtime; it connects
no database. A core datastore-disabled mode remains a follow-up.

Fixtures are always fresh. Warm fixture reuse, `reload: false`, `test.hookFails`,
`test.hookFactory`, package-discovery mounts and extra matchers are not part of
this MVP. Root/per-trial unsupported options reject rather than silently doing
nothing.

## Cleanup and failure contract

Trial resources close before the Sails instance is lowered and its directory is
removed. Cleanup runs after a handler or runtime boot failure. If both a trial
and cleanup fail, an AggregateError retains both errors. The tests verify that
a failed HTTP handler closes its listener and removes its fixture; startup
failure removes the fixture too. Expected boot failures do not yet have a
public `test.hookFails` declaration.

A plugin declares `trialOptions: ['hook']`; core keeps those values out of Node's
test options. Its `prepareApp({ options, projectPath })` runs before runtime
resolution and returns `{ runtime, context, cleanup }`. Only one plugin may own
a trial runtime, and it cannot replace an explicitly supplied runtime. Cleanup
runs on ownership conflicts as well.

## Run the verified real-hook demo locally

From the Sounding worktree:

```sh
SOUNDING_HOOK_ROOT=/Users/koo/Gringotts/687/sails-hook-node-fetch node examples/hooks/run-plugin-demo.js
```

The driver materializes a disposable hook package, registers the local core and
plugin packages, uses installed Sails tooling, and copies the small test file.
It never installs into or edits the real hook checkout. Both trials use
`require('sounding')`, assert actual helper furnishing/config, prove a mutation
does not survive into the next trial, and check that their generated fixture
paths are gone. No outbound request is made.

To demonstrate visible failure reporting without leaving fixtures behind:

```sh
SOUNDING_DEMO_FAIL=1 SOUNDING_HOOK_ROOT=/Users/koo/Gringotts/687/sails-hook-node-fetch node examples/hooks/run-plugin-demo.js
```

This intentionally exits with status 1: the first trial reports the sentinel
error, the next trial still proves fresh hook state/config, and the final cleanup
assertions verify both fixture directories are gone. The flag is only a demo
trigger; it does not turn failures into successes.
