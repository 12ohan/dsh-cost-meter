// Shipped settings + lazy preview: real draft/autosave, synthetic data, no external requests.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { sanitizeConfig, applyConfigPatch, zeroDay } from '../lib/store.js'
import { stateSchema } from '../lib/typert.host.js'
import { javascriptLiteral as literal } from '../scripts/javascript-literal.mjs'

const modules = resolve(process.env.DSH_TEST_UI_MODULES ?? '.tmp-pr240-host/node_modules')
const req = createRequire(join(modules, '__display.cjs'))
const { chromium } = req('playwright-core')
const executablePath = process.env.CM_TEST_BROWSER ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
const output = resolve('.tmp-display-review'); mkdirSync(output, { recursive: true })
let saved = sanitizeConfig({ locale: 'zh', exchangeRate: 1, currency: 'CNY', symbol: '¥', sidebarSimple: false, budget: { enabled: true, amount: 100 },
  goQuota: { enabled: false }, quotaStrip: { enabled: true, budget: true, go: false, plans: true }, peakEnabled: true, peakNotice: true, position: 'off' })
const client = readdirSync('src/client').filter(n => n.endsWith('.js')).sort().map(n => readFileSync('src/client/' + n, 'utf8')).join('')
  .replace('exports.apply = apply', 'exports.preview = { CostSection, parseConfig, SidebarFooter }; exports.apply = apply')
