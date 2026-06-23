const test = require('node:test')
const { createExpect: expect } = require('../../..')

test('request helpers stay response-shaped', () => {
  expect({
    status: 200,
    data: {
      ok: true,
    },
  }).toHaveStatus(200)
})

test('JSON paths read like product facts', () => {
  expect({
    data: {
      billing: {
        plan: 'pro',
      },
    },
  }).toHaveJsonPath('billing.plan', 'pro')
})
