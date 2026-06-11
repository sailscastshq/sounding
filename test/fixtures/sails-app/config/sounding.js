module.exports.sounding = {
  app: {
    quiet: true,
    loadOptions: {
      hooks: {
        grunt: false,
        sockets: false,
      },
    },
    liftOptions: {
      port: 0,
      hooks: {
        grunt: false,
        sockets: false,
      },
    },
  },
  datastore: {
    mode: 'managed',
    root: '.tmp/sounding-fixture-db',
    isolation: 'worker',
  },
  mail: {
    layout: false,
  },
}
