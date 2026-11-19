import { DurableObject } from 'cloudflare:workers'

export class Counter extends DurableObject {
  async increment() {
    const value = ((await this.ctx.storage.get('value')) ?? 0) + 1
    await this.ctx.storage.put('value', value)
    return value
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/greet') {
      return new Response(`${env.GREETING} world`)
    }
    if (pathname === '/count') {
      return Response.json(await env.COUNTER.getByName('shared').increment())
    }
    return new Response('Not found', { status: 404 })
  },
}
