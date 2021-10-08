import { resolve } from 'path'
import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { bPath, cValue, dir } from './fixtures/a'

test('work', () => {
  assert.ok(bPath.includes('b.ts'))
  assert.is(cValue, 'from-c')
  assert.equal(dir, resolve('test/fixtures'))
})

// test not running, awaits
// https://github.com/lukeed/uvu/issues/145
test.run()
