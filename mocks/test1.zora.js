import { test } from 'zora'
import { good, bad } from './lib'

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

test('external', async (t) => {
  t.equal(await good(), 'good')
  t.equal(await bad(), 'bad')
})
