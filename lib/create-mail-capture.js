const path = require('node:path')
const url = require('node:url')

function normalizeList(value) {
  if (value === undefined || value === null || value === '') {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeList(entry))
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  return [value]
}

function extractLinks(html) {
  if (!html) {
    return []
  }

  const matches = html.matchAll(/href=["']([^"']+)["']/gi)
  return [...matches].map((match) => match[1])
}

function resolvePrimaryLink(inputs = {}, links = []) {
  const templateData = inputs.templateData || {}
  const preferredKeys = [
    'magicLinkUrl',
    'verificationUrl',
    'resetPasswordUrl',
    'inviteUrl',
    'checkoutUrl',
    'actionUrl',
    'url',
  ]

  for (const key of preferredKeys) {
    if (templateData[key]) {
      return templateData[key]
    }
  }

  return links.find((link) => !/\/unsubscribe\b/i.test(link)) || links[0]
}

function createRenderViewPromise(view) {
  if (!view) {
    return Promise.resolve(undefined)
  }

  if (typeof view.intercept === 'function') {
    return view.intercept((error) => error)
  }

  return Promise.resolve(view)
}

async function renderTemplatePreview(sails, {
  template,
  templateData = {},
  layout = 'layout-email',
}) {
  if (!template || typeof sails?.renderView !== 'function') {
    return undefined
  }

  const emailTemplatePath = path.join('emails/', template)
  let emailTemplateLayout = false

  if (layout) {
    emailTemplateLayout = path.relative(
      path.dirname(emailTemplatePath),
      path.resolve('layouts/', layout)
    )
  }

  return createRenderViewPromise(
    sails.renderView(emailTemplatePath, {
      layout: emailTemplateLayout,
      url,
      ...templateData,
    })
  )
}

function resolveMailConfig(sails) {
  return sails?.config?.mail || {}
}

function resolveMailerName(sails, inputs = {}) {
  return inputs.mailer || process.env.MAIL_MAILER || resolveMailConfig(sails).default
}

function resolveTransportName(sails, mailer) {
  return resolveMailConfig(sails).mailers?.[mailer]?.transport
}

function resolveFromAddress(sails, inputs = {}) {
  return inputs.from || resolveMailConfig(sails).from?.address || process.env.MAIL_FROM_ADDRESS
}

function resolveFromName(sails, inputs = {}) {
  return inputs.fromName || resolveMailConfig(sails).from?.name || process.env.MAIL_FROM_NAME
}

function resolveReplyTo(sails, inputs = {}) {
  return inputs.replyTo || resolveMailConfig(sails).replyTo || process.env.MAIL_REPLY_TO
}

function toErrorShape(error) {
  if (!error) {
    return undefined
  }

  return {
    name: error.name,
    message: error.message,
  }
}

async function buildCapturedMail(sails, inputs = {}) {
  const mailer = resolveMailerName(sails, inputs)
  const transport = resolveTransportName(sails, mailer)
  const html = await renderTemplatePreview(sails, inputs)
  const links = extractLinks(html)

  return {
    mailer,
    transport,
    template: inputs.template,
    templateData: inputs.templateData || {},
    to: normalizeList(inputs.to),
    cc: normalizeList(inputs.cc),
    bcc: normalizeList(inputs.bcc),
    toName: inputs.toName,
    subject: inputs.subject || '',
    from: resolveFromAddress(sails, inputs),
    fromName: resolveFromName(sails, inputs),
    replyTo: resolveReplyTo(sails, inputs),
    text: inputs.text,
    html,
    links,
    ctaUrl: resolvePrimaryLink(inputs, links),
    attachments: inputs.attachments || [],
    headers: inputs.headers || {},
    layout: inputs.layout === undefined ? 'layout-email' : inputs.layout,
  }
}

