// Materialize local unpublished packages without installing or editing the real hook.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const hookRoot = process.env.SOUNDING_HOOK_ROOT
if (!hookRoot) throw new Error('Set SOUNDING_HOOK_ROOT to a local Sails hook checkout.')
const coreRoot = path.resolve(process.env.SOUNDING_CORE_ROOT || path.join(__dirname, '../..'))
const pluginRoot = path.resolve(
  process.env.SOUNDING_PLUGIN_ROOT || path.join(__dirname, '../../plugins/hook')
)
if (
  require(path.join(coreRoot, 'package.json')).name !== 'sounding' ||
  require(path.join(pluginRoot, 'package.json')).name !== 'sounding-plugin-hook'
) {
  throw new Error('The local demo requires the sounding core and sounding-plugin-hook packages.')
}
const demoFile = process.argv[2] === 'shipwright' ? 'shipwright.test.js' : 'plugin-node-fetch.test.js'
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-real-hook-demo-'))
try {
  const pkg = require(path.join(path.resolve(hookRoot), 'package.json'))
  fs.mkdirSync(path.join(project, 'node_modules'))
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({
      ...pkg,
      main: 'index.js',
      dependencies: {},
      devDependencies: {
        sounding: require(path.join(coreRoot, 'package.json')).version,
        'sounding-plugin-hook': require(path.join(pluginRoot, 'package.json')).version,
        sails: require('sails/package.json').version,
      },
    })
  )
  fs.writeFileSync(
    path.join(project, 'index.js'),
    `module.exports=require(${JSON.stringify(path.resolve(hookRoot))})`
  )
  fs.symlinkSync(coreRoot, path.join(project, 'node_modules/sounding'), 'dir')
  fs.symlinkSync(
    path.dirname(require.resolve('sails/package.json')),
    path.join(project, 'node_modules/sails'),
    'dir'
  )
  fs.cpSync(pluginRoot, path.join(project, 'node_modules/sounding-plugin-hook'), {
    recursive: true,
  })
  fs.writeFileSync(
    path.join(project, 'test.js'),
    `require('node:assert/strict').equal(require.resolve('sounding'),${JSON.stringify(path.join(fs.realpathSync(coreRoot), 'index.js'))})\n` +
      fs.readFileSync(path.join(__dirname, demoFile), 'utf8')
  )
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, ['--test', 'test.js'], {
    cwd: project,
    env,
    stdio: 'inherit',
    timeout: 10000,
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  fs.rmSync(project, { recursive: true, force: true })
}
