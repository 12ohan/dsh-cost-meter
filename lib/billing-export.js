/** Explicit, local-only exports. Jobs retain immutable bytes; RPC transports bounded chunks. */
import { randomUUID } from 'node:crypto'
import { setImmediate } from 'node:timers/promises'
import { currencyLedger } from './currency-view.js'
import { billingStatistics, ledgerStatisticsQuery, STAT_FIELDS } from './billing-statistics.js'
import { getSessionBillingSnapshot } from './turn-cost.js'
import { readSessionHeaders, sessionCostIds } from './session-tree.js'
import { bindPricingHistory, pricingHistoryOf } from './billing-history.js'

const MAX_BYTES = 64 * 1024 * 1024, CHUNK_BYTES = 48 * 1024, TTL = 10 * 60_000
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : 0
const buckets = (row, factor = 1) => Object.fromEntries(STAT_FIELDS.map(key => [key, numeric(row?.[key]) * (['cost', 'apiCost'].includes(key) ? factor : 1)]))
const same = (a, b) => Math.abs(a - b) <= Math.max(1e-8, Math.abs(a) * 1e-8)
const cell = value => {
  let text = value == null ? '' : String(value)
  if (typeof value === 'string' && /^[\s\x00-\x1f]*[=+@-]/.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}
export function billingExportCsv(headers, rows) {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function encodeBillingExport(data, format) {
  if (format === 'json') return JSON.stringify(data, null, 2) + '\n'
  const en = data.locale === 'en', text = (zh, english) => en ? english : zh
  const common = [text('对话 ID', 'Conversation ID'), text('对话标题', 'Conversation title'), text('币种', 'Currency')]
  if (format === 'csv-summary') {
    const headers = [...common, text('调用次数', 'Calls'), 'Input tokens', 'Cache read tokens', 'Cache write tokens', 'Output tokens', 'Reasoning tokens',
      text('账本总费用', 'Recorded total cost'), text('API 费用', 'API cost'), text('Plan 等值', 'Plan equivalent'), text('已解析调用', 'Parsed calls'), text('明细状态', 'Detail status')]
    return billingExportCsv(headers, data.sessions.map(row => [row.id, row.title, data.currency, row.recorded.calls, row.recorded.input, row.recorded.cacheRead, row.recorded.cacheWrite, row.recorded.output, row.recorded.reasoning,
      row.recorded.cost, row.recorded.apiCost, Math.max(0, row.recorded.cost - row.recorded.apiCost), row.calls.length, row.detailStatus]))
  }
  const headers = [...common, text('实际会话 ID', 'Actual session ID'), text('时间 (UTC)', 'Time (UTC)'), text('类型', 'Kind'), text('轮次', 'Turn'), text('步骤', 'Step'), text('渠道', 'Provider'), text('模型', 'Model'),
    'Input tokens', 'Cache read tokens', 'Cache write tokens', 'Output tokens', 'Reasoning tokens', text('费用', 'Cost'), text('API 费用', 'API cost'), text('Plan 等值', 'Plan equivalent'), text('已定价', 'Priced'),
    text('会话账本总额（参考）', 'Conversation ledger total (reference)'), text('会话明细状态', 'Conversation detail status')]
  return billingExportCsv(headers, data.sessions.flatMap(row => row.calls.map(call => [row.id, row.title, data.currency, call.sessionId, new Date(call.atMs).toISOString(), call.kind, call.turn, call.step, call.provider, call.model,
    call.input, call.cacheRead, call.cacheWrite, call.output, call.reasoning, call.cost, call.apiCost, Math.max(0, call.cost - call.apiCost), call.priced, row.recorded.cost, row.detailStatus])))
}

/** Internal detail snapshots never cross RPC without pagination. Only whitelisted billing fields leave here. */
export async function collectBillingExport(ledger, ctx, raw, { active = () => true, progress = () => {}, detail = getSessionBillingSnapshot, now = Date.now } = {}) {
  const cutoff = now(), query = ledgerStatisticsQuery(ledger, { ...raw, basis: 'total' })
  // Analytics transports USD-normalized display values; files contain real units
  // of their declared currency, including the saved historical FX amounts.
  const factor = ledger.config._displayCurrency ? ledger.config.exchangeRate : 1
  const ids = query.sessionId ? await sessionCostIds(ledger, ctx, query.sessionId) : null
  const headers = !query.sessionId && ledger.config.includeSubagentCost ? await readSessionHeaders(ctx) : []
  const stats = billingStatistics(ledger, query, ids, headers, { allSessions: true })
  const rows = query.sessionId ? [{ id: query.sessionId, title: stats.sessions.find(row => row.id === query.sessionId)?.title || query.sessionId, ...stats.totals }] : stats.sessions
  const data = { schema: 'dsh-cost-meter/billing-export/v1', exportedAt: new Date(cutoff).toISOString(), currency: raw.displayCurrency || ledger.config.currency || 'USD', locale: raw.locale === 'en' ? 'en' : 'zh',
    from: query.from, to: query.to, provider: query.provider, model: query.model, includeSubagents: ledger.config.includeSubagentCost === true, totals: buckets(stats.totals, factor), unassignedCost: stats.unassignedCost * factor, sessions: [] }
  let count = 0
  for (const row of rows) {
    if (!active()) throw new Error('cancelled')
    const session = { id: row.id, title: row.title || row.id, recorded: buckets(row, factor), detailStatus: 'complete', calls: [] }
    if (raw.format !== 'csv-summary') {
      try {
        const full = await detail(ledger, ctx, { ...query, sessionId: row.id, background: false })
        if (!active()) throw new Error('cancelled')
        for (const call of full.calls) {
          if (call.atMs > cutoff) continue
          const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }
          for (const part of call.rows) if (Object.hasOwn(tokens, part.bucket)) tokens[part.bucket] += numeric(part.tokens)
          session.calls.push({ sessionId: call.sessionId || row.id, atMs: call.atMs, kind: call.kind, turn: call.turn, step: call.step, provider: call.provider, model: call.model,
            ...tokens, cost: numeric(call.cost) * factor, apiCost: numeric(call.apiCost) * factor, plan: call.plan === true, priced: call.priced === true,
            rates: call.rows.map(part => ({ bucket: part.bucket, tokens: numeric(part.tokens), requests: numeric(part.requests), rate: numeric(part.rate) * factor, cost: numeric(part.cost) * factor, priced: part.priced === true })) })
          if (++count > 200000) throw new Error('EXPORT_LIMIT')
        }
        if (session.calls.length !== row.calls || !same(session.calls.reduce((sum, call) => sum + call.cost, 0), session.recorded.cost)) session.detailStatus = 'ledger-detail-difference'
      } catch (error) {
        if (!active() || error.message === 'EXPORT_LIMIT') throw error
        session.detailStatus = 'details-unavailable'
      }
    } else session.detailStatus = 'not-requested'
    data.sessions.push(session)
    progress(data.sessions.length, rows.length)
    await setImmediate()
  }
  if (!query.sessionId) {
    const assigned = Object.fromEntries(STAT_FIELDS.map(key => [key, data.sessions.reduce((sum, row) => sum + row.recorded[key], 0)]))
    const remaining = Object.fromEntries(STAT_FIELDS.map(key => [key, Math.max(0, data.totals[key] - assigned[key])]))
    if (Object.values(remaining).some(value => value > 1e-8)) data.sessions.push({ id: '', title: data.locale === 'en' ? 'Ledger entries without a conversation' : '未归属对话的账本记录', recorded: remaining, detailStatus: 'ledger-only', calls: [] })
  }
  return data
}

export function createBillingExporter(ledger, ctx, { now = Date.now, collect = collectBillingExport } = {}) {
  const jobs = new Map(); let closed = false
  const response = (job, offset = 0) => {
    const bytes = job.bytes ?? Buffer.alloc(0), nextOffset = Math.min(bytes.length, offset + CHUNK_BYTES)
    return { id: job.id, status: job.status, filename: job.filename, mime: job.mime, totalBytes: bytes.length, offset, nextOffset, data: bytes.subarray(offset, nextOffset).toString('base64'),
      completedSessions: job.completedSessions, totalSessions: job.totalSessions, rows: job.rows, message: job.message }
  }
  return {
    get(raw = {}) {
      const time = now()
      for (const [id, job] of jobs) if (time - job.touched > TTL) { job.cancelled = true; jobs.delete(id) }
      if (closed) throw new Error('Export service is closed')
      if (raw.id) {
        const job = jobs.get(raw.id)
        if (!job) throw new Error('Export expired; start again')
        job.touched = time
        if (raw.cancel === true) { job.cancelled = true; jobs.delete(raw.id); return response({ ...job, status: 'cancelled', bytes: null }) }
        const offset = raw.offset ?? 0
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > (job.bytes?.length ?? 0)) throw new Error('Invalid export offset')
        return response(job, offset)
      }
      if (jobs.size >= 2) throw new Error('Two exports are already active; close one before starting another')
      if (!['csv-summary', 'csv-calls', 'json'].includes(raw.format)) throw new Error('Invalid export format')
      if (raw.displayCurrency && !['USD', 'CNY', 'EUR'].includes(raw.displayCurrency)) throw new Error('Invalid export currency')
      ledger.refresh?.()
      const request = { ...raw, displayCurrency: raw.displayCurrency || ledger.config.currency || 'USD' }
      const config = bindPricingHistory(structuredClone(ledger.config), structuredClone(pricingHistoryOf(ledger.config)))
      const frozen = currencyLedger({ path: ledger.path, days: structuredClone(ledger.days), _config: config, get config() { return this._config } }, request.displayCurrency)
      ledgerStatisticsQuery(frozen, request)
      const id = randomUUID(), suffix = (raw.sessionId || 'all-conversations').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 60)
      const job = { id, touched: time, status: 'preparing', cancelled: false, completedSessions: 0, totalSessions: 0, rows: 0, message: '',
        filename: `dsh-cost-${suffix}-${new Date(time).toISOString().replace(/[:.]/g, '-')}.${raw.format === 'json' ? 'json' : 'csv'}`, mime: raw.format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' }
      jobs.set(id, job)
      const active = () => !closed && !job.cancelled && jobs.get(id) === job
      Promise.resolve().then(async () => {
        const data = await collect(frozen, ctx, request, { now: () => time, active, progress: (completed, total) => { job.completedSessions = completed; job.totalSessions = total } })
        if (!active()) return
        const bytes = Buffer.from(encodeBillingExport(data, raw.format))
        if (bytes.length > MAX_BYTES) throw new Error('EXPORT_LIMIT')
        job.rows = raw.format === 'csv-summary' ? data.sessions.length : data.sessions.reduce((sum, row) => sum + row.calls.length, 0)
        const incomplete = data.sessions.filter(row => !['complete', 'not-requested'].includes(row.detailStatus)).length
        if (incomplete) job.message = raw.locale === 'en' ? `${incomplete} conversation(s) have missing or differing call details. JSON and summary CSV preserve recorded ledger totals.` : `${incomplete} 个对话的调用明细缺失或与账本不同；JSON 和汇总 CSV 保留账本金额。`
        job.bytes = bytes; job.status = 'ready'
      }).catch(error => {
        if (!active()) return
        job.status = 'error'
        job.message = error.message === 'EXPORT_LIMIT' ? (raw.locale === 'en' ? 'Export is too large. Select a smaller date range or one conversation.' : '记录过多，请缩小日期范围或选择单个对话。') : (raw.locale === 'en' ? 'Export failed. Try again.' : '导出失败，请重试。')
      })
      return response(job)
    },
    dispose() { closed = true; for (const job of jobs.values()) job.cancelled = true; jobs.clear() },
  }
}
