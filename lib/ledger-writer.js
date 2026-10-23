/** Serialize daily writes in a worker; explicit flush/close can join the same transaction. */
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads'

export function startLedgerWrite(payload, receive) {
  const { port1, port2 } = new MessageChannel()
  const signal = new Int32Array(new SharedArrayBuffer(4))
  let finished = false, resolve
  const promise = new Promise(done => { resolve = done })
  const worker = new Worker(new URL('./ledger-writer-worker.js', import.meta.url), {
    workerData: { ...payload, signal, port: port2 }, transferList: [port2], execArgv: [],
  })
  const finish = message => {
    if (finished) return
    finished = true
    try { receive(message) }
    finally { port1.close(); void worker.terminate(); resolve() }
  }
  port1.on('message', finish)
  worker.on('error', error => finish({ error: { message: error.message, code: error.code } }))
  worker.on('exit', code => {
    if (!finished) finish(receiveMessageOnPort(port1)?.message ?? { error: { message: `Ledger worker exited (${code})` } })
  })
  return { promise, wait(timeoutMs = 8000) {
    const until = Date.now() + timeoutMs
    while (!finished) {
      const result = receiveMessageOnPort(port1)
      if (result) { finish(result.message); break }
      if (Date.now() >= until) return false
      Atomics.wait(signal, 0, 0, Math.min(50, until - Date.now()))
    }
    return true
  } }
}
