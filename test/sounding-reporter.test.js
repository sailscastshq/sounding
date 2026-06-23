const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const reporter = require('../lib/sounding-reporter')

test('parseTrial builds a SoundingTrial with a structured failure payload', () => {
  const cause = new Error(
    [
      'Expected response status 200, received 500.',
      '',
      'Sounding response diagnostics:',
      '- Request: GET /api/billing/summary (http)',
      '- Request headers: accept=application/json',
      '- Response: 500 Server Error',
      '- Headers: content-type=application/json',
      '- Body: {"message":"boom"}',
    ].join('\n')
  )
  cause.sounding = {
    world: {
      name: 'signed-in-creator',
      actor: 'owner',
      context: {
        plan: 'pro',
      },
    },
    browserArtifacts: {
      project: 'mobile',
      screenshot: '.tmp/sounding/artifacts/billing/mobile/screenshot.png',
    },
  }
  cause.stack = ''

  const wrapper = new Error('test code failure')
  wrapper.code = 'ERR_TEST_FAILURE'
  wrapper.failureType = 'testCodeFailure'
  wrapper.cause = cause
  wrapper.stack = ''

  const trial = reporter.parseTrial(
    {
      name: 'creator sees billing summary',
      file: path.join(process.cwd(), 'tests', 'billing.test.js'),
      line: 4,
      column: 3,
      details: {
        error: wrapper,
      },
    },
    'failed',
    {
      sourceLoader() {
        return [
          "const { test } = require('sounding')",
          '',
          "test('creator sees billing summary', async ({ expect }) => {",
          '  expect(response).toHaveStatus(200)',
          '})',
        ].join('\n')
      },
    }
  )

  assert.equal(trial.type, 'SoundingTrial')
  assert.equal(trial.status, 'failed')
  assert.equal(trial.failure.type, 'SoundingFailure')
  assert.equal(trial.failure.message, 'Expected response status 200, received 500.')
  assert.deepEqual(trial.metadataGroups.map((group) => group.title), [
    'World',
    'Request',
    'Response',
    'Body',
    'Browser',
  ])
  assert.equal(trial.failure.causeChain.length, 2)
  assert.equal(
    trial.failure.codeFrame.lines.find((line) => line.highlighted).source,
    '  expect(response).toHaveStatus(200)'
  )
})

test('parseTrial keeps passed trials lightweight', () => {
  const trial = reporter.parseTrial(
    {
      name: 'JSON paths read like product facts',
      file: path.join(process.cwd(), 'tests', 'arch.test.js'),
      details: {
        duration_ms: 1.4,
      },
    },
    'passed'
  )

  assert.deepEqual(trial, {
    type: 'SoundingTrial',
    status: 'passed',
    name: 'JSON paths read like product facts',
    file: path.join(process.cwd(), 'tests', 'arch.test.js'),
    line: undefined,
    column: undefined,
    durationMs: 1.4,
    event: {
      name: 'JSON paths read like product facts',
      file: path.join(process.cwd(), 'tests', 'arch.test.js'),
      details: {
        duration_ms: 1.4,
      },
    },
    metadataGroups: [],
  })
})

test('formatPassedGroups accepts raw Node pass events', () => {
  const rendered = reporter.formatPassedGroups(
    [
      {
        name: 'JSON paths read like product facts',
        file: path.join(process.cwd(), 'tests', 'arch.test.js'),
        details: {
          duration_ms: 2,
        },
      },
    ],
    {
      green: (value) => value,
      bold: (value) => value,
      dim: (value) => value,
    }
  )

  assert.match(rendered, /PASS\s+tests\/arch\.test\.js/)
  assert.match(rendered, /✓ JSON paths read like product facts\s+2ms/)
})

test('renderFailure can include raw wrapper error details and cause chains', () => {
  const cause = new Error('expected 2 to equal 3')
  const wrapper = new Error('test failed')
  wrapper.code = 'ERR_TEST_FAILURE'
  wrapper.failureType = 'testCodeFailure'
  wrapper.cause = cause

  const failure = reporter.parseFailure({
    name: 'adds numbers',
    file: path.join(process.cwd(), 'tests', 'math.test.js'),
    line: 3,
    details: {
      error: wrapper,
    },
  })
  const rendered = reporter.renderFailure(failure, {
    raw: true,
    verbose: false,
  })

  assert.match(rendered, /Caused by/)
  assert.match(rendered, /Error: expected 2 to equal 3/)
  assert.match(rendered, /Raw/)
  assert.match(rendered, /"code": "ERR_TEST_FAILURE"/)
  assert.match(rendered, /"cause":/)
})
