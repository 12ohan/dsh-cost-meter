import { multiplierPath } from './price-multiplier.js'
/** Immutable pricing versions. Calls share a version instead of copying a catalog per call. */
import { createHash, randomUUID } from 'node:crypto'
import { priceAt } from './pricing.js'

const bindings = new WeakMap()
const indexes = new WeakMap()
const fields = ['prices', 'priceMatch', 'priceOverrides', 'exchangeRate', 'peakEnabled', 'peakEffectiveAt', 'peakWindows', 'peakHolidays']
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const safe = key => !['__proto__', 'constructor', 'prototype'].includes(key)
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const rateFields = new Set(['cacheHit', 'cacheMiss', 'cacheWrite', 'input', 'cachedInput', 'output', 'reasoning', 'billingMode', 'unpriced', 'legacy', 'currency', 'aboveInputTokens', 'before', 'offPeak', 'peak', 'longContext', 'legacyBase', 'rateHistory', 'cny', 'multiplier', 'separateMultipliers', 'multipliers'])
const ratesOnly = value => Array.isArray(value) ? value.map(ratesOnly) : object(value)
  ? Object.fromEntries(Object.entries(value).filter(([key]) => rateFields.has(key) || multiplierPath.test(key)).map(([key, child]) => [key, ratesOnly(child)])) : value
const modelsOnly = models => Object.fromEntries(Object.entries(models ?? {}).filter(([key]) => safe(key)).map(([key, entry]) => [key, ratesOnly(entry)]))
const runFields = ['at', 'before', 'after', 'days', 'sessions', 'skipped']
const compare = (a, b) => a.at - b.at || (a.sequence ?? 0) - (b.sequence ?? 0) || a.version.localeCompare(b.version)
function indexOf(history) {
  let index = indexes.get(history)
  if (index) return index
  const revisions = new Map()
  for (const row of Object.values(history.revisions)) {
    const key = JSON.stringify([row.sessionId, row.date]), previous = revisions.get(key)
    if (!previous || compare(row, previous) >= 0) revisions.set(key, row)
  }
  index = { changes: Object.values(history.changes).sort(compare), revisions, fingerprint: hash([history.changes, history.revisions]) }
  indexes.set(history, index)
  return index
}

export function pricingSnapshot(config) {
  // Credentials, prompts and other settings never enter a price version.
  const snapshot = structuredClone(Object.fromEntries(fields.filter(key => key !== 'prices' && config?.[key] !== undefined).map(key => [key, config[key]])))
  const prices = config?.prices ?? {}
  snapshot.prices = { ...(prices.currency ? { currency: prices.currency } : {}), default: ratesOnly(prices.default), models: modelsOnly(prices.models),
    providers: Object.fromEntries(Object.entries(prices.providers ?? {}).filter(([key]) => safe(key)).map(([key, table]) => [key, {
      ...(table.currency ? { currency: table.currency } : {}), ...(table.default ? { default: ratesOnly(table.default) } : {}), models: modelsOnly(table.models),
    }])) }
  return snapshot
}

export function createPricingHistory(config) {
  const pricing = pricingSnapshot(config), id = hash(pricing)
  return { versions: { [id]: pricing }, changes: { initial: { at: 0, version: id } }, revisions: {}, runs: {} }
}

export function normalizePricingHistory(raw, config) {
  if (!object(raw?.versions) || !object(raw?.changes)) return createPricingHistory(config)
  const versions = Object.fromEntries(Object.entries(raw.versions).filter(([id, value]) => /^[a-f\d]{64}$/.test(id) && object(value?.prices))
    .map(([id, value]) => [id, pricingSnapshot(value)]))
  const changes = Object.fromEntries(Object.entries(raw.changes).filter(([id, row]) => safe(id) && Number.isFinite(row?.at) && row.at >= 0 && versions[row.version]))
  if (!Object.values(changes).some(row => row.at === 0)) return createPricingHistory(config)
  const revisions = Object.fromEntries(Object.entries(raw.revisions ?? {}).filter(([id, row]) => safe(id) && typeof row?.sessionId === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.at) && versions[row.version]))
  const runs = Object.fromEntries(Object.entries(object(raw.runs) ? raw.runs : {}).filter(([id, row]) => safe(id) && runFields.every(key => Number.isFinite(row?.[key]) && row[key] >= 0))
    .map(([id, row]) => [id, Object.fromEntries(runFields.map(key => [key, row[key]]))]))
  return { versions, changes, revisions, runs }
}

