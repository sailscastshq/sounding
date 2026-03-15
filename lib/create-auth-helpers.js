function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function looksLikeEmail(value) {
  return typeof value === 'string' && value.includes('@')
}

function createAuthHelpers({ sails, world, mailbox, request }) {
  function getUserModel() {
    return sails?.models?.user || sails?.models?.User
  }

  async function createUserFromEmail(email, fullName) {
    const User = getUserModel()

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

  async function resolveUser(actorOrEmail, options = {}) {
    const User = getUserModel()

    if (!actorOrEmail) {
      throw new Error('Sounding auth helpers require an actor, user, or email address.')
    }

    let candidate = actorOrEmail

    if (typeof candidate === 'string' && world.current?.users?.[candidate]) {
      candidate = world.current.users[candidate]
    }

    if (candidate?.id && User?.findOne) {
      return User.findOne({ id: candidate.id }) || candidate
    }

    const email = candidate?.email || (looksLikeEmail(candidate) ? candidate : null)

    if (!email) {
      throw new Error(
        `Sounding auth helpers could not resolve an email address for actor \`${candidate}\`.`
      )
    }

    const normalizedEmail = normalizeEmail(email)
    let user = User?.findOne ? await User.findOne({ email: normalizedEmail }) : null

    if (!user && options.createIfMissing !== false) {
      user = await createUserFromEmail(normalizedEmail, candidate?.fullName || options.fullName)
    }

    if (!user) {
      throw new Error(
        `Sounding auth helpers could not find a user for ${normalizedEmail}.`
      )
    }

    return user
  }

  async function issueMagicLink(actorOrEmail, options = {}) {
    const User = getUserModel()

    if (!User?.updateOne) {
      throw new Error('Sounding auth helpers require a User model with updateOne().')
    }

    const user = await resolveUser(actorOrEmail, {
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

  async function requestMagicLink(actorOrEmail, options = {}) {
    const user = await resolveUser(actorOrEmail, {
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

  const login = {
    async as(actorOrEmail, page, options = {}) {
      const magicLink = await issueMagicLink(actorOrEmail, options)
      await page.goto(magicLink.url)
      return magicLink
    },
  }

  return {
    resolveUser,
    issueMagicLink,
    requestMagicLink,
    login,
  }
}

module.exports = {
  createAuthHelpers,
}
