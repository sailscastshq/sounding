const test = require('node:test')
const assert = require('node:assert/strict')

const { createRuntime } = require('../lib/create-runtime')
const { buildCapturedMail } = require('../lib/create-mail-capture')

function createRenderView(htmlBuilder) {
  return (viewPath, locals) => ({
    intercept: async () => htmlBuilder(viewPath, locals),
  })
}

test('buildCapturedMail renders the email preview and extracts links', async () => {
  const sails = {
    config: {
      mail: {
        default: 'transactional',
        mailers: {
          transactional: {
            transport: 'smtp',
          },
        },
        from: {
          address: 'hello@africanengineer.com',
          name: 'The African Engineer',
        },
        replyTo: 'support@africanengineer.com',
      },
    },
    renderView: createRenderView((_viewPath, locals) => {
      return `<a href="${locals.magicLink}">Sign in</a>`
    }),
  }

  const message = await buildCapturedMail(sails, {
    template: 'email-magic-link',
    templateData: {
      magicLink: 'https://example.com/magic-link/token-123',
    },
    to: 'reader@example.com',
    subject: 'Sign in',
  })

  assert.equal(message.mailer, 'transactional')
  assert.equal(message.transport, 'smtp')
  assert.deepEqual(message.to, ['reader@example.com'])
  assert.equal(message.subject, 'Sign in')
  assert.equal(message.from, 'hello@africanengineer.com')
  assert.equal(message.fromName, 'The African Engineer')
  assert.equal(message.replyTo, 'support@africanengineer.com')
  assert.equal(message.ctaUrl, 'https://example.com/magic-link/token-123')
  assert.deepEqual(message.links, ['https://example.com/magic-link/token-123'])
})

test('runtime boot installs in-memory mail capture and lower restores the original helper', async () => {
  const sendCalls = []
  const originalSend = async function send(inputs) {
    sendCalls.push(['direct', inputs])
    return { accepted: [inputs.to] }
  }
  originalSend.with = async (inputs) => {
    sendCalls.push(['with', inputs])
    return { accepted: [inputs.to] }
  }

  const sails = {
    config: {
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
      mail: {
        default: 'transactional',
        mailers: {
          transactional: {
            transport: 'smtp',
          },
        },
      },
    },
    models: {},
    helpers: {
      mail: {
        send: originalSend,
      },
    },
    renderView: createRenderView((_viewPath, locals) => {
      return `<a href="${locals.magicLink}">Sign in</a>`
    }),
  }

  const runtime = createRuntime(sails)
  const booted = await runtime.boot({ mode: 'trial' })

  assert.equal(booted.mail.captureInstalled, true)
  assert.notEqual(sails.helpers.mail.send, originalSend)

  await sails.helpers.mail.send.with({
    template: 'email-magic-link',
    templateData: {
      magicLink: 'https://example.com/magic-link/kelvin',
    },
    to: 'reader@example.com',
    subject: 'Sign in',
  })

  assert.deepEqual(sendCalls, [])

  assert.equal(runtime.mailbox.latest().status, 'sent')
  assert.equal(runtime.mailbox.latest().subject, 'Sign in')
  assert.equal(runtime.mailbox.latest().ctaUrl, 'https://example.com/magic-link/kelvin')

  await runtime.lower()

  assert.equal(sails.helpers.mail.send, originalSend)
  assert.equal(runtime.mailbox.all().length, 0)
})

test('runtime can capture failed mail sends when passthrough delivery is enabled', async () => {
  const originalSend = async function send() {
    throw new Error('SMTP is down')
  }
  originalSend.with = async () => {
    throw new Error('SMTP is down')
  }

  const sails = {
    config: {
      sounding: {
        mail: {
          deliver: true,
        },
      },
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
        },
      },
      mail: {
        default: 'transactional',
        mailers: {
          transactional: {
            transport: 'smtp',
          },
        },
      },
    },
    models: {},
    helpers: {
      mail: {
        send: originalSend,
      },
    },
    renderView: createRenderView(() => '<p>No luck</p>'),
  }

  const runtime = createRuntime(sails)
  await runtime.boot({ mode: 'trial' })

  await assert.rejects(
    async () => {
      await sails.helpers.mail.send.with({
        to: 'reader@example.com',
        subject: 'Sign in',
      })
    },
    /SMTP is down/
  )

  assert.equal(runtime.mailbox.latest().status, 'failed')
  assert.equal(runtime.mailbox.latest().subject, 'Sign in')
  assert.equal(runtime.mailbox.latest().error.message, 'SMTP is down')

  await runtime.lower()
})
