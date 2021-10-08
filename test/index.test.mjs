import { resolve } from 'path'
// import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { renderToString } from 'vue/server-renderer'
import { createSSRApp } from 'vue'
import { bPath, cValue, dir, VueComponent } from './fixtures/a.mjs'

// test('work', () => {
assert.ok(bPath.includes('b.js'))
assert.is(cValue, 'from-c')
assert.equal(dir, resolve('test/fixtures').replace(/\\/g, '/'))
assert.ok(VueComponent.__file.includes('component.vue'))
assert.equal(await renderToString(createSSRApp(VueComponent)), '<div>3 x 2 = 6</div>')
// })

// eslint-disable-next-line no-console
console.log('Hey, well done!')

// test not running, awaits
// https://github.com/lukeed/uvu/issues/145
// test.run()
