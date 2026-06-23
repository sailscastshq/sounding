const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const reporter = require('../lib/sounding-reporter')

test('parseFailure builds a structured SoundingFailure before terminal rendering', () => {
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

  const failure = reporter.parseFailure(
    {
      name: 'creator sees billing summary',
      file: path.join(process.cwd(), 'tests', 'billing.test.js'),
      line: 4,
      column: 3,
      details: {
        error: wrapper,
      },
    },
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

  assert.equal(failure.type, 'SoundingFailure')
  assert.equal(failure.message, 'Expected response status 200, received 500.')
  assert.deepEqual(failure.metadataGroups.map((group) => group.title), [
    'World',
    'Request',
    'Response',
    'Body',
    'Browser',
  ])
  assert.equal(failure.causeChain.length, 2)
  assert.equal(
    failure.codeFrame.lines.find((line) => line.highlighted).source,
    '  expect(response).toHaveStatus(200)'
  )
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
