function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeDatastore(datastore) {
  if (typeof datastore === 'string') {
    return {
      mode: datastore,
    }
  }

  if (!isPlainObject(datastore)) {
    return datastore
  }

  const normalized = { ...datastore }
  const legacyManaged = isPlainObject(normalized.managed) ? normalized.managed : {}

  if (normalized.adapter == null && legacyManaged.adapter != null) {
    normalized.adapter = legacyManaged.adapter
  }

  if (normalized.root == null) {
    normalized.root = legacyManaged.root ?? legacyManaged.directory
  }

  if (normalized.isolation == null && legacyManaged.isolation != null) {
    normalized.isolation = legacyManaged.isolation
  }

  delete normalized.managed
  delete normalized.directory

  return normalized
}

function normalizeUserConfig(config = {}) {
  if (!isPlainObject(config)) {
    return {}
  }

  const normalized = { ...config }

  if ('datastore' in normalized) {
    normalized.datastore = normalizeDatastore(normalized.datastore)
  }

  return normalized
}

module.exports = {
  normalizeDatastore,
  normalizeUserConfig,
}