function createMailCapture({ sails, mailbox, getConfig }) {
  let originalSend = null

  function resolveMailSettings() {
    const soundingConfig =
      typeof getConfig === 'function' ? getConfig() : sails?.config?.sounding || {}

    return soundingConfig.mail || {}
  }

  function isEnabled() {
    return resolveMailSettings().capture !== false
  }

  function shouldPassthrough() {
    const settings = resolveMailSettings()
    return settings.deliver === true || settings.mode === 'passthrough'
  }

  function wrapDeferred(executor, onRejected) {
    let promise = Promise.resolve().then(executor)

    if (typeof onRejected === 'function') {
      promise = promise.catch(async (error) => {
        await onRejected(error)
        throw error
      })
    }

    const deferred = {
      intercept(handler) {
        promise = promise.catch((error) => handler(error))
        return deferred
      },

      then(onFulfilled, onRejected) {
        return promise.then(onFulfilled, onRejected)
      },

      catch(onRejected) {
        return promise.catch(onRejected)
      },

      finally(onFinally) {
        return promise.finally(onFinally)
      },
    }

    return deferred
  }

  function directSuccess(inputs = {}) {
    return captureSuccessfulSend(inputs).then(() => ({}))
  }

  function directPassthrough(sendHelper, inputs = {}) {
    return Promise.resolve(resolveDirectInvoker(sendHelper)(inputs))
      .then(async (result) => {
        await captureSuccessfulSend(inputs)
        return result
      })
      .catch(async (error) => {
        await captureFailedSend(inputs, error)
        throw error
      })
  }

  function deferredSuccess(inputs = {}) {
    return wrapDeferred(async () => {
      await captureSuccessfulSend(inputs)
      return {}
    })
  }

  function deferredPassthrough(sendHelper, inputs = {}) {
    return wrapDeferred(
      async () => {
        const result = await resolveWithInvoker(sendHelper)(inputs)
        await captureSuccessfulSend(inputs)
        return result
      },
      async (error) => {
        await captureFailedSend(inputs, error)
      }
    )
  }

  function resolveDirectInvoker(sendHelper) {
    if (typeof sendHelper === 'function') {
      return sendHelper.bind(sendHelper)
    }

    if (typeof sendHelper?.with === 'function') {
      return sendHelper.with.bind(sendHelper)
    }

    throw new Error('Sounding could not invoke `sails.helpers.mail.send`.')
  }

  function resolveWithInvoker(sendHelper) {
    if (typeof sendHelper?.with === 'function') {
      return sendHelper.with.bind(sendHelper)
    }

    if (typeof sendHelper === 'function') {
      return sendHelper.bind(sendHelper)
    }

    throw new Error('Sounding could not invoke `sails.helpers.mail.send.with()`.')
  }

  async function captureSuccessfulSend(inputs = {}) {
    try {
      const message = await buildCapturedMail(sails, inputs)
      mailbox.capture({
        ...message,
        status: 'sent',
      })
    } catch (error) {
      mailbox.capture({
        mailer: resolveMailerName(sails, inputs),
        transport: resolveTransportName(sails, resolveMailerName(sails, inputs)),
        to: normalizeList(inputs.to),
        subject: inputs.subject || '',
        template: inputs.template,
        status: 'sent',
        captureError: toErrorShape(error),
      })
    }
  }

  async function captureFailedSend(inputs = {}, error) {
    let message

    try {
      message = await buildCapturedMail(sails, inputs)
    } catch (captureError) {
      message = {
        mailer: resolveMailerName(sails, inputs),
        transport: resolveTransportName(sails, resolveMailerName(sails, inputs)),
        to: normalizeList(inputs.to),
        subject: inputs.subject || '',
        template: inputs.template,
        captureError: toErrorShape(captureError),
      }
    }

    mailbox.capture({
      ...message,
      status: 'failed',
      error: toErrorShape(error),
    })
  }

  function wrapSendHelper(sendHelper) {
    const wrapped = async (inputs = {}) => {
      return shouldPassthrough()
        ? directPassthrough(sendHelper, inputs)
        : directSuccess(inputs)
    }

    const descriptors = Object.getOwnPropertyDescriptors(sendHelper)
    delete descriptors.with
    Object.defineProperties(wrapped, descriptors)

    Object.defineProperty(wrapped, 'with', {
      value(inputs = {}) {
        return shouldPassthrough()
          ? deferredPassthrough(sendHelper, inputs)
          : deferredSuccess(inputs)
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(wrapped, '__soundingWrapped', {
      value: true,
      configurable: true,
    })

    Object.defineProperty(wrapped, '__soundingOriginal', {
      value: sendHelper,
      configurable: true,
    })

    return wrapped
  }

  function install() {
    if (!isEnabled()) {
      return false
    }

    const sendHelper = sails?.helpers?.mail?.send
    if (!sendHelper) {
      return false
    }

    if (sendHelper.__soundingWrapped) {
      originalSend = sendHelper.__soundingOriginal || originalSend
      return true
    }

    originalSend = sendHelper
    sails.helpers.mail.send = wrapSendHelper(sendHelper)
    return true
  }

  function uninstall() {
    if (!originalSend || !sails?.helpers?.mail) {
      return false
    }

    sails.helpers.mail.send = originalSend
    originalSend = null
    return true
  }

  return {
    install,
    uninstall,
    get installed() {
      return Boolean(originalSend) && Boolean(sails?.helpers?.mail?.send?.__soundingWrapped)
    },
  }
}

module.exports = {
  createMailCapture,
  buildCapturedMail,
  extractLinks,
  normalizeList,
  resolvePrimaryLink,
  renderTemplatePreview,
}
