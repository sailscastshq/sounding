function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeIdentity(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return normalized || null
}

function titleCase(value) {
  if (!value) {
    return value
  }

  return `${value[0].toUpperCase()}${value.slice(1)}`
}

function resolveSoundingConfig({ sails, getConfig } = {}) {
  return (typeof getConfig === 'function' ? getConfig() : null) || sails?.config?.sounding || {}
}

function getModelByIdentity(sails, identity) {
  const normalizedIdentity = normalizeIdentity(identity)

  if (!normalizedIdentity) {
    return null
  }

  return sails?.models?.[normalizedIdentity] || sails?.models?.[titleCase(normalizedIdentity)] || null
}

function detectModelIdentity(sails) {
  for (const candidate of ['user', 'creator']) {
    if (getModelByIdentity(sails, candidate)) {
      return candidate
    }
  }

  return 'user'
}

function resolvePasswordConfig(authConfig = {}) {
  const passwordConfig = isPlainObject(authConfig.password) ? authConfig.password : {}
  const formConfig = isPlainObject(passwordConfig.form) ? passwordConfig.form : {}
  const selectorConfig = isPlainObject(passwordConfig.selectors) ? passwordConfig.selectors : {}
  const form = {
    email: formConfig.email || 'email',
    password: formConfig.password || 'password',
    rememberMe: formConfig.rememberMe || 'rememberMe',
    returnUrl: formConfig.returnUrl || 'returnUrl',
  }

  return {
    loginPath: passwordConfig.loginPath || authConfig.loginPath || '/login',
    pagePath: passwordConfig.pagePath || passwordConfig.loginPath || authConfig.loginPath || '/login',
    pageQuery: isPlainObject(passwordConfig.pageQuery) ? passwordConfig.pageQuery : {},
    form,
    selectors: {
      email: selectorConfig.email || `input[name="${form.email}"], input[type="email"]`,
      password:
        selectorConfig.password || `input[name="${form.password}"], input[type="password"]`,
      rememberMe:
        selectorConfig.rememberMe ||
        `input[name="${form.rememberMe}"], input[id="${form.rememberMe}"], input[type="checkbox"]`,
      submit: selectorConfig.submit || 'button[type="submit"], input[type="submit"]',
    },
  }
}

function resolveAuthConfig({ sails, getConfig } = {}) {
  const soundingConfig = resolveSoundingConfig({ sails, getConfig })
  const authConfig = isPlainObject(soundingConfig.auth) ? soundingConfig.auth : {}
  const modelIdentity = normalizeIdentity(authConfig.modelIdentity) || detectModelIdentity(sails)

  return {
    modelIdentity,
    model: getModelByIdentity(sails, modelIdentity),
    sessionKey: authConfig.sessionKey || `${modelIdentity}Id`,
    worldCollection: authConfig.worldCollection || `${modelIdentity}s`,
    password: resolvePasswordConfig(authConfig),
  }
}

module.exports = {
  detectModelIdentity,
  getModelByIdentity,
  resolveAuthConfig,
  resolveSoundingConfig,
}
