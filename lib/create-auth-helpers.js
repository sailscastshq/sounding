const { resolveAuthConfig } = require('./resolve-auth-config')

/** @typedef {import('./types').SoundingActor} SoundingActor */
/** @typedef {import('./types').SoundingAuthHelpers} SoundingAuthHelpers */
/** @typedef {import('./types').SoundingBrowserLoginResult} SoundingBrowserLoginResult */
/** @typedef {import('./types').SoundingMagicLink} SoundingMagicLink */
/** @typedef {import('./types').SoundingMailbox} SoundingMailbox */
/** @typedef {import('./types').SoundingPage} SoundingPage */
/** @typedef {import('./types').SoundingPasswordRequestResult} SoundingPasswordRequestResult */
/** @typedef {import('./types').SoundingRequestMagicLinkResult} SoundingRequestMagicLinkResult */
/** @typedef {import('./types').SoundingRequestOptions} SoundingRequestOptions */
/** @typedef {import('./types').SoundingRequestClient} SoundingRequestClient */
/** @typedef {import('./types').SoundingSailsApp} SoundingSailsApp */
/** @typedef {import('./types').SoundingWorldEngine} SoundingWorldEngine */

/**
 * @param {any} value
 * @returns {string}
 */
function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

/**
 * @param {any} value
 * @returns {value is string}
 */
function looksLikeEmail(value) {
  return typeof value === 'string' && value.includes('@')
}

/**
 * @param {{
 *   sails?: SoundingSailsApp,
 *   world: SoundingWorldEngine,
 *   mailbox: SoundingMailbox,
 *   request: SoundingRequestClient,
 * }} input
 * @returns {SoundingAuthHelpers}
 */
