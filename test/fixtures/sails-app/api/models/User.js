module.exports = {
  primaryKey: 'id',

  attributes: {
    id: {
      type: 'number',
      autoIncrement: true,
    },
    email: {
      type: 'string',
      required: true,
      unique: true,
    },
    fullName: {
      type: 'string',
      defaultsTo: 'Fixture User',
    },
  },
}
