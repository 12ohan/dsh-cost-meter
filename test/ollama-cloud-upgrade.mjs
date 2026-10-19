import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

/**
 * Upgrading from v1.9.12 must not reprice recorded Ollama Cloud calls. The fixture ledger was
 * accounted by the v1.9.12 library (fixtures/ollama-cloud-upgrade-1.9.12/generate.mjs): its
 * frozen price version has no calendar policy and therefore keeps DeepSeek's windows. Calls
 * after the upgrade use Ollama's calendar; old calls change only through explicit model repricing.
 * The fixture's day keys are UTC dates, so the check runs under TZ=UTC.
 */
if (process.env.TZ !== 'UTC') {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' })
  process.stdout.write(child.stdout); process.stderr.write(child.stderr)
  assert.equal(child.status, 0, 'Ollama Cloud upgrade regression')
} else await run()

async function run() {
  const { Ledger, localDayKey } = await import('../lib/store.js')
  const { apply, __testProjection } = await import('../lib/index.js')
  const { replaySessionRecords, recomputeLedgerPricingBasis } = await import('../lib/backfill.js')
  const { turnCostFromRecords } = await import('../lib/turn-cost.js')
  const { pricingConfigAt } = await import('../lib/billing-history.js')
  const fixture = new URL('./fixtures/ollama-cloud-upgrade-1.9.12/', import.meta.url)
  const sessions = JSON.parse(readFileSync(new URL('sessions.json', fixture), 'utf8'))
  const root = mkdtempSync(join(tmpdir(), 'cm-ollama-upgrade-')), home = process.env.DSH_HOME
  const path = join(root, 'storages', 'cost-meter', 'ledger.json'), sessionsRoot = join(root, 'sessions')
  const oldFetch = globalThis.fetch, oldTimer = globalThis.setTimeout, oldNow = Date.now, disposers = []
  const flash = 'ollama-cloud:deepseek-v4.1-flash', pro = 'ollama-cloud:deepseek-v4-pro', official = 'deepseek-official:deepseek-v4.1-flash'
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: ${actual} != ${expected}`)
  const oldDay = '2026-10-19', newDay = '2026-10-20'
  // v1.9.12 amounts: DeepSeek's windows (06:30 UTC Monday peak, 13:00 off-peak).
  const OLD = { morning: { [flash]: .30, [pro]: 1.32, [official]: .30 }, afternoon: { [flash]: .15 } }
  // Tuesday after the upgrade: Ollama's calendar.
  sessions.upgraded = [{ at: `${newDay}T06:30:00.000Z`, provider: 'ollama-cloud', model: 'deepseek-v4.1-flash', input: 1e6 },
    { at: `${newDay}T13:00:00.000Z`, provider: 'ollama-cloud', model: 'deepseek-v4.1-flash', input: 1e6 }]
  const records = {}
  for (const [id, calls] of Object.entries(sessions)) {
    const rows = records[id] = [{ type: 'session', id, version: 0, createdAt: Date.parse(calls[0].at) - 1000 }, { type: 'turn/start', seq: 0, time: Date.parse(calls[0].at) - 1, data: { turn: 1 } }]
    for (const [i, { at, provider, model, input }] of calls.entries()) rows.push(
      { type: 'request/header', seq: i * 3 + 1, time: Date.parse(at), data: { header: { config: { provider, model } } } },
      { type: 'step/start', seq: i * 3 + 2, time: Date.parse(at), data: { turn: 1, step: i + 1 } },
      { type: 'assistant/message', seq: i * 3 + 3, time: Date.parse(at) + 1, data: { turn: 1, step: i + 1, usage: { inputTokens: input } } })
    rows.push({ type: 'turn/end', seq: calls.length * 3 + 1, time: Date.parse(calls.at(-1).at) + 2, data: { turn: 1 } })
    const dir = join(sessionsRoot, 'project', id); mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'session.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n')
  }
  const cells = (data, date, id) => data.days[date].sessions.find(row => row.id === id).byProviderModel
  const replayed = (config, id) => replaySessionRecords(records[id], config, null).days[localDayKey(Date.parse(sessions[id][0].at))]
  const detail = (config, id) => turnCostFromRecords(records[id], config, 0, sessions[id].length * 3 + 1).calls.reduce((sum, call) => ({ ...sum, [`${call.provider}:${call.model}`]: (sum[`${call.provider}:${call.model}`] ?? 0) + call.cost }), {})
  const projected = (ledger, id) => {
    const projection = __testProjection.makeCostUsageProjection(ledger)
    return records[id].slice(1).reduce((state, event) => projection.apply(state, event), projection.init({ id, createdAt: records[id][0].createdAt }, 0)).byProviderModel
  }
  const expectAll = (ledger, expected, label) => {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    for (const [id, models] of Object.entries(expected)) {
      const date = localDayKey(Date.parse(sessions[id][0].at)), replay = replayed(ledger.config, id), calls = detail(ledger.config, id), projection = projected(ledger, id)
      for (const [key, cost] of Object.entries(models)) {
        near(cells(data, date, id)[key].cost, cost, `${label} recorded ${id} ${key}`)
        near(replay[key].cost, cost, `${label} replay ${id} ${key}`)
        near(calls[key], cost, `${label} detail ${id} ${key}`)
        near(projection[key].cost, cost, `${label} projection ${id} ${key}`)
      }
    }
  }
  let clock = Date.parse(`${newDay}T00:00:00Z`), service
  try {
    process.env.DSH_HOME = root
    Date.now = () => clock
    mkdirSync(join(root, 'storages', 'cost-meter'), { recursive: true })
    cpSync(new URL('ledger.json', fixture), path)
    const original = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(original.version !== undefined && Object.keys(original.pricingHistory.versions).length, 1, 'fixture holds one v1.9.12 price version')
    for (const [id, models] of Object.entries(OLD)) for (const [key, cost] of Object.entries(models)) near(cells(original, oldDay, id)[key].cost, cost, `fixture ${id} ${key}`)

    // Load (upgrade at 2026-10-20 00:00 UTC): the old version keeps DeepSeek's calendar.
    let ledger = Ledger.load(path)
    const [initial] = Object.values(ledger.pricingHistory.changes).filter(row => row.at === 0)
    assert.equal(ledger.pricingHistory.versions[initial.version].prices.ollamaPeak, false, 'v1.9.12 version decodes with its calendar policy')
    assert.equal(pricingConfigAt(ledger.config, clock + 1).prices.ollamaPeak, true, 'calls after the upgrade use Ollama\'s calendar')
    assert.deepEqual(ledger.pricingHistory.runs, {})
    ledger.account({ input: 1e6 }, 'deepseek-v4.1-flash', 'upgraded', Date.parse(sessions.upgraded[0].at), 'ollama-cloud')
    ledger.account({ input: 1e6 }, 'deepseek-v4.1-flash', 'upgraded', Date.parse(sessions.upgraded[1].at), 'ollama-cloud')
    clock = Date.parse(`${newDay}T20:00:00Z`)
    // Automatic (non-explicit) repricing replays with the frozen versions and changes nothing.
    await recomputeLedgerPricingBasis(ledger, sessionsRoot, null)
    ledger.close()
    const NEW = { upgraded: { [flash]: .15 + .30 } }
    for (const call of ['morning', 'afternoon']) assert.deepEqual(cells(JSON.parse(readFileSync(path, 'utf8')), oldDay, call), cells(original, oldDay, call), `${call} unchanged by load and replay`)
    ledger = Ledger.load(path)
    expectAll(ledger, { ...OLD, ...NEW }, 'after upgrade')
    assert.deepEqual(turnCostFromRecords(records.upgraded, ledger.config, 0, 7).calls.map(call => call.cost), [.15, .30], 'new 06:30 off-peak, 13:00 peak')
    ledger.close()

    // Explicit target-model repricing opts old calls into the new calendar with the original FX.
    globalThis.fetch = async () => { throw Error('Unexpected network request') }
    globalThis.setTimeout = (fn, delay, ...args) => oldTimer(fn, delay === 3000 || delay === 5000 ? 3600000 : delay, ...args)
    apply({ on: () => () => {}, inject() {}, logger: { info() {}, warn() {}, error() {} }, effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) }, provide: (key, value) => { if (key === 'costMeter') service = value }, get: key => key === 'settings' ? { get: () => ({}) } : undefined })
    globalThis.setTimeout = oldTimer
    await service.updateConfig({ exchangeRate: 9 })
    assert.equal((await service.repriceModelHistory(true, flash)).ok, true)
    for (const dispose of disposers.splice(0).reverse()) await dispose()
    const REPRICED = { morning: { [flash]: .15, [pro]: 1.32, [official]: .30 }, afternoon: { [flash]: .30 } }
    const saved = JSON.parse(readFileSync(path, 'utf8'))
    near(cells(saved, oldDay, 'morning')[flash].costCny, .15 * 7, 'original FX')
    near(cells(saved, oldDay, 'afternoon')[flash].costCny, .30 * 7, 'original FX')
    for (const key of [pro, official]) assert.deepEqual(cells(saved, oldDay, 'morning')[key], cells(original, oldDay, 'morning')[key], `${key} untouched`)

    // Restart keeps the opted-in calls, untouched siblings, other providers and new calls.
    ledger = Ledger.load(path)
    expectAll(ledger, { ...REPRICED, ...NEW }, 'after reprice and restart')
    assert.equal(pricingConfigAt(ledger.config, Date.parse(sessions.morning[0].at), 'morning', flash).fxRates.CNY, 7)
    assert.equal(Object.values(ledger.pricingHistory.runs).filter(row => row.model === flash).length, 1)
    ledger.close()
  } finally {
    for (const dispose of disposers.reverse()) await dispose()
    globalThis.fetch = oldFetch; globalThis.setTimeout = oldTimer; Date.now = oldNow
    if (home === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = home
    rmSync(root, { recursive: true, force: true })
  }
  console.log('[ok] Ollama Cloud upgrade: v1.9.12 amounts kept on load/replay/detail/projection; new calls on Ollama\'s calendar; explicit model repricing opts in with original FX; restart')
}
