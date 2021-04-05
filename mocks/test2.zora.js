// 'use strict';

// const { test, only } = require('zora');
import { test, only } from 'zora'

test('some grouped assertions', (t) => {
  t.ok(true, 'true is truthy')
  t.equal('bar', 'bar', 'that both string are equivalent')
  t.isNot({}, {}, 'those are not the same reference')
})

test('some grouped assertions', (t) => {
  t.ok(true, 'true is truthy')

  t.test('a group inside another one', (t) => {
    t.equal('bar', 'bar', 'that both string are equivalent')
    t.isNot({}, {}, 'those are not the same reference')
  })
})
only('should run', (t) => {
  t.ok(true, 'I ran')

  t.only('keep running', (t) => {
    t.only('keeeeeep running', (t) => {
      t.ok(true, ' I got there')
    })
  })

  t.test('should not run', (t) => {
    t.fail('shouldn ot run')
  })
})
only('should run but nothing inside', (t) => {
  t.test('will not run', (t) => {
    t.fail('should not run')
  })
  t.test('will not run', (t) => {
    t.fail('should not run')
  })
})
