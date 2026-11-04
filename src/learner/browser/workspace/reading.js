// A Reading panel: a PDF from the project's knowledge bases (served by …/reading/PANEL), drawn page by
// page with pdf.js (window.ViablePdf, loaded with the page) with its text selectable. The learner
// moves by page, zooms, finds words, highlights a passage in one of four colors and writes a note on
// it; their highlights follow them across devices (…/annotations, as W3C Web Annotation selectors).
// Time on each page is kept (reading.page: visible, and active with gaps over 2 minutes not counted),
// and so are highlights, notes and searches. What the AI is shown (the page in view, what is selected,
// the highlights there, or the whole document) comes from the page's own text, as the panel allows.
import { BASE, CONFIG, IDLE, QUERY, button, el, emit, icon, post, ready, visitor } from './core.js';

const COLORS = ['yellow', 'green', 'blue', 'pink'];
const SWATCH = { yellow: '#facc15', green: '#4ade80', blue: '#60a5fa', pink: '#f472b6' };

export function reading(panel, api) {
  const wrap = el('div', 'ws-page reading');
  const lib = window.ViablePdf;
  const sees = (panel.sees || []).length > 0;
  // --- The bar: pages, zoom, find, highlights ---
  const bar = el('div', 'rd-bar');
  const prev = button('rd-btn', icon('left', 16), () => go(current - 1)); prev.setAttribute('aria-label', 'Previous page');
  const next = button('rd-btn', icon('right', 16), () => go(current + 1)); next.setAttribute('aria-label', 'Next page');
  const pageInput = el('input', 'rd-page'); pageInput.type = 'text'; pageInput.inputMode = 'numeric'; pageInput.setAttribute('aria-label', 'Page'); pageInput.value = '1';
  const of = el('span', 'rd-of', 'of …');
  const zoomOut = button('rd-btn', icon('minus', 16), () => zoom(scale / 1.15)); zoomOut.setAttribute('aria-label', 'Zoom out');
  const zoomLabel = button('rd-zoom', '100%', () => fit()); zoomLabel.setAttribute('aria-label', 'Fit to width');
  const zoomIn = button('rd-btn', icon('plus', 16), () => zoom(scale * 1.15)); zoomIn.setAttribute('aria-label', 'Zoom in');
  const find = el('input', 'rd-find'); find.type = 'search'; find.placeholder = 'Find'; find.setAttribute('aria-label', 'Find in the document');
  const found = el('span', 'rd-found');
  const listButton = button('rd-btn wide', [icon('marker', 15), el('span', null, 'Highlights')], () => toggleList());
  bar.append(el('span', 'rd-group', null), find, found, el('span', 'ws-grow'), listButton);
  bar.firstChild.append(prev, pageInput, of, next, el('span', 'rd-sep'), zoomOut, zoomLabel, zoomIn);
  if (!panel.highlights) listButton.hidden = true;
  const scroller = el('div', 'rd-scroll');
  scroller.tabIndex = 0;
  scroller.setAttribute('aria-label', panel.document?.title || panel.title);
  const pagesBox = el('div', 'rd-pages');
  scroller.append(pagesBox);
  const status = el('p', 'rd-status', 'Opening the document…');
  pagesBox.append(status);
  const list = el('aside', 'rd-list'); list.hidden = true; list.setAttribute('aria-label', 'Highlights and notes');
  const tools = el('div', 'rd-tools'); tools.hidden = true; tools.setAttribute('role', 'toolbar'); tools.setAttribute('aria-label', 'Highlight the selection');
  wrap.append(bar, scroller, list, tools);
  if (api.aiAvailable) {
    const note = el('p', 'ws-note-line rd-sees');
    note.append(icon(sees ? 'eye' : 'eyeOff', 13), el('span', null, api.seesSentence(panel)));
    wrap.append(note);
  }

  let doc = null, pageCount = 0, scale = 1, base = null, current = Math.max(1, panel.start_page || 1);
  const pages = new Map(); // number → { box, canvas, text, marks, rendered, task, textContent, string }
  let notes = [];
  const clocks = new Map(); // page → { visible, active, since, last }

  // --- Opening and drawing ---
  async function open() {
    if (!lib) { status.textContent = 'The reader couldn’t load. Reload the page.'; return; }
    lib.GlobalWorkerOptions.workerSrc = CONFIG.pdf.worker;
    // The file comes for this visitor only (the page's gate), so it is fetched here and handed over.
    let data;
    try {
      await ready;
      const res = await fetch(BASE + '/reading/' + encodeURIComponent(panel.id) + QUERY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor: visitor() }) });
      if (!res.ok) { const failed = await res.json().catch(() => ({})); status.textContent = (res.status === 403 && failed.error && failed.error.message) || 'This document couldn’t be opened. Ask your teacher to check it.'; return; }
      data = new Uint8Array(await res.arrayBuffer());
    } catch (error) { status.textContent = 'This document couldn’t be opened. Check your connection and reload.'; return; }
    try {
      doc = await lib.getDocument({ data, cMapUrl: CONFIG.pdf.data + 'cmaps/', cMapPacked: true, standardFontDataUrl: CONFIG.pdf.data + 'standard_fonts/', wasmUrl: CONFIG.pdf.data + 'wasm/', isEvalSupported: false, enableXfa: false }).promise;
    } catch (error) { status.textContent = 'This document couldn’t be opened. Ask your teacher to check it.'; return; }
    pageCount = doc.numPages;
    of.textContent = 'of ' + pageCount;
    api.setBadge(panel.id, pageCount + ' pages');
    const first = await doc.getPage(1);
    base = first.getViewport({ scale: 1 });
    status.remove();
    for (let n = 1; n <= pageCount; n += 1) {
      const box = el('div', 'rd-sheet'); box.dataset.page = String(n);
      const canvas = el('canvas', 'rd-canvas'); const text = el('div', 'textLayer'); const marks = el('div', 'rd-marks');
      box.append(canvas, marks, text, el('span', 'rd-num', String(n)));
      pagesBox.append(box);
      pages.set(n, { box, canvas, text, marks, rendered: 0, task: null, textContent: null, string: '' });
    }
    fit();
    seen.disconnect(); pages.forEach((entry) => seen.observe(entry.box));
    if (current > 1) requestAnimationFrame(() => go(current, true));
    loadNotes();
  }
  function layout() {
    for (const entry of pages.values()) {
      const width = Math.floor(base.width * scale), height = Math.floor(base.height * scale);
      entry.box.style.width = width + 'px'; entry.box.style.height = height + 'px';
      if (entry.rendered && entry.rendered !== scale) entry.rendered = 0;
    }
    zoomLabel.textContent = Math.round(scale * 100) + '%';
    pages.forEach((entry, n) => { if (near(n)) draw(n); });
  }
  const near = (n) => Math.abs(n - current) <= 2;
  async function draw(n) {
    const entry = pages.get(n);
    if (!entry || entry.rendered === scale || entry.drawing === scale) return;
    entry.drawing = scale;
    const at = scale;
    try {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: at });
      const ratio = window.devicePixelRatio || 1;
      entry.canvas.width = Math.floor(viewport.width * ratio); entry.canvas.height = Math.floor(viewport.height * ratio);
      entry.canvas.style.width = Math.floor(viewport.width) + 'px'; entry.canvas.style.height = Math.floor(viewport.height) + 'px';
      if (entry.task) entry.task.cancel();
      entry.task = page.render({ canvas: entry.canvas, canvasContext: entry.canvas.getContext('2d'), viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null });
      await entry.task.promise;
      if (!entry.textContent) { entry.textContent = await page.getTextContent(); entry.string = entry.textContent.items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join(''); }
      entry.text.replaceChildren();
      entry.box.style.setProperty('--scale-factor', String(at)); entry.box.style.setProperty('--total-scale-factor', String(at));
      const layer = new lib.TextLayer({ textContentSource: entry.textContent, container: entry.text, viewport });
      await layer.render();
      entry.spans = layer.textDivs || [...entry.text.querySelectorAll('span')];
      entry.text.append(el('div', 'endOfContent'));
      entry.rendered = at;
      paint(n);
      if (query) markFound(n);
    } catch (error) { if (error && error.name !== 'RenderingCancelledException') entry.rendered = 0; }
    finally { if (entry.drawing === at) entry.drawing = 0; }
  }
  function fit() {
    const width = Math.max(240, scroller.clientWidth - 48);
    scale = Math.min(2.5, Math.max(0.4, width / base.width));
    layout();
  }
  function zoom(value) { if (!base) return; const keep = current; scale = Math.min(4, Math.max(0.4, value)); layout(); go(keep, true); }

  // --- Which page is in view, and time on it ---
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const n = Number(entry.target.dataset.page);
      const clock = clocks.get(n) || { visible: 0, active: 0, since: 0, last: 0 };
      clocks.set(n, clock);
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) { if (!clock.since && !document.hidden) clock.since = Date.now(); }
      else stopClock(n);
    }
    // The page most in view is the current one.
    const visible = [...pages.entries()].map(([n, entry]) => [n, overlap(entry.box)]).filter(([, area]) => area > 0).sort((a, b) => b[1] - a[1]);
    if (visible.length) setCurrent(visible[0][0]);
  }, { root: scroller, threshold: [0, 0.5, 1] });
  const overlap = (box) => { const a = box.getBoundingClientRect(), b = scroller.getBoundingClientRect(); return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); };
  function stopClock(n) {
    const clock = clocks.get(n);
    if (!clock || !clock.since) return;
    clock.visible += Date.now() - clock.since; clock.since = 0; clock.last = 0;
    if (clock.visible >= 1500) { emit(panel.id, 'page', { page: n, visible_ms: clock.visible, active_ms: clock.active }); }
    clock.visible = 0; clock.active = 0;
  }
  const touch = () => { const clock = clocks.get(current); if (!clock || !clock.since) return; const now = Date.now(); if (clock.last) clock.active += Math.min(now - clock.last, IDLE); clock.last = now; api.touch(); };
  ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((type) => scroller.addEventListener(type, touch, { passive: true }));
  scroller.addEventListener('scroll', () => { touch(); hideTools(); }, { passive: true });
  function setCurrent(n) {
    if (n === current && pageInput.value === String(n)) return;
    current = n; pageInput.value = String(n);
    prev.disabled = n <= 1; next.disabled = n >= pageCount;
    pages.forEach((entry, k) => { if (near(k)) draw(k); });
  }
  function go(n, instant) {
    if (!pageCount) return;
    const target = Math.min(pageCount, Math.max(1, Math.round(n) || 1));
    const entry = pages.get(target);
    if (!entry) return;
    scroller.scrollTo({ top: entry.box.offsetTop - 12, behavior: instant ? 'auto' : 'smooth' });
    setCurrent(target);
  }
  pageInput.addEventListener('change', () => go(Number(pageInput.value)));
  pageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(Number(pageInput.value)); pageInput.blur(); } });
  scroller.addEventListener('keydown', (e) => {
    if (e.target !== scroller) return;
    if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !e.shiftKey)) { e.preventDefault(); go(current + 1); }
    if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !e.shiftKey)) { e.preventDefault(); go(current - 1); }
  });
  let resizing = 0;
  new ResizeObserver(() => { if (!base) return; clearTimeout(resizing); resizing = setTimeout(() => { const keep = current; fit(); go(keep, true); }, 150); }).observe(scroller);

  // --- Finding words ---
  let query = '', hits = [], hit = -1, findTimer = 0;
  find.addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(search, 300); });
  find.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { find.value = ''; search(); } });
  async function search() {
    query = find.value.trim().toLowerCase();
    hits = []; hit = -1;
    pages.forEach((entry) => entry.box.querySelectorAll('.rd-hit').forEach((node) => node.remove()));
    if (!query || !doc) { found.textContent = ''; return; }
    found.textContent = 'Finding…';
    for (let n = 1; n <= pageCount; n += 1) {
      const entry = pages.get(n);
      if (!entry.textContent) { const page = await doc.getPage(n); entry.textContent = await page.getTextContent(); entry.string = entry.textContent.items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join(''); }
      const text = entry.string.toLowerCase();
      for (let at = text.indexOf(query); at >= 0; at = text.indexOf(query, at + query.length)) hits.push({ page: n, start: at, end: at + query.length });
    }
    found.textContent = hits.length ? hits.length + ' found' : 'Not found';
    emit(panel.id, 'search', { chars: query.length, results: hits.length });
    pages.forEach((entry, n) => { if (entry.rendered) markFound(n); });
    if (hits.length) step(1);
  }
  function step(by) {
    if (!hits.length) return;
    hit = (hit + by + hits.length) % hits.length;
    found.textContent = (hit + 1) + ' of ' + hits.length;
    go(hits[hit].page);
  }
  function markFound(n) {
    const entry = pages.get(n);
    entry.box.querySelectorAll('.rd-hit').forEach((node) => node.remove());
    hits.filter((item) => item.page === n).forEach((item) => rects(n, item.start, item.end).forEach((r) => { const box = el('i', 'rd-hit'); place(box, r); entry.marks.append(box); }));
  }

  // --- Offsets in a page's text, and where they are on screen ---
  // Each text span is one text item; the page's text is their strings joined (with line ends), so an
  // offset maps to a span and a character in it.
  function spanAt(entry, offset) {
    let at = 0;
    const items = entry.textContent.items;
    for (let i = 0; i < items.length; i += 1) {
      const len = items[i].str.length;
      if (offset <= at + len) return { index: i, char: offset - at };
      at += len + (items[i].hasEOL ? 1 : 0);
    }
    return { index: items.length - 1, char: items.at(-1)?.str.length || 0 };
  }
  function rects(n, start, end) {
    const entry = pages.get(n);
    if (!entry || !entry.spans || !entry.textContent) return [];
    const a = spanAt(entry, start), b = spanAt(entry, end);
    const range = document.createRange();
    const node = (index) => entry.spans[index] && (entry.spans[index].firstChild || entry.spans[index]);
    try {
      const from = node(a.index), to = node(b.index);
      if (!from || !to) return [];
      range.setStart(from, Math.min(a.char, from.length ?? 0)); range.setEnd(to, Math.min(b.char, to.length ?? 0));
    } catch { return []; }
    const origin = entry.box.getBoundingClientRect();
    return [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5).map((r) => ({ left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height }));
  }
  const place = (node, r) => { node.style.left = r.left + 'px'; node.style.top = r.top + 'px'; node.style.width = r.width + 'px'; node.style.height = r.height + 'px'; };
  // The offsets of a selection within one page's text.
  function selected() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const sheet = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest('.rd-sheet');
    const box = sheet(range.startContainer);
    if (!box || box !== sheet(range.endContainer)) return null;
    const n = Number(box.dataset.page);
    const entry = pages.get(n);
    if (!entry || !entry.spans) return null;
    const startOf = (index) => { let at = 0; for (let i = 0; i < index; i += 1) at += entry.textContent.items[i].str.length + (entry.textContent.items[i].hasEOL ? 1 : 0); return at; };
    const inside = (node) => (node.nodeType === 1 ? [node, ...node.querySelectorAll('span')] : []).map((item) => entry.spans.indexOf(item)).filter((i) => i >= 0);
    const offsetOf = (container, offset, edge) => {
      if (container.nodeType === 1 && container.classList.contains('endOfContent')) { offset = [...container.parentNode.childNodes].indexOf(container); container = container.parentNode; }
      const span = (container.nodeType === 1 ? container : container.parentElement).closest('.textLayer span');
      const index = entry.spans.indexOf(span);
      if (index >= 0) return startOf(index) + (container.nodeType === 3 ? offset : offset > 0 ? entry.textContent.items[index].str.length : 0);
      // A drag that ends past a line's end (or starts before a line) lands between the spans: take the
      // nearest span on the selection's side of that point.
      if (container.nodeType === 3) { offset = [...container.parentNode.childNodes].indexOf(container) + (edge === 'end' ? 0 : 1); container = container.parentNode; }
      const kids = [...container.childNodes];
      if (edge === 'end') {
        for (let i = Math.min(offset, kids.length) - 1; i >= 0; i -= 1) { const found = inside(kids[i]); if (found.length) { const last = found[found.length - 1]; return startOf(last) + entry.textContent.items[last].str.length; } }
      } else {
        for (let i = offset; i < kids.length; i += 1) { const found = inside(kids[i]); if (found.length) return startOf(found[0]); }
      }
      return null;
    };
    const start = offsetOf(range.startContainer, range.startOffset, 'start'), end = offsetOf(range.endContainer, range.endOffset, 'end');
    if (start == null || end == null || end <= start) return null;
    const exact = entry.string.slice(start, end);
    if (!exact.trim()) return null;
    return { page: n, start, end, exact, prefix: entry.string.slice(Math.max(0, start - 32), start), suffix: entry.string.slice(end, end + 32), rect: range.getBoundingClientRect() };
  }

  // --- Highlights and notes ---
  async function loadNotes() {
    if (!panel.highlights) return;
    try { const data = await post('/annotations', { panel: panel.id, action: 'list' }); notes = data.data || []; } catch { notes = []; }
    pages.forEach((entry, n) => { if (entry.rendered) paint(n); });
    renderList();
  }
  const positionOf = (note) => (note.target?.selector || []).find((entry) => entry.type === 'TextPositionSelector');
  const quoteOf = (note) => (note.target?.selector || []).find((entry) => entry.type === 'TextQuoteSelector')?.exact || '';
  // Where a highlight is: its offsets, or (if the text moved) its quote found again on the page.
  function where(note) {
    const entry = pages.get(note.page);
    if (!entry || !entry.string) return null;
    const position = positionOf(note), quote = quoteOf(note);
    if (position && entry.string.slice(position.start, position.end) === quote) return position;
    const at = quote ? entry.string.indexOf(quote) : -1;
    return at >= 0 ? { start: at, end: at + quote.length } : null;
  }
  function paint(n) {
    const entry = pages.get(n);
    if (!entry) return;
    entry.marks.querySelectorAll('.rd-mark').forEach((node) => node.remove());
    for (const note of notes.filter((item) => item.page === n)) {
      const spot = where(note);
      if (!spot) continue;
      rects(n, spot.start, spot.end).forEach((r, i) => {
        const mark = el('button', 'rd-mark ' + (note.color || 'yellow'));
        mark.type = 'button'; place(mark, r);
        mark.setAttribute('aria-label', 'Highlight: ' + quoteOf(note).slice(0, 80) + (note.note ? '. Note: ' + note.note : ''));
        if (i) mark.tabIndex = -1;
        if (note.note && i === 0) mark.classList.add('has-note');
        mark.onclick = (e) => { e.stopPropagation(); edit(note, mark.getBoundingClientRect()); };
        entry.marks.append(mark);
      });
    }
  }
  // The toolbar by a selection: a color makes a highlight, Note makes one and opens its note, Ask
  // puts the passage in the chat (where the AI sees it).
  let pending = null;
  const swatches = COLORS.map((color) => { const b = button('rd-swatch ' + color, null, () => highlight(color)); b.setAttribute('aria-label', 'Highlight ' + color); b.style.setProperty('--swatch', SWATCH[color]); return b; });
  const noteButton = button('rd-tool', [icon('note', 14), el('span', null, 'Note')], () => highlight('yellow', true));
  const askButton = button('rd-tool', [icon('chat', 14), el('span', null, 'Ask')], () => { if (!pending) return; api.askAi('About this passage: “' + pending.exact.slice(0, 400).replace(/\s+/g, ' ').trim() + '” '); hideTools(); });
  if (panel.highlights) tools.append(...swatches);
  if (panel.highlights && panel.notes) tools.append(noteButton);
  if (api.aiAvailable) tools.append(askButton);
  // Dragging past a line's end ends the selection at that line, as pdf.js's own viewer does
  // (TextLayerBuilder): while selecting, the layer's endOfContent covers it, placed just after the
  // point being dragged; Firefox and Chromium 148+ select well without it.
  const layers = () => [...pages.values()].map((entry) => entry.text).filter(Boolean);
  const reset = (layer) => { const end = layer.querySelector('.endOfContent'); if (end) { layer.append(end); end.style.userSelect = ''; } layer.classList.remove('selecting'); };
  const chromium = navigator.userAgentData ? navigator.userAgentData.brands.find((brand) => brand.brand === 'Chromium')?.version : /\bChrome\/(\d+)\b/.exec(navigator.userAgent)?.[1];
  const native = /firefox/i.test(navigator.userAgent) || Number.parseInt(chromium, 10) >= 148;
  let held = false, previous = null;
  document.addEventListener('pointerdown', () => { held = true; });
  document.addEventListener('pointerup', () => { held = false; layers().forEach(reset); });
  window.addEventListener('blur', () => { held = false; layers().forEach(reset); });
  document.addEventListener('keyup', () => { if (!held) layers().forEach(reset); });
  document.addEventListener('selectionchange', () => {
    const selection = document.getSelection();
    if (!selection || !selection.rangeCount) { layers().forEach(reset); previous = null; }
    else {
      const range = selection.getRangeAt(0);
      layers().forEach((layer) => (range.intersectsNode(layer) ? layer.classList.add('selecting') : reset(layer)));
      if (!native) {
        const modifyStart = previous && (range.compareBoundaryPoints(Range.END_TO_END, previous) === 0 || range.compareBoundaryPoints(Range.START_TO_END, previous) === 0);
        let anchor = modifyStart ? range.startContainer : range.endContainer;
        if (anchor.nodeType === 3) anchor = anchor.parentNode;
        if (!modifyStart && range.endOffset === 0) {
          do { while (anchor && !anchor.previousSibling) anchor = anchor.parentNode; anchor = anchor && anchor.previousSibling; } while (anchor && !anchor.childNodes.length);
        }
        const layer = anchor && anchor.parentElement && anchor.parentElement.closest('.textLayer');
        const end = layer && layer.querySelector('.endOfContent');
        if (end && anchor !== end) { end.style.userSelect = 'text'; anchor.parentElement.insertBefore(end, modifyStart ? anchor : anchor.nextSibling); }
        previous = range.cloneRange();
      }
    }
    if (tools.contains(document.activeElement)) return;
    const s = selected();
    if (!s || (!panel.highlights && !api.aiAvailable)) { if (!tools.matches(':hover')) hideTools(); return; }
    pending = s;
    const origin = wrap.getBoundingClientRect();
    tools.hidden = false;
    tools.style.left = Math.max(8, Math.min(origin.width - tools.offsetWidth - 8, s.rect.left - origin.left + s.rect.width / 2 - tools.offsetWidth / 2)) + 'px';
    tools.style.top = Math.max(8, s.rect.top - origin.top - tools.offsetHeight - 10) + 'px';
  });
  function hideTools() { tools.hidden = true; pending = null; }
  async function highlight(color, withNote) {
    const s = pending;
    if (!s) return;
    hideTools();
    document.getSelection()?.removeAllRanges();
    const target = { selector: [{ type: 'TextQuoteSelector', exact: s.exact, prefix: s.prefix, suffix: s.suffix }, { type: 'TextPositionSelector', start: s.start, end: s.end }] };
    try {
      const note = await post('/annotations', { panel: panel.id, page: s.page, target, color });
      notes.push(note); paint(s.page); renderList();
      emit(panel.id, 'highlight', { page: s.page, color, chars: s.exact.length });
      if (withNote) { const first = pages.get(s.page).marks.querySelector('.rd-mark:last-of-type'); edit(note, first ? first.getBoundingClientRect() : s.rect); }
    } catch (error) { flash(error.message); }
  }
  // A highlight's own card: its note, its color, and removing it.
  const card = el('div', 'rd-card'); card.hidden = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Highlight');
  wrap.append(card);
  function edit(note, rect) {
    card.replaceChildren();
    const quote = el('blockquote', 'rd-quote', quoteOf(note));
    const colors = el('div', 'rd-colors');
    COLORS.forEach((color) => { const b = button('rd-swatch ' + color + (note.color === color ? ' on' : ''), null, () => save({ color })); b.setAttribute('aria-label', color); b.style.setProperty('--swatch', SWATCH[color]); colors.append(b); });
    const remove = button('rd-tool danger', [icon('trash', 14), el('span', null, 'Remove')], async () => {
      try { await post('/annotations', { panel: panel.id, action: 'remove', id: note.id }); notes = notes.filter((item) => item.id !== note.id); paint(note.page); renderList(); emit(panel.id, 'highlight', { page: note.page, color: note.color, chars: quoteOf(note).length, removed: true }); card.hidden = true; }
      catch (error) { flash(error.message); }
    });
    card.append(quote, colors);
    let text = null;
    if (panel.notes) {
      text = el('textarea', 'rd-note'); text.placeholder = 'Write a note…'; text.value = note.note || ''; text.maxLength = 2000; text.setAttribute('aria-label', 'Your note');
      card.append(text);
    }
    const close = button('rd-tool', 'Done', async () => { if (text && (text.value.trim() || null) !== (note.note || null)) await save({ note: text.value }); card.hidden = true; });
    const row = el('div', 'rd-row'); row.append(remove, el('span', 'ws-grow'), close);
    card.append(row);
    async function save(change) {
      try {
        const updated = await post('/annotations', { panel: panel.id, id: note.id, page: note.page, color: change.color || note.color, note: change.note !== undefined ? change.note : note.note });
        Object.assign(note, updated); paint(note.page); renderList();
        if (change.note !== undefined && updated.note) emit(panel.id, 'note', { page: note.page, chars: updated.note.length });
        if (change.color) colors.querySelectorAll('.rd-swatch').forEach((b) => b.classList.toggle('on', b.classList.contains(note.color)));
      } catch (error) { flash(error.message); }
    }
    const origin = wrap.getBoundingClientRect();
    card.hidden = false;
    card.style.left = Math.max(8, Math.min(origin.width - card.offsetWidth - 8, rect.left - origin.left)) + 'px';
    card.style.top = Math.min(origin.height - card.offsetHeight - 8, rect.bottom - origin.top + 8) + 'px';
    (text || close).focus();
  }
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden) { card.hidden = true; } });
  scroller.addEventListener('pointerdown', (e) => { if (!card.contains(e.target)) card.hidden = true; });
  function toggleList(open = list.hidden) { list.hidden = !open; listButton.setAttribute('aria-expanded', String(open)); if (open) renderList(); }
  function renderList() {
    listButton.lastChild.textContent = notes.length ? 'Highlights · ' + notes.length : 'Highlights';
    if (list.hidden) return;
    list.replaceChildren(el('h3', null, 'Highlights and notes'));
    if (!notes.length) { list.append(el('p', 'ws-muted', 'Select text in the document to highlight it' + (panel.notes ? ' or add a note.' : '.'))); return; }
    [...notes].sort((a, b) => a.page - b.page || String(a.created_at).localeCompare(String(b.created_at))).forEach((note) => {
      const item = button('rd-item', null, () => { go(note.page); });
      item.append(el('span', 'rd-item-page', 'Page ' + note.page), el('span', 'rd-item-quote ' + (note.color || 'yellow'), quoteOf(note)));
      if (note.note) item.append(el('span', 'rd-item-note', note.note));
      list.append(item);
    });
  }
  let flashTimer = 0;
  const toast = el('p', 'rd-toast'); toast.hidden = true; toast.setAttribute('role', 'status'); wrap.append(toast);
  function flash(text) { toast.textContent = text; toast.hidden = false; clearTimeout(flashTimer); flashTimer = setTimeout(() => { toast.hidden = true; }, 4000); }

  // --- What the AI is shown ---
  let documentText = null;
  async function wholeText() {
    if (documentText !== null || !doc) return documentText || '';
    const out = [];
    for (let n = 1; n <= pageCount && out.join('').length < 30000; n += 1) {
      const entry = pages.get(n);
      if (!entry.textContent) { const page = await doc.getPage(n); entry.textContent = await page.getTextContent(); entry.string = entry.textContent.items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join(''); }
      out.push('[Page ' + n + ']\n' + entry.string.trim());
    }
    documentText = out.join('\n\n');
    return documentText;
  }
  // The whole document's text is read once, in the background, where the AI may see it.
  if ((panel.context || {}).document) ready.then(() => setTimeout(() => { wholeText().catch(() => {}); }, 1500));

  ready.then(open);
  return {
    el: wrap,
    state: () => {
      const entry = pages.get(current);
      const selection = selected();
      return {
        panel: panel.id, page: current, pages: pageCount || null,
        page_text: entry && entry.string ? entry.string.slice(0, 8000) : undefined,
        selection: selection ? selection.exact.slice(0, 1500) : undefined,
        highlights: notes.filter((note) => note.page === current).slice(0, 12).map((note) => ({ quote: quoteOf(note).slice(0, 300), note: note.note || null })),
        document_text: documentText ? documentText.slice(0, 30000) : undefined
      };
    },
    hide: () => { stopClock(current); hideTools(); card.hidden = true; },
    resume: () => { const clock = clocks.get(current); if (clock && !clock.since && !document.hidden) clock.since = Date.now(); }
  };
}
