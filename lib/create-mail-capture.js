const path = require('node:path')
const url = require('node:url')

const DEFAULT_MAIL_LAYOUT = 'mail'

/** @typedef {import('./types').AnyRecord} AnyRecord */
/** @typedef {import('./types').SoundingMailCapture} SoundingMailCapture */
/** @typedef {import('./types').SoundingMailbox} SoundingMailbox */
/** @typedef {import('./types').SoundingMailMessage} SoundingMailMessage */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */

/**
 * @param {any} value
 * @returns {any[]}
 */
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

/**
 * @param {string | undefined} html
 * @returns {string[]}
 */
function extractLinks(html) {
  if (!html) {
    return []
  }

  const matches = html.matchAll(/href=["']([^"']+)["']/gi)
  return [...matches].map((match) => match[1])
}

/**
 * @param {AnyRecord} [inputs]
 * @param {string[]} [links]
 * @returns {string | undefined}
 */
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

/**
 * @param {any} view
 * @returns {Promise<string | undefined>}
 */
function createRenderViewPromise(view) {
  if (!view) {
    return Promise.resolve(undefined)
  }

  if (typeof view.intercept === 'function') {
    return view.intercept((error) => error)
  }

  return Promise.resolve(view)
}

/**
 * @param {SoundingSailsApp} sails
 * @param {AnyRecord} [inputs]
 * @param {AnyRecord} [options]
 * @returns {Promise<string | undefined>}
 */
async function renderTemplatePreview(sails, inputs = {}, options = {}) {
  const { template, templateData = {} } = inputs

  if (!template || typeof sails?.renderView !== 'function') {
    return undefined
  }

  const resolvedLayout = resolvePreviewLayout(sails, inputs, options)
  const emailTemplatePath = path.join('emails/', template)
  /** @type {string | false} */
  let emailTemplateLayout = false

  if (resolvedLayout) {
    emailTemplateLayout = path.relative(
      path.dirname(emailTemplatePath),
      path.resolve('layouts/', resolvedLayout)
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

/**
 * @param {SoundingSailsApp} sails
 * @returns {AnyRecord}
 */
function resolveMailConfig(sails) {
  return sails?.config?.mail || {}
}

/**
 * @param {SoundingSailsApp} sails
 * @param {AnyRecord} [options]
 * @returns {AnyRecord}
 */
function resolveSoundingMailConfig(sails, options = {}) {
  if (options.mailSettings) {
    return options.mailSettings
  }

  const soundingConfig =
    options.soundingConfig || options.config || sails?.config?.sounding || {}

  return soundingConfig.mail || {}
}

/**
 * @param {SoundingSailsApp} sails
 * @param {AnyRecord} [inputs]
 * @param {AnyRecord} [options]
 * @returns {string | false | undefined}
 */
function resolvePreviewLayout(sails, inputs = {}, options = {}) {
  if (Object.prototype.hasOwnProperty.call(inputs, 'layout')) {
    return inputs.layout
  }

  const mailSettings = resolveSoundingMailConfig(sails, options)

  if (Object.prototype.hasOwnProperty.call(mailSettings, 'layout')) {
    return mailSettings.layout
  }

  return DEFAULT_MAIL_LAYOUT
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

/**
 * @param {SoundingSailsApp} sails
 * @param {AnyRecord} [inputs]
 * @param {AnyRecord} [options]
 * @returns {Promise<SoundingMailMessage>}
 */
async function buildCapturedMail(sails, inputs = {}, options = {}) {
  const mailer = resolveMailerName(sails, inputs)
  const transport = resolveTransportName(sails, mailer)
  const layout = resolvePreviewLayout(sails, inputs, options)
  const html = await renderTemplatePreview(sails, inputs, options)
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
    layout,
  }
}

/**
 * @param {{ sails?: SoundingSailsApp, mailbox: SoundingMailbox, getConfig?: () => AnyRecord }} input
 * @returns {SoundingMailCapture}
 */
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

  function resolveMessageLayout(inputs = {}) {
    return resolvePreviewLayout(sails, inputs, {
      mailSettings: resolveMailSettings(),
    })
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
      const message = await buildCapturedMail(sails, inputs, {
        mailSettings: resolveMailSettings(),
      })
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
        layout: resolveMessageLayout(inputs),
        status: 'sent',
        captureError: toErrorShape(error),
      })
    }
  }

  async function captureFailedSend(inputs = {}, error) {
    let message

    try {
      message = await buildCapturedMail(sails, inputs, {
        mailSettings: resolveMailSettings(),
      })
    } catch (captureError) {
      message = {
        mailer: resolveMailerName(sails, inputs),
        transport: resolveTransportName(sails, resolveMailerName(sails, inputs)),
        to: normalizeList(inputs.to),
        subject: inputs.subject || '',
        template: inputs.template,
        layout: resolveMessageLayout(inputs),
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
  resolvePreviewLayout,
}
