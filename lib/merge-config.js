function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeConfig(base, override) {
  const output = { ...base }

  for (const [key, value] of Object.entries(override || {})) {
    if (Array.isArray(value)) {
      output[key] = [...value]
      continue
    }

    if (isPlainObject(value) && isPlainObject(base[key])) {
      output[key] = mergeConfig(base[key], value)
      continue
    }

    output[key] = value
  }

  return output
}

module.exports = { mergeConfig }
