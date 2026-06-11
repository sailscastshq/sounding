module.exports = {
  friendlyName: 'Send welcome email',

  inputs: {
    email: {
      type: 'string',
      required: true,
    },
  },

  exits: {
    success: {
      outputType: 'ref',
    },
  },

  fn: async function ({ email }) {
    await sails.helpers.mail.send.with({
      to: email,
      subject: 'Welcome to the fixture',
      text: 'Your real Sails fixture account is ready.',
    })

    return {
      queued: true,
      email,
    }
  },
}
