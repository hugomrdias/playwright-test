import net from 'node:net'

export default {
  /**
   * Keep an in-flight HTTP request open against the asset server so
   * `server.close()` cannot finish on its own during shutdown.
   *
   * @param {{ PW_SERVER?: string }} env
   */
  beforeTests(env) {
    const url = new URL(env.PW_SERVER ?? '')
    return new Promise((resolve, reject) => {
      const socket = net.connect(Number(url.port), url.hostname, () => {
        // Incomplete headers keep the request active on Node's http.Server
        socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n')
        socket.unref()
        resolve(socket)
      })
      socket.once('error', reject)
    })
  },
}
