function createMailbox() {
  const messages = []

  return {
    capture(message) {
      const normalized = {
        capturedAt: new Date().toISOString(),
        ...message,
      }
      messages.push(normalized)
      return normalized
    },

    all() {
      return [...messages]
    },

    latest() {
      return messages.at(-1)
    },

    clear() {
      messages.length = 0
    },
  }
}

module.exports = { createMailbox }
