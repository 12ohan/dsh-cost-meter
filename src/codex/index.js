/** Codex subscription compatibility (spec contract E): one-time prompt + settings panel.
 *  Loaded on demand as `client.codex.js` so the always-loaded client.js stays under the
 *  DSH STORE 256 KiB per-file bound. Text lives here as local zh/en pairs instead of the
 *  main bundle MESSAGES table (the main table would be billed against client.js). */
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.codex.js',
  factory: require => {
    const React = require('react')
    const { createElement: el, useState, useEffect, useRef } = React

    // Dialog geometry/head/body are reused from the always-loaded .cm-stat-dialog rules;
    // the chunk narrows the width itself (chunk bytes are not billed against client.js).
    const DIALOG_CLASS = 'cm-stat-dialog cm-codex-compat-dialog'
    if (typeof document !== 'undefined') {
      const style = document.createElement('style')
      style.textContent = '.cm-codex-compat-dialog{width:min(560px,94vw)}.cm-codex-compat{display:flex;flex-direction:column;gap:8px;font-size:13px}'
      // dsh-pocket 手机端适配(task-10):弹窗铺满窄屏、安全区内边距;桌面端规则不变。
      style.textContent += '@media (max-width:1023px){.cm-codex-compat-dialog{width:calc(100vw - 24px);max-height:90vh;overflow:auto}.cm-codex-compat{padding:0 2px}}body[data-dsh-pocket-layout="mobile"] .cm-codex-compat-dialog{width:calc(100vw - 24px)}'
      document.head.appendChild(style)
    }

    // Shared pending/error state for the two api writes (apply / dismiss).
    function useCodexAction() {
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const run = action => {
        if (busy) return
        setBusy(true)
        setError(null)
        action().catch(failure => setError(failure?.message ?? String(failure))).finally(() => setBusy(false))
      }
      return [busy, error, run]
    }

    // One-time prompt: mounted in sidebar.footer.action, gated by state.codexCompat.promptDue.
    // × / Keep status quo / ESC all persist promptDismissed; only the primary button
    // reclassifies the historical baseline, so a maybe-later answer never rewrites the ledger.
    function CodexCompatPrompt(props) {
      const state = props.state
      const compat = state?.codexCompat
      const api = props.api
      const en = props.locale === 'en'
      const text = (zh, english) => en ? english : zh
      const dialog = useRef(null)
      const [busy, error, run] = useCodexAction()
      const show = compat?.promptDue === true
      // Native modal: browser owns backdrop/focus; ESC is routed to onCancel.
      useEffect(() => {
        if (show && dialog.current && !dialog.current.open) dialog.current.showModal()
      }, [show])
      if (!show) return null
      const usage = compat.usage ?? {}
      const dismiss = () => run(api.dismissCodexCompat)
      return el('dialog', {
        ref: dialog,
        className: DIALOG_CLASS,
        'aria-label': text('兼容修复', 'Compatibility fix'),
        onCancel: event => { event.preventDefault(); dismiss() },
      },
        el('header', { className: 'cm-stat-dialog-head' },
          text('兼容修复', 'Compatibility fix'),
          el('button', { type: 'button', className: 'cm-btn', 'aria-label': text('关闭', 'Close'), disabled: busy, onClick: dismiss }, '×')),
        el('div', { className: 'cm-stat-dialog-body' },
          el('p', null, text(
            '检测到 dsh-codex-subscription {version}。Codex 订阅用量不计入 API 费用；为兼容本插件，新产生的 Codex 用量已自动归类为 Plan。是否将历史 codex 类模型的计费统一归类为 Plan（订阅额度，不计入 API 费用）？',
            'Detected dsh-codex-subscription {version}. Codex subscription usage is not billed as API usage; for compatibility this plugin now defaults new Codex usage to Plan. Reclassify the billing of historical codex-class models as Plan (subscription quota, excluded from API usage)?',
          ).replace('{version}', 'v' + (compat.version ?? ''))),
          usage.calls > 0
            ? el('p', { className: 'cm-note' }, text('历史 Codex 用量：{calls} 次调用 · {cost} · {days} 天', 'Historical Codex usage: {calls} calls · {cost} · {days} days')
              .replace('{calls}', usage.calls).replace('{cost}', '$' + Number(usage.cost ?? 0).toFixed(2)).replace('{days}', usage.days))
            : null,
          error
            ? el('div', { className: 'cm-msg err' }, text('失败：', 'Failed: ') + error)
            : null,
          el('div', { className: 'cm-buttons' },
            el('button', { type: 'button', className: 'cm-btn', disabled: busy, onClick: dismiss }, text('保持现状', 'Keep status quo')),
            el('button', { type: 'button', className: 'cm-btn primary', disabled: busy, onClick: () => run(api.applyCodexCompatHistory) }, text('统一归类为 Plan', 'Reclassify as Plan'))),
          el('p', { className: 'cm-note' }, text('之后可在 设置 → 费用 → Codex 订阅兼容 中处理。', 'You can change this later in Settings → Cost → Codex subscription compatibility.'))))
    }

    // Settings panel: read-only echo of the contract C fields, no client-side recompute.
    function CodexCompatPanel(props) {
      const state = props.state
      const compat = state?.codexCompat
      // Legacy hosts have no codexCompat; CostSection hides the tab, this guard is a backstop.
      if (compat?.installed !== true) return null
      const api = props.api
      const t = props.t
      const en = props.locale === 'en'
      const text = (zh, english) => en ? english : zh
      const usage = compat.usage ?? {}
      const applied = compat.historyAppliedAt > 0
      const planClass = compat.planClass === 'plan' ? t('billingClassPlan') : compat.planClass === 'api' ? t('billingClassApi') : t('billingClassAuto')
      return el('div', { className: 'cm-codex-compat' },
        el('h3', null, text('Codex 订阅兼容', 'Codex subscription compatibility')),
        el('p', null, text('检测版本：{version}', 'Detected version: {version}').replace('{version}', 'v' + (compat.version ?? ''))),
        el('p', null, text('当前计费方式：{planClass}', 'Current billing class: {planClass}').replace('{planClass}', planClass)),
        el('p', null, text('历史用量：{calls} 次调用 · {cost} · {tokens} tokens · {days} 天', 'Historical usage: {calls} calls · {cost} · {tokens} tokens · {days} days')
          .replace('{calls}', usage.calls).replace('{cost}', '$' + Number(usage.cost ?? 0).toFixed(2))
          .replace('{tokens}', Number(usage.tokens ?? 0).toLocaleString(en ? 'en-US' : 'zh-CN')).replace('{days}', usage.days)),
        applied
          ? el('p', { className: 'cm-note' }, text('已归类于 {time}', 'Reclassified at {time}').replace('{time}', new Date(compat.historyAppliedAt).toLocaleString()))
          : el('p', null, text('历史用量未归类。', 'Historical usage is not reclassified yet.')),
        !applied && usage.providers?.length
          ? el('p', { className: 'cm-note' }, text('来源：{providers}', 'Sources: {providers}').replace('{providers}', usage.providers.join(', ')))
          : null,
        applied
          ? null
          : el('div', { className: 'cm-buttons' },
            el('button', { type: 'button', className: 'cm-btn primary', onClick: () => api.applyCodexCompatHistory().catch(() => {}) }, text('统一归类为 Plan', 'Reclassify as Plan'))),
        // Dismissed before applying: keep a note that applying remains available anytime.
        !applied && compat.promptDismissed === true
          ? el('p', { className: 'cm-note' }, text('此前选择保持现状，可随时统一归类。', 'You chose Keep status quo earlier; you can reclassify anytime.'))
          : null)
    }

    function mount() {
      return { CodexCompatPrompt, CodexCompatPanel }
    }
    return { mount, CodexCompatPrompt, CodexCompatPanel }
  },
})
