# Hook lifecycle audit — 2026-10-03

This is the historical lifecycle-only snapshot at `2019d68`. The resumed
[hook-plugin MVP report](hook-plugin-report.md) records the subsequently
implemented API, final checks and new benchmark results.

This is an **unreleased local improvement**, not completion of issue #101.

Source: `sailscastshq/sounding`, base `aa3dd8b5bcd104c99d6df7d20c267d1108849304`,
package 0.2.0. Main checkout: `/Users/koo/Gringotts/687/sounding`.
Work: actual Git Vibe branch `feat/sounding-hook-lifecycle` in
`/Users/koo/Documents/Codex/2026-10-03/task/sounding`. Main was clean and is unchanged.
Remote main matched the local base on inspection. No open PRs; issue #101 already
owns the intended hook API. No push, PR, merge, tag, release or production job ran.
Quest task `01a0fe25` and its files were not modified.

No applicable ancestor/repo AGENTS instructions were found; ~/.codex/AGENTS.md
was empty and ~/.codex/memories was empty. Read the repo Sounding skill,
~/.agents/skills/sounding and the Git Vibe skill. No repo `.agents` directory exists.

## Current and intended DX

Current main has public `createAppManager`, `createTestApi`, warm load/lift,
explicit reload, virtual/HTTP/socket/browser contexts and plugin discovery.
It still requires a fixture app for hook tests. Current plugins add post-boot
trial context; mounting a hook requires a pre-boot extension point that does not
exist. Concurrent Sounding contexts share Sails, hook singleton state, and any
worker datastore. Worker SQLite paths do not imply per-trial database isolation.

[Issue #101](https://github.com/sailscastshq/sounding/issues/101) proposes an
auto-discovered `sounding-plugin-hook`, the unchanged `require('sounding').test`
import, generated fixtures, `projectPath` vs `appPath`, per-trial hook config,
real `hook === sails.hooks[hook.identity]`, package discovery and explicit expected
boot failures. These remain proposed. There is no shipped `hook`, `hookApp`,
`test.hookFails`, `test.hookFactory`, or zero-config hook fixture API.
Issues #102/#103 separately discuss core plugins and mail capture; avoid coupling
the hook fixture MVP to that broader migration.

Local bounded change:

- Constructor `loadOptions` merges over file `app.loadOptions`, matching
  existing constructor `liftOptions` behavior without changing lift-mode config.
- `lower()` waits for an active boot, attempts both app teardowns, restores
  manager globals/filtering and removes managed artifacts before surfacing Sails
  callback errors. Multiple teardown errors are aggregated.
- Real node-fetch hook example tests helper furnishing, globals override, no
  HTTP hook, a mutation discarded by reload, Sounding trial cleanup and temp-file
  removal. No outbound request is made. ORM is excluded; a placeholder datastore
  config satisfies today's runtime, without connecting a database.

## Checks

Unmodified baseline: 163 passing tests (829 ms). Local source: 165 passing tests
(826 ms); typecheck and git diff --check pass. The targeted new regressions fail
against main (ignored constructor override; missing expected cleanup rejection)
and both pass after the fix. The real hook demo passes all three reported tests,
including two Sounding subtrials (176 ms).

Initial restricted-shell listener tests failed with EPERM; the complete runs used
permission for disposable local fixture listeners. No failure was skipped to get
the passing result. Browser mocks in the repository are not a real browser proof.

## Reproducible benchmark

Node v24.14.1, Sails 1.5.18, macOS arm64; local node-fetch hook 0.0.3.
Eight alternating fresh child processes per version; exact same generated fixture
config and installed dependency bytes. Results are medians in milliseconds.
Raw samples and platform details: `results-2026-10-03.json`.

| Measurement | Main | Local |
| --- | ---: | ---: |
| totalProcessMs | 233.285 | 233.921 |
| factory-unit | 0.209 | 0.214 |
| load-fresh-instance | 35.960 | 35.411 |
| load-warm | 0.020 | 0.019 |
| load-coalesced-8 | 0.053 | 0.049 |
| runtime-serial-8 | 1.403 | 1.378 |
| runtime-concurrent-8 | 0.697 | 0.681 |
| load-isolated-reload | 4.862 | 4.893 |
| load-cleanup | 0.097 | 0.118 |
| load-virtual | 54.371 | 53.411 |
| request-virtual | 9.984 | 9.960 |
| lift-http | 6.407 | 6.399 |
| request-http | 11.209 | 11.437 |
| lift-cleanup | 0.385 | 0.403 |

`totalProcessMs` includes Node/module startup and the entire measured workflow,
not only one load. `load-fresh-instance` is the first minimal-hook load in each
fresh process, after imports. `load-isolated-reload` includes teardown and a new
Sails instance with warmed module caches. `load-virtual` loads the HTTP machinery
for the first time without opening a listener; `lift-http` follows that, so its
modules are warm. These are not interchangeable cold HTTP-vs-load measurements.

Assertions verify the real hook and fetch helper exist, warm requests coalesce
to one app, reload creates a fresh app/hook with no sentinel mutation, HTTP and
virtual routes return actual JSON, and final listener/globals are gone. Each
round removes its fixture in finally; process exit also bounds live resources.
The unit lane invokes the real factory against a small Sails stub and is not
lifecycle coverage. Serial/concurrent runtime lanes have no database or shared
mutations, and are microbenchmarks, not concurrency-safety or throughput promises.

The fix has no meaningful measured speed gain: full workflow changes by roughly
0.3%; cleanup adds around 0.02 ms here to preserve error reporting. The practical
performance lever is choosing the smallest required hook set, reusing a warm app
only for state-independent cases, and paying explicit reload cost for isolation.
Use per-process fixtures for concurrent hook/global mutations; never solve speed
by sharing mutated state, swallowing teardown errors or skipping assertions.

Playwright is not installed, so real browser launch/navigation/cleanup cost is
unmeasured. No browser install or unrelated dependency upgrade was made. Preserve
unit, real load/functional, HTTP/socket and browser lanes as distinct coverage.

## Run and present

```sh
SOUNDING_HOOK_ROOT=/Users/koo/Gringotts/687/sails-hook-node-fetch node --test examples/hooks/node-fetch.test.js
SOUNDING_BASELINE=/Users/koo/Documents/Codex/2026-10-03/task/sounding-baseline SOUNDING_HOOK_ROOT=/Users/koo/Gringotts/687/sails-hook-node-fetch node bench/compare.js
```

For the keynote, use the executable example with explicit setup today. Show the
issue #101 three-line `{ sails, hook, expect }` trial as the intended API, clearly
labelled proposed. Next implement pre-boot plugin preparation, plugin-owned trial
option claiming and the projectPath/appPath split, then a direct-mount generated
fixture with per-trial reload; dogfood mail with capture disabled and a local
transport. Defer package discovery, fancy matchers and the core-plugin migration.
A datastore-free fixture mode will remove today's most visible setup friction.

Publication remains a separate decision. An interim cross-thread message was
blocked by automatic approval review for lack of explicit messaging authorization;
the delegated final report can be read by the parent automatically.
