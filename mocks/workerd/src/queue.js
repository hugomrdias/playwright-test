import worker from './index.js'

export { Counter } from './index.js'

export default {
  ...worker,
  /** Saves the body of each message in KV */
  async queue(batch, env) {
    for (const message of batch.messages) {
      await env.KV.put(`job:${message.body}`, 'done')
      message.ack()
    }
  },
}
