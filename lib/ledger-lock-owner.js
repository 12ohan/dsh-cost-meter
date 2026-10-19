/** Process identity for local ledger locks; PID liveness alone cannot detect reuse. */
import { readFileSync, readlinkSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { hostname } from 'node:os'
import { join } from 'node:path'

const host = hostname()
const ownStartMs = Date.now() - process.uptime() * 1000
const commandOptions = { encoding: 'utf8', timeout: 2000, maxBuffer: 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
let ownIdentity, clockTicks

function processIdentity(pid, legacy = false) {
  try {
    if (process.platform === 'linux') {
      // comm can itself contain spaces and ')'; field 22 follows its last ')'.
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
      const start = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19]
      if (!/^\d+$/.test(start ?? '')) return null
      const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
      const namespace = readlinkSync(`/proc/${pid}/ns/pid`)
      if (!/^[a-f0-9-]{36}$/.test(boot) || !namespace) return null
      let startedAtMs = pid === process.pid ? ownStartMs : null
      if (legacy && pid !== process.pid) {
        clockTicks ??= Number(execFileSync('getconf', ['CLK_TCK'], commandOptions).trim())
        const bootTime = readFileSync('/proc/stat', 'utf8').match(/^btime (\d+)$/m)?.[1]
        if (Number.isFinite(clockTicks) && clockTicks > 0 && bootTime) startedAtMs = (Number(bootTime) + Number(start) / clockTicks) * 1000
      }
      return { platform: 'linux', boot, namespace, start, startedAtMs }
    }
    if (process.platform === 'win32') {
      // 自己的进程不必启动 PowerShell：一次 Get-Process 要 1.2–1.4 秒，而启动时刻
      // 可以从 process.uptime() 估算到毫秒级。同机的两个进程各自估算同一启动时刻
      // 会相差几十毫秒，2 秒容差足够区分「同一个进程」与「PID 被复用」。
      if (pid === process.pid) {
        return { platform: 'win32', start: String(Math.round(ownStartMs)), unit: 'ms', startedAtMs: ownStartMs }
      }
      const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const start = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`], commandOptions).trim()
      if (!/^\d+$/.test(start)) return null
      return { platform: 'win32', start, startedAtMs: Number(BigInt(start) / 10000n - 62135596800000n) }
    }
  } catch { /* Missing process, permissions or OS tools: ownership remains unknown. */ }
  return null
}

function localIdentity() {
  if (ownIdentity === undefined) ownIdentity = processIdentity(process.pid)
  return ownIdentity
}

export function ledgerLockOwner() {
  return JSON.stringify({ version: 1, host, identity: localIdentity() })
}

/** Only dead processes, changed native identities or pre-birth legacy files qualify. */
export function staleLedgerLockOwner(path, pid, identities = new Map()) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 2147483647) return false
  const text = readFileSync(path, 'utf8')
  let previous
  if (text !== '') {
    try { previous = JSON.parse(text) } catch { /* Incomplete owner write is not stale. */ }
    if (previous?.host && previous.host !== host) return false
    const local = localIdentity()
    // Same-boot locks in another PID namespace cannot be probed from this one.
    if (previous?.identity?.platform === 'linux' && local?.platform === 'linux'
      && previous.identity.boot === local.boot && previous.identity.namespace !== local.namespace) return false
  }
  try { process.kill(pid, 0) } catch (error) { return error.code === 'ESRCH' }
  if (pid !== process.pid && !identities.has(pid)) identities.set(pid, processIdentity(pid, text === ''))
  const current = pid === process.pid ? localIdentity() : identities.get(pid)
  if (text === '') {
    // v1.8.13 and earlier wrote empty owner files. Allow for timestamp precision
    // and startup-time estimation; ordinary old locks are never expired by age.
    const start = pid === process.pid ? (current?.startedAtMs ?? ownStartMs) : current?.startedAtMs
    return Number.isFinite(start) && statSync(path).mtimeMs < start - 2000
  }
  const identity = previous?.version === 1 && previous.identity
  if (!identity || !current || identity.platform !== current.platform || typeof identity.start !== 'string' || !/^\d+$/.test(identity.start)) return false
  if (current.platform === 'linux') {
    if (typeof identity.boot !== 'string' || typeof identity.namespace !== 'string') return false
    return identity.boot !== current.boot || identity.start !== current.start
  }
  // 毫秒估算（unit: 'ms'）与 PowerShell 的 100ns ticks 不是同一单位，不能直接比较。
  // 只有双方都是毫秒时才用 2 秒容差判定；混用时保守地认为锁未过期。
  if (identity.unit === 'ms' || current.unit === 'ms') {
    if (identity.unit !== 'ms' || current.unit !== 'ms') return false
    const previousStart = Number(identity.start)
    const currentStart = Number(current.start)
    if (!Number.isFinite(previousStart) || !Number.isFinite(currentStart)) return false
    return Math.abs(previousStart - currentStart) > 2000
  }
  return identity.start !== current.start
}
