import { resolve } from 'path'
import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { renderToString } from 'vue/server-renderer'
import { createSSRApp } from 'vue'
import { bPath, cValue, dir, VueComponent } from './fixtures/a.mjs'

const test = suite()

test('nested export', async() => {
  assert.ok(bPath.includes('b.js'))
  assert.is(cValue, 'from-c')
  assert.equal(dir.replace(/^\//, ''), resolve('test/fixtures').replace(/\\/g, '/').replace(/^\//, ''))
})

test('vue component', async() => {
  assert.ok(VueComponent.__file.includes('component.vue'))
  assert.equal(await renderToString(createSSRApp(VueComponent)), '<div>3 x 2 = 6</div>')
})

test.run()
