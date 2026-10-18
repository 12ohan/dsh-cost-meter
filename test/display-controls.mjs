import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { sanitizeConfig, applyConfigPatch } from '../lib/store.js'
import { stateSchema } from '../lib/typert.host.js'

const el = (type, props, ...children) => ({ type, props: props ?? {}, children })
const React = { cloneElement: (node, props) => ({ ...node, props: { ...node.props, ...props } }) }
const Inspector = vm.runInNewContext(readFileSync(new URL('../src/display/controls.js', import.meta.url), 'utf8') + '\nDisplayInspector', { React, el })
const nodes = node => node && typeof node === 'object' ? [node, ...node.children.flatMap(nodes)] : []
let config = sanitizeConfig({ codingPlans: { minimax: { enabled: false, display: 'both', baseUrl: 'https://www.minimax.cn' }, kimi: { enabled: false, display: 'settings' } } })
let writes = 0, selectedPlan = 'minimax', navigated = null
const initial = JSON.stringify(config.codingPlans.kimi)
const set = patch => {
  writes++
  const result = applyConfigPatch(config, JSON.parse(JSON.stringify(patch)))
  assert.deepEqual(result.errors, [])
  config = stateSchema.shape.config.parse(result.config)
}
const inspect = selected => Inspector({ props: {
  t: key => key, numInput: () => null, displayOptions: () => ['sidebar','settings','both','off'].map(value => el('option', { value }, value)),
  planOptions: [['minimax','MiniMax'],['kimi','Kimi']], state: {},
}, config, selected, selectedPlan, selectPlan: value => { selectedPlan = value }, openQuota: () => { navigated = selectedPlan },
  set, select() {}, labels: {}, registry: { plan: { on: true, patch: { codingPlans: { ...config.codingPlans, [selectedPlan]: { ...config.codingPlans[selectedPlan], display: 'settings' } } } } },
  text: (_, en) => en, region: 'sidebar', examples: true })
const control = (tree, label) => nodes(tree).find(node => node.props['aria-label'] === label)
let tree = inspect('plan')
control(tree, 'Placement').props.onChange({ target: { value: 'sidebar' } })
assert.equal(config.codingPlans.minimax.display, 'sidebar')
assert.equal(config.codingPlans.minimax.enabled, false, 'display changes never enable a quota query')
assert.equal(JSON.stringify(config.codingPlans.kimi), initial, 'another account is unchanged')
tree = inspect('plan')
assert.ok(!nodes(tree).some(node => node.type === 'input' && node.props.type === 'checkbox'), 'placement replaces the duplicate visibility checkbox')
control(tree, 'Placement').props.onChange({ target: { value: 'settings' } })
assert.equal(config.codingPlans.minimax.display, 'settings', 'sidebar visibility preserves the settings card')
const beforeSwitch = writes
control(inspect('plan'), 'Plan').props.onChange({ target: { value: 'kimi' } })
assert.equal(writes, beforeSwitch, 'selecting an account does not save or query anything')
control(inspect('plan'), 'Placement').props.onChange({ target: { value: 'both' } })
assert.equal(config.codingPlans.kimi.display, 'both')
assert.equal(config.codingPlans.kimi.enabled, false)
assert.equal(config.codingPlans.minimax.display, 'settings')
nodes(inspect('plan')).find(node => node.type === 'button' && node.children.includes('Account and quota settings →')).props.onClick()
assert.equal(navigated, 'kimi', 'navigation targets the selected account')
const budget = nodes(inspect('budget'))
assert.ok(!budget.some(node => node.type === 'span' && node.children.includes('Show today’s usage')), 'today visibility belongs to its own component')
assert.ok(!nodes(inspect('today')).some(node => node.type === 'input' && node.props.type === 'checkbox'), 'today visibility is a top-level display switch')
control(inspect('today'), 'sidebarTodayMetric').props.onChange({ target: { value: 'tokens' } })
assert.equal(config.sidebarTodayMetric, 'tokens', 'the inspector still controls the daily value format')
console.log('[ok] display controls: per-account visibility/placement, no query enablement, independent selection, targeted navigation and separate today control')
