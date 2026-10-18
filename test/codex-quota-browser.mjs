// Shipped client + real DSH Connection RPC; quota/account data are synthetic.
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { sanitizeConfig, zeroDay } from '../lib/store.js'

const modules = resolve(process.env.DSH_TEST_UI_MODULES ?? '.tmp-context-host/node_modules')
const req = createRequire(join(modules, '__quota.cjs'))
const host = createRequire(join(resolve(process.env.DSH_TEST_NODE_MODULES ?? modules), '__quota.cjs'))
const { chromium } = req('playwright-core')
const executablePath = process.env.CM_TEST_BROWSER ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
const connectionSource = readFileSync(join(host.resolve('@deepseek-ai/dsh-client-connection/package.json'), '..', 'lib/client.js'), 'utf8')
const state = { config: sanitizeConfig({ locale: 'zh', codexQuotaEnabled: true, codexQuotaSource: 'subscription', peakEnabled: false,
  hideOfficialBalance: true, sidebar: false, hideTodayCost: true, goQuota: { enabled: false }, budget: { enabled: false } }),
  today: zeroDay(), month: zeroDay(), total: zeroDay(), history: [] }
const code = `
import React from ${JSON.stringify(req.resolve('react'))};
import {createRoot} from ${JSON.stringify(req.resolve('react-dom/client'))};
window.__ModuleLoader__={load:mod=>window.connectionUI=mod.factory(()=>({}))};
${connectionSource}
window.__ModuleLoader__={load:mod=>window.costUI=mod.factory(name=>name==='react'?React:{Tooltip:({children})=>children})};
${readFileSync('lib/client.js', 'utf8')}
let state=${JSON.stringify(state)};const entries=new Map(),disposers=[];const services={};
const context={fiber:{uid:1},remote:{$mount:async()=>()=>{}},on:()=>()=>{},inject:(names,fn)=>{if(names.every(name=>services[name]))fn(context)},provide:(name,value)=>services[name]=value,
 effect:fn=>{const cleanup=fn();if(typeof cleanup==='function')disposers.push(cleanup);return cleanup},get:name=>services[name]};
connectionUI.installConnection(context);
services['remote.costMeter']={getLocalState:async()=>({ok:true,value:state}),getState:async()=>({ok:true,value:state}),
 updateConfig:async patch=>{state={...state,config:{...state.config,...patch}};return{ok:true,value:state}}};
services.slots={entries:()=>[],inject:(name,fn)=>fn(),register:(options,component)=>{entries.set(options.name+':'+options.id,{options,component});return()=>{}}};
await costUI.apply(context);
await new Promise(resolve=>setTimeout(resolve,0));
const slot=entries.get('sidebar.footer.action:cost-meter'),injected=slot.options.inject(),store=injected.hooks.cost;
function useCost(pick){return pick(React.useSyncExternalStore(store.subscribe,store.getSnapshot))}
window.configure=patch=>injected.api.updateConfig(patch);
window.dispose=()=>{root.unmount();for(const fn of disposers.reverse())fn()};
function App(){const[wide,setWide]=React.useState(true);window.setWide=setWide;return React.createElement(slot.component,{...injected,useCost,wide})}
const root=createRoot(document.getElementById('root'));root.render(React.createElement(App));
`
const compiled = await build({ stdin: { contents: code, resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'browser' })
let signedIn = false
const calls = []
const server = createServer(async (request, response) => {
  if (request.url === '/app.js') { response.setHeader('content-type', 'text/javascript'); return response.end(compiled.outputFiles[0].contents) }
  if (request.url === '/api/codex-subscription/usage') {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks)); calls.push(message)
    assert.equal(message.type, 'client-request'); assert.equal(message.method, 'codex-subscription/usage')
    response.setHeader('content-type', 'application/json')
    return response.end(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result: signedIn
      ? { ok: true, value: { rateLimits: [{ id: 'codex', windows: [{ windowSeconds: 18000, remainingPercent: 60 }, { windowSeconds: 604800, remainingPercent: 83, resetsAt: Date.parse('2026-10-25T00:10:00Z') / 1000 }] }] } }
      : { ok: false, error: { code: 'internal', message: 'ChatGPT subscription is not signed in', details: { issues: [] } } } }))
  }
  if (request.url !== '/') { response.statusCode = 404; return response.end() }
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.end('<!doctype html><meta charset="utf-8"><style>:root{--dsw-alias-label-primary:#25262b;--dsw-alias-label-secondary:#737780;--dsw-alias-border-l1:#e5e7eb;--dsw-alias-bg-layer-2:#fff;--dsw-alias-state-warn-primary:#d48a00;--dsw-alias-state-ok-primary:#3ba272}body{font:14px/1.6 system-ui;padding:24px}#root{width:280px}</style><div id="root"></div><script type="module" src="/app.js"></script>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 600, height: 400 }, timezoneId: 'Asia/Shanghai' })
const errors = [], external = []
page.on('pageerror', error => errors.push(String(error)))
await page.route('**/*', route => {
  if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort() }
  return route.continue()
})
const output = resolve('.tmp-codex-quota-browser'); mkdirSync(output, { recursive: true })
try {
  await page.clock.install()
  await page.goto(origin)
  const card = page.locator('[data-cm-display="codex"]')
  await card.getByText(/未取得额度/).waitFor()
  assert.equal(calls.length, 1, 'card and sidebar share the real Connection request')
  await page.screenshot({ path: join(output, 'unavailable.png') })
  signedIn = true
  await page.clock.fastForward(61_000)
  await card.getByText('剩余 60%', { exact: true }).waitFor()
  await card.getByText('剩余 83%', { exact: true }).waitFor()
  await card.getByText('· 10/25 08:10 重置', { exact: true }).waitFor()
  assert.equal(calls.length, 2, 'sign-in recovers through the real RPC without remounting')
  await card.click(); await page.waitForFunction(() => document.querySelector('[data-cm-display="codex"]').getAttribute('aria-busy') === 'false')
  assert.equal(calls.at(-1).payload.force, true)
  await page.screenshot({ path: join(output, 'quota.png') })
  await page.evaluate(() => window.configure({ barDirections: { plan: 'used' } }))
  await card.getByText('剩余 83%', { exact: true }).waitFor()
  await page.evaluate(() => { document.getElementById('root').style.width = '200px' })
  assert.equal(await card.evaluate(node => node.scrollWidth <= node.clientWidth), true)
  await page.screenshot({ path: join(output, 'quota-narrow.png') })
  await page.evaluate(() => window.configure({ locale: 'en' }))
  await card.getByText('83% remaining', { exact: true }).waitFor()
  assert.equal(await card.evaluate(node => node.scrollWidth <= node.clientWidth), true)
  await page.screenshot({ path: join(output, 'quota-en.png') })
  await page.evaluate(() => window.setWide(false))
  await card.getByText('83% remaining', { exact: true }).waitFor()
  assert.equal(await card.evaluate(node => node.scrollWidth <= node.clientWidth), true)
  await page.evaluate(() => window.configure({ codexQuotaEnabled: false }))
  await card.waitFor({ state: 'detached' })
  const count = calls.length
  await page.clock.fastForward(360_000)
  assert.equal(calls.length, count, 'turning off stops quota reads')
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  writeFileSync(join(output, 'result.json'), JSON.stringify({ passed: true, calls: calls.length, externalRequests: 0, browserErrors: errors }, null, 2))
  await page.evaluate(() => window.dispose())
  console.log('[ok] Codex quota: shipped asset + DSH Connection RPC, retry after login, both windows and disable cleanup')
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
