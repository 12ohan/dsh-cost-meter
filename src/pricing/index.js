/** Settings-only model search and explicit historical recalculation. */
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.pricing.js',
  factory: require => {
    const { createElement: el, Fragment, useState, useEffect, useMemo, useRef } = require('react')
    const runFields = ['at', 'before', 'after', 'days', 'sessions', 'skipped']
    const historySchema = { parse: value => {
      if (!Array.isArray(value) || !value.every(row => runFields.every(key => Number.isFinite(row?.[key]) && row[key] >= 0))) throw new Error('Invalid recalculation history')
      return value
    } }
    const resultSchema = { parse: value => {
      if (typeof value?.ok !== 'boolean' || typeof value?.message !== 'string') throw new Error('Invalid recalculation result')
      return value
    } }
    const boolSchema = { parse: value => { if (typeof value !== 'boolean') throw new Error('Expected confirmation'); return value } }
    const catalogSchema = { parse: value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid price catalog')
      return value
    } }
    const codec = (name, schema) => ({ mode: 'strict', typeSymbol: 'dsh-cost-meter#' + name, schema, create: () => schema })
    const CONTRIBUTION = { package: 'dsh-cost-meter-pricing', face: 'host', descriptors: [
      { id: 'dsh-cost-meter#costMeter/getPriceCatalog', service: 'costMeter', namespace: 'costMeter', method: 'getPriceCatalog', invocation: { kind: 'direct' }, parameters: [], result: codec('PriceCatalog', catalogSchema) },
      { id: 'dsh-cost-meter#costMeter/getRepricingHistory', service: 'costMeter', namespace: 'costMeter', method: 'getRepricingHistory', invocation: { kind: 'direct' }, parameters: [], result: codec('RepricingHistory', historySchema) },
      { id: 'dsh-cost-meter#costMeter/repriceHistory', service: 'costMeter', namespace: 'costMeter', method: 'repriceHistory', invocation: { kind: 'direct' }, parameters: [{ name: 'confirmed', wire: 'confirmed', source: 'json', codec: codec('RepricingConfirmation', boolSchema) }], result: codec('FetchPricesResult', resultSchema) },
    ] }

    function SearchPriceSelect({ options, value, placeholder, label, locale, onChange }) {
      const [query, setQuery] = useState('')
      const selectRef = useRef(null)
      const en = locale === 'en', words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
      const indexed = useMemo(() => options.map(option => ({ option, search: (option.label + ' ' + option.value).toLowerCase() })), [options])
      const matches = indexed.filter(row => words.every(word => row.search.includes(word))).map(row => row.option)
      const selected = options.find(option => option.value === value)
      const limited = matches.slice(0, 80)
      const shown = selected && !limited.includes(selected) ? [selected, ...limited] : limited
      return el('div', { className: 'cm-price-search' },
        el('input', { type: 'search', className: 'cm-input', value: query, placeholder: en ? 'Search model or provider' : '搜索模型或提供商',
          'aria-label': label + (en ? ' · Search prices' : ' · 搜索价格'), onChange: event => setQuery(event.target.value), onKeyDown: event => { if (event.key === 'Escape') { setQuery(''); event.stopPropagation() } else if (event.key === 'ArrowDown') { event.preventDefault(); selectRef.current?.focus() } } }),
        el('select', { ref: selectRef, className: 'cm-input', value, 'aria-label': label + (en ? ' · Price model' : ' · 价格模型'), onChange: event => onChange(event.target.value) },
          el('option', { value: '' }, placeholder), ...shown.map(option => el('option', { key: option.value, value: option.value }, option.label))),
        query ? el('small', { role: 'status' }, matches.length > 80 ? (en ? `${matches.length} models · Showing the first 80. Type to filter.` : `${matches.length} 个模型 · 先显示 80 个，输入关键词筛选`) : matches.length ? (en ? `${matches.length} matches` : `${matches.length} 个结果`) : (en ? 'No matches' : '没有匹配的模型')) : null)
    }

    function RestorePrices({ state, draft, setDraft, locale, rpc }) {
      const [open, setOpen] = useState(false), [catalog, setCatalog] = useState(null), [selected, setSelected] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0)
      const currency = state.config.prices.currency ?? 'USD', en = locale === 'en'
      useEffect(() => {
        if (!open) return
        let active = true
        setCatalog(null); setError(''); setSelected('')
        rpc('getPriceCatalog').then(value => { if (active) setCatalog(value) }, e => { if (active) setError(String(e.message ?? e)) })
        return () => { active = false }
      }, [open, currency, retry, rpc])
      const options = []
      for (const [provider, families] of Object.entries(catalog ?? {})) for (const models of Object.values(families)) for (const [id, entry] of Object.entries(models)) {
        const mounted = provider === 'deepseek' ? draft?.prices.models[id] : draft?.prices.providers?.[provider]?.models?.[id]
        if (!mounted && !entry.unpriced) options.push({ value: provider + ':' + id, label: provider + ' · ' + id, provider, id, entry })
      }
      const choice = options.find(option => option.value === selected)
      const restore = () => {
        if (!choice || !draft) return
        const { provider, id, entry } = choice, copy = JSON.parse(JSON.stringify(entry)), prices = draft.prices
        setDraft({ ...draft, prices: provider === 'deepseek'
          ? { ...prices, models: { ...prices.models, [id]: copy } }
          : { ...prices, providers: { ...prices.providers, [provider]: { ...prices.providers?.[provider], models: { ...prices.providers?.[provider]?.models, [id]: copy } } } } })
        setSelected('')
      }
      return el('div', { className: 'cm-restore-prices' },
        el('button', { type: 'button', className: 'cm-btn small', 'aria-expanded': open, onClick: () => setOpen(value => !value) }, open ? (en ? 'Close restore' : '收起恢复入口') : (en ? 'Restore bundled model' : '恢复内置模型')),
        open ? el('div', { className: 'cm-collapse-body' },
          error ? el('div', { role: 'alert', className: 'cm-err' }, error, el('button', { type: 'button', className: 'cm-btn small', onClick: () => setRetry(n => n + 1) }, en ? 'Retry' : '重试'))
            : catalog === null ? el('p', { role: 'status', className: 'cm-hint' }, en ? 'Loading prices…' : '读取价格…')
            : options.length ? el(Fragment, null,
              el(SearchPriceSelect, { options, value: choice ? selected : '', placeholder: en ? 'Select a model' : '选择模型', label: en ? 'Restore model' : '恢复模型', locale, onChange: setSelected }),
              el('button', { type: 'button', className: 'cm-btn small', disabled: !choice, onClick: restore }, en ? 'Restore' : '恢复'))
            : el('p', { className: 'cm-hint' }, en ? 'All bundled models are mounted.' : '内置模型均已挂载。')) : null)
    }

    function CustomPriceEditor({ value, label, locale, onChange, t, priceEditor }) {
      const en = locale === 'en'
      const { PriceInput, priceFactor, setPriceFactor, multiplierOptions } = priceEditor
      const fields = [['cacheMiss', en ? 'Input · cache miss' : '输入 · 未命中缓存'], ['cacheHit', en ? 'Cached input' : '缓存读取'], ['output', en ? 'Output' : '输出'], ['cacheWrite', en ? 'Cache write' : '缓存写入'], ['reasoning', en ? 'Separate reasoning' : '单独推理费用']]
      const edit = (key, number, factor) => {
        const next = { ...value }
        if (number === null) delete next[key]; else next[key] = number
        setPriceFactor(next, 'base.' + key, factor)
        onChange(next)
      }
      const field = ([key, title]) => el('label', { key }, title, el('span', { className: 'cm-custom-amount' },
        el('span', { 'aria-hidden': true }, value.currency === 'CNY' ? '¥' : '$'), el(PriceInput, { entry: value, value: value[key] ?? null, path: 'base.' + key, t,
          emptyMode: ['cacheWrite', 'reasoning'].includes(key) ? 'clear' : 'ignore', label: label + ' · ' + title,
          placeholder: key === 'cacheWrite' ? (en ? 'Same as cached input' : '跟随缓存读取') : key === 'reasoning' ? (en ? 'Included in output' : '含在输出中') : '0',
          onCommit: (number, factor) => edit(key, number, factor) })))
      return el('fieldset', { className: 'cm-custom-price', 'aria-label': label + (en ? ' · Custom price' : ' · 自定义价格') },
        el('legend', null, en ? 'Custom price · per 1M tokens' : '自定义价格 · 每百万 Token'),
        el('div', { className: 'cm-custom-head' }, el('span', null, en ? 'Only this channel and model' : '仅用于此渠道的这个模型'),
          el('label', null, en ? 'Currency' : '币种', el('select', { className: 'cm-input', value: value.currency, onChange: event => onChange({ ...value, currency: event.target.value }) },
            el('option', { value: 'USD' }, en ? 'USD · US dollar' : 'USD · 美元'), el('option', { value: 'CNY' }, en ? 'CNY · Yuan' : 'CNY · 人民币')))),
        el('div', { className: 'cm-custom-grid' }, ...fields.slice(0, 3).map(field)),
        multiplierOptions(value, t, separate => onChange({ ...value, separateMultipliers: separate, multipliers: {} })),
        el('div', { className: 'cm-custom-effective', role: 'status' },
          el('div', { className: 'cm-effective-heading' }, el('span', null, en ? 'Effective prices' : '实际单价'), el('small', null, en ? 'Price × multiplier / 1M tokens' : '单价 × 倍率 / 百万 Token')),
          el('div', { className: 'cm-effective-grid' }, ...fields.slice(0, 3).map(([key, title]) => el('div', { key }, el('span', null, title), el('strong', null, (value.currency === 'CNY' ? '¥' : '$') + Number((value[key] * priceFactor(value, 'base.' + key)).toPrecision(8)).toLocaleString(en ? 'en-US' : 'zh-CN', { maximumFractionDigits: 8 })))))),
        el('details', { className: 'cm-custom-more' }, el('summary', null, en ? 'More billing fields' : '更多计费项'),
          el('div', { className: 'cm-custom-grid' }, ...fields.slice(3).map(field)),
          el('p', { className: 'cm-hint' }, en ? 'Leave reasoning blank when it is included in output. Leave cache write blank to use the cached input rate.' : '推理已包含在输出中时无需另填。缓存写入留空则使用缓存读取价格。')),
        el('p', { className: 'cm-hint' }, en ? 'Enter or leave a field to save. Switching the price source keeps your custom values.' : '回车或离开输入框后保存；切换价格来源会保留已填的自定义价格。'))
    }

    function Matching({ state, draft, setDraft, t, locale, resolveClientPrice, prettyProviderKey, setField, priceEditor }) {
      const [query, setQuery] = useState(''), [limit, setLimit] = useState(24)
      const en = locale === 'en'
      const config = state.config
          const overrides = draft?.priceOverrides ?? config.priceOverrides ?? {}
          const dismissed = draft?.priceMatchDismissed ?? config.priceMatchDismissed ?? []
          const pricesNow = draft?.prices ?? config.prices
          const byProvider = state.today.byProviderModel ?? {}
          // 今日出现但未命中价格条目的 provider:model 键:判定走 resolveClientPrice 完整
          // 解析链(精确/归一化/宽泛/跨厂商兑底,按当前匹配模式),与计费口径一致——
          // 路由 provider 前缀(go:/opencode: 等)下实际已正确计价的模型不再误报,
          // 仅 DeepSeek 默认价兜底与完全未命中者需要人工指定。
          const matchPrices = { prices: pricesNow, priceMatch: draft?.priceMatch ?? config.priceMatch }
          const unmatchedKeys = Object.keys(byProvider).filter(key => {
            if (dismissed.includes(key)) return false
            if (overrides[key] !== undefined) return false // 已手动指定的键由下方 rows 展示
            const sep = key.indexOf(':')
            const provider = (sep > 0 ? key.slice(0, sep) : 'deepseek').toLowerCase()
            const modelId = sep > 0 ? key.slice(sep + 1) : key
            return resolveClientPrice(provider, modelId, matchPrices).matched !== true
          })
          const rows = [...new Set([...unmatchedKeys, ...Object.keys(overrides)])].filter(key => !dismissed.includes(key))
          // 本月已命中价格且未手动指定的 provider:model 键(v1.6.11):同样允许
          // 改挂其它条目或标记为本地模型(零消耗)。数据取 state.month.byProviderModel
          // (比今日覆盖面广);override 写入后该键转入上方 rows(手动指定区)展示。
          const monthByProvider = state.month?.byProviderModel ?? {}
          const matchedKeys = Object.keys(monthByProvider).filter(key => {
            if (dismissed.includes(key)) return false
            if (overrides[key] !== undefined) return false
            const sep = key.indexOf(':')
            const provider = (sep > 0 ? key.slice(0, sep) : 'deepseek').toLowerCase()
            const modelId = sep > 0 ? key.slice(sep + 1) : key
            return resolveClientPrice(provider, modelId, matchPrices).matched === true
          }).sort()
  const targetOptions = useMemo(() => [
    // 「本地模型(零消耗)」哨兵(v1.6.11):__local__ 由服务端解析为未定价
    // (token 照记、后续调用费用为 0)。
    { value: '__local__', label: t('overrideTargetLocal') },
    { value: '__custom__', label: locale === 'en' ? 'Custom price for this model' : '自定义价格（此渠道模型）' },
    { value: 'deepseek:__default__', label: t('overrideTargetDefault') },
    // DeepSeek 目标必须带 'deepseek:' 前缀存储(issue #56):裸名会被按
    // 「同渠道换名」解析,跨渠道映射(如 cephalon:x → deepseek-v4-flash)查无此价。
    ...Object.keys(pricesNow.models ?? {}).map(id => ({ value: 'deepseek:' + id, label: 'DeepSeek · ' + id })),
    ...Object.entries(pricesNow.providers ?? {}).flatMap(([p, table]) =>
      Object.keys(table?.models ?? {}).map(id => ({ value: p + ':' + id, label: p + ' · ' + id }))),
  ], [pricesNow.models, pricesNow.providers, locale, t])
          const setOverride = (key, value) => {
            if (draft === null) return
            const next = { ...(draft.priceOverrides ?? {}) }
            if (value === '') delete next[key]
            else next[key] = value
            if (value === '__custom__' && !pricesNow.custom?.[key]) {
              const split = key.indexOf(':'), resolved = resolveClientPrice(key.slice(0, split), key.slice(split + 1), { ...config, ...draft })
              const entry = resolved.entry ?? {}, custom = { currency: resolved.currency ?? 'USD', billingMode: 'flat', ...priceEditor?.priceMultiplierSettings(entry),
                cacheMiss: entry.cacheMiss ?? entry.input ?? 0, cacheHit: entry.cacheHit ?? entry.cachedInput ?? entry.cacheMiss ?? entry.input ?? 0, output: entry.output ?? 0,
                ...(entry.cacheWrite !== undefined ? { cacheWrite: entry.cacheWrite } : {}), ...(entry.reasoning !== undefined ? { reasoning: entry.reasoning } : {}) }
              setDraft({ ...draft, priceOverrides: next, prices: { ...pricesNow, custom: { ...pricesNow.custom, [key]: custom } } })
            } else setDraft({ ...draft, priceOverrides: next })
          }
          const dismissMatch = key => {
            if (draft === null) return
            const next = { ...(draft.priceOverrides ?? {}) }
            delete next[key]
            setDraft({ ...draft, priceOverrides: next, priceMatchDismissed: [...new Set([...dismissed, key])] })
          }
          const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
          const filter = keys => keys.filter(key => words.every(word => prettyProviderKey(key).toLowerCase().includes(word)))
          const pending = filter(rows), matched = filter(matchedKeys), total = pending.length + matched.length
          const visiblePending = pending.slice(0, limit), visibleMatched = matched.slice(0, Math.max(0, limit - visiblePending.length))
          const row = (key, automatic) => {
            const label = prettyProviderKey(key), split = label.indexOf(':'), source = overrides[key]
            const badge = automatic ? (en ? 'Automatic' : '自动匹配') : source === '__custom__' ? (en ? 'Custom price' : '自定义价格') : source === '__local__' ? (en ? 'Local · free' : '本地 · 零费用') : source ? (en ? 'Price table' : '指定价格表') : (en ? 'Needs a price' : '待设置价格')
            return el('div', { key, className: 'cm-match-row' },
              el('div', { className: 'cm-model-head' },
                el('div', { className: 'cm-model-identity', title: label }, el('span', { className: 'cm-model-provider' }, split > 0 ? label.slice(0, split) : 'DeepSeek'), el('strong', null, split > 0 ? label.slice(split + 1) : label)),
                el('span', { className: 'cm-model-badge' + (!automatic && !source ? ' needs-price' : '') }, badge),
                automatic ? null : el('button', { type: 'button', className: 'cm-btn small', title: t('removePriceMatchHint'), onClick: () => dismissMatch(key) }, t('overrideRemove'))),
              el('div', { className: 'cm-model-source' }, el('span', null, en ? 'Price source' : '价格来源'),
                el(SearchPriceSelect, { value: source ?? '', options: targetOptions, placeholder: t('matchedKeepAuto'), label, locale, onChange: value => setOverride(key, value) })),
              source === '__custom__' && pricesNow.custom?.[key] ? el(CustomPriceEditor, { value: pricesNow.custom[key], label, locale, t, priceEditor,
                onChange: entry => setDraft({ ...draft, prices: { ...pricesNow, custom: { ...pricesNow.custom, [key]: entry } } }) }) : null)
          }
          return el('div', { className: 'cm-model-matching' },
            el('div', { className: 'cm-pricing-intro' },
              el('h3', { className: 'cm-h' }, en ? 'Set prices by channel and model' : '按渠道和模型设置价格'),
              el('p', { className: 'cm-note' }, en ? 'Keep automatic matching, choose a catalog entry, or enter a custom price for this channel.' : '选择自动匹配、指定价格表，或为这个渠道单独填写价格。')),
            el('div', { className: 'cm-model-toolbar' },
              el('input', { type: 'search', className: 'cm-input', value: query, placeholder: en ? 'Find a model or channel…' : '查找模型或渠道…', 'aria-label': en ? 'Find configured models' : '查找已用模型', onChange: event => { setQuery(event.target.value); setLimit(24) }, onKeyDown: event => { if (event.key === 'Escape') { setQuery(''); setLimit(24); event.stopPropagation() } } }),
              el('span', { className: 'cm-note', role: 'status' }, en ? `${total} models` : `${total} 个模型`)),
            visiblePending.length ? el('section', { className: 'cm-model-group' }, el('h4', { className: 'cm-pricing-group-title' }, t('unmatchedTitle'), el('span', null, pending.length)), ...visiblePending.map(key => row(key, false))) : null,
            visibleMatched.length ? el('section', { className: 'cm-model-group' }, el('h4', { className: 'cm-pricing-group-title' }, t('matchedTitle'), el('span', null, matched.length)), ...visibleMatched.map(key => row(key, true))) : null,
            total === 0 ? el('p', { className: 'cm-pricing-empty' }, query ? (en ? 'No models found. Try another keyword.' : '没有找到模型，试试其他关键词。') : (en ? 'Models appear here after their first call.' : '调用过的模型会显示在这里，之后可按渠道设置价格。')) : null,
            total > limit ? el('button', { type: 'button', className: 'cm-btn', onClick: () => setLimit(n => n + 24) }, en ? `Show more · ${total - limit} remaining` : `显示更多 · 还有 ${total - limit} 个`) : null,
            dismissed.length > 0 ? el('button', { type: 'button', className: 'cm-btn small', onClick: () => setField('priceMatchDismissed', []) }, t('restorePriceMatches', { count: dismissed.length })) : null,
            el('details', { className: 'cm-pricing-rules' }, el('summary', null, en ? 'Automatic matching rules' : '自动匹配规则'),
              el('label', { className: 'cm-field' }, el('span', null, t('priceMatchLabel')), el('select', { className: 'cm-input', value: draft?.priceMatch === 'exact' ? 'exact' : 'auto', onChange: event => setField('priceMatch', event.target.value) }, el('option', { value: 'auto' }, t('priceMatchAuto')), el('option', { value: 'exact' }, t('priceMatchExact')))),
              el('p', { className: 'cm-note' }, t('priceMatchNote'))))
    }

    function History({ state, locale, formatMoneyUsd, api, rpc, disabled }) {
      const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [runs, setRuns] = useState([]), [error, setError] = useState('')
      const en = locale === 'en', money = amount => formatMoneyUsd(amount, state.config)
      const refresh = () => rpc('getRepricingHistory').then(value => { setRuns(historySchema.parse(value)); setError('') }).catch(e => setError(String(e.message ?? e)))
      useEffect(() => { let active = true; rpc('getRepricingHistory').then(value => { if (active) setRuns(historySchema.parse(value)) }, e => { if (active) setError(String(e.message ?? e)) }); return () => { active = false } }, [rpc])
      const run = async () => {
        if (!confirm || busy || disabled) return
        setBusy(true); setError(''); setMessage('')
        try {
          const result = await rpc('repriceHistory', true)
          if (!result.ok) throw new Error(result.message)
          setMessage(result.message); setConfirm(false)
          await refresh(); await api.reload()
        } catch (error) { setError(String(error.message ?? error)) }
        finally { setBusy(false) }
      }
      return el('section', { className: 'cm-repricing' },
        el('h3', { className: 'cm-h' }, en ? 'Historical pricing' : '历史费用'),
        el('p', { className: 'cm-note' }, en ? 'Rate changes apply to new calls. Recorded historical rates remain fixed.' : '修改价格只影响后续调用，历史费用沿用原价格。'),
        confirm ? el('div', { className: 'cm-repricing-warning', role: 'alert', onKeyDown: event => { if (event.key === 'Escape' && !busy) { setConfirm(false); event.stopPropagation() } } },
          el('strong', null, en ? 'This changes historical amounts' : '这会改变历史费用'),
          el('p', null, en ? 'Recalculate retained calls using current rates and replace their amounts in statistics. Original amounts, price versions and a full ledger backup are kept. Records with incomplete logs are unchanged.' : '确认后，将按当前价格重新计算保留的历史调用，并更新统计金额。原金额、原价格版本和完整账本备份都会保留；日志不完整的记录不改。'),
          el('div', { className: 'cm-buttons' }, el('button', { type: 'button', className: 'cm-btn', disabled: busy, onClick: () => setConfirm(false) }, en ? 'Cancel' : '取消'),
            el('button', { type: 'button', className: 'cm-btn danger', disabled: busy || disabled, onClick: run }, busy ? (en ? 'Recalculating…' : '正在重算…') : (en ? 'Confirm recalculation' : '确认重算'))))
          : el('button', { type: 'button', className: 'cm-btn', disabled: disabled || busy, onClick: () => setConfirm(true) }, en ? 'Recalculate history at current rates' : '按当前价格重算历史'),
        message ? el('p', { role: 'status', className: 'cm-note' }, message) : null,
        error ? el('p', { role: 'alert', className: 'cm-err' }, error) : null,
        runs.length ? el('details', { className: 'cm-repricing-history' }, el('summary', null, en ? 'Recalculation records · original amounts retained' : '重算记录 · 原金额已保留'),
          el('div', { className: 'cm-stat-scroll' }, el('table', { className: 'cm-stat-table' },
            el('thead', null, el('tr', null, ...(en ? ['Time', 'Before', 'After', 'Session/day records'] : ['重算时间', '原金额', '重算后', '会话日期记录']).map(s => el('th', { key: s, scope: 'col' }, s)))),
            el('tbody', null, ...runs.map(row => el('tr', { key: row.at }, el('td', null, new Date(row.at).toLocaleString(locale)), el('td', null, money(row.before)), el('td', null, money(row.after)), el('td', null, row.sessions))))))) : null)
    }

    async function mount(ctx) {
      const unmount = await ctx.get('remote').$mount(CONTRIBUTION)
      ctx.effect(() => () => unmount(), 'cost-meter: pricing settings contribution')
      const service = ctx.get('remote.costMeter')
      const rpc = async (method, ...args) => {
        if (method === 'repriceHistory') boolSchema.parse(args[0])
        const result = await service[method](...args)
        if (result?.ok !== true) throw new Error(result?.error?.message ?? 'Pricing request failed')
        return (method === 'getPriceCatalog' ? catalogSchema : method === 'getRepricingHistory' ? historySchema : resultSchema).parse(result.value)
      }
      const style = document.createElement('style')
      style.textContent = '.cm-price-search{display:grid;gap:6px;min-width:0}.cm-price-search small{color:var(--dsw-alias-label-tertiary)}.cm-price-search select,.cm-price-search input{width:100%;min-width:0}.cm-repricing-warning{padding:12px;border:1px solid var(--dsw-alias-state-warning-primary,#c58a25);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}.cm-repricing-warning p{margin:8px 0 12px;line-height:1.6}.cm-repricing-history{margin-top:12px}.cm-repricing-history table{width:100%;text-align:left;font-variant-numeric:tabular-nums}.cm-repricing-history td,.cm-repricing-history th{padding:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}'
      style.textContent += '.cm-custom-price{grid-column:1/-1;display:grid;gap:14px;margin:4px 0 12px;padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1);min-width:0}.cm-custom-price legend{padding:0 6px;font-weight:500;font-size:13px}.cm-custom-price label{display:grid;gap:7px;font-size:12px;min-width:0;color:var(--dsw-alias-label-secondary)}.cm-custom-price .cm-input{width:100%;min-width:0}.cm-custom-head{display:flex;justify-content:space-between;align-items:center;gap:12px;color:var(--dsw-alias-label-secondary);font-size:12px}.cm-custom-head label{display:flex;align-items:center;gap:8px}.cm-custom-head select{width:auto!important}.cm-custom-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.cm-custom-amount{position:relative;display:block}.cm-custom-amount>span{position:absolute;inset-inline-start:11px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--dsw-alias-label-tertiary)}.cm-custom-amount input{padding-inline-start:28px}.cm-custom-more summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary)}.cm-custom-more .cm-custom-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin:12px 0 8px}.cm-custom-price p{margin:0;line-height:1.6}@media(max-width:700px){.cm-custom-grid{grid-template-columns:1fr}.cm-custom-head{flex-wrap:wrap}}'
      document.head.appendChild(style)
      style.textContent += `
        .cm-model-matching{display:grid;gap:20px;min-width:0}
        .cm-pricing-intro{display:grid;gap:6px}.cm-pricing-intro p{line-height:1.65}
        .cm-model-toolbar{display:flex;align-items:center;gap:12px}.cm-model-toolbar>.cm-input{flex:1;width:100%;min-width:0;box-sizing:border-box}.cm-model-toolbar>.cm-note{white-space:nowrap}
        .cm-model-group{display:grid;gap:12px;min-width:0}.cm-pricing-group-title{margin:0;display:flex;align-items:center;gap:8px;font-weight:500;font-size:12px;color:var(--dsw-alias-label-secondary)}.cm-pricing-group-title>span{font-size:11px;color:var(--dsw-alias-label-tertiary)}
        .cm-model-matching .cm-match-row{display:grid;gap:14px;padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);min-width:0}
        .cm-model-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cm-model-identity{flex:1 1 180px;display:grid;gap:3px;min-width:0}.cm-model-identity strong{font-size:14px;font-weight:600;line-height:1.5;overflow-wrap:anywhere}.cm-model-provider{font-size:11px;color:var(--dsw-alias-label-tertiary)}
        .cm-model-badge{font-size:11px;color:var(--dsw-alias-label-secondary);padding:3px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;white-space:nowrap}.cm-model-badge.needs-price{color:var(--dsw-alias-state-business-primary)}.cm-model-head>.cm-btn{font-size:12px;padding:4px 8px}
        .cm-model-source{display:grid;gap:7px;min-width:0}.cm-model-source>span{font-size:12px;color:var(--dsw-alias-label-secondary)}.cm-model-source .cm-price-search{grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:8px}.cm-model-source .cm-price-search>small{grid-column:1/-1}.cm-model-source .cm-input{box-sizing:border-box;padding:8px 10px}
        .cm-pricing-rules{padding:14px 0 0;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:12px}.cm-pricing-rules summary{cursor:pointer}.cm-pricing-rules .cm-field{margin:12px 0;max-width:360px}.cm-pricing-rules .cm-note{line-height:1.65}
        .cm-pricing-empty{margin:0;padding:32px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);border:1px dashed var(--dsw-alias-border-l1);border-radius:12px;font-size:13px}
        .cm-model-matching .cm-custom-price{margin:0;padding:14px;background:var(--dsw-alias-bg-base);gap:16px}.cm-custom-head{flex-wrap:wrap}.cm-custom-head>span{flex:1;min-width:160px}.cm-custom-grid{grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))}.cm-custom-price .cm-input{max-width:none;box-sizing:border-box;padding-top:8px;padding-bottom:8px}.cm-custom-price .cm-custom-amount input{padding-inline-start:28px}.cm-custom-price .cm-price-multiplier{align-items:center;gap:8px}.cm-custom-price .cm-price-multiplier label{display:inline-flex;align-items:center;gap:6px}.cm-custom-price .cm-price-multiplier input{width:auto;min-width:0}.cm-custom-price .cm-hint{font-size:11px;color:var(--dsw-alias-label-tertiary)}
        .cm-custom-effective{display:grid;gap:12px;padding:12px;background:var(--dsw-alias-bg-layer-1);border-radius:8px;font-size:12px;font-variant-numeric:tabular-nums}.cm-effective-heading{display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap}.cm-effective-heading>span{font-weight:500}.cm-effective-heading small,.cm-effective-grid span{color:var(--dsw-alias-label-tertiary);font-size:11px}.cm-effective-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.cm-effective-grid>div{display:grid;gap:5px;min-width:0}.cm-effective-grid strong{font-size:14px;font-weight:600;overflow-wrap:anywhere}
        .cm-pricing-page .cm-price-card{overflow-x:auto}.cm-pricing-page .cm-price-row{min-width:420px}.cm-pricing-page .cm-price-row input{max-width:none;font-variant-numeric:tabular-nums}.cm-pricing-catalog .cm-catalog-vendor{margin-top:8px}.cm-pricing-catalog .cm-vendor-toggle{padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
        @media(max-width:480px){.cm-model-matching .cm-match-row{padding:12px}.cm-model-matching .cm-custom-price{padding:10px}.cm-custom-more .cm-custom-grid{grid-template-columns:1fr}.cm-effective-grid{gap:8px}.cm-model-identity{flex-basis:100%}}
      `
      ctx.effect(() => () => style.remove(), 'cost-meter: pricing settings styles')
      return props => props.mode === 'matching' ? el(Matching, props) : el(props.mode === 'restore' ? RestorePrices : History, { ...props, rpc })
    }
    return { mount, CONTRIBUTION }
  },
})
