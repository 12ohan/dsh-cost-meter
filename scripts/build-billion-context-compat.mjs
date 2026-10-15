/** Reproducible, local-only adapter for the exact inspected npm build. Never installs or publishes it. */
import { readFileSync, writeFileSync, cpSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { transform } from 'esbuild'

const sourceRoot = resolve(import.meta.dirname, '..')
const hashes = {
  'dist/index.js': '454b3f5943e6248dc5900ab34213475da546ea5cfb75ccd1157c9bd3040b2d3b',
  'dist/agent/dsh-native.js': 'd11c45c4a1eb2317c27df027d3bd8bf485b5b44665bc827db76d862432593fd5',
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const prepend = (source, statement) => source.startsWith('#!') ? source.slice(0, source.indexOf('\n') + 1) + statement + source.slice(source.indexOf('\n') + 1) : statement + source
const once = (source, before, after) => {
  if (source.split(before).length !== 2) throw Error('Unsupported upstream build: metering anchor changed')
  return source.replace(before, after)
}
function section(source, first, next, edit) {
  const start = source.indexOf(first), end = source.indexOf(next, start + first.length)
  if (start < 0 || end < 0) throw Error('Unsupported upstream function boundary')
  return source.slice(0, start) + edit(source.slice(start, end)) + source.slice(end)
}
export async function buildBillionCompatibility(input, destination, { pack = true } = {}) {
  const stage = mkdtempSync(join(tmpdir(), 'dsh-billion-compat-')), target = join(stage, 'package')
  if (input.endsWith('.tgz')) {
    const entries = execFileSync('tar', ['-tzf', resolve(input)], { encoding: 'utf8' }).trim().split(/\r?\n/)
    if (entries.some(name => !name.startsWith('package/') || name.includes('\\') || name.includes(':') || name.split('/').includes('..'))) throw Error('Unsafe npm archive paths')
    const listing = execFileSync('tar', ['-tvzf', resolve(input)], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    if (listing.split(/\r?\n/).some(line => /^[lh]/.test(line))) throw Error('Linked entries are unsupported')
    execFileSync('tar', ['-xzf', resolve(input), '-C', stage])
  } else cpSync(resolve(input), target, { recursive: true, filter: path => !['node_modules', '.git'].includes(path.split(/[\\/]/).at(-1)) })
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
  if (pkg.name !== 'billion-context' || pkg.version !== '0.1.197') throw Error('Only billion-context 0.1.197 is supported by this patch')
  for (const [file, expected] of Object.entries(hashes)) if (hash(readFileSync(join(target, file))) !== expected) throw Error('Upstream runtime checksum mismatch: ' + file)
  let proxy = (await transform(readFileSync(join(target, 'dist/index.js'), 'utf8'), { format: 'esm', target: 'es2022', minify: false })).code
  proxy = section(proxy, 'async function fetchWithTimeout(url, opts, timeoutMs, externalSignal)', '\nfunction armIdleBody', text => {
    text = once(text, '  checkOutboundBody(opts.body);', '  checkOutboundBody(opts.body);\n  const cmCall = cmBeginCall(url, opts);')
    text = once(text, 'const raw = transport ? await transport(url, finalOpts) : await fetch(url, finalOpts);', 'const raw = cmMeterResponse(cmCall, transport ? await transport(url, finalOpts) : await fetch(url, finalOpts));')
    return once(text, '  } catch (e) {\n    cleanup();', '  } catch (e) {\n    cmFailCall(cmCall);\n    cleanup();')
  })
  proxy = once(proxy, 'async function handle(req, res, opts, core, config, log2, instanceId, instanceStartedAt, proxyWatchers, initialWatcherPid, adminCtx)',
    'function handle(...args) { return cmMeterRequest(args[0], args[1], () => handleUnmetered(...args)); }\nasync function handleUnmetered(req, res, opts, core, config, log2, instanceId, instanceStartedAt, proxyWatchers, initialWatcherPid, adminCtx)')
  proxy = once(proxy, 'async function requestSummaryBody(deps, body, stream2)', 'function requestSummaryBody(...args) { return cmWithKind("compaction", () => requestSummaryBodyUnmetered(...args)); }\nasync function requestSummaryBodyUnmetered(deps, body, stream2)')
  proxy = once(proxy, 'function createSummaryHttpCandidate(target, maxResponseBytes)',
    'function createSummaryHttpCandidate(...args) { const delegate = createSummaryHttpCandidateUnmetered(...args); return { ...delegate, summarize: (...work) => cmWithKind("compaction", () => delegate.summarize(...work)) }; }\nfunction createSummaryHttpCandidateUnmetered(target, maxResponseBytes)')
  proxy = section(proxy, 'async function fetchWithRetry(', '\nvar dispatcherCache', text => text
    .replace('result = await fetchWithTimeout(url, opts, timeoutMs, externalSignal);', 'result = await cmWithAttempt(attempt, () => fetchWithTimeout(url, opts, timeoutMs, externalSignal));')
    .replace('return await fetchWithTimeout(url, opts, timeoutMs, externalSignal);', 'return await cmWithAttempt(attempt, () => fetchWithTimeout(url, opts, timeoutMs, externalSignal));'))
  proxy = section(proxy, 'async function requestSummaryBodyUnmetered(', '\nvar SSE_DATA_LINE_RE', text => once(text,
    'const result = await fetchWithTimeout(deps.url, { method: "POST", headers: { "content-type": "application/json", ...summaryHeaders(deps) }, body, dispatcher: proxyDispatcher(deps.proxyUrl) }, void 0, deps.signal);',
    'const result = await cmWithAttempt(attempt, () => fetchWithTimeout(deps.url, { method: "POST", headers: { "content-type": "application/json", ...summaryHeaders(deps) }, body, dispatcher: proxyDispatcher(deps.proxyUrl) }, void 0, deps.signal));'))
  proxy = prepend(proxy, 'import { meterBillionRequest as cmMeterRequest, beginBillionCall as cmBeginCall, meterBillionResponse as cmMeterResponse, failBillionCall as cmFailCall, withBillionMeterKind as cmWithKind, withBillionMeterAttempt as cmWithAttempt } from "./cost-meter-proxy.js";\n')
  let native = (await transform(readFileSync(join(target, 'dist/agent/dsh-native.js'), 'utf8'), { format: 'esm', target: 'es2022', minify: false })).code
  native = section(native, 'function installNativeFetchIntercept(state3)', '\nimport { createHash', text => {
    if ([...text.matchAll(/\bsend\(/g)].length < 10) throw Error('Incomplete native transport coverage')
    return text.replace(/\bsend\(/g, 'cmMeterSend(send, ')
  })
  native = prepend(native, 'import { sendWithBillionMeter as cmMeterSend } from "./cost-meter-native.js";\n')
  writeFileSync(join(target, 'dist/index.js'), proxy)
  writeFileSync(join(target, 'dist/agent/dsh-native.js'), native)
  cpSync(join(sourceRoot, 'lib/billion-context-proxy.js'), join(target, 'dist/cost-meter-proxy.js'))
  cpSync(join(sourceRoot, 'lib/billion-context-native.js'), join(target, 'dist/agent/cost-meter-native.js'))
  for (const file of ['dist/index.js', 'dist/agent/dsh-native.js', 'dist/cost-meter-proxy.js', 'dist/agent/cost-meter-native.js']) execFileSync(process.execPath, ['--check', join(target, file)], { stdio: 'pipe' })
  pkg.version = '0.1.197-cost-meter.1'
  pkg.dshCostMeterCompatibility = { protocol: 1, baseVersion: '0.1.197', baseCommit: '3aeddc160864ca774e54817559d6984310e2a9ab', sourceHashes: hashes }
  writeFileSync(join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  if (!pack) return { directory: target, version: pkg.version }
  mkdirSync(resolve(destination), { recursive: true })
  const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  if (!existsSync(npmCli)) throw Error('Set npm_execpath to npm-cli.js to build the local archive')
  const output = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', resolve(destination)], {
    cwd: target, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }))[0]
  return { directory: target, version: pkg.version, archive: join(resolve(destination), output.filename), sha256: hash(readFileSync(join(resolve(destination), output.filename))) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node scripts/build-billion-context-compat.mjs <original npm archive or directory> <output directory>')
  console.log(JSON.stringify(await buildBillionCompatibility(process.argv[2], process.argv[3])))
}
