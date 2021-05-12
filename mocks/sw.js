'use strict'

self.addEventListener('fetch', (event) => {
  console.log('WORKER: Fetching', event.request)
  event.respondWith(new Response('caught it'))
})
