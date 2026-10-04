# Sounding hook fixtures

Test reusable Sails hooks with a real Sails instance and the normal Sounding trial API.
Requires Sounding 0.3.0 or later.

## Minimum setup

In the hook package, retain its normal `sails.isHook`, optional `sails.hookName`,
package name and entry point. Install Sounding, this plugin, and Sails as development dependencies:

```sh
npm install -D sounding@^0.3.0 sounding-plugin-hook@^0.1.0 sails@^1.5.18
```

`sounding@0.2.x` does not support hook fixture preparation.
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
need their packages and hook dependencies plus separate integration proof; browser/socket lifecycle integration must be verified separately.

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
this release. Root/per-trial unsupported options reject rather than silently doing
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
SOUNDING_HOOK_ROOT=/path/to/sails-hook-node-fetch node examples/hooks/run-plugin-demo.js
```

The driver materializes a disposable hook package, registers the local core and
plugin packages, uses installed Sails tooling, and copies the small test file.
It never installs into or edits the real hook checkout. Both trials use
`require('sounding')`, assert actual helper furnishing/config, prove a mutation
does not survive into the next trial, and check that their generated fixture
paths are gone. No outbound request is made.

To demonstrate visible failure reporting without leaving fixtures behind:

```sh
SOUNDING_DEMO_FAIL=1 SOUNDING_HOOK_ROOT=/path/to/sails-hook-node-fetch node examples/hooks/run-plugin-demo.js
```

This intentionally exits with status 1: the first trial reports the sentinel
error, the next trial still proves fresh hook state/config, and the final cleanup
assertions verify both fixture directories are gone. The flag is only a demo
trigger; it does not turn failures into successes.

## Shipwright: a manifest-to-HTML contract

From the Sounding worktree, run:

```sh
SOUNDING_HOOK_ROOT=/path/to/sails-hook-shipwright node examples/hooks/run-plugin-demo.js shipwright
```

The driver registers the local core/plugin and Sails in a disposable project,
loads the real Shipwright package entry, and runs `examples/hooks/shipwright.test.js`.
The 15-line test supplies a manifest with initial JS/CSS and an async JS chunk.
It asserts exact generated script/link tags and verifies the view-local generator
matches the hook API. This checks manifest consumption and HTML output, not an
Rsbuild build or browser loading behavior.

`hook.config.dontLift: true` is explicit: Shipwright's initializer checks that
Sails config flag before starting Rsbuild. Plain Sails.load does not set it in
this harness. This leaves configure/defaults/helper setup real while skipping
build/dev-server startup. A fresh fixture and its cleanup remain harness-owned.

Verified with Shipwright 1.5.1 at `f233659eb9749157f78fd84e780175f96b95bbe0`,
Sails 1.5.18 and Node v24.14.1. The core package import remains `sounding`.
