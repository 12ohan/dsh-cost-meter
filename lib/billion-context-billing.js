/** DSH side of the local billion-context metering bridge. No inference or HTTP polling. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { billionRoot, billionSessionKey, billionStreamPath, writeBillionJson, readBillionJson, listBillionFiles, iterateBillionCalls, readBillionStream,
  billionProvider, usageOnly, usageBuckets, usageSignature, validUsage, validSessionId } from './billion-context-history.js'

const bridgeKey = Symbol.for('dsh-cost-meter.billion-context.v1'), bridges = new WeakMap()
const plainId = value => typeof value === 'string' ? value.slice(0, 200) : ''
function stepIdentity(ctx, id) {
  try {
    const records = ctx?.get?.('sessions')?.get?.(id)?.snapshotEvents?.() ?? []
    let turn = null, step = null
    for (let i = records.length - 1; i >= 0; i--) {
      const row = records[i]
      if (row.type === 'step/start') { turn = row.data?.turn; step = row.data?.step; break }
      if (row.type === 'turn/start') { turn = row.data?.turn; break }
    }
    return { turn: Number.isSafeInteger(turn) && turn >= 0 ? turn : null, step: Number.isSafeInteger(step) && step >= 0 ? step : null }
  } catch { return { turn: null, step: null } }
}
export function installBillionContextBilling(ctx, ledger) {
  if (!ledger.path) return null
  const root = billionRoot(ledger.path), scope = new AsyncLocalStorage(), streams = new Map(), groups = new Map(), files = new Map()
  let stopped = false, pending = null, rerun = false
  const status = { protocol: 1, requests: 0, unreported: 0, partial: 0, uncovered: 0, connected: false, failed: false }
  const save = stream => {
    if (!stream.groups.length) return
    writeBillionJson(billionStreamPath(root, stream.sessionId, stream.streamId), {
      protocol: 1, streamId: stream.streamId, sessionId: stream.sessionId, model: stream.model, provider: stream.provider,
      turn: stream.turn, step: stream.step, startedAtMs: stream.startedAtMs, covered: stream.covered ?? stream.lastAck === true,
      finished: !!stream.finishedAt, policies: stream.policies,
      ...(stream.reported ? { reported: stream.reported } : {}), sourceSeqs: stream.sourceSeqs,
    })
  }
  // The proxy reads this fixed private file. No filesystem path is sent upstream.
  try { writeBillionJson(join(dirname(ledger.path), 'billion-context-bridge.json'), { protocol: 1, root }) }
  catch { return null }
  const ingest = () => {
    if (stopped) return Promise.resolve()
    if (pending) { rerun = true; return pending.then(() => rerun ? ingest() : undefined) }
    pending = (async () => {
      do {
        rerun = false
        ledger.refresh()
        let work = 0
        for (const file of listBillionFiles(ledger.path)) {
          const info = statSync(file.path), cached = files.get(file.path)
          if (cached?.size === info.size && cached?.mtime === info.mtimeMs) continue
          let offset = cached?.offset <= info.size ? cached.offset : 0, blocked = false
          for await (const item of iterateBillionCalls(file, offset)) {
            const row = item.row, stream = readBillionStream(ledger.path, row)
            if (!stream || !stream.finished) { blocked = true; break }
            offset = item.offset
            status.connected = true; status.requests++
            if (!row.usage) status.unreported++
            else if (!row.complete) status.partial++
            const meter = { source: row.source + ':' + file.key, seq: row.seq }
            const reset = ledger.historyReset?.at ?? 0
            if ((ledger.usageCursors?.[meter.source] ?? 0) < meter.seq) {
              if (!row.usage || row.startedAtMs <= reset || stream.policies?.[row.groupId] === 'fallback') ledger.advanceUsageCursor(meter)
              else ledger.account(usageBuckets(row.usage), row.model, row.sessionId, row.startedAtMs, billionProvider(row, stream), meter)
            }
            if (++work >= 5000) break
          }
          files.set(file.path, { offset, size: blocked || offset < info.size && work >= 5000 ? -1 : info.size, mtime: info.mtimeMs })
          if (work >= 5000) break
        }
        status.failed = false
      } while (rerun && !stopped)
    })().catch(() => { status.failed = true }).finally(() => { pending = null })
    return pending
  }
  const api = {
    unsupported() { const current = scope.getStore(); if (current) { current.lastAck = false; current.lastGroup = null; status.uncovered++ } },
    begin(url) {
      const current = scope.getStore()
      if (!current || stopped || !validSessionId(current.sessionId)) return
      let address
      try { address = new URL(url) } catch { return }
      const local = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(address.hostname)
      if (!local || !address.pathname.startsWith('/bili/')) {
        if (/\/(chat\/completions|responses(?:\/compact)?|messages)$|:(?:generateContent|streamGenerateContent)$/.test(address.pathname)) { current.lastAck = false; current.lastGroup = null }
        return
      }
      if (current.groups.length >= 64) { current.lastAck = false; current.lastGroup = null; return }
      const groupId = randomUUID()
      current.groups.push(groupId); current.lastGroup = groupId; groups.set(groupId, current)
      save(current)
      writeBillionJson(join(root, 'groups', groupId + '.json'), { protocol: 1, groupId, streamId: current.streamId, sessionId: current.sessionId })
      return groupId
    },
    ack(groupId, acknowledged) {
      const current = groups.get(groupId)
      if (!current) return
      current.lastAck = acknowledged === true
      if (acknowledged) status.connected = true
      try { save(current) } catch { status.failed = true }
    },
    createScope(options, startedAtMs) {
      const current = { streamId: randomUUID(), sessionId: options?.sessionId, model: plainId(options?.model), provider: plainId(options?.provider),
        ...stepIdentity(ctx, options?.sessionId), startedAtMs, groups: [], policies: {}, sourceSeqs: [], lastAck: false }
      // Retain completed contexts briefly so the host's final message can link its exact sequence.
      for (const [id, item] of streams) if (streams.size >= 2048 || item.finishedAt && Date.now() - item.finishedAt > 300000) {
        streams.delete(id); for (const group of item.groups) groups.delete(group)
      }
      streams.set(current.streamId, current)
      return {
        run: operation => scope.run(current, operation),
        observe: usage => { if (validUsage(usageOnly(usage))) current.reported = usageOnly(usage) },
        async finish(usage) {
          if (usage) current.reported = usageOnly(usage)
          const deadline = Date.now() + 200
          for (const groupId of current.groups) {
            let receipt
            do {
              try { receipt = readBillionJson(join(root, 'groups', groupId + '.status.json')) } catch {}
              if (receipt?.complete || Date.now() >= deadline) break
              await new Promise(resolve => setTimeout(resolve, 10))
            } while (!stopped)
            current.policies[groupId] = receipt?.complete && !receipt.failed ? 'full' : usage ? 'fallback' : 'partial'
            if (current.policies[groupId] !== 'full') status.uncovered++
          }
          current.covered = current.lastAck === true && current.policies[current.lastGroup] !== 'fallback'
          current.finishedAt = Date.now()
          let saved = true
          try { save(current) } catch {
            saved = false; current.covered = false; current.lastAck = false
            // A later host event must not resurrect full proxy import after host fallback billing.
            for (const groupId of current.groups) current.policies[groupId] = 'fallback'
            status.uncovered++
          }
          await ingest()
          if (!saved) status.failed = true
          return current.covered
        },
      }
    },
    ingest,
    status: () => ({ ...status }),
    dispose() { stopped = true; if (globalThis[bridgeKey] === api) delete globalThis[bridgeKey]; scope.disable() },
  }
  globalThis[bridgeKey] = api; bridges.set(ledger, api)
  const timer = setInterval(() => { void ingest() }, 3000); timer.unref?.()
  ctx.effect(() => () => { clearInterval(timer); api.dispose(); bridges.delete(ledger) }, 'cost-meter: billion-context billing')
  ctx.on('session/event', (session, event) => {
    if (!Number.isSafeInteger(event.seq) || event.seq < 0) return
    const usage = event.type === 'assistant/message' || event.type === 'compaction/summary' ? event.data?.usage
      : event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage' ? event.data.chunk.usage : null
    if (!usage) return
    const candidates = [...streams.values()].filter(stream => stream.sessionId === session.id && stream.lastAck && stream.reported
      && usageSignature(stream.reported) === usageSignature(usage)
      && (stream.turn == null || event.data?.turn == null || stream.turn === event.data.turn)
      && (stream.step == null || event.data?.step == null || stream.step === event.data.step)
      && (!event.data?.message?.source?.model || event.data.message.source.model === stream.model))
    if (candidates.length !== 1) return
    const stream = candidates[0]
    if (!stream.sourceSeqs.includes(event.seq) && stream.sourceSeqs.length < 32) {
      stream.sourceSeqs.push(event.seq)
      try { save(stream) } catch { status.failed = true }
    }
  }, { global: true })
  void ingest()
  return api
}
export const syncBillionContextBilling = ledger => bridges.get(ledger)?.ingest() ?? Promise.resolve()
export const billionContextBillingStatus = ledger => bridges.get(ledger)?.status()
