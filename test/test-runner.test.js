const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  DEFAULT_JUNIT_DESTINATION,
  DEFAULT_REPORTER_PATH,
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

function createChildEnv() {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return env
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

test('buildTestCommand uses the Sounding reporter by default', () => {
  const appPath = createTempApp()
  const command = buildTestCommand({
    appPath,
    nodeExecutable: 'node',
    argv: ['tests/account.test.js'],
  })

  assert.deepEqual(command.args, [
    '--test',
    '--test-reporter',
    DEFAULT_REPORTER_PATH,
    'tests/account.test.js',
  ])
})

test('buildTestCommand maps Sounding reporter mode flags to environment', () => {
  const appPath = createTempApp()
  const command = buildTestCommand({
    appPath,
    nodeExecutable: 'node',
    argv: ['--compact', '--verbose', '--raw-error', 'tests/account.test.js'],
  })

  assert.deepEqual(command.env, {
    SOUNDING_REPORTER_COMPACT: '1',
    SOUNDING_REPORTER_VERBOSE: '1',
    SOUNDING_DIAGNOSTICS: 'verbose',
    SOUNDING_RAW: '1',
  })
  assert.deepEqual(command.args, [
    '--test',
    '--test-reporter',
    DEFAULT_REPORTER_PATH,
    'tests/account.test.js',
  ])
})

test('buildTestCommand can request the Sounding reporter explicitly', () => {
  const appPath = createTempApp()
  const command = buildTestCommand({
    appPath,
    nodeExecutable: 'node',
    argv: ['--reporter', 'sounding', 'tests/account.test.js'],
  })

  assert.deepEqual(command.args, [
    '--test',
    '--test-reporter',
    DEFAULT_REPORTER_PATH,
    'tests/account.test.js',
  ])
})

test('formatTestCommand produces a copyable dry-run command', () => {
  const command = {
    command: 'node',
    args: ['--test', '--test-name-pattern', 'sign in', 'tests/account.test.js'],
    cwd: process.cwd(),
    env: {
      SOUNDING_REPORTER_VERBOSE: '1',
    },
    files: ['tests/account.test.js'],
    dryRun: true,
  }

  assert.equal(
    formatTestCommand(command),
    'SOUNDING_REPORTER_VERBOSE=1 node --test --test-name-pattern "sign in" tests/account.test.js'
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
  ], { env: createChildEnv() })

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
  ], { env: createChildEnv() })

  assert.equal(result.status, 0, result.stderr.toString())
})

test('bin/sounding.js shows a readable PASS block for small successful runs', () => {
  const appPath = createTempApp()
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'bin', 'sounding.js'),
    'test',
    '--app',
    appPath,
    '--file',
    'tests/account.test.js',
  ], { env: createChildEnv() })
  const stdout = result.stdout.toString()

  assert.equal(result.status, 0, result.stderr.toString())
  assert.match(stdout, /PASS\s+tests\/account\.test\.js/)
  assert.match(stdout, /✓ account/)
  assert.match(stdout, /PASS\s+Tests:\s+1 passed, 1 total/)
  assert.doesNotMatch(stdout, /Tests:\s{2,}\d/)
  assert.match(stdout, /\n\n {6}Duration: \d+ms/)
  assert.doesNotMatch(stdout, /\n\n {0,5}Duration:/)
})

test('bin/sounding.js uses the Sounding reporter for failures by default', () => {
  const appPath = createTempApp()
  const testPath = path.join(appPath, 'tests', 'billing.test.js')
  fs.writeFileSync(
    testPath,
    `const test = require('node:test')
const { createExpect: expect } = require(${JSON.stringify(path.join(__dirname, '..'))})

test('creator sees billing summary', () => {
  const response = {
    status: 500,
    statusText: 'Server Error',
    headers: { 'content-type': 'application/json' },
    data: { message: 'boom' },
    request: {
      method: 'GET',
      target: '/api/billing/summary',
      transport: 'http',
      url: 'http://localhost:1337/api/billing/summary',
      headers: { accept: 'application/json' }
    }
  }

  expect(response).toHaveStatus(200)
})
`
  )

  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'bin', 'sounding.js'),
    'test',
    '--app',
    appPath,
    '--file',
    'tests/billing.test.js',
  ], { env: createChildEnv() })
  const stdout = result.stdout.toString()

  assert.equal(result.status, 1, `${stdout}\n${result.stderr.toString()}`)
  assert.match(stdout, /FAIL\s+tests\/billing\.test\.js/)
  assert.match(stdout, /× creator sees billing summary/)
  assert.match(stdout, /Expected response status 200, received 500\./)
  assert.match(stdout, /Request\n\s+GET \/api\/billing\/summary/)
  assert.match(stdout, /Response\n\s+500 Server Error/)
  assert.match(stdout, /Body\n\s+\{"message":"boom"\}/)
  assert.match(stdout, /->\s+\d+\s+expect\(response\)\.toHaveStatus\(200\)/)
  assert.doesNotMatch(stdout, /AssertionError/)
})

test('bin/sounding.js can include raw error details on demand', () => {
  const appPath = createTempApp()
  const testPath = path.join(appPath, 'tests', 'math.test.js')
  fs.writeFileSync(
    testPath,
    `const test = require('node:test')
const assert = require('node:assert/strict')

test('adds numbers', () => {
  assert.equal(1 + 1, 3)
})
`
  )

  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'bin', 'sounding.js'),
    'test',
    '--app',
    appPath,
    '--file',
    'tests/math.test.js',
    '--raw-error',
  ], { env: createChildEnv() })
  const stdout = result.stdout.toString()

  assert.equal(result.status, 1, `${stdout}\n${result.stderr.toString()}`)
  assert.match(stdout, /Raw/)
  assert.match(stdout, /"cause":/)
  assert.match(stdout, /ERR_TEST_FAILURE|ERR_ASSERTION|AssertionError/)
})
