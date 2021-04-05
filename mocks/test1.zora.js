'use strict'

const { test } = require('zora')

test('a first sub test', (t) => {
  t.ok(true)

  t.test('inside', (t) => {
    t.ok(true)
  })
})

test('a first sub test', (t) => {
  t.ok(true)

  t.test('inside', (t) => {
    t.ok(false, 'oh no!')
  })
})
