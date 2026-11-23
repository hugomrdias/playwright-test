// The service worker of the tests answers for the pages of the tests
describe('sw iframe', () => {
  it('serves the app shell to an iframe at /', async () => {
    const frame = document.createElement('iframe')
    frame.src = '/'
    const loaded = new Promise((resolve) => {
      frame.addEventListener('load', resolve, { once: true })
    })
    document.body.append(frame)
    await loaded
    const text = frame.contentDocument?.body.textContent
    if (text !== 'app shell') {
      throw new Error(`The iframe got: ${text}`)
    }
  })
})