const day = { ...zeroDay(), cost: 1.28, apiCost: 1.28 }
const state = { config: saved, today: day, month: day, total: day, history: [], balance: { status: 'off' }, codingPlans: {}, budgetUsed: 32 }
const code = `
import React from ${literal(req.resolve('react'))};import{createRoot}from ${literal(req.resolve('react-dom/client'))};
const h=React.createElement;
window.__ModuleLoader__={load:mod=>window.mainUI=mod.factory(name=>name==='react'?React:{Tooltip:({children})=>children})};
${client}
window.__ModuleLoader__={load:mod=>window.displayUI=mod.factory(()=>React)};
${readFileSync('lib/client.display.js', 'utf8')}
const Display=window.displayUI.mount({effect:()=>{}}),{CostSection,parseConfig,SidebarFooter}=window.mainUI.preview;
let state=${literal(state)};state.config=parseConfig(state.config,'config');window.patches=[];window.listeners=new Set();window.failSave=false;window.mounts=0;
const publish=()=>{for(const fn of window.listeners)fn({...state});return state};
window.current=()=>state.config;window.setConfig=patch=>{state={...state,config:parseConfig({...state.config,...patch},'config')};publish()};
window.changeLocale=locale=>window.setConfig({locale});
const api={loadDisplay:async()=>Display,loadCommunity:async()=>()=>null,loadStatistics:async()=>()=>null,updateConfig:async patch=>{
  if(window.failSave)throw Error('synthetic save failure');const config=await window.saveConfig(patch);window.patches.push(patch);state={...state,config:parseConfig(config,'config')};return publish()}};
function useCost(){const[value,setValue]=React.useState(state);React.useEffect(()=>{window.listeners.add(setValue);return()=>window.listeners.delete(setValue)},[]);return{state:value,status:'ready'}}
function App(){return h(React.Fragment,null,h(CostSection,{useCost,api}),h('div',{id:'actual-sidebar',hidden:true},h(SidebarFooter,{useCost,api,wide:true})))}
const root=createRoot(document.getElementById('root'));window.remount=()=>root.render(h(App,{key:++window.mounts}));window.remount();
`
const compiled = await build({ stdin: { contents: code, resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'iife', platform: 'browser' })
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--dsw-font-family:"Segoe UI","Microsoft YaHei",sans-serif;--dsw-radius-md:12px;--dsw-radius-panel:26px;--dsw-alias-label-primary-inverted:#fff;--dsw-alias-border-l2:#e5e7eb;--dsw-specific-sidebar-fill:#f8f9fa;--dsw-specific-input-major:#fff;--dsw-alias-button-elevated-fill:#fff;--dsw-specific-selector:#eff0f2;--dsw-alias-label-primary:#25262b;--dsw-alias-label-secondary:#737780;--dsw-alias-label-tertiary:#858a94;--dsw-alias-border-l1:#e5e7eb;--dsw-alias-border-l3:#e5e7eb;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f7f8fa;--dsw-alias-bg-layer-2:#fff;--dsw-alias-bg-layer-3:#edf0f4;--dsw-alias-state-business-primary:#4d6bfe;--dsw-alias-interactive-bg-hover:#f0f1f4;--ds-font-family-sans:system-ui}
html[data-theme=dark]{color-scheme:dark;--dsw-alias-label-primary-inverted:#202022;--dsw-alias-border-l2:#38383c;--dsw-specific-sidebar-fill:#252527;--dsw-specific-input-major:#303033;--dsw-alias-button-elevated-fill:#303033;--dsw-specific-selector:#353538;--dsw-alias-label-primary:#ececee;--dsw-alias-label-secondary:#a6a6ad;--dsw-alias-label-tertiary:#92929c;--dsw-alias-border-l1:#38383c;--dsw-alias-border-l3:#38383c;--dsw-alias-bg-base:#202022;--dsw-alias-bg-layer-1:#29292c;--dsw-alias-bg-layer-2:#29292c;--dsw-alias-bg-layer-3:#36363c;--dsw-alias-state-business-primary:#6a83ff;--dsw-alias-interactive-bg-hover:#38383c}
body{margin:0;padding:24px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:13px/1.6 system-ui}#root{max-width:960px;margin:auto}button{font:inherit}@media(max-width:480px){body{padding:12px}}
</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`
const server = createServer((request, response) => {
  if (request.url === '/app.js') { response.setHeader('content-type', 'text/javascript'); response.end(compiled.outputFiles[0].contents) }
  else if (request.url === '/') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(html) }
  else { response.statusCode = 404; response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/`
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } })
const errors = [], external = []
page.on('pageerror', error => errors.push(String(error)))
await page.route('**/*', route => {
  if (new URL(route.request().url()).origin !== new URL(url).origin) { external.push(route.request().url()); return route.abort() }
  return route.continue()
})
await page.exposeFunction('saveConfig', patch => {
  const result = applyConfigPatch(saved, patch); assert.deepEqual(result.errors, [])
  saved = stateSchema.shape.config.parse(sanitizeConfig(result.config))
  return saved
})
try {
  await page.goto(url);await page.getByRole('tab',{name:'显示',exact:true}).click();await page.locator('.cm-display').waitFor()
  await page.locator('.cm-display').screenshot({path:join(output,'initial.png')})
  const item = key => page.locator('.cm-preview [data-display="' + key + '"]')
  assert.equal(await page.locator('.cm-display-details').evaluate(n=>n.open),false)
  assert.equal(await page.locator('.cm-display input[type=checkbox]:visible').count(),0,'primary UI is the preview')
  assert.equal(await item('balance').getAttribute('aria-pressed'),'true')
  await item('balance').click();await page.waitForFunction(()=>window.current().hideOfficialBalance===true)
  assert.ok(await item('balance').locator('.cm-display-item-content').evaluate(n=>Number(getComputedStyle(n).opacity)<.6))
  await item('balance').focus();await page.keyboard.press('Space');await page.waitForFunction(()=>window.current().hideOfficialBalance===false)
  await item('budget').click();await page.waitForFunction(()=>window.current().hideBudget===true)
  assert.equal(saved.budget.enabled,true,'hiding a budget preserves budget accounting')
  assert.equal(await page.locator('#actual-sidebar .cm-bbox-label').filter({hasText:'预算'}).count(),0,'actual sidebar hides the card')
  await item('budget').click();await page.waitForFunction(()=>window.current().hideBudget===false)
  assert.equal(await page.locator('#actual-sidebar .cm-bbox-label').filter({hasText:'预算'}).count(),1)
  await item('peak').click();await page.waitForFunction(()=>window.current().peakNotice===false)
  assert.equal(saved.peakEnabled,true,'display changes preserve peak pricing')
  await item('strip-go').click();await page.waitForFunction(()=>window.current().quotaStrip.go===true)
  assert.equal(saved.goQuota.enabled,false,'showing quota does not enable an account query')
  await page.evaluate(()=>window.setConfig({quotaStrip:{enabled:false,budget:true,go:true,plans:true}}))
  await page.evaluate(()=>window.remount());await page.getByRole('tab',{name:'显示',exact:true}).click();await page.locator('.cm-display').waitFor()
  await page.waitForFunction(()=>document.querySelector('[data-display="strip-budget"]').getAttribute('aria-pressed')==='false')
  await item('strip-budget').click();await page.waitForFunction(()=>window.current().quotaStrip.enabled===true)
  assert.equal(saved.quotaStrip.go,false);assert.equal(saved.quotaStrip.plans,false)
  await item('session-header').click();await item('session-dock').click();await item('turn').click()
  await page.waitForFunction(()=>window.current().hideSessionCostHeader&&window.current().hideSessionCostDock&&window.current().hideTurnCost)
  assert.ok(saved.hideSessionCostHeader&&saved.hideSessionCostDock&&saved.hideTurnCost,'rapid changes survive autosave')
  await item('badge').click();await page.waitForFunction(()=>window.current().position==='dock')
  await page.getByRole('button',{name:'简洁',exact:true}).click();await page.waitForFunction(()=>window.current().sidebarSimple===true)
  await page.evaluate(()=>window.remount());await page.getByRole('tab',{name:'显示',exact:true}).click();await page.locator('.cm-display').waitFor()
  assert.equal(await item('session-header').getAttribute('aria-pressed'),'false','saved toggles survive reopening')
  await page.getByRole('button',{name:'标准',exact:true}).click();await item('session-header').click();await item('session-dock').click();await item('turn').click()
  await item('peak').click();await item('strip-plans').click()
  await page.waitForFunction(()=>window.current().hideTurnCost===false&&window.current().peakNotice===true)
  for (const theme of ['light','dark']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme)
    for (const width of [1100,720,390]) {
      await page.setViewportSize({width,height:1000});await page.locator('.cm-display').scrollIntoViewIfNeeded()
      assert.equal(await page.locator('.cm-preview').evaluate(n=>n.scrollWidth>n.clientWidth+1),false,`preview fits ${theme}/${width}`)
      await page.locator('.cm-display').screenshot({path:join(output,`${theme}-${width}.png`)})
    }
  }
  await page.setViewportSize({width:1500,height:1050})
  await page.evaluate(()=>document.documentElement.dataset.theme='light')
  await page.getByRole('button',{name:'简洁',exact:true}).click()
  await page.getByRole('button',{name:'放大预览',exact:true}).click()
  await page.getByRole('dialog',{name:'桌面显示预览'}).waitFor()
  assert.equal(await page.locator('.cm-native-desktop').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ')[0]),'280px')
  const badgeBefore = await item('badge').getAttribute('aria-pressed')
  await item('badge').click()
  await page.waitForFunction(before=>document.querySelector('[data-display="badge"]').getAttribute('aria-pressed')!==before,badgeBefore)
  await page.mouse.move(1400,20)
  await page.locator('.cm-display-dialog').screenshot({path:join(output,'desktop-expanded.png')})
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('dialog[open]').count(),0)
  assert.equal(await page.getByRole('button',{name:'放大预览',exact:true}).evaluate(n=>n===document.activeElement),true)
  await page.setViewportSize({width:1100,height:1000})
  await page.locator('.cm-toolbar select').selectOption('en');await page.getByRole('region',{name:'Interactive display settings'}).waitFor()
  await page.waitForFunction(()=>window.current().locale==='en')
  await page.getByText('More options · layout, currency and refresh intervals',{exact:true}).click()
  assert.equal(await page.locator('.cm-display-details').evaluate(n=>n.open),true)
  await page.evaluate(()=>window.failSave=true);await item('balance').click()
  await page.getByText(/synthetic save failure/).waitFor()
  // A rendered DSH page takes precedence over the reference composition. Peer
  // plugins and skin overrides must survive the copy without mounting again.
  await page.evaluate(()=>{
    window.failSave=false
    const frame=document.querySelector('.cm-native-desktop').cloneNode(true)
    frame.classList.add('BynINW_frame');frame.id='host-fixture'
    Object.assign(frame.style,{position:'absolute',left:'0',top:'1200px',margin:'0',transform:'none',width:'1280px',height:'800px'})
    const aliases={'.cm-native-side-root':'_2H3hWW_root','.cm-native-chat-titleRow':'Dc7zOa_titleRow','.cm-native-input-root':'RlGAzG_root','.cm-native-input-dock':'RlGAzG_dock'}
    for(const[selector,name]of Object.entries(aliases))frame.querySelector(selector).classList.add(name)
    for(const key of ['session-header','session-dock'])frame.querySelector('[data-display="'+key+'"]').querySelector('.cm-stat-entry').classList.add('cm-stat-'+key.split('-')[1])
    frame.querySelector('[data-display="turn"]').firstElementChild.setAttribute('data-cm-turn','')
    frame.querySelector('[data-display="corner"]').firstElementChild.classList.add('cm-corner')
    for(const wrapper of frame.querySelectorAll('[data-display]'))wrapper.replaceWith(wrapper.firstElementChild)
    for(const node of frame.querySelectorAll('[inert]'))node.removeAttribute('inert')
    const peer=document.createElement('span');peer.className='peer-extension';peer.textContent='Peer plugin badge';peer.style.cssText='background:rgb(224,241,234);color:rgb(22,92,68);border-radius:17px;padding:2px 7px;font-size:11px'
    frame.querySelector('.cm-native-chat-titleRow').appendChild(peer)
    const overlay=document.createElement('div');overlay.dataset.shellOverlay='';frame.appendChild(overlay)
    document.body.appendChild(frame)
    window.remount()
  })
  await page.getByRole('tab',{name:'Display',exact:true}).click()
  await page.getByText('Current page · includes skins and plugins',{exact:true}).waitFor()
  await page.locator('.cm-live-hit[data-display="balance"]').waitFor()
  const live=page.frameLocator('.cm-live-frame')
  assert.equal(await live.locator('.peer-extension').textContent(),'Peer plugin badge')
  assert.equal(await live.locator('.peer-extension').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(224, 241, 234)')
  assert.equal(await live.locator('.peer-extension').evaluate(n=>getComputedStyle(n).borderRadius),'17px')
  const alignment=await page.evaluate(()=>{
    const source=document.querySelector('#host-fixture'),copy=document.querySelector('.cm-live-frame').contentDocument
    const root=source.getBoundingClientRect(),a=source.querySelector('.cm-native-input-card').getBoundingClientRect(),b=copy.querySelector('.cm-native-input-card').getBoundingClientRect()
    return{width:Math.abs(a.width-b.width),height:Math.abs(a.height-b.height),left:Math.abs(a.left-root.left-b.left)}
  })
  for(const value of Object.values(alignment))assert.ok(value<1,JSON.stringify(alignment))
  const balanceBefore=await page.evaluate(()=>window.current().hideOfficialBalance)
  await item('balance').click();await page.waitForFunction(before=>window.current().hideOfficialBalance!==before,balanceBefore)
  assert.equal(await live.locator('[data-cm-live-key="balance"]').evaluate(n=>n.style.opacity),balanceBefore?'1':'0.26')
  await page.evaluate(()=>{const style=document.createElement('style');style.textContent='#host-fixture .peer-extension{background:rgb(39,48,65)!important;border-radius:4px!important}';document.head.appendChild(style)})
  await page.waitForFunction(()=>document.querySelector('.cm-live-frame')?.contentDocument.querySelector('.peer-extension')?.style.backgroundColor==='rgb(39, 48, 65)')
  await page.getByRole('button',{name:'Expand preview',exact:true}).click()
  await page.locator('.cm-live-hit[data-display="balance"]').waitFor()
  await page.locator('.cm-display-dialog').screenshot({path:join(output,'live-skin-and-plugin.png')})
  await page.keyboard.press('Escape')
  assert.deepEqual(errors,[]);assert.deepEqual(external,[])
  writeFileSync(join(output,'result.json'),JSON.stringify({themes:2,widths:[1100,720,390],autosave:true,keyboard:true,liveDOM:true,skinAndPeerPlugin:true,alignment,externalRequests:external.length,browserErrors:errors.length},null,2))
  console.log('[ok] visual display settings: native settings autosave, visibility gates, reopen, keyboard, save error, 2 themes / 3 widths, zero external requests')
} catch(error) {
  await page.screenshot({path:join(output,'failure.png'),fullPage:true})
  console.error(errors)
  throw error
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
