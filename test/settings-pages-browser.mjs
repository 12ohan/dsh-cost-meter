// Local React fixture with synthetic data. No account or ledger access.
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { sanitizeConfig, zeroDay } from '../lib/store.js'
import { javascriptLiteral as literal } from '../scripts/javascript-literal.mjs'

const root = resolve(import.meta.dirname, '..')
const req = createRequire(join(resolve(process.argv[2] ?? '.tmp-pr240-host/node_modules'), '__pages.cjs'))
const config = sanitizeConfig({ locale: 'zh', currency: 'CNY', symbol: '¥', exchangeRate: 7,
  budget: { enabled: true, amount: 200 }, balance: { display: 'both' }, goQuota: { enabled: false },
  codingPlans: { minimax: { enabled: true }, opendesign: { enabled: true } },
  customBalances: [{ enabled: true, label: '示例积分', labelEn: 'Example credits', unit: 'CREDITS', display: 'settings' }],
  gatewayQuotas: { sources: [{ id: 'demo', label: '示例网关', type: 'cliproxyapi', enabled: true, display: 'settings', baseURL: 'http://127.0.0.1:8317' }] } })
const day = { ...zeroDay('2026-10-23'), calls: 32, input: 200000, output: 30000, cacheRead: 800000, cost: 13, apiCost: 3 }
const state = { config, today: day, month: { ...day, cost: 28, apiCost: 18 }, total: { ...day, cost: 52, apiCost: 42 }, history: [], budgetUsed: 18,
  balance: { status: 'ok', totalBalance: 123.45, grantedBalance: 0, toppedUpBalance: 123.45, currency: 'CNY', fetchedAt: Date.parse('2026-10-23T10:00:00+08:00') },
  codingPlans: { minimax: { status: 'ok', fetchedAt: Date.parse('2026-10-23T10:00:00+08:00'), windows: { fiveHour: { percent: 24 }, weekly: { percent: 40 } } },
    opendesign: { status: 'error', message: '示例查询失败，请在插件页检查连接。', windows: {} } },
  customBalances: [{ index: 0, status: 'ok', remaining: 12, unit: 'CREDITS' }],
  gatewayQuotas: [{ id: 'demo', status: 'partial', message: '一个示例账户查询失败。', accounts: [
    { id: 'ok', label: '示例账户', status: 'ok', windows: [{ id: 'weekly', percent: 25 }], credits: { remaining: 125, limit: 200, unit: 'Credits' } },
    { id: 'error', label: '失败账户', status: 'error', message: '示例连接失败。', windows: [] },
  ] }] }
const client = readdirSync(join(root, 'src/client')).filter(name => name.endsWith('.js')).sort().map(name => readFileSync(join(root, 'src/client', name), 'utf8')).join('')
  .replace('exports.apply = apply', 'exports.fixture = { CostSection, CostOverview }; exports.apply = apply')
