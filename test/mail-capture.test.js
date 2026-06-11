const test = require('node:test')
const assert = require('node:assert/strict')

const { createRuntime } = require('../lib/create-runtime')
const { buildCapturedMail, createMailCapture } = require('../lib/create-mail-capture')
const { createExpect } = require('../lib/create-expect')

function createRenderView(htmlBuilder) {
  return (viewPath, locals) => ({
    intercept: async () => htmlBuilder(viewPath, locals),
  })
}

test('buildCapturedMail renders the email preview and extracts links', async () => {
  let previewLayout
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
      previewLayout = locals.layout
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
  assert.equal(message.layout, 'mail')
  assert.equal(previewLayout, '../layouts/mail')
  createExpect(message).toHaveCtaUrl(/magic-link\/token-123/)
  createExpect(message).not.toHaveCtaUrl(/reset-password/)
})

test('buildCapturedMail honors the configured preview layout for compatibility', async () => {
  let previewLayout
  const sails = {
    config: {
      sounding: {
        mail: {
          layout: 'layout-email',
        },
      },
    },
    renderView: createRenderView((_viewPath, locals) => {
      previewLayout = locals.layout
      return '<p>Hello</p>'
    }),
  }

  const message = await buildCapturedMail(sails, {
    template: 'reset-password',
    to: 'reader@example.com',
  })

  assert.equal(message.layout, 'layout-email')
  assert.equal(previewLayout, '../layouts/layout-email')
})

test('buildCapturedMail keeps explicit layout overrides in preview metadata', async () => {
  let previewLayout
  const sails = {
    config: {},
    renderView: createRenderView((_viewPath, locals) => {
      previewLayout = locals.layout
      return '<p>Hello</p>'
    }),
  }

  const message = await buildCapturedMail(sails, {
    template: 'reset-password',
    to: 'reader@example.com',
    layout: false,
  })

  assert.equal(message.layout, false)
  assert.equal(previewLayout, false)
})

test('runtime mail capture reports uninvokable send helpers with a stable code', async () => {
  const sails = {
    config: {
      sounding: {
        mail: {
          deliver: true,
        },
      },
    },
    helpers: {
      mail: {
        send: {},
      },
    },
  }
  const mailbox = {
    capture() {},
  }
  const capture = createMailCapture({
    sails,
    mailbox,
    getConfig: () => sails.config.sounding,
  })

  capture.install()

  try {
    await assert.rejects(
      async () => {
        await sails.helpers.mail.send({ to: 'reader@example.com' })
      },
      (error) => {
        assert.equal(error.code, 'E_SOUNDING_MAIL_SEND_UNAVAILABLE')
        return true
      }
    )
  } finally {
    capture.uninstall()
  }
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
  assert.equal(runtime.mailbox.latest().layout, 'mail')
  createExpect(runtime.mailbox).toHaveSentCount(1)
  createExpect(runtime.mailbox).toHaveSentMail({
    to: 'reader@example.com',
    subject: /sign in/i,
    template: 'email-magic-link',
    status: 'sent',
    ctaUrl: /magic-link\/kelvin$/,
    templateData: {
      magicLink: /magic-link\/kelvin$/,
    },
  })
  createExpect(runtime.mailbox.latest()).toHaveCtaUrl(/magic-link/)
  createExpect(runtime.mailbox).not.toHaveSentMail({ subject: /reset password/i })

  assert.throws(
    () => {
      createExpect(runtime.mailbox).toHaveSentMail({
        to: 'missing@example.com',
      })
    },
    (error) => {
      assert.match(error.message, /missing@example\.com/)
      assert.match(error.message, /reader@example\.com/)
      assert.match(error.message, /Sign in/)
      return true
    }
  )

  await runtime.lower()

  assert.equal(sails.helpers.mail.send, originalSend)
  assert.equal(runtime.mailbox.all().length, 0)
})

test('runtime mail capture honors sounding mail layout config', async () => {
  let previewLayout
  const originalSend = async () => ({})
  originalSend.with = async () => ({})

  const sails = {
    config: {
      sounding: {
        mail: {
          layout: 'layout-email',
        },
      },
      datastores: {
        default: {
          adapter: 'sails-sqlite',
          url: '.tmp/test.db',
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
      previewLayout = locals.layout
      return '<p>Hello</p>'
    }),
  }

  const runtime = createRuntime(sails)
  await runtime.boot({ mode: 'trial' })

  await sails.helpers.mail.send.with({
    template: 'reset-password',
    to: 'reader@example.com',
    subject: 'Reset your password',
  })

  assert.equal(runtime.mailbox.latest().layout, 'layout-email')
  assert.equal(previewLayout, '../layouts/layout-email')

  await runtime.lower()
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
  createExpect(runtime.mailbox).toHaveSentMail({
    status: 'failed',
    error: {
      message: /SMTP is down/,
    },
  })

  await runtime.lower()
})
