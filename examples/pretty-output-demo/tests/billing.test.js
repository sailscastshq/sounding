const test = require('node:test')
const { createExpect: expect } = require('../../..')

test('creator sees billing summary', () => {
  const response = {
    status: 500,
    statusText: 'Server Error',
    headers: {
      'content-type': 'application/json',
    },
    data: {
      message: 'boom',
    },
    request: {
      method: 'GET',
      target: '/api/billing/summary',
      transport: 'http',
      url: 'http://localhost:1337/api/billing/summary',
      headers: {
        accept: 'application/json',
      },
    },
  }

  expect(response).toHaveStatus(200)
})