const chunks = ['settings-overview', 'statistics', 'community', 'pricing', 'openrouter', 'display', 'codex'].map(name => readFileSync(join(root, 'lib/client.' + name + '.js'), 'utf8')).join('\n')
const code = `import React from ${literal(req.resolve('react'))};import{createRoot}from ${literal(req.resolve('react-dom/client'))};
const el=React.createElement,modules={};window.fixtureErrors=[];window.fixtureWrites=0;
window.addEventListener('error',e=>window.fixtureErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.fixtureErrors.push(String(e.reason)));
window.__ModuleLoader__={load:module=>{modules[module.chunk??'main']=module.factory(name=>name==='react'?React:{Tooltip:({children})=>children})}};
${client}
${chunks}
let state=${literal(state)},snapshot={status:'ready',state,locale:'zh'},listeners=new Set();
const store={getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};
const emit=()=>{snapshot={...snapshot,state};listeners.forEach(fn=>fn())};
function useCost(){return React.useSyncExternalStore(store.subscribe,store.getSnapshot)}
const api={loadCommunity:async()=>()=>null,updateConfig:async patch=>{window.fixtureWrites++;state={...state,config:{...state.config,...patch}};emit();return state},reload:async()=>{}};
for(const [key,name]of Object.entries({loadSettingsOverview:'settings-overview',loadDisplay:'display',loadPricing:'pricing',loadOpenRouter:'openrouter',loadCodex:'codex'}))api[key]=async()=>modules['client.'+name+'.js'].mount({},store,config=>config.locale==='en'?'en':'zh');
const root=createRoot(document.getElementById('root'));let generation=0;
const render=mode=>{document.getElementById('heading').textContent=mode==='plugin'?'插件 / 费用计量':mode==='future'?'设置 / 费用（待启用展示页）':'设置 / 费用';root.render(el(mode==='future'?modules.main.fixture.CostOverview:modules.main.fixture.CostSection,{key:++generation,useCost,api}))};
document.getElementById('settings').onclick=()=>render('settings');document.getElementById('plugin').onclick=()=>render('plugin');document.getElementById('future').onclick=()=>render('future');
document.getElementById('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'};
document.getElementById('language').onclick=()=>{state={...state,config:{...state.config,locale:state.config.locale==='en'?'zh':'en'}};emit()};
const settle=()=>new Promise(resolve=>setTimeout(resolve,220));const check=(value,message)=>{if(!value)throw Error(message)};
window.runChecks=async()=>{const result=document.getElementById('result');result.textContent='Running';try{
state={...state,config:{...state.config,locale:'zh',showTotalWithPlan:false}};emit();render('settings');await settle();
const tabs=()=>[...document.querySelectorAll('#root .cm-tabs [role=tab]')].map(n=>n.textContent).join('|');const settingsTabs=tabs();check(settingsTabs.includes('显示')&&settingsTabs.includes('价格'),'full settings tabs present');
const before=window.fixtureWrites;document.querySelector('#root .cm-cards-toggle input').click();await settle();await settle();check(state.config.showTotalWithPlan===true&&window.fixtureWrites===before+1,'settings saves exactly once');
render('plugin');await settle();check(tabs()===settingsTabs,'both pages share all tabs');check(document.querySelector('#root .cm-cards-toggle input').checked,'plugin sees saved setting');
document.querySelector('#root .cm-cards-toggle input').click();await settle();await settle();check(!state.config.showTotalWithPlan,'plugin saves configuration');
render('settings');await settle();check(!document.querySelector('#root .cm-cards-toggle input').checked,'settings sees plugin save');
render('future');await settle();await settle();const writes=window.fixtureWrites;const panel=()=>document.querySelector('#root [data-settings-overview]');
check(!!panel(),'future overview mounts');check(!panel().querySelector('input,select,textarea,button,[contenteditable=true]'),'read-only page has no edit or action controls');
check(panel().textContent.includes('76%')&&panel().textContent.includes('60%'),'remaining quota is correctly converted');
check(panel().textContent.includes('12 Credits')&&panel().textContent.includes('125 / 200'),'custom balance and partial gateway credits retained');
check(panel().textContent.includes('示例查询失败')&&panel().textContent.includes('示例连接失败'),'query errors remain visible');
check(panel().querySelector('.cm-card-value').textContent==='¥21','saved API-only accounting applies');
state={...state,today:{...state.today,apiCost:5},codingPlans:{...state.codingPlans,minimax:{...state.codingPlans.minimax,windows:{fiveHour:{percent:30}}}}};emit();await settle();
check(panel().querySelector('.cm-card-value').textContent==='¥35'&&panel().textContent.includes('70%'),'live snapshots update cost and quota');
snapshot={...snapshot,status:'error',error:'Synthetic snapshot error'};emit();await settle();check(panel().textContent.includes('Synthetic snapshot error'),'stale snapshot error retained');
snapshot={...snapshot,status:'ready',error:null};state={...state,config:{...state.config,locale:'en'}};emit();await settle();check(panel().textContent.includes('Balances and quotas'),'language changes live');
const sizes=[];for(const width of [960,560,360]){document.getElementById('root').style.width=width+'px';await settle();check(document.getElementById('root').scrollWidth<=document.getElementById('root').clientWidth+1,'no overflow at '+width);sizes.push(width)}
state={...state,config:{...state.config,locale:'zh'}};emit();document.getElementById('root').style.width='';await settle();check(window.fixtureWrites===writes,'display page and live updates never save');check(!window.fixtureErrors.length,window.fixtureErrors.join(';'));
result.textContent='PASS: 双入口配置同步；展示页无编辑控件；费用/额度实时更新；错误提示；中英文；960/560/360px。';
}catch(error){result.textContent='FAIL '+error.message;throw error}};
document.getElementById('check').onclick=()=>window.runChecks().catch(()=>{});render('settings');`
const bundle = (await build({ stdin: { contents: code, resolveDir: root }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text
const theme = readFileSync(join(root, 'test/fixtures/peak-theme.css'), 'utf8')
const html = `<!doctype html><html lang="zh" data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>费用页面迁移 · 合成数据预览</title><style>${theme}body{padding:16px}nav{display:flex;flex-wrap:wrap;gap:8px}nav button{padding:6px 12px}#result{overflow-wrap:anywhere}main{max-width:1100px;margin:32px auto}#root{max-width:100%;width:960px}h1{font-size:22px}</style><nav><button id="settings">当前设置页</button><button id="plugin">插件配置页</button><button id="future">待启用展示页</button><button id="theme">切换明暗</button><button id="language">切换语言</button><button id="check">运行页面检查</button></nav><p>本地合成数据，不代表真实账户。</p><p id="result" role="status">Ready</p><main><h1 id="heading"></h1><div id="root"></div></main><script src="/fixture.js"></script></html>`
createServer((request, response) => { response.setHeader('content-type', request.url === '/fixture.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8'); response.end(request.url === '/fixture.js' ? bundle : html) }).listen(0, '127.0.0.1', function () { console.log('http://127.0.0.1:' + this.address().port + '/') })
