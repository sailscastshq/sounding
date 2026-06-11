module.exports = ({ defineFactory }) =>
  defineFactory('user', ({ sequence }) => ({
    email: sequence('fixture-user', (number) => `fixture-user-${number}@example.com`),
    fullName: 'Fixture User',
  })).trait('admin', {
    fullName: 'Fixture Admin',
  })
