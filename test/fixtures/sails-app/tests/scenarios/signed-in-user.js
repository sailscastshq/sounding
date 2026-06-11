module.exports = ({ defineScenario }) =>
  defineScenario('signed-in-user', async ({ create }) => {
    const user = await create('user').trait('admin')

    return {
      users: {
        member: user,
      },
    }
  })
