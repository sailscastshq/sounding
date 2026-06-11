const test = require('node:test')
const assert = require('node:assert/strict')

const { createSoundingError } = require('../lib/create-error')

test('createSoundingError adds stable code and structured details', () => {
  const cause = new SyntaxError('Unexpected end of JSON input')
  const error = createSoundingError({
    code: 'E_SOUNDING_EXAMPLE',
    message: 'Sounding example failed.',
    details: {
      resource: 'example',
      status: 500,
    },
    cause,
  })

  assert.equal(error.name, 'SoundingError')
  assert.equal(error.code, 'E_SOUNDING_EXAMPLE')
  assert.equal(error.message, 'Sounding example failed.')
  assert.equal(error.resource, 'example')
  assert.equal(error.status, 500)
  assert.deepEqual(error.details, {
    resource: 'example',
    status: 500,
  })
  assert.equal(error.cause, cause)
})

test('createSoundingError can preserve a domain-specific error name', () => {
  const error = createSoundingError({
    code: 'E_SOUNDING_JSON_PARSE',
    message: 'Sounding could not parse JSON response.',
    name: 'SoundingJsonParseError',
  })

  assert.equal(error.name, 'SoundingJsonParseError')
  assert.equal(error.code, 'E_SOUNDING_JSON_PARSE')
})

test('createSoundingError keeps canonical fields stable when details collide', () => {
  const error = createSoundingError({
    code: 'E_SOUNDING_EXAMPLE',
    message: 'Sounding example failed.',
    details: {
      code: 'E_USER_DETAIL',
      name: 'UserDetailError',
      message: 'User detail message.',
      details: {
        nested: true,
      },
      resource: 'example',
    },
  })

  assert.equal(error.name, 'SoundingError')
  assert.equal(error.code, 'E_SOUNDING_EXAMPLE')
  assert.equal(error.message, 'Sounding example failed.')
  assert.equal(error.resource, 'example')
  assert.deepEqual(error.details, {
    code: 'E_USER_DETAIL',
    name: 'UserDetailError',
    message: 'User detail message.',
    details: {
      nested: true,
    },
    resource: 'example',
  })
})
