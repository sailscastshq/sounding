// Run with SOUNDING_HOOK_ROOT; optional SOUNDING_MODULE selects a baseline archive.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { createAppManager, createRuntime } = require(process.env.SOUNDING_MODULE || '..')
const soundingHook = require(process.env.SOUNDING_MODULE || '..')
const hookFactory = require(path.resolve(process.env.SOUNDING_HOOK_ROOT))
const SailsConstructor = require('sails').Sails
const samples = []
async function measure(name, fn) {
  const start = performance.now()
  const result = await fn()
  samples.push({ name, ms: performance.now() - start })
  return result
}
async function main() {
  for (let round = 0; round < Number(process.env.SOUNDING_BENCH_ROUNDS || 8); round++) {
    const appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-hook-bench-'))
    fs.mkdirSync(path.join(appPath, 'config'))
    fs.writeFileSync(path.join(appPath, 'package.json'), '{"name":"hook-bench","private":true}')
    // Identical fixture/options for baseline and current; no real datastore is connected.
    const common = { globals: false, log: { level: 'silent' }, port: 0,
      datastores: { default: { adapter: 'unused', url: 'unused' } },
      loadHooks: ['moduleloader', 'userconfig', 'helpers', 'node-fetch', 'sounding'],
      hooks: { session: false, 'node-fetch': hookFactory, sounding: soundingHook } }
    function writeFixtureConfig() {
      // Mount before Sails discovers hooks; late userconfig cannot add loadHooks.
      fs.writeFileSync(path.join(appPath, 'config/sounding.js'), `const options=${JSON.stringify({...common,hooks:undefined})};options.hooks={session:false,'node-fetch':require(${JSON.stringify(path.resolve(process.env.SOUNDING_HOOK_ROOT))}),sounding:require(${JSON.stringify(path.resolve(process.env.SOUNDING_MODULE || '.'))})};options.routes={'GET /health':(req,res)=>res.json({ok:true})};module.exports.sounding={datastore:'inherit',app:{quiet:false,loadOptions:options,liftOptions:options}}`)
    }
    writeFixtureConfig()
    const manager = createAppManager({ appPath, SailsConstructor })
    try {
      await measure('factory-unit', async () => {
        let helper
        const hook = hookFactory({ hooks: { helpers: { furnishHelper(name, definition) { helper = definition } } }, after(event, fn) { fn() } })
        await new Promise((resolve, reject) => hook.initialize(error => error ? reject(error) : resolve()))
        if (!helper?.fn) throw new Error('real factory did not furnish fetch')
      })
      const app = await measure('load-fresh-instance', () => manager.load())
      if (!app.hooks['node-fetch'] || typeof app.helpers.fetch.with !== 'function') throw new Error('Actual node-fetch hook missing')
      await measure('load-warm', () => manager.load())
      await measure('load-coalesced-8', async () => {
        const apps = await Promise.all(Array.from({ length: 8 }, () => manager.load()))
        if (apps.some(other => other !== app)) throw new Error('warm reuse changed app')
      })
      await measure('runtime-serial-8', async () => {
        for (let i = 0; i < 8; i++) {
          const runtime = createRuntime(app)
          try { await runtime.boot() } finally { await runtime.lower() }
        }
      })
      await measure('runtime-concurrent-8', () => Promise.all(Array.from({ length: 8 }, async () => {
        const runtime = createRuntime(app)
        try { await runtime.boot() } finally { await runtime.lower() }
      })))
      app.hooks['node-fetch'].benchmarkMutation = round
      const fresh = await measure('load-isolated-reload', () => manager.load({ reload: true }))
      if (fresh === app || fresh.hooks['node-fetch'].benchmarkMutation !== undefined) throw new Error('Hook lifecycle isolation failed')
      await measure('load-cleanup', () => manager.lower())
      // Add real HTTP lane; browser tooling availability is reported, never simulated.
      common.loadHooks.push('http', 'request', 'responses')
      writeFixtureConfig()
      const virtualApp = await measure('load-virtual', () => manager.load())
      const virtualRuntime = createRuntime(virtualApp)
      try {
        await virtualRuntime.boot()
        await measure('request-virtual', async () => {
          const response = await virtualRuntime.request.get('/health')
          if (response.status !== 200 || !response.data.ok) throw new Error('Virtual fixture failed')
        })
      } finally { await virtualRuntime.lower(); await manager.lower() }
      const lifted = await measure('lift-http', () => manager.lift())
      await measure('request-http', async () => {
        const response = await fetch(`http://127.0.0.1:${lifted.hooks.http.server.address().port}/health`)
        if (!response.ok || !(await response.json()).ok) throw new Error('HTTP fixture failed')
      })
      const server = lifted.hooks.http.server
      await measure('lift-cleanup', () => manager.lower())
      if (server.listening || globalThis.sails || globalThis.sounding) throw new Error('Fixture cleanup failed')
    } finally {
      await manager.lower()
      fs.rmSync(appPath, { recursive: true, force: true })
    }
  }
  const median = values => { const sorted = [...values].sort((a,b) => a-b); const i=Math.floor(sorted.length/2); return sorted.length%2 ? sorted[i] : (sorted[i-1]+sorted[i])/2 }
  let browser
  try { browser = require.resolve('playwright') } catch { browser = 'unavailable: playwright not installed; browser lane not measured' }
  console.log(JSON.stringify({ node: process.version, platform: `${process.platform}/${process.arch}`, module: process.env.SOUNDING_MODULE || 'current', rounds:Number(process.env.SOUNDING_BENCH_ROUNDS || 8), browser,
    isolation: 'Fresh temp fixture per round; reload gives new Sails/hook; concurrent runtime contexts share Sails/hook; no ORM and no outbound requests.',
    summary: Object.fromEntries([...new Set(samples.map(s=>s.name))].map(name=>[name,{medianMs:median(samples.filter(s=>s.name===name).map(s=>s.ms))}])), samples }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
