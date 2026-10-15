/** Interactive display settings. Only local presentation components are mounted. */
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.display.js',
  factory: require => {
    const React = require('react')
    const { createElement: el, useState } = React
    const Fragment = React.Fragment
    /* DISPLAY_NATIVE_SOURCE */
    const fallbackNative = displayNativeFallback(React)
    let hostNative = {}
    try { hostNative = require('@deepseek-ai/dsh-client-ui-primitives') } catch {}
    const Native = Object.fromEntries(Object.entries(fallbackNative).map(([name, component]) => [name, hostNative[name] ?? component]))
    const css = 'DISPLAY_STYLE_SOURCE'
    /* DISPLAY_APPEARANCE_SOURCE */
    function PreviewStylePicker({ mode, peakStyle, onMode, onPeak, text }) {
      const [open, setOpen] = useState(false)
      const root = React.useRef(null), trigger = React.useRef(null), panel = React.useRef(null)
      const id = React.useId()
      const close = () => { setOpen(false); trigger.current?.focus() }
      React.useEffect(() => {
        if (!open) return
        panel.current.querySelector('[aria-pressed=true]')?.focus({ preventScroll: true })
        const outside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
        document.addEventListener('pointerdown', outside, true)
        return () => document.removeEventListener('pointerdown', outside, true)
      }, [open])
      return el('div', { ref: root, className: 'cm-preview-style-picker', onKeyDown: event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close() }
        if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) && event.target.closest('[role=group]')) {
          event.preventDefault()
          const buttons = [...event.target.closest('[role=group]').querySelectorAll('button')], index = buttons.indexOf(event.target)
          buttons[(index + (['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length]?.focus()
        }
      } },
        el('button', { ref: trigger, type: 'button', className: 'cm-preview-style-trigger', 'aria-label': text('侧栏样式', 'Sidebar style'),
          'aria-expanded': open, 'aria-controls': open ? id : undefined, 'aria-haspopup': 'dialog', onClick: () => setOpen(!open) },
          el(Native.IconSlidersTwoOutlineRegular, { size: 14 }), text('样式', 'Style')),
        open ? el('div', { ref: panel, id, className: 'cm-preview-style-panel', role: 'dialog', 'aria-label': text('侧栏外观', 'Sidebar appearance') },
          el('div', { className: 'cm-preview-style-title' }, text('侧栏外观', 'Sidebar appearance'),
            el('button', { type: 'button', 'aria-label': text('关闭样式选择', 'Close style picker'), onClick: close }, el(Native.IconCloseOutlineRegular, { size: 14 }))),
          el('div', { className: 'cm-preview-style-options', role: 'group', 'aria-label': text('侧栏布局', 'Sidebar layout') },
            ...[['simple', text('简洁', 'Simple')], ['standard', text('标准', 'Standard')], ['compact', text('紧凑', 'Compact')]].map(([value, label]) =>
              el('button', { key: value, type: 'button', 'aria-pressed': mode === value, onClick: () => onMode(value) },
                el('span', { className: 'cm-style-sample ' + value, 'aria-hidden': true }, ...[0,1,2,3].map(i => el('i', { key: i }))), el('span', null, label)))),
          el('div', { className: 'cm-preview-peak-title' }, text('峰谷条', 'Peak / off-peak bar')),
          el('div', { className: 'cm-preview-peak-options', role: 'group', 'aria-label': text('峰谷条样式', 'Peak bar style') },
            ...[['compact', text('细条', 'Slim')], ['classic', text('分段', 'Segmented')]].map(([value, label]) =>
              el('button', { key: value, type: 'button', 'aria-pressed': peakStyle === value, onClick: () => onPeak(value) },
                el('i', { className: 'cm-style-peak-sample ' + value, 'aria-hidden': true }), label))),
          el('p', null, text('直接查看效果，更改自动保存', 'See the result here. Changes save automatically.'))) : null)
    }

    function DisplaySettings(props) {
      const { draft, setDraft, t, locale, formatMoneyUsd, renderBudget, renderBalance, renderGo, renderPeak, onNavigate } = props
      const config = draft ?? props.state.config
      const en = locale === 'en', text = (zh, english) => en ? english : zh
      const [feedback, setFeedback] = useState(''), [region, setRegion] = useState('sidebar'), [expanded, setExpanded] = useState(false)
      const appearance = useDisplayAppearance()
      const id = React.useId(), dialogRef = React.useRef(null), expandButton = React.useRef(null)
      React.useEffect(() => {
        if (!expanded) return
        const dialog = dialogRef.current
        dialog.showModal()
        return () => { dialog.close(); expandButton.current?.focus() }
      }, [expanded])
      const money = value => formatMoneyUsd(value, config)
      const set = patch => setDraft(previous => ({ ...(previous ?? config), ...patch }))
      const toggle = (label, on, patch) => {
        set(patch)
        setFeedback(label + text(on ? '已隐藏' : '已显示', on ? ' hidden' : ' shown'))
      }
      const item = (key, label, on, patch, content, extra = '') => {
        const node = el('div', {
        key, role: 'button', tabIndex: 0, className: 'cm-display-item ' + extra, 'data-display': key,
        'aria-pressed': on, 'aria-label': label + text(on ? '，点击隐藏' : '，点击显示', on ? ', click to hide' : ', click to show'),
        title: label + text(on ? ' · 点击隐藏' : ' · 点击显示', on ? ' · Click to hide' : ' · Click to show'),
        onClick: () => toggle(label, on, patch),
        onKeyDown: event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggle(label, on, patch) } },
      }, el('span', { className: 'cm-display-item-content', inert: '' }, content),
      el('span', { className: 'cm-display-item-tag', 'aria-hidden': true }, text(on ? '点击隐藏' : '点击显示', on ? 'Hide' : 'Show')))
        return node
      }
      const line = (label, value) => el('span', { className: 'cm-preview-line' }, el('span', null, label), el('span', { className: 'cm-preview-value' }, value))
      const simple = config.sidebarSimple === true
      const balanceOn = config.hideOfficialBalance !== true && ['both', 'sidebar'].includes(config.balance?.display ?? 'both')
      const balancePatch = balanceOn ? { hideOfficialBalance: true } : {
        hideOfficialBalance: false,
        balance: { ...config.balance, display: config.balance?.display === 'settings' || config.balance?.display === 'both' ? 'both' : 'sidebar' },
      }
      const todayOn = config.sidebar !== false && config.hideTodayCost !== true
      const today = item('today', text('今日用量', 'Today’s usage'), todayOn, todayOn ? { hideTodayCost: true } : { sidebar: true, hideTodayCost: false },
        el('span', { className: 'cm-foot' }, line(t('today'), config.sidebarTodayMetric === 'tokens' ? '128K tok' : money(1.28))))
      // This is an explicit visibility field: hiding a card keeps budget tracking enabled.
      const budget = item('budget', text('侧栏预算', 'Sidebar budget'), config.hideBudget !== true, { hideBudget: config.hideBudget !== true },
        simple ? el('span', { className: 'cm-simple-summary' }, line(text('今日 / 本月预算', 'Today / monthly budget'), money(1.28) + ' / ' + money(100)))
          : el('span', { className: 'cm-bbox' }, renderBudget({ ...config, hideTodayCost: true, peakNotice: false, budget: { ...config.budget, enabled: true, amount: 100 * (Number(config.exchangeRate) || 1) } })))
      const peakOn = config.peakNotice !== false
      const peak = item('peak', text('峰谷时段', 'Peak / off-peak'), peakOn, { peakNotice: !peakOn },
        renderPeak({ ...config, peakNotice: true, peakEnabled: true }))
      const strip = config.quotaStrip ?? {}
      const stripItem = (key, label, value, kind) => {
        const on = strip.enabled === true && strip[key] !== false
        // Enabling one item from a disabled strip must not show its siblings unexpectedly.
        const next = strip.enabled ? { ...strip, [key]: !on } : { ...strip, budget: false, go: false, plans: false, [key]: true }
        const pct = (config.barDirections?.[kind] ?? 'used') === 'remaining' ? 100 - value : value
        return item('strip-' + key, text('输入框上方 · ', 'Above composer · ') + label, on, { quotaStrip: { ...next, enabled: true, promptSeen: true } },
          el('span', { className: 'cm-qchip' }, el('span', { className: 'cm-qlabel' }, label),
            el('span', { className: 'cm-qbar' }, el('span', { className: 'cm-qfill', style: { width: pct + '%' } })), el('span', { className: 'cm-qtext' }, pct + '%')))
      }
      const session = position => item('session-' + position, text(position === 'header' ? '顶部费用明细' : '输入框下方费用明细', position === 'header' ? 'Header cost details' : 'Composer cost details'), config[position === 'header' ? 'hideSessionCostHeader' : 'hideSessionCostDock'] !== true,
        { [position === 'header' ? 'hideSessionCostHeader' : 'hideSessionCostDock']: config[position === 'header' ? 'hideSessionCostHeader' : 'hideSessionCostDock'] !== true },
        el('span', { className: 'cm-btn cm-stat-entry' }, text('费用明细', 'Cost details')))
      const badge = position => (config.position === 'header' ? 'header' : 'dock') === position
        ? item('badge', text('会话费用摘要', 'Session cost summary'), config.position !== 'off', { position: config.position === 'off' ? position : 'off' },
          el('span', { className: 'cm-root cm-session-cost' }, el('span', { className: 'cm-session-amount' }, t('sessionLineCompact', { amount: money(.32) })),
            config.sessionCostCompact === true ? null : el('span', { className: 'cm-session-detail' }, text(' · 输入 128K · 输出 4K', ' · In 128K · Out 4K')))) : null
      const cornerOn = config.corner?.enabled === true
      const mode = simple ? 'simple' : config.sidebarStyle === 'compact' ? 'compact' : 'standard'
      const stylePicker = el(PreviewStylePicker, { mode, peakStyle: config.peakStyle === 'classic' ? 'classic' : 'compact', text,
        onMode: value => set({ sidebarSimple: value === 'simple', sidebarSimplePromptSeen: true, ...(value === 'simple' ? {} : { sidebarStyle: value }) }),
        onPeak: value => set({ peakStyle: value }) })
      const native = (name, ...children) => el('div', { className: 'cm-native-' + name }, ...children)
      const icon = (name, size = 16) => el(Native[name], { size })
      const meta = (name, label) => native('meta', icon(name, 14), label)
      const nav = (name, label) => native('side-panelRow', native('side-panelGlyph', icon(name)), native('side-panelTitle', label))
      const folder = label => native('folder', icon('IconFolderCloseRegular'), label)
      const balance = item('balance', text('官方余额', 'Official balance'), balanceOn, balancePatch, renderBalance(config))
      const go = item('go', text('侧栏 Go 额度', 'Sidebar Go quota'), ['both', 'sidebar'].includes(config.goQuota?.display ?? 'both'),
        { goQuota: { ...config.goQuota, display: ['both', 'sidebar'].includes(config.goQuota?.display ?? 'both') ? 'settings' : 'both' } }, renderGo(config))
      const corner = item('corner', text('右下角额度', 'Corner quota'), cornerOn, { corner: { ...config.corner, enabled: !cornerOn } },
        el('span', { className: 'cm-corner-chip' }, t('budget') + ' 32%'))
      const regions = [['sidebar', text('侧栏', 'Sidebar')], ['composer', text('输入区', 'Composer')], ['conversation', text('会话内容', 'Conversation')]]
      const scene = region === 'sidebar' ?
        el('div', { className: 'cm-preview-sidebar', style: appearance.sidebar },
          el('div', { className: 'cm-preview-region-head' }, el('span', null, icon('IconPanelLeftOutlineRegular'), text('侧栏底部', 'Sidebar footer')), stylePicker),
          el('div', { className: 'cm-preview-history', 'aria-hidden': true }, icon('IconFolderCloseRegular'), text('工作区', 'Workspace'), el('span', null, '···')),
          el('div', { className: 'cm-footer-stack' + (simple ? ' simple' : mode === 'compact' ? ' compact' : '') },
            ...(simple ? [budget, balance, go, peak, today] : [balance, go, budget, peak, today])),
          el('div', { className: 'cm-preview-account', 'aria-hidden': true }, icon('IconUserOutlineRegular', 18), text('已登录 DeepSeek', 'Signed in to DeepSeek'))) : region === 'composer' ?
        el('div', { className: 'cm-preview-composer' },
          el('div', { className: 'cm-preview-region-head' }, el('span', null, icon('IconPlusOutlineRegular'), text('输入区域', 'Composer area'))),
          el('div', { className: 'cm-preview-strip' }, stripItem('budget', t('budget'), 32, 'budget'), stripItem('go', 'Go', 24, 'go'), stripItem('plans', 'Plan', 18, 'plan')),
          el('div', { className: 'cm-native-input-card', style: appearance.composer, 'aria-hidden': true },
            native('input-placeholder', text('发消息或创建任务，/ 调用指令，@ 文件或对话', 'Send a message, / commands, @ files or conversations')),
            native('input-row', native('input-tools', native('input-add', icon('IconPlusOutlineRegular', 20)), native('permission', icon('PermissionIconFullAccessRegular'), text('完全权限', 'Full access'))),
              native('input-trailing', native('model', 'DeepSeek-V41-Flash', icon('IconChevronDownOutlineRegular', 12)), icon('IconMicrophoneOutlineRegular', 20), native('input-primary', icon('IconSendOutlineRegular', 24))))),
          native('input-dock', el('span', { className: 'cm-native-dock-stat', 'aria-hidden': true }, icon('IconGaugeOutlineRegular', 14), text('2 轮 6 步 · 273 tok/s', '2 turns · 6 steps · 273 tok/s')),
            el('span', { className: 'cm-native-dock-stat', 'aria-hidden': true }, icon('IconDatabaseOutlineRegular', 14), text('128K tok · 缓存命中 98%', '128K tok · 98% cache')),
            session('dock'), badge('dock'), corner,
            el('span', { className: 'cm-native-dock-context', 'aria-hidden': true }, el('i', { className: 'cm-native-context-ring' }), '29%'))) :
        el('div', { className: 'cm-preview-conversation' },
          el('div', { className: 'cm-native-chat-header', style: appearance.header },
            el('div', { className: 'cm-native-chat-titleRow' }, el('span', null, text('整理项目计划', 'Organize the project plan')), session('header'), badge('header')),
            el('div', { className: 'cm-native-chat-tabs', 'aria-hidden': true }, ...[text('对话', 'Chat'), text('轨迹', 'Trace'), text('上下文', 'Context')].map((label, i) => el('span', { key: label, className: i === 0 ? 'active' : '' }, label)))),
          el('div', { className: 'cm-preview-response' },
            el('p', { 'aria-hidden': true }, text('已整理好项目资料，接下来可以确认计划与时间安排。', 'The project materials are ready. Next, review the plan and schedule.')),
            item('turn', text('每轮费用', 'Per-turn cost'), config.hideTurnCost !== true, { hideTurnCost: config.hideTurnCost !== true },
              el('span', { className: 'cm-native-turn' }, text('▸ 本轮费用 ≈ ', '▸ Turn cost ≈ ') + money(.08))),
            el('div', { className: 'cm-native-response-actions', 'aria-hidden': true }, icon('IconCopyOutlineRegular'), icon('IconLikeOutlineRegular'), icon('IconDislikeOutlineRegular'), icon('IconShareOutlineRegular'), el('span', null, '14:32'))))
      const preview = el(Fragment, null,
        el('div', { className: 'cm-display-region-tabs', role: 'tablist', 'aria-label': text('预览区域', 'Preview area') }, ...regions.map(([key, label], index) =>
          el('button', { key, type: 'button', role: 'tab', id: id + key, 'aria-selected': region === key, 'aria-controls': id + '-panel', tabIndex: region === key ? 0 : -1,
            onClick: () => setRegion(key), onKeyDown: event => {
              if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
              event.preventDefault()
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? regions.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + regions.length) % regions.length
              setRegion(regions[next][0]); event.currentTarget.parentElement.children[next].focus()
            } }, label))),
        el('div', { className: 'cm-preview cm-region-preview', role: 'tabpanel', id: id + '-panel', 'aria-labelledby': id + region, 'data-region': region }, scene))
      return el('section', { className: 'cm-display', 'aria-label': text('交互式显示设置', 'Interactive display settings') },
        el('div', { className: 'cm-display-heading' }, el('div', null,
          el('h3', null, text('设置你看到的界面', 'Make the screen yours')),
          el('p', null, text('点击项目切换显示，淡化的项目已隐藏。', 'Click an item to toggle it. Faded items are hidden.'))),
          el('button', { ref: expandButton, type: 'button', className: 'cm-btn small cm-display-expand', onClick: () => setExpanded(true) }, icon('IconFullscreenOutlineRegular', 14), text('放大预览', 'Expand preview'))),
        expanded ? el('dialog', { ref: dialogRef, className: 'cm-display-dialog', 'aria-label': text('桌面显示预览', 'Desktop display preview'),
          onCancel: event => { event.preventDefault(); event.stopPropagation(); setExpanded(false) }, onKeyDown: event => { if(event.key==='Escape')event.stopPropagation() } },
          el('div', { className: 'cm-display-dialog-head' }, text('显示设置', 'Display settings'),
            el('button', { type: 'button', className: 'cm-display-dialog-close', 'aria-label': text('关闭预览', 'Close preview'), autoFocus: true, onClick: () => setExpanded(false) }, icon('IconCloseOutlineRegular'))), preview) : preview,
        el('div', { className: 'cm-display-toolbar' }, el('span', { className: 'cm-display-feedback', role: 'status', 'aria-live': 'polite' }, feedback || text('更改自动保存 · 预览使用示例数值', 'Changes save automatically · example values'))),
        el(DetailedSettings, props))
    }

    class DisplayBoundary extends React.Component {
      constructor(props) { super(props); this.state = { failed: false } }
      static getDerivedStateFromError() { return { failed: true } }
      render() {
        if (!this.state.failed) return el(DisplaySettings, this.props)
        const en = this.props.locale === 'en'
        return el('section', { className: 'cm-display' },
          el('p', { role: 'alert' }, en ? 'Preview unavailable. Display options are still available below.' : '预览暂不可用，可在下方继续调整显示选项。'),
          el('button', { type: 'button', className: 'cm-btn small', onClick: () => this.setState({ failed: false }) }, en ? 'Retry preview' : '重试预览'),
          el(DetailedSettings, { ...this.props, open: true }))
      }
    }
    function DetailedSettings({ state, draft, setDraft, t, locale, numInput, displayOptions, CURRENCY_PRESETS, USAGE_POSITION_SWITCHABLE, open = false }) {
      const config=state.config
      const setField=(key,value)=>setDraft(previous=>({...previous,[key]:value}))
      return el('details', { className: 'cm-display-details', open: open || undefined },
        el('summary', null, locale === 'en' ? 'More options · layout, currency and refresh intervals' : '详细设置 · 布局、金额格式与刷新频率'),
        el('div', { className: 'cm-grid' },
            el('div', { className: 'cm-grid-group' }, t('groupGeneral')),
            ...['includeSubagentCost', 'codexQuotaEnabled', 'codexQuotaSidebar'].map(key => el('label', { key, className: 'cm-check' },
              el('input', { type: 'checkbox', checked: draft?.[key] === true, onChange: event => setField(key, event.target.checked) }),
              el('span', null, t(key)))),
            USAGE_POSITION_SWITCHABLE
              ? el('div', { className: 'cm-field' },
                  el('label', null, t('usagePositionLabel')),
                  el('select', {
                    className: 'cm-input',
                    value: draft?.usage?.position ?? 'cost',
                    onChange: event => {
                      if (draft === null) return
                      setDraft({ ...draft, usage: { ...(draft.usage ?? { position: 'cost' }), position: event.target.value } })
                    },
                  },
                    el('option', { value: 'cost' }, t('usagePositionCost')),
                    el('option', { value: 'general' }, t('usagePositionGeneral')),
                    el('option', { value: 'section' }, t('usagePositionSection'))))
              : null,
            el('div', { className: 'cm-field' },
              el('label', null, t('positionLabel')),
              el('select', {
                className: 'cm-input',
                value: draft?.position ?? 'dock',
                onChange: event => setField('position', event.target.value),
              },
                el('option', { value: 'dock' }, t('positionDock')),
                el('option', { value: 'header' }, t('positionHeader')),
                el('option', { value: 'off' }, t('off')))),
            el('div', { className: 'cm-field' },
              el('label', null, t('sidebarLabel')),
              el('select', {
                className: 'cm-input',
                value: draft?.sidebar === false ? 'off' : 'on',
                onChange: event => setField('sidebar', event.target.value === 'on'),
              },
                el('option', { value: 'on' }, t('sidebarOn')),
                el('option', { value: 'off' }, t('off')))),
            el('label', { className: 'cm-check' },
              el('input', {
                type: 'checkbox',
                checked: draft?.showSessionId === true,
                onChange: event => setField('showSessionId', event.target.checked),
              }),
              el('span', null, t('showSessionIdLabel'))),
            ...['hideSessionCostHeader', 'hideSessionCostDock', 'hideTurnCost', 'sessionCostCompact'].map(key => el('label', { key, className: 'cm-check' },
              el('input', { type: 'checkbox', checked: draft?.[key] === true, onChange: event => setField(key, event.target.checked) }),
              el('span', null, t(key)))),
            el('div', { className: 'cm-grid-group' }, t('groupMoney')),
            el('div', { className: 'cm-field' },
              el('label', null, t('currencyLabel')),
              el('select', {
                className: 'cm-input',
                value: draft?.currency ?? 'CNY',
                onChange: event => {
                  const preset = CURRENCY_PRESETS[event.target.value]
                  if (preset !== undefined && draft !== null) {
                    setDraft({ ...draft, currency: event.target.value, ...preset })
                  }
                },
              },
                el('option', { value: 'CNY' }, t('currencyCny')),
                el('option', { value: 'USD' }, t('currencyUsd')),
                el('option', { value: 'EUR' }, t('currencyEur')))),
            el('div', { className: 'cm-field' },
              el('label', null, t('symbolLabel')),
              el('input', {
                className: 'cm-input narrow', type: 'text',
                value: draft?.symbol ?? '',
                onChange: event => setField('symbol', event.target.value),
              })),
            el('div', { className: 'cm-field' },
              el('label', null, t('rateLabel')),
              // 清空不提交:汇率 0 会被服务端校验拒绝并整包报错,保留原值更友好。
              numInput({ value: draft?.exchangeRate ?? 1, emptyMode: 'ignore' }, v => setField('exchangeRate', v))),
            el('div', { className: 'cm-field' },
              el('label', null, t('decimalsLabel')),
              numInput({ value: draft?.decimals ?? 2 }, v => setField('decimals', Math.min(10, Math.floor(v))))),
            // UI 隐藏开关(issues #45/#46):开启后官方余额/今日消耗金额的对应区块整体不渲染。
            el('label', { className: 'cm-check' },
              el('input', {
                type: 'checkbox',
                checked: draft?.hideOfficialBalance === true,
                onChange: event => setField('hideOfficialBalance', event.target.checked),
              }),
              el('span', null, t('hideOfficialBalanceLabel'))),
            el('label', { className: 'cm-check' },
              el('input', {
                type: 'checkbox',
                checked: draft?.hideTodayCost === true,
                onChange: event => setField('hideTodayCost', event.target.checked),
              }),
              el('span', null, t('hideTodayCostLabel'))),
            el('div', { className: 'cm-grid-group' }, t('groupSidebar')),
            el('div', { className: 'cm-field' },
              el('label', null, t('sidebarTodayMetric')),
              el('select', { className: 'cm-input', value: draft?.sidebarTodayMetric ?? 'cost',
                onChange: event => setField('sidebarTodayMetric', event.target.value) },
                el('option', { value: 'cost' }, t('sidebarTodayCost')),
                el('option', { value: 'tokens' }, t('sidebarTodayTokens')))),
            el('div', { className: 'cm-field' },
              el('label', null, t('balanceDisplayLabel')),
              el('select', {
                className: 'cm-input',
                value: draft?.balance?.display ?? 'both',
                onChange: event => {
                  if (draft === null) return
                  setDraft({ ...draft, balance: { ...(draft.balance ?? { display: 'both', refreshMinutes: 5 }), display: event.target.value } })
                },
              },
                ...displayOptions(t))),
            el('div', { className: 'cm-field' },
              el('label', null, t('refreshIntervalLabel')),
              numInput({ value: draft?.balance?.refreshMinutes ?? 5 }, v => {
                if (draft === null) return
                setDraft({ ...draft, balance: { ...(draft.balance ?? { display: 'both', refreshMinutes: 5, showProgressBar: false, budgetCap: null }), refreshMinutes: Math.min(1440, Math.max(1, Math.floor(v))) } })
              })),
            el('div', { className: 'cm-field' },
              el('label', { className: 'cm-check' },
                el('input', {
                  type: 'checkbox',
                  checked: draft?.balance?.showProgressBar === true,
                  onChange: event => {
                    if (draft === null) return
                    setDraft({ ...draft, balance: { ...(draft.balance ?? { display: 'both', refreshMinutes: 5, showProgressBar: false, budgetCap: null }), showProgressBar: event.target.checked } })
                  },
                }),
                el('span', null, t('balanceShowProgressBar')))),
            el('div', { className: 'cm-field' },
              el('label', null, t('balanceBudgetCapLabel')),
              numInput({ value: draft?.balance?.budgetCap ?? '' }, v => {
                if (draft === null) return
                setDraft({ ...draft, balance: { ...(draft.balance ?? { display: 'both', refreshMinutes: 5, showProgressBar: false, budgetCap: null }), budgetCap: v > 0 ? v : null } })
              }),
              el('span', { className: 'cm-hint' }, t('balanceBudgetCapHint'))),
            // 进度条方向(issue #67):四组条独立选择剩余/已用方向,默认保持各自原设计。
            el('div', { className: 'cm-field' },
              el('label', null, t('barDirectionsTitle')),
              ['balance', 'budget', 'go', 'plan'].map(kind => el('div', { className: 'cm-dir-row', key: kind },
                el('span', { className: 'cm-dir-label' }, t('barDirection_' + kind)),
                el('select', {
                  className: 'cm-input',
                  value: draft?.barDirections?.[kind] ?? (kind === 'balance' ? 'remaining' : 'used'),
                  onChange: event => {
                    if (draft === null) return
                    const fallback = { balance: 'remaining', budget: 'used', go: 'used', plan: 'used' }
                    setDraft({ ...draft, barDirections: { ...(draft.barDirections ?? fallback), [kind]: event.target.value } })
                  },
                },
                el('option', { value: 'remaining' }, t('barDirectionRemaining')),
                el('option', { value: 'used' }, t('barDirectionUsed'))))),
              el('span', { className: 'cm-hint' }, t('barDirectionsHint'))),
            el('div', { className: 'cm-field' },
              el('label', null, t('customBalanceDisplayLabel')),
              el('select', {
                className: 'cm-input',
                value: draft?.customBalance?.display ?? config.customBalance?.display ?? 'both',
                onChange: event => {
                  if (draft === null) return
                  setDraft({ ...draft, customBalance: { ...(draft.customBalance ?? config.customBalance ?? {}), display: event.target.value } })
                },
              },
                ...displayOptions(t))),
            el('div', { className: 'cm-field' },
              el('label', null, t('customBalanceRefreshInterval')),
              numInput({ value: draft?.customBalance?.refreshMinutes ?? config.customBalance?.refreshMinutes ?? 15 }, v => {
                if (draft === null) return
                setDraft({ ...draft, customBalance: { ...(draft.customBalance ?? config.customBalance ?? {}), refreshMinutes: Math.min(1440, Math.max(1, Math.floor(v))) } })
              })),
            el('div', { className: 'cm-grid-group' }, t('quotaStripGroup')),
            el('div', { className: 'cm-field' },
              el('label', { className: 'cm-check' },
                el('input', {
                  type: 'checkbox',
                  checked: draft?.quotaStrip?.enabled === true,
                  onChange: event => {
                    if (draft === null) return
                    setDraft({ ...draft, quotaStrip: { ...(draft.quotaStrip ?? { enabled: false, budget: true, go: true, plans: true }), enabled: event.target.checked, promptSeen: true } })
                  },
                }),
                el('span', null, t('quotaStripEnable')))),
            draft?.quotaStrip?.enabled === true
              ? [['budget', 'quotaStripShowBudget'], ['go', 'quotaStripShowGo'], ['plans', 'quotaStripShowPlans']].map(([key, labelKey]) =>
                  el('label', { key, className: 'cm-check' },
                    el('input', {
                      type: 'checkbox',
                      checked: draft.quotaStrip[key] !== false,
                      onChange: event => {
                        if (draft === null) return
                        setDraft({ ...draft, quotaStrip: { ...draft.quotaStrip, [key]: event.target.checked } })
                      },
                    }),
                    el('span', null, t(labelKey))))
              : null,
            el('div', { className: 'cm-field' },
              el('span', { className: 'cm-hint' }, t('quotaStripNote'))),
            el('div', { className: 'cm-grid-group' }, t('groupCorner')),
            el('div', { className: 'cm-field' },
              el('label', null, t('cornerLabel')),
              el('label', { className: 'cm-check' },
                el('input', {
                  type: 'checkbox',
                  checked: draft?.corner?.enabled === true,
                  onChange: event => {
                    if (draft === null) return
                    setDraft({ ...draft, corner: { ...(draft.corner ?? { enabled: false, goRolling: true, goWeekly: true, goMonthly: true, budget: true }), enabled: event.target.checked } })
                  },
                }),
                el('span', null, t('cornerEnabledLabel'))),
              draft?.corner?.enabled === true
                ? [['goRolling', 'cornerGoRolling'], ['goWeekly', 'cornerGoWeekly'], ['goMonthly', 'cornerGoMonthly'], ['budget', 'cornerBudget']].map(([key, labelKey]) =>
                  el('label', { key, className: 'cm-check' },
                    el('input', {
                      type: 'checkbox',
                      checked: draft.corner[key] !== false,
                      onChange: event => {
                        if (draft === null) return
                        setDraft({ ...draft, corner: { ...draft.corner, [key]: event.target.checked } })
                      },
                    }),
                    el('span', null, t(labelKey))))
                : null),
            el('div', { className: 'cm-grid-group' }, t('groupDetail')),
            el('div', { className: 'cm-field' },
              el('label', { className: 'cm-check' },
                el('input', {
                  type: 'checkbox',
                  checked: draft?.goQuota?.detail !== false,
                  onChange: event => {
                    if (draft === null) return
                    setDraft({ ...draft, goQuota: { ...(draft.goQuota ?? { display: 'both', refreshMinutes: 15, apiKey: '', main: 'rolling', detail: true }), detail: event.target.checked } })
                  },
                }),
                el('span', null, t('goDetailLabel')))),
            el('div', { className: 'cm-field' },
              el('label', { className: 'cm-check' },
                el('input', {
                  type: 'checkbox',
                  checked: draft?.budget?.detail !== false,
                  onChange: event => {
                    if (draft === null) return
                    setDraft({ ...draft, budget: { ...(draft.budget ?? { enabled: false, amount: 100, period: 'month', customStart: null, customEnd: null, detail: true }), detail: event.target.checked } })
                  },
                }),
                el('span', null, t('budgetDetailLabel'))))))
    }

    function mount(ctx) {
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
      ctx.effect(() => () => style.remove(), 'cost-meter: display settings styles')
      return DisplayBoundary
    }
    return { mount, DisplaySettings }
  },
})
