# Local issue #101 MVP — verified 2026-10-03

Historical measurement snapshot at commit `56addc6`, before release preparation.
For the proposed package versions and release contract, see
[0.3.0 release notes](../releases/v0.3.0.md).

This resumes the lifecycle-only commit `2019d68` with a working **unpublished**
`sounding-plugin-hook`. Public core package name is `sounding`; main is still
`aa3dd8b5bcd104c99d6df7d20c267d1108849304`, version 0.2.0. The local core package
version is deliberately unchanged; the plugin is private, version 0.0.0. Neither
registry package should be assumed to contain this work.

## Implemented and verified

- Plugin-declared trial options stay out of `node:test` options.
- Pre-boot plugin preparation can supply a runtime, context and cleanup.
- Only one runtime owner is allowed; conflicting/invalid ownership closes its
  prepared fixtures. Explicit runtimes cannot silently be replaced.
- The discovered hook plugin reads package metadata and root config, infers a
  name, direct-mounts the actual factory before Sails load/lift, and generates
  a fresh fixture per trial. Existing fixture content can be copied safely.
- Canonical `hook === sails.hooks[hook.name] === sails.hooks[hook.identity]`,
  read-only alias, config overrides, fixture files and HTTP promotion work.
- Handler/boot failure cleanup removes fixture paths; HTTP handler failure
  closes the actual listener. Trial and cleanup failures remain visible.
- Concurrent hook trials reject; no safe in-process parallel lifecycle claim.

173 tests pass (860 ms), including 8 focused plugin tests. Typecheck and diff
checks pass. Packed core/plugin also pass the real node-fetch demo, using an
assertion against the exact resolved package entry point. The intentional
failure variant exits 1, reports its sentinel, then passes the second isolated
trial and final cleanup assertions. No outbound requests or production work run.

The core/plugin were packed locally with lifecycle scripts disabled. Installation
requirements and the small test body are in `../plugins/hook/README.md`. The demo
driver materializes both local packages plus Sails in a disposable hook project;
it does not edit or install into the real hook checkout.

## Performance

The paired lifecycle audit alternates eight fresh processes per version, same
minimal real-hook fixtures and installed dependency bytes, on Node v24.14.1 /
Sails 1.5.18 / macOS arm64. These medians are milliseconds:

| Lane | Main | Local MVP |
| --- | ---: | ---: |
| totalProcessMs | 240.977 | 241.473 |
| factory-unit | 0.217 | 0.215 |
| load-fresh-instance | 35.684 | 35.816 |
| load-warm | 0.020 | 0.020 |
| load-coalesced-8 | 0.050 | 0.050 |
| runtime-serial-8 | 1.388 | 1.440 |
| runtime-concurrent-8 | 0.676 | 0.688 |
| load-isolated-reload | 4.955 | 5.038 |
| load-cleanup | 0.095 | 0.117 |
| load-virtual | 52.723 | 52.857 |
| request-virtual | 9.991 | 9.632 |
| lift-http | 6.545 | 6.446 |
| request-http | 10.699 | 10.841 |
| lift-cleanup | 0.366 | 0.371 |

The full paired workflow changes from 240.98 to 241.47 ms,
about 0.21% in this sample. This is no meaningful speedup claim.
`load-fresh-instance` occurs after imports; totalProcessMs includes imports,
Node startup and the whole workflow. HTTP lift follows virtual load, so its
module caches are warm. Reload includes lower and a fresh hook instance.
Cleanup costs remain included; errors are not suppressed to improve timings.

The separate auto-discovered real-hook demo takes a median **225.10 ms**
for eight fresh processes. That includes temporary package registration,
two fresh per-trial fixtures, real helper/config/state assertions and cleanup.
It is a full workflow measurement, not a startup-only or comparative claim.
Raw samples: `results-hook-plugin-2026-10-03.json` and
`results-hook-demo-2026-10-03.json`.

Runtime concurrency microbenchmarks still share Sails/hook state and contain
no shared mutations or database work. The hook plugin therefore refuses that
lane. Real browser startup/navigation/cleanup remains unmeasured because
Playwright is absent; no dependency installation was made for this audit.

## Runnable keynote demo

```sh
SOUNDING_HOOK_ROOT=/Users/koo/Gringotts/687/sails-hook-node-fetch node examples/hooks/run-plugin-demo.js
```

In a hook package with the matching local core/plugin and Sails installed:

```js
const { test } = require('sounding')

test('furnishes fetch', async ({ sails, hook, expect }) => {
  expect(hook.name).toBe('node-fetch')
  expect(hook).toBe(sails.hooks['node-fetch'])
  expect(sails.helpers.fetch.with).toBeDefined()
})
```

Root `config/sounding.js` is optional and configures `sounding.hook.config` and
`sounding.hook.files`; per-trial `hook.config` overrides it. The plugin is
installed as a dev dependency and discovered automatically. No separate
plugin test import, fixture files for the simplest hook, or manual teardown
is required. The demonstration test file adds cleanup assertions to prove
what the harness owns.

## Boundaries and next step

Issue #101 is only partially implemented. `test.hookFails`, `test.hookFactory`,
package/api-hooks discovery mounts, warm fixture reuse and additional matchers
remain proposed. Views/ORM/socket hook dependencies must be supplied explicitly;
the minimal default is a non-ORM hook fixture with a placeholder datastore
config. A core datastore-disabled mode is still needed.

Next dogfood `sails-hook-mail` with fixture views, capture disabled and a local
transport; then add expected-boot-failure declarations. Keep core-plugin issue
#102 and mail-capture issue #103 separate. Publication requires its own approval;
no push, PR, merge, tag or release has occurred.
