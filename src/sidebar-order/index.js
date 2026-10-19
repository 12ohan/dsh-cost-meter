// Sidebar-only interaction. No account reads, timers or conversation traversal.
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.sidebar-order.js',
  factory: () => {
    const keyOf = node => {
      const kind = node?.dataset?.cmDisplay
      return kind === 'plan' ? 'plan:' + node.dataset.cmPlan : kind === 'gateway' ? 'gateway:' + node.dataset.cmSource : kind
    }
    function move(order, visible, source, target, after) {
      const next = [...new Set([...order, ...visible])].filter(key => key !== source)
      const index = next.indexOf(target)
      if (source === target || index < 0 || !visible.includes(source)) return null
      next.splice(index + Number(after), 0, source)
      return next.slice(0, 64)
    }
    function mount(ctx, store, resolveLocale, { updateConfig } = {}) {
      let drag = null, frame = 0, active = true, saving = false
      const roots = new Map()
      const text = (zh, en) => resolveLocale(store.getSnapshot().state?.config) === 'en' ? en : zh
      const style = document.createElement('style')
      style.textContent = `
        .cm-footer-stack:not(.rail){padding-left:16px;box-sizing:border-box;position:relative}
        .cm-footer-stack>[data-cm-display]{position:relative}
        .cm-order-handle{position:absolute;left:0;top:3px;width:16px;height:24px;border:0;padding:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary,#888);font:14px/24px system-ui;cursor:grab;opacity:0;z-index:2;touch-action:none}
        .cm-footer-stack:hover .cm-order-handle,.cm-order-handle:focus-visible{opacity:.8}
        .cm-order-handle:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe)}
        [data-cm-order-drop=before]{box-shadow:0 -2px var(--dsw-alias-state-business-primary,#4d6bfe)!important}
        [data-cm-order-drop=after]{box-shadow:0 2px var(--dsw-alias-state-business-primary,#4d6bfe)!important}
        .cm-order-status{font:11px/1.4 system-ui;color:var(--dsw-alias-label-secondary);padding:2px 4px}
        .cm-sidebar-target[data-cm-order-key]::after{content:'⠿';position:absolute;left:-16px;top:3px;line-height:22px;width:14px;color:var(--dsw-alias-label-secondary);cursor:grab}
      `
      document.head.appendChild(style)
      const scopeOf = node => node?.closest?.('.cm-sidebar-selection,.cm-footer-stack')
      const entries = root => root?.classList.contains('cm-sidebar-selection')
        ? [...root.querySelectorAll('[data-cm-order-key]')].map(node => ({ node, key: node.dataset.cmOrderKey }))
        : [...(root?.children ?? [])].filter(node => keyOf(node)).map(node => ({ node, key: keyOf(node) })).filter((row, index, rows) => rows.findIndex(other => other.key === row.key) === index)
      const clear = () => {
        for (const root of [drag?.root]) root?.querySelectorAll('[data-cm-order-drop]').forEach(node => node.removeAttribute('data-cm-order-drop'))
        drag = null
      }
      const announce = (root, message) => {
        let node = root.querySelector('.cm-order-status')
        if (!node) { node = document.createElement('div'); node.className = 'cm-order-status'; node.setAttribute('role', 'status'); root.appendChild(node) }
        node.textContent = message
      }
      const save = async (root, source, target, after) => {
        if (saving) return
        const preview = root.classList.contains('cm-sidebar-selection')
        const order = preview ? JSON.parse(root.dataset.cmOrder || '[]') : store.getSnapshot().state?.config?.sidebarOrder ?? []
        const next = move(order, entries(root).map(row => row.key), source, target, after)
        if (!next || JSON.stringify(order) === JSON.stringify(next)) return
        if (preview) { root.dispatchEvent(new CustomEvent('cost-meter:sidebar-reorder', { detail: next })); return }
        saving = true
        try { await updateConfig({ sidebarOrder: next }); if (active) announce(root, text('顺序已保存', 'Order saved')) }
        catch { if (active) announce(root, text('保存失败，请重试', 'Save failed. Try again.')) }
        finally { saving = false }
      }
      const prepare = root => {
        if (!active || !root || root.closest('[inert]') || root.classList.contains('rail')) return
        if (!roots.has(root)) {
          const observer = new MutationObserver(schedule)
          observer.observe(root, { childList: true, subtree: true })
          roots.set(root, observer)
        }
        const handles = new Map([...root.querySelectorAll(':scope > .cm-order-handle')].map(node => [node.dataset.cmOrderKey, node]))
        const cards = entries(root).slice(0, 64)
        for (const [key, handle] of handles) if (!cards.some(row => row.key === key)) handle.remove()
        for (const { node, key } of cards) {
          let handle = handles.get(key)
          if (!handle) { handle = document.createElement('button'); handle.type = 'button'; handle.className = 'cm-order-handle'; handle.textContent = '⠿'; handle.draggable = true; root.appendChild(handle) }
          handle.dataset.cmOrderKey = key
          handle.style.top = node.offsetTop + 3 + 'px'
          const label = node.querySelector('.cm-mm-title,.cm-bbox-label')?.textContent || key
          handle.title = text('拖动排序；方向键上移或下移 · ', 'Drag to reorder; use arrow keys to move · ') + label
          handle.setAttribute('aria-label', handle.title)
        }
      }
      function schedule() {
        if (!active || frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          for (const [root, observer] of roots) if (!root.isConnected) { observer.disconnect(); roots.delete(root) }
          for (const root of [...document.querySelectorAll('.cm-footer-stack')].slice(0, 8)) prepare(root)
        })
      }
      const start = event => {
        const handle = event.target.closest?.('[data-cm-order-key]'), root = scopeOf(handle)
        if (!root || saving) return
        drag = { root, key: handle.dataset.cmOrderKey }
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('application/x-dsh-cost-sidebar', drag.key)
        event.stopPropagation()
      }
      const destination = event => {
        if (!drag) return null
        const root = scopeOf(event.target)
        if (root !== drag.root) return null
        const key = event.target.closest?.('.cm-order-handle')?.dataset.cmOrderKey
        const item = entries(root).find(row => row.key === key || row.node === event.target || row.node.contains(event.target))
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
      const hover = event => prepare(event.target.closest?.('.cm-footer-stack'))
      const click = event => { if (event.target.closest?.('.cm-order-handle')) { event.preventDefault(); event.stopPropagation() } }
      const events = { dragstart: start, dragover: over, drop, dragend: clear, keydown, pointerover: hover, click }
      for (const [name, handler] of Object.entries(events)) document.addEventListener(name, handler, true)
      window.addEventListener('resize', schedule)
      const stop = store.subscribe(schedule)
      schedule()
      ctx.effect(() => () => {
        active = false; stop(); clear(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame)
        for (const [name, handler] of Object.entries(events)) document.removeEventListener(name, handler, true)
        for (const [root, observer] of roots) { observer.disconnect(); root.querySelectorAll('.cm-order-handle,.cm-order-status').forEach(node => node.remove()) }
        roots.clear(); style.remove()
      }, 'cost-meter: sidebar reorder')
      return () => null
    }
    return { mount, move }
  },
})
