import delay from 'delay'

export const good = async () => {
  await delay(100)
  return 'good'
}

export const bad = async () => {
  // new Promise((resolve, reject) => {
  //   throw new Error('ooopps')
  // })
  await delay(100)
  return 'bad'
}
