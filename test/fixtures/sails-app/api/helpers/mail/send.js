module.exports = {
  friendlyName: 'Send mail',

  description: 'Tiny fixture mail helper that Sounding can wrap during tests.',

  inputs: {
    to: {
      type: 'string',
      required: true,
    },
    subject: {
      type: 'string',
      defaultsTo: '',
    },
    text: {
      type: 'string',
      defaultsTo: '',
    },
  },

  exits: {
    success: {
      outputType: 'ref',
    },
  },

  fn: async function (inputs) {
    return {
      delivered: true,
      to: inputs.to,
      subject: inputs.subject,
    }
  },
}