function createAuthHelpers({ sails, world, mailbox, request }) {
  function getAuthConfig() {
    return resolveAuthConfig({ sails })
  }

  function getAuthModel() {
    return getAuthConfig().model
  }

  /**
   * @param {string} alias
   * @returns {SoundingActor | null}
   */
  function resolveWorldActor(alias) {
    if (!alias || typeof alias !== 'string') {
      return null
    }

    const auth = getAuthConfig()

    return (
      world.current?.[auth.worldCollection]?.[alias] ||
      world.current?.users?.[alias] ||
      world.current?.creators?.[alias] ||
      null
    )
  }

  /**
   * @param {string} email
   * @param {string} [fullName]
   * @returns {Promise<Record<string, any>>}
   */
  async function createUserFromEmail(email, fullName) {
    const auth = getAuthConfig()
    const User = getAuthModel()

    if (auth.modelIdentity !== 'user') {
      throw new Error(
        `Sounding auth helpers could not auto-create a missing ${auth.modelIdentity} record.`
      )
    }

    if (!sails?.helpers?.user?.signupWithTeam) {
      throw new Error(
        'Sounding auth helpers could not find `sails.helpers.user.signupWithTeam`.'
      )
    }

    const signupResult = await sails.helpers.user.signupWithTeam.with({
      fullName: fullName || normalizeEmail(email).split('@')[0],
      email: normalizeEmail(email),
      tosAcceptedByIp: '127.0.0.1',
      emailStatus: 'verified',
    })

    if (User?.updateOne) {
      await User.updateOne({ id: signupResult.user.id }).set({
        emailStatus: 'verified',
      })
    }

    if (User?.findOne) {
      return User.findOne({ id: signupResult.user.id })
    }

    return signupResult.user
  }

  /**
   * @param {SoundingActor | string} actorOrEmail
   * @param {{ createIfMissing?: boolean, fullName?: string, [key: string]: any }} [options]
   * @returns {Promise<Record<string, any>>}
   */
  async function resolveActor(actorOrEmail, options = {}) {
    const auth = getAuthConfig()
    const User = getAuthModel()

    if (!actorOrEmail) {
      throw new Error('Sounding auth helpers require an actor or email address.')
    }

    let candidate = actorOrEmail

    if (typeof candidate === 'string' && !looksLikeEmail(candidate)) {
      candidate = resolveWorldActor(candidate) || candidate
    }

    if (typeof candidate !== 'string' && candidate?.id && User?.findOne) {
      return User.findOne({ id: candidate.id }) || candidate
    }

    const email =
      typeof candidate === 'string'
        ? looksLikeEmail(candidate)
          ? candidate
          : null
        : candidate?.email || null

    if (!email) {
      throw new Error(
        `Sounding auth helpers could not resolve an email address for actor \`${candidate}\`.`
      )
    }

    const normalizedEmail = normalizeEmail(email)
    let user = User?.findOne ? await User.findOne({ email: normalizedEmail }) : null

    if (!user && options.createIfMissing !== false) {
      user = await createUserFromEmail(
        normalizedEmail,
        (typeof candidate !== 'string' && candidate?.fullName) || options.fullName
      )
    }

    if (!user) {
      throw new Error(
        `Sounding auth helpers could not find a ${auth.modelIdentity} for ${normalizedEmail}.`
      )
    }

    return user
  }

  /**
   * @param {SoundingActor | string} actorOrEmail
   * @param {{ createIfMissing?: boolean, fullName?: string, [key: string]: any }} [options]
   * @returns {Promise<SoundingMagicLink>}
   */
  async function issueMagicLink(actorOrEmail, options = {}) {
    const User = getAuthModel()

    if (!User?.updateOne) {
      throw new Error('Sounding auth helpers require an auth model with updateOne().')
    }

    const user = await resolveActor(actorOrEmail, {
      createIfMissing: true,
      ...options,
    })
    const token = await sails.helpers.magicLink.generateToken()
    const hashedToken = await sails.helpers.magicLink.hashToken(token)

    await User.updateOne({ id: user.id }).set({
      emailStatus: 'verified',
      magicLinkToken: hashedToken,
      magicLinkTokenExpiresAt: Date.now() + 15 * 60 * 1000,
      magicLinkTokenUsedAt: null,
    })

    const refreshedUser = User.findOne ? await User.findOne({ id: user.id }) : user

    return {
      user: refreshedUser,
      email: refreshedUser.email,
      token,
      url: `/magic-link/${token}`,
    }
  }

  /**
   * @param {SoundingActor | string} actorOrEmail
   * @param {{ fullName?: string, redirectUrl?: string, requestOptions?: SoundingRequestOptions, [key: string]: any }} [options]
   * @returns {Promise<SoundingRequestMagicLinkResult>}
   */
  async function requestMagicLink(actorOrEmail, options = {}) {
    const user = await resolveActor(actorOrEmail, {
      createIfMissing: true,
      ...options,
    })

    const response = await request.post(
      '/magic-link',
      {
        email: user.email,
        fullName: options.fullName || user.fullName,
        redirectUrl: options.redirectUrl || '/login',
      },
      options.requestOptions || {}
    )

    return {
      response,
      email: user.email,
      message: mailbox.latest(),
      url: mailbox.latest()?.ctaUrl,
    }
  }

  /**
   * @param {SoundingActor | string} actorOrEmail
   * @param {SoundingPage} page
   * @param {{ password?: string, rememberMe?: boolean, returnUrl?: string, [key: string]: any }} [options]
   * @returns {Promise<SoundingBrowserLoginResult>}
   */
  async function loginWithPassword(actorOrEmail, page, options = {}) {
    if (!page || typeof page.goto !== 'function') {
      throw new Error('Sounding password browser login requires a Playwright page.')
    }

    const auth = getAuthConfig()
    const actor = await resolveActor(actorOrEmail, {
      createIfMissing: false,
      ...options,
    })
    const email = normalizeEmail(actor?.email || actorOrEmail)

    if (!options.password) {
      throw new Error('Sounding password login requires a `password` option.')
    }

    const loginUrl = new URL(auth.password.pagePath, 'http://sounding.local')

    for (const [key, value] of Object.entries(auth.password.pageQuery || {})) {
      if (value != null) {
        loginUrl.searchParams.set(key, String(value))
      }
    }

    if (options.returnUrl) {
      loginUrl.searchParams.set(auth.password.form.returnUrl, options.returnUrl)
    }

    await page.goto(`${loginUrl.pathname}${loginUrl.search}`)
    await page.fill(auth.password.selectors.email, email)
    await page.fill(auth.password.selectors.password, options.password)

    if (options.rememberMe && typeof page.check === 'function') {
      await page.check(auth.password.selectors.rememberMe)
    }

    await page.click(auth.password.selectors.submit)

    return {
      actor,
      email,
      path: `${loginUrl.pathname}${loginUrl.search}`,
    }
  }

  /**
   * @param {SoundingActor | string} actorOrEmail
   * @param {{ password?: string, rememberMe?: boolean, returnUrl?: string, request?: SoundingRequestClient, requestOptions?: SoundingRequestOptions, [key: string]: any }} [options]
   * @returns {Promise<SoundingPasswordRequestResult>}
   */
  async function requestWithPassword(actorOrEmail, options = {}) {
    const auth = getAuthConfig()
    const actor = await resolveActor(actorOrEmail, {
      createIfMissing: false,
      ...options,
    })
    const email = normalizeEmail(actor?.email || actorOrEmail)

    if (!options.password) {
      throw new Error('Sounding password request auth requires a `password` option.')
    }

    /** @type {Record<string, any>} */
    const payload = {
      [auth.password.form.email]: email,
      [auth.password.form.password]: options.password,
    }

    if (options.rememberMe !== undefined) {
      payload[auth.password.form.rememberMe] = options.rememberMe
    }

    if (options.returnUrl !== undefined) {
      payload[auth.password.form.returnUrl] = options.returnUrl
    }

    const targetRequest = options.request || request
    const response = await targetRequest.post(
      auth.password.loginPath,
      payload,
      options.requestOptions || {}
    )

    return {
      actor,
      email,
      request: targetRequest,
      response,
    }
  }

  const login = {
    async as(actorOrEmail, page, options = {}) {
      const magicLink = await issueMagicLink(actorOrEmail, options)
      await page.goto(magicLink.url)
      return magicLink
    },
    withPassword: loginWithPassword,
  }

  return {
    conventions: getAuthConfig(),
    resolveActor,
    resolveUser: resolveActor,
    issueMagicLink,
    requestMagicLink,
    request: {
      withPassword: requestWithPassword,
    },
    login,
  }
}

module.exports = {
  createAuthHelpers,
}
