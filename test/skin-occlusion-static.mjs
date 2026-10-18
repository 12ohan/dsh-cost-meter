// 皮肤插件把 --dsw-alias-bg-base / layer-* 调成半透明后,插件的浮层/弹窗不能透出
// 后方页面内容。约定:每个可遮挡其它内容的表面必须=「本地不透明基底(--cob)」+
// 「皮肤半透明色渐变叠层」。这里守住三类表面的合成规则仍在源码与构建产物里
// (把规则写回单层 alias 会在这里立刻失败,而不必等浏览器回归)。
//
// 注意:构建时 .cm-* / --dsw-alias-* 会被 CSS 字典 token 化(如 Ƃstat-dialog),
// 所以选择器只在源码断言,构建产物只断言未被 token 化的 --cob / --cl2 与渐变片段。
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = (...parts) => readFileSync(new URL('../' + parts.join('/'), import.meta.url), 'utf8')
const mainSource = read('src/client/01-open-styles-i18n.js')
const statisticsSource = read('src/statistics/index.js')
const pricingSource = read('src/pricing/index.js')

assert.ok(mainSource.includes("'body{--cob:var(--dsw-static-neutral-bluish-00,#fff);--cl2:var(--dsw-alias-bg-layer-2,#fff)}'"),
  'main client defines the opaque light base and skin layer tokens')
assert.ok(mainSource.includes('body[data-ds-dark-theme],html[data-theme=dark] body{--cob:var(--dsw-static-neutral-bluish-950,#151517)}'),
  'main client defines the opaque dark base token')
assert.ok(mainSource.includes('.cm-stat-dialog,.cm-qguide,.cm-peak-alert,.cm-footer-stack.simple{background-color:var(--cob,#fff);background-image:linear-gradient(var(--cl2),var(--cl2))}'),
  'every main-client floating surface composites an opaque base plus the skin tint')

assert.ok(statisticsSource.includes('body{--cob:var(--dsw-static-neutral-bluish-00,#fff);--cl2:var(--dsw-alias-bg-layer-2,#fff)}'),
  'statistics chunk defines the opaque base token locally')
assert.ok(/dialog\.cm-fee-dialog\{[^}]*background-color:var\(--cob,#fff\);background-image:linear-gradient\(var\(--cm-bg\),var\(--cm-bg\)\)/.test(statisticsSource),
  'fee dialog keeps the skin colour as a gradient over an opaque base')
assert.ok(/\.cm-context-intro\{[^}]*background-color:var\(--cob,#fff\)/.test(statisticsSource),
  'context intro composites an opaque base')
assert.ok(/\.cm-billion-notice\{[^}]*background-color:var\(--cob,#fff\)/.test(statisticsSource),
  'billion-context notice composites an opaque base')

assert.ok(/\.cm-combo-panel\{[^}]*background-color:var\(--cob,#fff\);background-image:linear-gradient\(var\(--dsw-alias-bg-layer-2/.test(pricingSource),
  'pricing combo panel composites an opaque base plus the skin tint')

const main = read('lib/client.js')
const statistics = read('lib/client.statistics.js')
const pricing = read('lib/client.pricing.js')
for (const [name, bundle, marker] of [
  ['lib/client.js', main, 'background-image:linear-gradient(var(--cl2),var(--cl2))'],
  ['lib/client.statistics.js', statistics, 'linear-gradient(var(--cm-bg),var(--cm-bg))'],
  ['lib/client.statistics.js', statistics, 'background-color:var(--cob,#fff)'],
  ['lib/client.pricing.js', pricing, 'linear-gradient(var(--dsw-alias-bg-layer-2'],
]) assert.ok(bundle.includes(marker), name + ' ships the occlusion composite: ' + marker)

console.log('[ok] skin occlusion: opaque local base + skin tint gradient on every floating surface')
