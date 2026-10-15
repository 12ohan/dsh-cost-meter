/** Read the already-rendered DSH page, including skin and peer-plugin output.
 * Only a scriptless local DOM copy is shown. No controllers, slots or requests run twice.
 * The copy stays in memory and is discarded when the settings screen unmounts.
 */
function displayHostFrame() {
  const overlay = [...document.querySelectorAll('[data-shell-overlay]')].find(node => !node.closest('.cm-display'))
  const root = overlay?.parentElement ?? document.querySelector('.BynINW_frame')
  return root && root.getBoundingClientRect().width > 100 && !root.closest('.cm-display') ? root : null
}

function captureDisplayFrame(frame, references) {
  const rect = frame.getBoundingClientRect(), copyMap = new Map(), scroll = [], pseudo = []
  let count = 0
  const out = document.implementation.createHTMLDocument('DSH display preview')
  const blocked = 'script,style,link,base,meta,iframe,object,embed,audio,source,dialog,[role="dialog"],[role="menu"],[role="tooltip"],.cm-display'
  const safeImage = value => !/url\(/i.test(value) || ![...value.matchAll(/url\(["']?([^"')]+)/gi)].some(m => !/^(?:data:|blob:|#)/i.test(m[1]))
  const styleText = style => [...style].filter(name => !name.startsWith('--') && !['animation','animation-name','transition','transition-property','cursor','-webkit-app-region'].includes(name))
    .map(name => [name, style.getPropertyValue(name)])
    .filter(([, value]) => safeImage(value)).map(([name, value]) => name + ':' + value + ';').join('') + 'animation:none;transition:none;-webkit-app-region:no-drag;'
  function copy(source) {
    if (source.nodeType === 3) return out.createTextNode(source.textContent)
    if (source.nodeType !== 1 || source.matches(blocked) || (source.matches('[role="presentation"]') && source.querySelector('[role="dialog"]'))) return null
    if (++count > 18000) throw Error('Display preview exceeds the DOM size limit')
    const style = getComputedStyle(source)
    if (style.display === 'none') return null
    let node
    if (['IMG','CANVAS','VIDEO'].includes(source.tagName)) {
      node = out.createElement('img')
      try {
        const canvas = document.createElement('canvas')
        canvas.width = source.naturalWidth || source.videoWidth || source.width || source.clientWidth
        canvas.height = source.naturalHeight || source.videoHeight || source.height || source.clientHeight
        if (canvas.width * canvas.height < 8_000_000) { canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height); node.src = canvas.toDataURL() }
      } catch { /* Cross-origin media remains an inert placeholder. */ }
    } else node = source.cloneNode(false)
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || /^(?:src|srcset|href|xlink:href|action|formaction|autofocus|contenteditable|tabindex)$/i.test(attr.name)) {
        if (node.tagName === 'IMG' && attr.name === 'src' && /^data:image\//.test(attr.value)) continue
        if (/href$/.test(attr.name) && attr.value.startsWith('#')) continue
        node.removeAttribute(attr.name)
      }
    }
    node.style.cssText = styleText(style)
    node.removeAttribute('inert')
    if (node.matches('input,textarea,select')) { node.disabled = true; if ('value' in source && source.type !== 'password') node.value = source.value }
    const id = 'n' + count; node.dataset.cmSnapshotNode = id
    copyMap.set(source,node)
    if (source.scrollTop || source.scrollLeft) scroll.push([id, source.scrollTop, source.scrollLeft])
    for (const kind of ['before','after']) {
      const ps = getComputedStyle(source,'::'+kind)
      if (ps.content && !['none','normal'].includes(ps.content)) pseudo.push(`[data-cm-snapshot-node="${id}"]::${kind}{${styleText(ps)}}`)
    }
    if (!['IMG','CANVAS','VIDEO'].includes(source.tagName)) for (const child of source.childNodes) { const result = copy(child); if(result)node.appendChild(result) }
    return node
  }
  const root = copy(frame)
  root.style.cssText += `;position:absolute;inset:0;transform:none;margin:0;width:${rect.width}px;height:${rect.height}px;`
  out.body.style.cssText = `margin:0;width:${rect.width}px;height:${rect.height}px;overflow:hidden;background:${getComputedStyle(frame).backgroundColor};`
  out.body.appendChild(root)
  const all = selector => [...frame.querySelectorAll(selector)].filter(n => copyMap.has(n))
  const first = selector => all(selector)[0]
  const visible = node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > rect.top && r.top < rect.bottom }
  const sidebar = first('._2H3hWW_root')
  const footer = first('.cm-footer-stack')
  const labels = all('.cm-bbox-label')
  const box = expression => labels.find(n => expression.test(n.textContent))?.closest('.cm-bbox-section,.cm-bbox')
  const summary = first('.cm-simple-summary')
  const balance = first('.cm-bal-amt')?.closest('.cm-bbox,.cm-foot') ?? first('.cm-bal-err')
  const targets = {
    balance, budget: box(/预算|Budget/i) ?? summary, go: box(/^Go/),
    peak: first('.cm-peak-strip,.cm-peak-classic,.cm-peak-rail,.cm-peak-rail-classic'),
    today: all('.cm-foot,.cm-bbox-line').find(n => /今日|Today/i.test(n.textContent) && !n.contains(balance)),
    'session-header': first('.cm-stat-header'), 'session-dock': first('.cm-stat-dock'),
    badge: first('.cm-session-cost') ?? all('.cm-root[role="status"],.cm-chip').find(n=>!n.closest('.cm-footer-stack')),
    turn: all('[data-cm-turn],details.cm-note').filter(visible).at(-1), corner: first('.cm-corner'),
  }
  const chips = all('.cm-qchip')
  targets['strip-budget'] = chips.find(n => /^(预算|Budget)/i.test(n.textContent))
  targets['strip-go'] = chips.find(n => /^Go/i.test(n.textContent))
  targets['strip-plans'] = chips.find(n => !/^(预算|Budget|Go|Codex)/i.test(n.textContent))
  // Add faded examples only for controls that are currently absent. They join the
  // actual native slot, so skins and other plugins still determine the surrounding layout.
  const sideSlot = copyMap.get(footer ?? first('._2H3hWW_settingsArea') ?? sidebar)
  const headerSlot = copyMap.get(first('.Dc7zOa_titleRow'))
  const input = first('.RlGAzG_root'), inputCopy = copyMap.get(input)
  const dockSlot = copyMap.get(first('.RlGAzG_dock'))
  let stripSlot = copyMap.get(first('.cm-qstrip'))
  for (const reference of references) {
    const key = reference.dataset.display
    const source = targets[key]
    const target = source && copyMap.get(source)
    if (target && visible(source)) { target.dataset.cmLiveKey = key; continue }
    let slot = ['balance','budget','go','peak','today'].includes(key) ? sideSlot
      : key === 'session-header' ? headerSlot : key.startsWith('strip-') ? stripSlot : dockSlot
    if (key.startsWith('strip-') && !slot && inputCopy) {
      slot = stripSlot = out.createElement('div');slot.style.cssText='display:flex;justify-content:center;align-items:center;gap:6px;flex:none;min-height:24px;'
      inputCopy.prepend(slot); inputCopy.style.height = 'auto'
    }
    if (!slot) continue
    const body = reference.querySelector('.cm-display-item-content')
    const ghost = copy(body)
    if (!ghost) continue
    ghost.dataset.cmLiveKey=key;ghost.dataset.cmLiveExample='true'
    ghost.style.cssText += ';visibility:visible;position:relative;flex:none;min-width:0;max-width:100%;height:auto;'
    if (key==='turn') { // The native turn tail stays above the composer, not in its statistics row.
      if (inputCopy) inputCopy.before(ghost)
      else slot.appendChild(ghost)
    } else slot.appendChild(ghost)
    slot.style.height = 'auto'
    if (sideSlot?.contains(ghost)) {
      for (let p=slot;p&&p!==copyMap.get(sidebar);p=p.parentElement) { p.style.height='auto';p.style.maxHeight='none';p.style.overflow='visible' }
    }
  }
  // Existing browser styles have already been resolved, including third-party CSS.
  const style = out.createElement('style'); style.textContent = pseudo.join('\n').replace(/<\/style/gi,'<\\/style') + '\n[data-cm-live-key]{transition:opacity .12s!important}';out.head.appendChild(style)
  const csp = out.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data: blob:; form-action 'none'; base-uri 'none'";out.head.prepend(csp)
  return { html:'<!doctype html>'+out.documentElement.outerHTML, width:rect.width, height:rect.height, scroll, nodes:count }
}

function LiveDesktopPreview({ scene, items, expanded, onSource }) {
  const stage = React.useRef(null), iframe = React.useRef(null), captureRef = React.useRef(null)
  const [snapshot,setSnapshot] = React.useState(null), [positions,setPositions] = React.useState({})
  const host = React.useMemo(displayHostFrame,[])
  const latest = React.useRef(items);latest.current=items
  const readPositions = React.useCallback(() => {
    const doc = iframe.current?.contentDocument;if(!doc)return
    const next={}
    for(const node of doc.querySelectorAll('[data-cm-live-key]')) {
      const r=node.getBoundingClientRect();if(r.width>0&&r.height>0)next[node.dataset.cmLiveKey]={left:r.left,top:r.top,width:r.width,height:r.height,example:node.dataset.cmLiveExample==='true'}
    }
    setPositions(next)
  },[])
  React.useLayoutEffect(() => {
    if(!host){onSource(false);return}
    let timer,closed=false
    const capture=()=>{
      if(closed||!stage.current)return
      try { const next=captureDisplayFrame(host,[...stage.current.querySelectorAll('[data-display]')]);setSnapshot(next);onSource(true) }
      catch { onSource(false) }
    }
    captureRef.current=capture
    timer=setTimeout(capture,0)
    // Theme switches change the root attributes; ordinary message streaming and
    // our own show/hide saves do not cause repeated full-page captures.
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(capture,250)}
    const theme=new MutationObserver(schedule)
    theme.observe(document.documentElement,{attributes:true});theme.observe(document.body,{attributes:true})
    const css=new MutationObserver(schedule);css.observe(document.head,{childList:true,subtree:true,characterData:true})
    window.addEventListener('resize',schedule)
    return()=>{closed=true;clearTimeout(timer);theme.disconnect();css.disconnect();window.removeEventListener('resize',schedule);captureRef.current=null}
  },[host,onSource])
  React.useEffect(()=>{
    const doc=iframe.current?.contentDocument;if(!doc)return
    for(const item of items){const node=doc.querySelector(`[data-cm-live-key="${item.key}"]`);if(node)node.style.opacity=item.props['aria-pressed'] && node.dataset.cmLiveExample!=='true'?'1':'.26'}
  },[items,positions])
  const load=()=>{
    const doc=iframe.current?.contentDocument;if(!doc)return
    for(const face of document.fonts)if(face.status==='loaded')doc.fonts.add(face)
    for(const [id,top,left]of snapshot.scroll){const node=doc.querySelector(`[data-cm-snapshot-node="${id}"]`);if(node){node.scrollTop=top;node.scrollLeft=left}}
    readPositions()
  }
  return el(Fragment,null,
    host ? el('div',{ref:stage,className:'cm-preview-reference','aria-hidden':true,inert:''},el('div',{className:'cm-native-desktop',style:{position:'relative',left:0,margin:0}},scene)) : null,
    el(PreviewCanvas,{expanded,width:snapshot?.width,height:snapshot?.height,live:!!snapshot},snapshot ?
      el(Fragment,null,el('iframe',{ref:iframe,title:'DSH appearance preview',sandbox:'allow-same-origin',srcDoc:snapshot.html,onLoad:load,tabIndex:-1,'aria-hidden':true,className:'cm-live-frame',style:{width:snapshot.width,height:snapshot.height}}),
        ...items.map(item=>{const p=positions[item.key];return p?el('div',{...item.props,key:item.key,className:'cm-live-hit',style:{left:p.left,top:p.top,width:p.width,height:p.height}},el('span',{className:'cm-display-item-tag'},item.props['aria-label'])):null})) : scene),
    snapshot ? el('button',{type:'button',className:'cm-btn small cm-live-refresh',onClick:()=>captureRef.current?.()},'↻ ', items[0]?.props['aria-label']?.includes('点击')?'刷新当前界面':'Refresh current page') : null)
}