export function advancePricingHistory(history, config, at = Date.now()) {
  const pricing = pricingSnapshot(config), version = hash(pricing)
  const latest = indexOf(history).changes.at(-1)
  if (latest?.version === version) return false
  history.versions[version] = pricing
  history.changes[randomUUID()] = { at: Math.max(at, latest?.at ?? 0), sequence: (latest?.sequence ?? 0) + 1, version }
  indexes.delete(history)
  return true
}

export function bindPricingHistory(config, history) {
  if (config && history) bindings.set(config, history)
  return config
}

export function pricingHistoryOf(config) { return bindings.get(config) }

/** Classification stays editable; monetary rates come from the call's price version. */
export function pricingConfigAt(config, at, sessionId = '') {
  const history = bindings.get(config)
  if (!history) return config
  if (!Number.isFinite(at)) return config
  const index = indexOf(history)
  const date = new Date(at)
  const day = Number.isFinite(at) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : ''
  let low = 0, high = index.changes.length
  while (low < high) { const middle = (low + high) >>> 1; if (index.changes[middle].at <= at) low = middle + 1; else high = middle }
  const chosen = index.changes[low - 1]
  let revision = index.revisions.get(JSON.stringify([sessionId, day]))
  if (revision && at > revision.at) revision = null
  const version = (revision ?? chosen)?.version
  return version && history.versions[version] ? { ...config, ...history.versions[version] } : config
}

/** Repricing affects only fully replayable session/day records explicitly accepted by the user. */
export function recordPricingRevision(history, config, sessionId, date, at, before, after) {
  const pricing = pricingSnapshot(config), version = hash(pricing)
  history.versions[version] = pricing
  history.revisions[randomUUID()] = { sessionId, date, at, sequence: Object.keys(history.revisions).length + 1, version, before, after }
  indexes.delete(history)
}

export function mergePricingHistory(local, disk) {
  if (!local) return disk
  if (!disk) return local
  const revisions = { ...disk.revisions }
  for (const [key, row] of Object.entries(local.revisions ?? {})) if (!revisions[key] || row.at >= revisions[key].at) revisions[key] = row
  return { versions: { ...disk.versions, ...local.versions }, changes: { ...local.changes, ...disk.changes }, revisions, runs: { ...disk.runs, ...local.runs } }
}

export function pricingHistoryFingerprint(config) {
  const history = bindings.get(config)
  return history ? indexOf(history).fingerprint : ''
}

/** Explicit recalculation uses today's rates, retaining time-of-day and length tiers. */
export function currentPricingConfig(config, now = Date.now()) {
  const freeze = raw => {
    if (!raw || typeof raw !== 'object') return raw
    const { rateHistory, legacyBase, ...entry } = priceAt(raw, now)
    return entry
  }
  const snapshot = pricingSnapshot(config), prices = snapshot.prices
  prices.default = freeze(prices.default)
  prices.models = Object.fromEntries(Object.entries(prices.models ?? {}).map(([id, entry]) => [id, freeze(entry)]))
  prices.providers = Object.fromEntries(Object.entries(prices.providers ?? {}).map(([id, table]) => [id, { ...table,
    ...(table.default ? { default: freeze(table.default) } : {}),
    models: Object.fromEntries(Object.entries(table.models ?? {}).map(([model, entry]) => [model, freeze(entry)])) }]))
  return { ...config, ...snapshot }
}
