import { DurableObject } from 'cloudflare:workers'
import wasm from './add.wasm'
import data from './data.bin'
import asset from './other/assets/file.txt'
import raw from './raw/file.txt'
import template from './template.html'

// Read when the worker loads, before any request
const loadedWith = process.env.NODE_ENV

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
    if (pathname === '/template') {
      return new Response(template)
    }
    if (pathname === '/data') {
      return new Response(new TextDecoder().decode(data))
    }
    if (pathname === '/wasm') {
      const { exports } = await WebAssembly.instantiate(wasm)
      return new Response(String(exports.add(2, 3)))
    }
    if (pathname === '/rules') {
      return Response.json({
        asset: typeof asset,
        raw: raw instanceof ArrayBuffer,
      })
    }
    if (pathname === '/configured') {
      return new Response(process.env.CONFIGURED)
    }
    if (pathname === '/env') {
      return new Response(loadedWith ?? 'unset')
    }
    if (pathname === '/count') {
      return Response.json(await env.COUNTER.getByName('shared').increment())
    }
    return new Response('Not found', { status: 404 })
  },
}
