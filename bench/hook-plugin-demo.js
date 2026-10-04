// Includes disposable package registration plus two real, isolated hook trials.
const { spawnSync } = require('node:child_process')
const { performance } = require('node:perf_hooks')
const path = require('node:path')
const samples = []
const env = { ...process.env }
delete env.NODE_TEST_CONTEXT
for (let round = 0; round < 8; round++) {
  const start = performance.now()
  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, '../examples/hooks/run-plugin-demo.js')],
    {
      env,
      encoding: 'utf8',
      timeout: 10000,
    }
  )
  const ms = performance.now() - start
  if (result.status !== 0 || !/pass 2/.test(result.stdout) || !/fail 0/.test(result.stdout)) {
    throw new Error(`Real hook demo failed: ${result.stdout}\n${result.stderr}`)
  }
  samples.push({ round, totalProcessMs: ms, stdout: result.stdout, stderr: result.stderr })
}
const ordered = samples.map((sample) => sample.totalProcessMs).sort((a, b) => a - b)
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      method:
        'Eight fresh processes; includes local package materialization, real node-fetch hook furnishing, per-trial isolation/config assertions and teardown. No outbound requests.',
      medianMs: (ordered[3] + ordered[4]) / 2,
      samples,
    },
    null,
    2
  )
)
