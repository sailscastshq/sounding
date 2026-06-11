async function resolveSessionUser(req) {
  if (req.session.userId) {
    const user = await req._sails.models.user.findOne({ id: req.session.userId })
    return user || null
  }

  return req.session.user || null
}

module.exports.routes = {
  'GET /api/health': function health(req, res) {
    return res.json({
      ok: true,
      environment: req._sails.config.environment,
      hookEnabled: Boolean(req._sails.sounding),
    })
  },

  'POST /login': async function login(req, res) {
    const email = req.body.email

    req.session.user = {
      email,
    }
    req.flash('info', `Welcome ${email}`)

    return res.redirect('/dashboard')
  },

  'GET /dashboard': async function dashboard(req, res) {
    const user = await resolveSessionUser(req)

    if (!user) {
      return res.status(401).json({
        error: 'unauthenticated',
      })
    }

    return res.json({
      ok: true,
      email: user.email,
    })
  },

  'GET /me': async function me(req, res) {
    const user = await resolveSessionUser(req)

    if (!user) {
      return res.status(401).json({
        error: 'unauthenticated',
      })
    }

    return res.json({
      email: user.email,
      flashes: req.flash('info'),
    })
  },

  'POST /api/users': async function createUser(req, res) {
    const user = await req._sails.models.user
      .create({
        email: req.body.email,
        fullName: req.body.fullName || 'Fixture User',
      })
      .fetch()

    return res.status(201).json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    })
  },
}
