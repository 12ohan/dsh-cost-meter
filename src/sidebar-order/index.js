// Ordering belongs to the Display preview only. The live sidebar is presentation-only.
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.sidebar-order.js',
  factory: () => {
    const validKey = key => typeof key === 'string' && /^(balance|customBalance|today|peak|models|go|budget|codex|(plan|gateway):[A-Za-z0-9_-]{1,100})$/.test(key)
    function move(order, visible, source, target, after) {
      const next = [...new Set([...order, ...visible])].filter(key => validKey(key) && key !== source)
      const index = next.indexOf(target)
      if (!validKey(source) || source === target || index < 0 || !visible.includes(source)) return null
      next.splice(index + Number(after), 0, source)
      return next.slice(0, 64)
    }
    function mount(ctx) {
      let drag = null
      const style = document.createElement('style')
      style.textContent = `
        body .cm-footer-stack.summary:not(.rail){display:flex;flex-direction:column;gap:4px;box-sizing:border-box;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);height:auto;max-height:none;overflow:visible}
        body .cm-footer-stack:is(.simple,.summary)>[data-cm-display]{background:transparent;box-shadow:none}
        body .cm-footer-stack.simple{max-height:max(180px,min(38dvh,320px))}
        body .cm-footer-stack.simple>.cm-simple-summary{background:inherit}
        body .cm-footer-stack.summary>[data-cm-display]{border:0;margin:0;min-width:0;flex-shrink:0}
        body .cm-footer-stack.summary>.cm-foot{padding:0;height:auto;min-height:24px;font-size:12px;line-height:20px;border-radius:0}
        .cm-footer-stack.summary>[data-cm-display=today]>.cm-num{flex:1;display:flex;min-width:0}
        .cm-footer-stack.summary .cm-today-values{display:flex;flex:1;min-width:0;align-items:center;justify-content:space-between;max-width:none}
        .cm-footer-stack.summary [data-cm-today=cost]{order:2;margin-left:auto;color:var(--dsw-alias-state-business-primary,#4d6bfe);font-weight:600}
        .cm-footer-stack.summary [data-cm-today=tokens]{order:1;font-size:11px;color:var(--dsw-alias-label-tertiary,#888)}
        .cm-footer-stack.summary .cm-today-values:not(:has([data-cm-today=cost])){justify-content:flex-end}
        body .cm-footer-stack.summary>.cm-bbox{padding:8px 0 2px;border-top:1px solid var(--dsw-alias-border-l1,#ddd)}
        [data-cm-order-drop=before]{box-shadow:0 -2px var(--dsw-alias-state-business-primary,#4d6bfe)!important}
        [data-cm-order-drop=after]{box-shadow:0 2px var(--dsw-alias-state-business-primary,#4d6bfe)!important}
      `
      document.head.appendChild(style)
      const scopeOf = node => node?.closest?.('.cm-sidebar-selection')
      const entries = root => [...root.querySelectorAll('[data-cm-order-key]')]
        .map(node => ({ node, key: node.dataset.cmOrderKey }))
        .filter((row, index, rows) => validKey(row.key) && rows.findIndex(other => other.key === row.key) === index)
      const clear = () => {
        drag?.root.querySelectorAll('[data-cm-order-drop]').forEach(node => node.removeAttribute('data-cm-order-drop'))
        drag = null
      }
      const save = (root, source, target, after) => {
        const order = JSON.parse(root.dataset.cmOrder || '[]')
        const next = move(order, entries(root).map(row => row.key), source, target, after)
        if (next && JSON.stringify(order) !== JSON.stringify(next)) root.dispatchEvent(new CustomEvent('cost-meter:sidebar-reorder', { detail: next }))
      }
      const start = event => {
        const handle = event.target.closest?.('[data-cm-order-key]'), root = scopeOf(handle)
        if (!root || !validKey(handle.dataset.cmOrderKey)) return
        drag = { root, key: handle.dataset.cmOrderKey }
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('application/x-dsh-cost-sidebar', drag.key)
        event.stopPropagation()
      }
      const destination = event => {
        if (!drag) return null
        const root = scopeOf(event.target)
        if (root !== drag.root) return null
        const item = entries(root).find(row => row.node === event.target || row.node.contains(event.target))
        if (!item || item.key === drag.key) return null
        return { ...item, after: event.clientY > item.node.getBoundingClientRect().top + item.node.getBoundingClientRect().height / 2 }
      }
      const over = event => {
        const item = destination(event)
        if (!item) return
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'
        drag.root.querySelectorAll('[data-cm-order-drop]').forEach(node => node.removeAttribute('data-cm-order-drop'))
        item.node.dataset.cmOrderDrop = item.after ? 'after' : 'before'
      }
      const drop = event => {
        const item = destination(event), current = drag
        if (!item) return
        event.preventDefault(); event.stopPropagation(); clear()
        void save(current.root, current.key, item.key, item.after)
      }
      const keydown = event => {
        if (event.key === 'Escape') { clear(); return }
        const handle = event.target.closest?.('[data-cm-order-key]'), root = scopeOf(handle)
        if (!root || !['ArrowUp','ArrowDown'].includes(event.key)) return
        const list = entries(root), index = list.findIndex(row => row.key === handle.dataset.cmOrderKey), next = list[index + (event.key === 'ArrowUp' ? -1 : 1)]
        if (!next) return
        event.preventDefault(); event.stopPropagation(); void save(root, handle.dataset.cmOrderKey, next.key, event.key === 'ArrowDown')
      }
      const events = { dragstart: start, dragover: over, drop, dragend: clear, keydown }
      for (const [name, handler] of Object.entries(events)) document.addEventListener(name, handler, true)
      ctx.effect(() => () => {
        clear()
        for (const [name, handler] of Object.entries(events)) document.removeEventListener(name, handler, true)
        style.remove()
      }, 'cost-meter: display preview reorder')
      return () => null
    }
    return { mount, move }
  },
})
