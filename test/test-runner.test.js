const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  DEFAULT_JUNIT_DESTINATION,
  buildTestCommand,
  formatTestCommand,
  resolveTestFiles,
} = require('../lib/test-runner')

function createTempApp() {
  const appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sounding-test-runner-'))
  fs.mkdirSync(path.join(appPath, 'tests', 'browser'), { recursive: true })
  fs.mkdirSync(path.join(appPath, 'test'), { recursive: true })
  fs.writeFileSync(path.join(appPath, 'tests', 'account.test.js'), "require('node:test')('account', () => {})\n")
  fs.writeFileSync(path.join(appPath, 'tests', 'browser', 'login.test.js'), "require('node:test')('login', () => {})\n")
  fs.writeFileSync(path.join(appPath, 'test', 'legacy.test.js'), "require('node:test')('legacy', () => {})\n")
  fs.writeFileSync(path.join(appPath, 'tests', 'readme.md'), '# ignored\n')
  return appPath
}

test('resolveTestFiles discovers tests and test directories by default', () => {
  const appPath = createTempApp()

  assert.deepEqual(resolveTestFiles(appPath, []), [
    'test/legacy.test.js',
    'tests/account.test.js',
    'tests/browser/login.test.js',
  ])
})

test('buildTestCommand maps Sounding flags to node --test flags', () => {
  const appPath = createTempApp()
  const command = buildTestCommand({
    appPath,
    nodeExecutable: 'node',
    argv: [
      '--grep',
      'login',
      '--file',
      'tests/account.test.js',
      '--reporter',
      'spec',
      '--watch',
      '--coverage',
      '--dry-run',
    ],
  })

  assert.equal(command.command, 'node')
  assert.equal(command.cwd, appPath)
  assert.equal(command.dryRun, true)
  assert.deepEqual(command.files, ['tests/account.test.js'])
  assert.deepEqual(command.args, [
    '--test',
    '--test-name-pattern',
    'login',
    '--test-reporter',
    'spec',
    '--watch',
    '--experimental-test-coverage',
    'tests/account.test.js',
  ])
})

test('buildTestCommand supports lane filters and CI reporters', () => {
  const appPath = createTempApp()
  const command = buildTestCommand({
    appPath,
    nodeExecutable: 'node',
    argv: ['--lane', 'browser', '--junit'],
  })

  assert.deepEqual(command.files, ['tests/browser/login.test.js'])
  assert.deepEqual(command.args, [
    '--test',
    '--test-reporter',
    'junit',
    '--test-reporter-destination',
    DEFAULT_JUNIT_DESTINATION,
    'tests/browser/login.test.js',
  ])
})

test('buildTestCommand preserves Node test runner pass-through flags', () => {
  const appPath = createTempApp()
  const command = buildTestCommand({
    appPath,
    nodeExecutable: 'node',
    argv: ['--test-concurrency=1', '--test-reporter', 'tap', 'tests/**/*.test.js'],
  })

  assert.deepEqual(command.args, [
    '--test',
    '--test-concurrency=1',
    '--test-reporter',
    'tap',
    'tests/account.test.js',
    'tests/browser/login.test.js',
  ])
})

test('formatTestCommand produces a copyable dry-run command', () => {
  const command = {
    command: 'node',
    args: ['--test', '--test-name-pattern', 'sign in', 'tests/account.test.js'],
    cwd: process.cwd(),
    files: ['tests/account.test.js'],
    dryRun: true,
  }

  assert.equal(
    formatTestCommand(command),
    'node --test --test-name-pattern "sign in" tests/account.test.js'
  )
})

test('bin/sounding.js can dry-run the test command', () => {
  const appPath = createTempApp()
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'bin', 'sounding.js'),
    'test',
    '--app',
    appPath,
    '--grep',
    'account',
    '--dry-run',
  ])

  assert.equal(result.status, 0, result.stderr.toString())
  assert.match(result.stdout.toString(), /--test-name-pattern account/)
  assert.match(result.stdout.toString(), /tests\/account\.test\.js/)
})

test('bin/sounding.js can run a selected test file', () => {
  const appPath = createTempApp()
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'bin', 'sounding.js'),
    'test',
    '--app',
    appPath,
    '--file',
    'tests/account.test.js',
  ])

  assert.equal(result.status, 0, result.stderr.toString())
})
