const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const packageJson = require('../package.json')
const { TEST_COMMAND, initProject } = require('../lib/init-project')

function createTempApp(prefix = 'sounding-init-') {
  const appPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  fs.mkdirSync(path.join(appPath, 'api', 'models'), { recursive: true })
  fs.mkdirSync(path.join(appPath, 'config'), { recursive: true })
  return appPath
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

test('initProject scaffolds package scripts, dependencies, worlds, and examples', () => {
  const appPath = createTempApp()
  fs.writeFileSync(path.join(appPath, 'api', 'models', 'User.js'), 'module.exports = {}\n')
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify({ name: 'example-sails-app', private: true }, null, 2)
  )

  const result = initProject({ appPath })
  const pkg = readJson(path.join(appPath, 'package.json'))
  const exampleFile = path.join(appPath, 'tests', 'sounding', 'examples.test.js')

  assert.equal(result.auth.identity, 'user')
  assert.equal(result.auth.detected, true)
  assert.equal(pkg.scripts.test, TEST_COMMAND)
  assert.equal(pkg.devDependencies.sounding, `^${packageJson.version}`)
  assert.equal(pkg.devDependencies['sails-sqlite'], '^0.2.6')
  assert.equal(fs.existsSync(path.join(appPath, 'tests', 'factories')), true)
  assert.equal(fs.existsSync(path.join(appPath, 'tests', 'scenarios')), true)
  assert.equal(fs.existsSync(path.join(appPath, 'config', 'sounding.js')), false)
  assert.match(
    fs.readFileSync(path.join(appPath, 'tests', 'factories', 'user.js'), 'utf8'),
    /defineFactory\('user'/
  )
  assert.match(
    fs.readFileSync(path.join(appPath, 'tests', 'scenarios', 'signed-in-user.js'), 'utf8'),
    /users:/
  )
  assert.match(fs.readFileSync(exampleFile, 'utf8'), /virtual request example/)
  assert.match(fs.readFileSync(exampleFile, 'utf8'), /browser journey example/)
})

test('initProject preserves existing scripts and files on repeated runs', () => {
  const appPath = createTempApp()
  const packagePath = path.join(appPath, 'package.json')
  const factoryPath = path.join(appPath, 'tests', 'factories', 'user.js')

  fs.mkdirSync(path.dirname(factoryPath), { recursive: true })
  fs.writeFileSync(path.join(appPath, 'api', 'models', 'User.js'), 'module.exports = {}\n')
  fs.writeFileSync(factoryPath, 'module.exports = customFactory\n')
  fs.writeFileSync(
    packagePath,
    JSON.stringify(
      {
        name: 'custom-sails-app',
        scripts: {
          test: 'node ./custom-test-runner.js',
        },
        devDependencies: {
          sounding: 'workspace:*',
        },
      },
      null,
      2
    )
  )

  initProject({ appPath })
  const firstPackage = fs.readFileSync(packagePath, 'utf8')

  initProject({ appPath })
  const secondPackage = fs.readFileSync(packagePath, 'utf8')
  const pkg = readJson(packagePath)

  assert.equal(pkg.scripts.test, 'node ./custom-test-runner.js')
  assert.equal(pkg.scripts['test:sounding'], TEST_COMMAND)
  assert.equal(pkg.devDependencies.sounding, 'workspace:*')
  assert.equal(fs.readFileSync(factoryPath, 'utf8'), 'module.exports = customFactory\n')
  assert.equal(secondPackage, firstPackage)
})

test('initProject can scaffold optional config and detect Creator conventions', () => {
  const appPath = createTempApp()
  fs.writeFileSync(path.join(appPath, 'api', 'models', 'Creator.js'), 'module.exports = {}\n')
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify({ name: 'creator-app', private: true }, null, 2)
  )

  const result = initProject({ appPath, config: true })
  const configPath = path.join(appPath, 'config', 'sounding.js')

  assert.equal(result.auth.identity, 'creator')
  assert.equal(result.auth.collection, 'creators')
  assert.match(fs.readFileSync(configPath, 'utf8'), /module\.exports\.sounding/)
  assert.match(
    fs.readFileSync(path.join(appPath, 'tests', 'factories', 'creator.js'), 'utf8'),
    /defineFactory\('creator'/
  )
  assert.match(
    fs.readFileSync(path.join(appPath, 'tests', 'scenarios', 'signed-in-creator.js'), 'utf8'),
    /creators:/
  )
})

test('bin/sounding.js runs init from the command line', () => {
  const appPath = createTempApp()
  fs.writeFileSync(path.join(appPath, 'api', 'models', 'User.js'), 'module.exports = {}\n')
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify({ name: 'cli-app', private: true }, null, 2)
  )

  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'bin', 'sounding.js'),
    'init',
    '--app',
    appPath,
  ])

  assert.equal(result.status, 0, result.stderr.toString())
  assert.match(result.stdout.toString(), /Sounding initialized/)
  assert.equal(fs.existsSync(path.join(appPath, 'tests', 'sounding', 'examples.test.js')), true)
})

test('bin/sounding.js shows help and reports missing option values', () => {
  const help = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'bin', 'sounding.js'),
    '--help',
  ])

  assert.equal(help.status, 0)
  assert.match(help.stdout.toString(), /Usage:/)

  const missingApp = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'bin', 'sounding.js'),
    'init',
    '--app',
  ])

  assert.equal(missingApp.status, 1)
  assert.match(missingApp.stderr.toString(), /requires a path/)
})
