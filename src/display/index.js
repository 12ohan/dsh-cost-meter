/** Interactive display settings. Preview values are local examples; no account reads. */
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
    /* DISPLAY_LIVE_SOURCE */

    // Preserve the desktop layout at every settings-pane width.
    function PreviewCanvas({ children, expanded, width = 1280, height = 800, live = false }) {
      const ref = React.useRef(null)
      const [scale, setScale] = useState(.6)
      React.useLayoutEffect(() => {
        const update = () => setScale(Math.max(.05, Math.min(ref.current.clientWidth / width, expanded ? (window.innerHeight - 150) / height : Infinity)))
        const observer = new ResizeObserver(update)
        observer.observe(ref.current); window.addEventListener('resize', update); update()
        return () => { observer.disconnect(); window.removeEventListener('resize', update) }
      }, [expanded, width, height])
      return el('div', { ref, className: 'cm-preview', style: { height: height * scale } },
        el('div', { className: live ? 'cm-live-desktop' : 'cm-native-desktop', style: { width, height, marginLeft: -width / 2, transform: 'scale(' + scale + ')' } }, children))
    }

    function DisplaySettings(props) {
      const { draft, setDraft, t, locale, formatMoneyUsd, renderBudget, renderBalance, renderGo, renderPeak, onNavigate } = props
      const config = draft ?? props.state.config
      const en = locale === 'en', text = (zh, english) => en ? english : zh
      const [feedback, setFeedback] = useState('')
      const [expanded, setExpanded] = useState(false)
      const [liveSource, setLiveSource] = useState(false)
      const dialogRef = React.useRef(null), expandButton = React.useRef(null)
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
      const items = []
      const item = (key, label, on, patch, content, extra = '') => {
        const node = el('div', {
        key, role: 'button', tabIndex: 0, className: 'cm-display-item ' + extra, 'data-display': key,
        'aria-pressed': on, 'aria-label': label + text(on ? '，点击隐藏' : '，点击显示', on ? ', click to hide' : ', click to show'),
        title: label + text(on ? ' · 点击隐藏' : ' · 点击显示', on ? ' · Click to hide' : ' · Click to show'),
        onClick: () => toggle(label, on, patch),
        onKeyDown: event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggle(label, on, patch) } },
      }, el('span', { className: 'cm-display-item-content', inert: '' }, content),
      el('span', { className: 'cm-display-item-tag', 'aria-hidden': true }, text(on ? '点击隐藏' : '点击显示', on ? 'Hide' : 'Show')))
        items.push(node)
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
      const modeButton = (value, label) => el('button', { key: value, type: 'button', 'aria-pressed': mode === value,
        onClick: () => set({ sidebarSimple: value === 'simple', sidebarSimplePromptSeen: true, ...(value === 'simple' ? {} : { sidebarStyle: value }) }) }, label)
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
      const scene = el(Fragment, null,
        el('div', { className: 'cm-native-titlebar', 'aria-hidden': true }, icon('IconPanelLeftOutlineRegular'), text('应用', 'App'), text('编辑', 'Edit'),
          native('window-actions', '−', el('span', { className: 'cm-native-window-square' }), icon('IconCloseOutlineRegular', 14))),
        el('aside', { className: 'cm-native-side-root', 'aria-label': text('侧栏预览', 'Sidebar preview') },
          el('div', { className: 'cm-native-side-logoRow', 'aria-hidden': true }, el('div', { className: 'cm-native-side-brand' }, el(Native.BrandWordmark, { size: 24 }))),
          el('div', { className: 'cm-native-side-newSession', 'aria-hidden': true }, native('side-newSessionContent', icon('IconNewChatOutlineRegular'), text('新会话', 'New conversation'))),
          el('div', { className: 'cm-native-side-panelList', 'aria-hidden': true }, nav('IconPluginPinwheelOutlineRegular', text('插件', 'Plugins')), nav('IconClockOutlineRegular', text('自动化任务', 'Automations')), nav('IconInspectOutlineRegular', text('上下文洞察', 'Context insights'))),
          el('div', { className: 'cm-native-workspaces', 'aria-hidden': true },
            native('workspaces-title', text('工作区', 'Workspaces'), native('workspace-tools', icon('IconSearchOutlineRegular', 14), icon('IconSlidersTwoOutlineRegular', 14), icon('IconProjectAddOutlineRegular', 14))),
            folder(text('日常工作', 'Daily work')), folder(text('项目资料', 'Project files')),
            el('div', { className: 'cm-native-history active' }, text('整理项目计划', 'Organize the project plan'), el('small', null, text('刚刚', 'now'))),
            native('history', text('查看文档与任务', 'Review documents and tasks')),
            native('history', text('讨论界面布局', 'Discuss the interface layout')),
            native('history', text('展开其余 5 个会话', 'Show 5 more conversations'))),
          native('sidebar-footer', el('div', { className: 'cm-footer-stack' + (simple ? ' simple' : mode === 'compact' ? ' compact' : '') },
            ...(simple ? [budget, balance, go, peak, today] : [balance, go, budget, peak, today]))),
          el('div', { className: 'cm-native-account', 'aria-hidden': true }, native('avatar', icon('IconUserOutlineRegular', 18)), text('已登录 DeepSeek', 'Signed in to DeepSeek'))),
        native('chat-root',
          native('chat-header', native('chat-titleRow', native('chat-title', text('整理项目计划', 'Organize the project plan')),
            meta('IconChevronDownOutlineRegular', text('7 个子智能体', '7 subagents')), meta('IconUsersOutlineRegular', text('智能体团队', 'Agent team')), meta('IconBranchOutlineRegular', text('标准模式', 'Standard mode')),
            session('header'), badge('header'), native('header-tools', icon('IconEllipsisOutlineRegular'), icon('IconPanelLeftOutlineRegular'))),
            el('div', { className: 'cm-native-chat-tabs', 'aria-hidden': true }, ...[text('对话', 'Chat'), text('轨迹', 'Trace'), text('上下文', 'Context'), text('编队', 'Team')].map((label, i) => el('span', { key: label, className: 'cm-native-chat-tab' + (i === 0 ? ' cm-native-chat-tabActive' : '') }, label)))),
          native('thread',
            el('div', { className: 'cm-native-user', 'aria-hidden': true }, text('帮我整理一下项目计划，列出接下来的工作。', 'Organize the project plan and outline the next steps.')),
            native('response',
              el('p', { 'aria-hidden': true }, text('已经整理好项目资料，接下来可以按这个顺序推进。', 'The project materials are ready. Here are the next steps.')),
              el('table', { className: 'cm-native-response-table', 'aria-hidden': true }, el('tbody', null,
                ...[[text('整理需求与资料', 'Organize requirements'), text('已完成', 'Done')], [text('确认界面布局', 'Review the layout'), text('已完成', 'Done')], [text('检查显示效果', 'Check the display'), text('进行中', 'In progress')]].map(([a,b]) => el('tr', { key: a }, el('td', null, a), el('td', null, el('span', { className: 'cm-native-check' }, '✓'), b))))),
              el('p', { 'aria-hidden': true }, text('预算、余额和费用明细保留在常用位置，便于随时查看。', 'Budget, balance and cost details stay within easy reach.')),
              el('div', { className: 'cm-native-file', 'aria-hidden': true }, native('file-icon', 'MD'), el('div', null, 'project-plan.md', el('small', null, text('项目计划与待办事项', 'Project plan and next steps')))),
              item('turn', text('每轮费用', 'Per-turn cost'), config.hideTurnCost !== true, { hideTurnCost: config.hideTurnCost !== true },
                el('span', { className: 'cm-native-turn' }, text('▸ 本轮费用 ≈ ', '▸ Turn cost ≈ ') + money(.08))),
              el('div', { className: 'cm-native-response-actions', 'aria-hidden': true }, icon('IconCopyOutlineRegular'), icon('IconLikeOutlineRegular'), icon('IconDislikeOutlineRegular'), icon('IconShareOutlineRegular'),
                el('span', null, icon('IconDatabaseOutlineRegular'), text('用量 128K tok', 'Usage 128K tok')), el('span', null, '14:32')))),
          native('input-root',
            el('div', { className: 'cm-preview-strip' }, stripItem('budget', t('budget'), 32, 'budget'), stripItem('go', 'Go', 24, 'go'), stripItem('plans', 'Plan', 18, 'plan')),
            el('div', { className: 'cm-native-input-card', 'aria-hidden': true },
              native('input-grow', native('input-input'), native('input-placeholder', text('发消息或创建任务，/ 调用指令，@ 文件或对话', 'Send a message, / commands, @ files or conversations'))),
              native('input-row', native('input-tools', native('input-add', icon('IconPlusOutlineRegular', 20)), native('permission', icon('PermissionIconFullAccessRegular'), text('完全权限', 'Full access'), icon('IconChevronDownOutlineRegular', 12))),
                native('input-trailing', native('model', 'DeepSeek-V41-Flash', el('em', null, 'Max'), icon('IconChevronDownOutlineRegular', 12)), icon('IconMicrophoneOutlineRegular', 20), native('input-primary', icon('IconSendOutlineRegular', 24))))),
            native('input-dock', el('span', { className: 'cm-native-dock-stat', 'aria-hidden': true }, icon('IconGaugeOutlineRegular', 14), text('2 轮 6 步 · 273 tok/s', '2 turns · 6 steps · 273 tok/s')),
              el('span', { className: 'cm-native-dock-stat', 'aria-hidden': true }, icon('IconDatabaseOutlineRegular', 14), text('128K tok · 缓存命中 98%', '128K tok · 98% cache')),
              session('dock'), badge('dock'), corner,
              el('span', { className: 'cm-native-dock-context', 'aria-hidden': true }, el('i', { className: 'cm-native-context-ring' }), '29%')))))
      const preview = el(LiveDesktopPreview, { scene, items, expanded, onSource: setLiveSource })
      return el('section', { className: 'cm-display', 'aria-label': text('交互式显示设置', 'Interactive display settings') },
        el('div', { className: 'cm-display-heading' },
          el('div', null, el('h3', null, text('点击界面，选择显示内容', 'Choose what appears on your screen')),
            el('p', null, text('点击预算、余额或费用等项目即可切换。隐藏后会淡化，点击可重新显示。', 'Click a budget, balance or cost item to toggle it. Faded items can be turned back on.'))),
          el('div', { className: 'cm-display-legend', 'aria-hidden': true }, el('span', null, el('i', { className: 'cm-display-dot' }), text('显示', 'Shown')), el('span', null, el('i', { className: 'cm-display-dot hidden' }), text('隐藏', 'Hidden')))),
        el('div', { className: 'cm-display-preview-actions' }, el('span', null, liveSource ? text('当前界面 · 已包含皮肤和插件效果', 'Current page · includes skins and plugins') : text('原生布局示例', 'Native layout example')),
          el('button', { ref: expandButton, type: 'button', className: 'cm-btn small cm-display-expand', onClick: () => setExpanded(true) }, icon('IconFullscreenOutlineRegular', 14), text('放大预览', 'Expand preview'))),
        expanded ? el('dialog', { ref: dialogRef, className: 'cm-display-dialog', 'aria-label': text('桌面显示预览', 'Desktop display preview'),
          onCancel: event => { event.preventDefault(); event.stopPropagation(); setExpanded(false) },
          onKeyDown: event => { if (event.key === 'Escape') event.stopPropagation() },
          onClick: event => { if(event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if(event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setExpanded(false) } } },
          el('div', { className: 'cm-display-dialog-head' }, text('点击项目，调整显示', 'Click items to adjust the display'),
            el('button', { type: 'button', className: 'cm-display-dialog-close', 'aria-label': text('关闭预览', 'Close preview'), autoFocus: true, onClick: () => setExpanded(false) }, icon('IconCloseOutlineRegular'))),
          preview, el('div', { className: 'cm-display-feedback', role: 'status', 'aria-live': 'polite' }, feedback || text('更改会自动保存', 'Changes save automatically'))) : preview,
        el('div', { className: 'cm-display-toolbar' },
          el('div', { className: 'cm-display-style' }, text('侧栏样式', 'Sidebar style'),
            el('div', { className: 'cm-display-segments', role: 'group', 'aria-label': text('侧栏样式', 'Sidebar style') }, modeButton('simple', text('简洁', 'Simple')), modeButton('standard', text('标准', 'Standard')), modeButton('compact', text('紧凑', 'Compact')))),
          el('span', { className: 'cm-display-feedback', role: 'status', 'aria-live': 'polite' }, feedback || text('更改会自动保存', 'Changes save automatically'))),
        el('div', { className: 'cm-display-footnote' },
          el('p', null, liveSource ? text('已显示的项目直接取自当前界面；隐藏或未配置的项目用淡化示例占位。', 'Visible items come from your current page. Hidden or unconfigured items use faded examples.') : text('预算、余额和额度使用示例数据；这里仅调整显示。', 'Budget, balance and quota values are examples; these controls change visibility.')),
          el('button', { type: 'button', className: 'cm-btn small', onClick: () => onNavigate('quotas') }, text('配置额度 →', 'Set up quotas →'))),
        el(DetailedSettings, props))
    }


    function DetailedSettings({ state, draft, setDraft, t, locale, numInput, displayOptions, CURRENCY_PRESETS, USAGE_POSITION_SWITCHABLE }) {
      const config=state.config
      const setField=(key,value)=>setDraft(previous=>({...previous,[key]:value}))
      return el('details', { className: 'cm-display-details' },
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
            el('label', { className: 'cm-check' },
              el('input', { type: 'checkbox', checked: draft?.sidebarSimple === true,
                onChange: event => { if (draft) setDraft({ ...draft, sidebarSimple: event.target.checked, sidebarSimplePromptSeen: true }) } }),
              el('span', null, t('sidebarSimple'))),
            el('div', { className: 'cm-field' }, el('span', { className: 'cm-hint' }, t('sidebarSimpleNote'))),
            el('div', { className: 'cm-field' },
              el('label', null, t('sidebarStyleLabel')),
              el('select', {
                className: 'cm-input',
                value: draft?.sidebarStyle ?? 'standard',
                disabled: draft?.sidebarSimple === true,
                onChange: event => setField('sidebarStyle', event.target.value),
              },
                el('option', { value: 'standard' }, t('sidebarStyleStandard')),
                el('option', { value: 'compact' }, t('sidebarStyleCompact')))),
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
      style.textContent = displayNativeCss + '\n' + css
      document.head.appendChild(style)
      ctx.effect(() => () => style.remove(), 'cost-meter: display settings styles')
      return DisplaySettings
    }
    return { mount, DisplaySettings }
  },
})
