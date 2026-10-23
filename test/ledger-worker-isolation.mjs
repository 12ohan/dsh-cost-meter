// Desktop workers do not inherit the DSH resolver. Use a directory with no
// node_modules and exercise the shipped worker, failure and disposal paths.
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { Ledger, sanitizeConfig } from '../lib/store.js'
import { startLedgerWrite } from '../lib/ledger-writer.js'

const work = mkdtempSync(join(tmpdir(), 'cm-isolated-worker-')), ledgers = []
const calls = path => Object.values(JSON.parse(readFileSync(path, 'utf8')).days).reduce((n, row) => n + row.calls, 0)
const make = (name, options) => {
  const ledger = new Ledger(sanitizeConfig({}), {}, join(work, name + '.json'), [], {
    backgroundWriter: (payload, receive) => startLedgerWrite(payload, receive, options),
  })
  ledgers.push(ledger)
  ledger.account({ input: 100, output: 50 }, 'deepseek-v4-flash', name, Date.now(), 'deepseek')
  return ledger
}
try {
  const worker = join(work, 'worker.mjs')
  copyFileSync(new URL('../lib/ledger-writer-worker.js', import.meta.url), worker)
  const isolated = make('isolated', { workerUrl: pathToFileURL(worker) })
  await isolated.flushAsync()
  assert.equal(isolated.pendingWrite, false, 'shipped worker runs without host peers or a module loader')
  assert.equal(calls(isolated.path), 1)

  const broken = join(work, 'broken.mjs')
  writeFileSync(broken, 'import "@deepseek-ai/dsh-home-paths"')
  const failed = make('failed-import', { workerUrl: pathToFileURL(broken) })
  let ticks = 0
  const heartbeat = setInterval(() => { ticks++ }, 5)
  const start = performance.now()
  failed.flushAsync()
  await failed.close()
  clearInterval(heartbeat)
  assert.ok(performance.now() - start < 2000, 'worker import failure cannot block close for the old 8-second synchronous wait')
  assert.ok(ticks > 0, 'the host loop stays responsive while unloading')
  assert.equal(calls(failed.path), 1, 'final synchronous write preserves usage after worker failure')

  const stalled = join(work, 'stalled.mjs')
  writeFileSync(stalled, 'setInterval(() => {}, 1000)')
  const timed = make('timed-out', { workerUrl: pathToFileURL(stalled), timeoutMs: 100 })
  const timeoutStart = performance.now()
  timed.flushAsync()
  await timed.close()
  assert.ok(performance.now() - timeoutStart < 2000, 'a silent worker cannot keep disposal pending forever')
  assert.equal(calls(timed.path), 1, 'bounded failure preserves the pending transaction once')
  const locked = join(work, 'locked.mjs')
  writeFileSync(locked, `import { workerData } from 'node:worker_threads';
    import { withLedgerLock } from ${JSON.stringify(new URL('../lib/ledger-persistence.js', import.meta.url).href)};
    withLedgerLock(workerData.path, () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000), 5000, workerData.lockId)`)
  const killed = make('killed-with-lock', { workerUrl: pathToFileURL(locked), timeoutMs: 500 })
  const lockedStart = performance.now()
  killed.flushAsync()
  while (!existsSync(killed.path + '.lock') && performance.now() - lockedStart < 2000) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(existsSync(killed.path + '.lock'), 'fixture worker really owns the ledger lock')
  await killed.close()
  assert.equal(existsSync(killed.path + '.lock'), false, 'termination releases only the stopped worker lock')
  assert.equal(calls(killed.path), 1, 'lock recovery permits the final write without dropping usage')
  console.log('[ok] standalone Desktop worker, missing peer failure, responsive close and bounded stalled worker; all usage retained')
} finally {
  for (const ledger of ledgers) await ledger.close()
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
