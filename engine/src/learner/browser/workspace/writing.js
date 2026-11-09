// A writing task: its prompt, a rubric in a drawer (optionally ticked off as the learner checks their
// work), an optional plan beside the draft (an outline the author gave to start from), and the draft,
// saved as the learner writes (it follows them across devices) and handed in when they're done.
//
// How it is written is recorded as counts and timings: what was typed, deleted and pasted (and
// whether a paste came from the AI's answers), pauses of 2 s or more, bursts of writing between them
// (P-bursts) and those ended by a revision (R-bursts), edits inside the text against those at its
// end, active time with idle gaps capped at 2 minutes, when each field was first changed, and
// snapshots of the text when the writer pauses (the versions the AI may be shown).
import { IDLE, button, el, emit, flush, icon, plural, post, ready, replies, rich, visitor, words } from './core.js';

// Earlier writing, from this or another device, once the visitor may use the page. A failed load is
// tried again three times; after that it resolves to undefined (the writing stays closed, with a way
// to try again: fresh). A refusal (the activity closed, or isn't open for them) isn't tried again: it
// resolves to the refusal.
let draftsPromise = null;
function loadDrafts(fresh = false) {
  if (draftsPromise && !fresh) return draftsPromise;
  draftsPromise = ready.then(() => new Promise((resolve) => {
    const attempt = (n) => post('/draft', { action: 'load' }).then((data) => resolve(data.drafts || {}))
      .catch((error) => { if (error.status === 403) resolve({ refused: error.message }); else if (n < 3) setTimeout(() => attempt(n + 1), [2000, 5000, 10000][n]); else resolve(undefined); });
    attempt(0);
  }));
  return draftsPromise;
}

export function writing(panel, api) {
  const wrap = el('div', 'ws-page writing' + (panel.plan ? ' has-plan' : ''));
  const head = el('header', 'ws-ph');
  // The kind above the title, unless the title already says it.
  head.append(...(panel.title.trim().toLowerCase() === 'writing' ? [] : [el('p', 'ws-eyebrow', 'Writing')]), el('h2', 'ws-h', panel.title));
  const chips = el('div', 'ws-chips');
  const target = [panel.min_words && 'at least ' + panel.min_words, panel.max_words && 'at most ' + panel.max_words].filter(Boolean).join(', ');
  if (target) chips.append(el('span', 'ws-chip', target + ' words'));
  const handedChip = el('span', 'ws-chip ok');
  handedChip.hidden = true;
  chips.append(handedChip);
  head.append(chips);
  wrap.append(head);

  if (panel.prompt) {
    const task = el('section', 'ws-card ws-task');
    task.append(el('p', 'ws-label', 'Your task'), rich(panel.prompt, 'ws-task-text'));
    wrap.append(task);
  }

  // The rubric, in a drawer the learner opens beside their writing.
  let rubricOpen = 0;
  let drawer = null;
  const checks = new Set();
  if (panel.rubric && panel.rubric.length) {
    drawer = el('aside', 'ws-drawer');
    drawer.setAttribute('aria-label', 'Rubric');
    drawer.hidden = true;
    const top = el('div', 'ws-drawer-head');
    top.append(el('strong', null, 'How this will be judged'), button('icon-btn', icon('close', 16), () => toggleRubric(false)));
    const list = el('ol', 'ws-criteria');
    panel.rubric.forEach((row, i) => {
      const li = el('li', 'ws-criterion');
      const text = el('div');
      text.append(el('b', null, row.criterion));
      if (row.description) text.append(rich(row.description, 'ws-criterion-text'));
      if (panel.self_check) {
        const box = el('input');
        box.type = 'checkbox';
        box.setAttribute('aria-label', 'I’ve checked my writing for: ' + row.criterion);
        box.addEventListener('change', () => { if (box.checked) checks.add(i); else checks.delete(i); emit(panel.id, 'rubric_check', { criterion: i, checked: box.checked }); updateRubricButton(); });
        const label = el('label', 'ws-check');
        label.append(box, text);
        li.append(label);
      } else li.append(text);
      list.append(li);
    });
    drawer.append(top, list);
    if (panel.self_check) drawer.append(el('p', 'ws-muted', 'Tick each one once you’ve checked your writing for it.'));
    wrap.append(drawer);
  }
  const rubricButton = drawer ? button('ws-btn ghost', [icon('rubric', 15), el('span', null, 'Rubric')], () => toggleRubric(drawer.hidden)) : null;
  function updateRubricButton() { if (rubricButton && panel.self_check) rubricButton.lastChild.textContent = 'Rubric · ' + checks.size + '/' + panel.rubric.length; }
  function toggleRubric(on) {
    if (!drawer) return;
    drawer.hidden = !on;
    rubricButton.setAttribute('aria-expanded', String(on));
    if (on) rubricOpen = Date.now();
    else if (rubricOpen) { emit(panel.id, 'rubric', { visible_ms: Date.now() - rubricOpen }); rubricOpen = 0; }
  }

  // The plan and the draft: side by side where there is room, else one at a time.
  const area = el('div', 'ws-write' + (panel.plan ? ' has-plan' : ''));
  const fields = {};
  const seg = el('div', 'ws-seg');
  seg.setAttribute('role', 'tablist');
  const field = (name, label, placeholder) => {
    const col = el('div', 'ws-col ' + name);
    const id = 'ws-' + panel.id + '-' + name;
    const lab = el('label', 'ws-label', label);
    lab.htmlFor = id;
    const text = el('textarea', 'ws-paper' + (name === 'plan' ? ' plan' : ''));
    text.id = id; text.spellcheck = true;
    // Read-only until earlier writing has loaded, so nothing typed is lost or saved over it.
    text.readOnly = true; text.placeholder = 'Loading your writing…';
    text.dataset.placeholder = placeholder;
    col.append(lab, text);
    area.append(col);
    fields[name] = { text, col, stats: blank(), last: '', composing: false, pasting: null, lastInput: 0, burst: 0, revised: false, snapshotAt: 0, changed: false, pauseTimer: 0, started: false };
    if (panel.plan) {
      const tab = button('ws-seg-btn', label, () => show(name));
      tab.setAttribute('role', 'tab');
      tab.dataset.field = name;
      seg.append(tab);
    }
    return text;
  };
  if (panel.plan) field('plan', panel.plan.label || 'Plan', 'Notes, an outline, your ideas.');
  field('draft', panel.plan ? 'Draft' : 'Your writing', 'Start writing…');
  function show(name) {
    area.dataset.show = name;
    seg.querySelectorAll('.ws-seg-btn').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.field === name)));
    fields[name].text.focus();
  }
  if (panel.plan) { wrap.append(seg); area.dataset.show = 'draft'; seg.querySelectorAll('.ws-seg-btn').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.field === 'draft'))); }
  wrap.append(area);

  // The footer: the words against the target, whether it is saved, the rubric and Hand in.
  const foot = el('footer', 'ws-foot');
  const count = el('div', 'ws-count');
  const countText = el('span');
  const meter = el('span', 'ws-meter');
  const meterFill = el('i');
  meter.append(meterFill);
  count.append(countText);
  if (panel.min_words || panel.max_words) count.append(meter);
  const status = el('span', 'ws-save');
  const heard = el('span', 'sr');
  heard.setAttribute('role', 'alert');
  const submit = button('ws-btn primary', 'Hand in', () => {
    const n = words(fields.draft.text.value);
    if (panel.min_words && n < panel.min_words && !confirm('Your writing has ' + n + ' words, fewer than the ' + panel.min_words + ' asked for. Hand it in anyway?')) return;
    // Handed in once, it can't be changed: say so before.
    if (panel.lock_on_submit && !confirm('Once you hand this in, you can’t change it. Hand it in now?')) return;
    save(true);
  });
  foot.append(count, status, el('span', 'ws-grow'), heard);
  if (rubricButton) foot.append(rubricButton);
  if (panel.submit !== false) foot.append(submit);
  wrap.append(foot);
  const note = el('p', 'ws-note-line');
  note.append(icon((panel.sees || []).length ? 'eye' : 'eyeOff', 13), el('span', null, api.seesSentence(panel)));
  if (api.aiAvailable) wrap.append(note);

  function setStatus(kind, text) {
    status.className = 'ws-save ' + kind;
    status.replaceChildren(icon(kind === 'error' ? 'alert' : kind === 'saved' ? 'check' : 'cloud', 13), el('span', null, text));
    if (kind === 'error' || /^Handed in/.test(text)) { heard.textContent = ''; setTimeout(() => { heard.textContent = text; }, 60); }
  }
  function blank() { return { keys: 0, deleted: 0, pasted: 0, pastes: 0, pasted_from_ai: 0, pauses: 0, pause_ms: 0, longest_pause_ms: 0, p_bursts: 0, r_bursts: 0, burst_chars: 0, inside_edits: 0, leading_edits: 0, active_ms: 0 }; }
  function grow(text) { text.style.height = 'auto'; text.style.height = Math.max(text.scrollHeight, 0) + 'px'; }
  function updateCount() {
    const n = words(fields.draft.text.value);
    countText.textContent = plural(n, 'word');
    const goal = panel.min_words || panel.max_words;
    count.className = 'ws-count' + (panel.min_words && n < panel.min_words ? ' short' : panel.max_words && n > panel.max_words ? ' long' : goal ? ' ok' : '');
    if (goal) meterFill.style.width = Math.min(100, Math.round(n / (panel.max_words || panel.min_words) * 100)) + '%';
    if (!handed) api.setBadge(panel.id, n ? plural(n, 'word') : null);
  }
  // A burst ends at a pause of 2 s or more; one ended by deleting is a revision burst.
  const endBurst = (f) => { if (f.burst > 0) { f.stats.p_bursts += 1; f.stats.burst_chars += f.burst; if (f.revised) f.stats.r_bursts += 1; } f.burst = 0; f.revised = false; };
  Object.entries(fields).forEach(([name, f]) => {
    f.text.addEventListener('compositionstart', () => { f.composing = true; });
    f.text.addEventListener('compositionend', () => { f.composing = false; changed(name, f); });
    f.text.addEventListener('paste', (e) => { f.pasting = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''; });
    f.text.addEventListener('input', () => { grow(f.text); if (!f.composing) changed(name, f); if (name === 'draft') pausing(); });
    f.text.addEventListener('blur', () => { endBurst(f); report(name, f); save(false); });
  });
  // A pause in writing, 8 s after the last key: the AI may look in, if the teacher chose that and enough new words came since it last did (the chat counts).
  let pauseTimer = 0, startWords = null;
  function pausing() {
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { if (window.VIABLE_CHAT && window.VIABLE_CHAT.speakFirst) window.VIABLE_CHAT.speakFirst('writing', { panel: panel.id, words: words(fields.draft.text.value), start: startWords || 0 }); }, 8000);
  }
  function changed(name, f) {
    const now = Date.now();
    const before = f.last;
    const after = f.text.value;
    // What changed: the text between what stayed the same at the start and at the end.
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
    let end = 0;
    while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end += 1;
    const removed = before.length - start - end;
    const inserted = after.length - start - end;
    // The first change in this field on this visit (time before planning or drafting).
    if (!f.started) { f.started = true; emit(panel.id, 'start', { field: name }); }
    const gap = f.lastInput ? now - f.lastInput : 0;
    if (gap >= 2000) { f.stats.pauses += 1; f.stats.pause_ms += gap; f.stats.longest_pause_ms = Math.max(f.stats.longest_pause_ms, gap); endBurst(f); }
    if (f.lastInput) f.stats.active_ms += Math.min(gap, IDLE);
    f.lastInput = now;
    if (f.pasting != null && inserted > 0) {
      f.stats.pasted += inserted; f.stats.pastes += 1;
      const piece = after.slice(start, start + inserted).trim();
      if (piece.length >= 20 && replies.some((reply) => reply.includes(piece.slice(0, 200)))) f.stats.pasted_from_ai += inserted;
      f.pasting = null;
    } else if (inserted > 0) { f.stats.keys += inserted; f.burst += inserted; }
    if (removed > 0) { f.stats.deleted += removed; f.revised = true; }
    // At the end of the text (the leading edge) or inside it.
    if (inserted || removed) { if (start + removed >= before.length) f.stats.leading_edits += 1; else f.stats.inside_edits += 1; }
    f.last = after;
    f.changed = true;
    dirty = true;
    api.touch();
    updateCount();
    scheduleSave();
    // A snapshot once the writer pauses for 3 s, at most every 20 s.
    clearTimeout(f.pauseTimer);
    f.pauseTimer = setTimeout(() => { if (Date.now() - f.snapshotAt >= 20000) snapshot(name, f); }, 3000);
  }
  function snapshot(name, f) {
    if (!f.changed) return;
    f.snapshotAt = Date.now(); f.changed = false;
    emit(panel.id, 'snapshot', { field: name, text: f.text.value, words: words(f.text.value) });
  }
  function report(name, f) {
    const s = f.stats;
    if (!s.keys && !s.deleted && !s.pasted) return;
    emit(panel.id, 'progress', { field: name, ...s, words: words(f.text.value), chars: f.text.value.length });
    f.stats = blank();
  }
  setInterval(() => Object.entries(fields).forEach(([name, f]) => report(name, f)), 30000);

  let saveTimer = 0;
  let saving = false;
  // Saved only once earlier writing has loaded, and only what changed since (or when handing in), over
  // the version it loaded (base): never over what was written on another device meanwhile.
  let loaded = false;
  let base = null;
  let dirty = false;
  let refused = null;
  let handed = null;
  function scheduleSave() { setStatus('pending', 'Unsaved changes'); clearTimeout(saveTimer); saveTimer = setTimeout(() => save(false), 4000); }
  function showHanded(at) {
    handed = at;
    handedChip.hidden = false;
    handedChip.replaceChildren(icon('check', 13), el('span', null, 'Handed in ' + new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })));
    api.setBadge(panel.id, 'Handed in', true);
    if (panel.lock_on_submit) {
      // Read-only from now on: what was handed in stays as it is.
      Object.values(fields).forEach((f) => { f.text.readOnly = true; });
      submit.hidden = true;
      setStatus('saved', 'Handed in. It can’t be changed now.');
      status.querySelector('.ws-i').replaceWith(icon('lock', 13));
      return;
    }
    submit.textContent = 'Hand in again';
  }
  async function save(handIn) {
    if (!loaded || refused || saving || !visitor() || (!dirty && !handIn)) return;
    clearTimeout(saveTimer);
    saving = true;
    dirty = false;
    setStatus('pending', 'Saving…');
    try {
      const data = await post('/draft', { panel: panel.id, plan: fields.plan ? fields.plan.text.value : null, draft: fields.draft.text.value, submit: handIn, base });
      base = data.updated_at || base;
      setStatus('saved', 'Saved');
      if (handIn) {
        Object.entries(fields).forEach(([name, f]) => { endBurst(f); report(name, f); snapshot(name, f); });
        emit(panel.id, 'submit', { words: words(fields.draft.text.value), chars: fields.draft.text.value.length });
        showHanded(data.submitted_at);
        // Handed in: the AI may write first about it, if the teacher chose that.
        if (window.VIABLE_CHAT && window.VIABLE_CHAT.speakFirst) window.VIABLE_CHAT.speakFirst('handed_in');
        flush(false);
      }
    } catch (error) {
      dirty = true;
      // Closed meanwhile (or not open for them): no use trying again; say why, and keep their text on screen to copy.
      if (error.status === 403) { refused = error.message; setStatus('error', error.message + ' Your latest changes aren’t saved: copy them if you need them.'); return; }
      // Handed in on another device, where it locked: the handed-in text stands.
      if (error.code === 'draft_locked') { refused = error.message; dirty = false; setStatus('error', error.message); loadDrafts(true).then((drafts) => { const saved = drafts && drafts[panel.id]; if (saved) { if (fields.plan) fields.plan.text.value = saved.plan || ''; fields.draft.text.value = saved.draft || ''; Object.values(fields).forEach((f) => { f.last = f.text.value; grow(f.text); }); updateCount(); if (saved.submitted_at) showHanded(saved.submitted_at); } }); return; }
      // Written on another device since this opened: that version stands, and is shown here.
      if (error.code === 'draft_changed' && error.details && error.details.draft) {
        const latest = error.details.draft;
        dirty = false; base = latest.updated_at || null;
        if (fields.plan) fields.plan.text.value = latest.plan || '';
        fields.draft.text.value = latest.draft || '';
        Object.values(fields).forEach((f) => { f.last = f.text.value; grow(f.text); });
        updateCount();
        setStatus('error', 'This was changed on another device, so it shows that version now. What you just wrote here isn’t saved.');
        if (latest.submitted_at) showHanded(latest.submitted_at);
        return;
      }
      setStatus('error', 'Not saved yet — trying again'); scheduleSave();
    }
    finally { saving = false; }
  }
  function open(fresh) {
    loadDrafts(fresh).then((drafts) => {
      if (drafts && drafts.refused) { loaded = true; refused = drafts.refused; setStatus('error', drafts.refused); return; }
      // Not loaded: nothing can be written over it, so the writing stays closed until it loads.
      if (drafts === undefined) {
        setStatus('error', 'Your earlier writing couldn’t be loaded.');
        status.append(button('ws-retry', 'Try again', () => { setStatus('pending', 'Loading…'); open(true); }));
        return;
      }
      loaded = true;
      setTimeout(() => { if (startWords == null) startWords = words(fields.draft.text.value); }, 0);
      Object.values(fields).forEach((f) => { f.text.readOnly = false; f.text.placeholder = f.text.dataset.placeholder; });
      const saved = drafts[panel.id];
      base = saved ? saved.updated_at || null : null;
      if (saved) {
        if (fields.plan) fields.plan.text.value = saved.plan || '';
        fields.draft.text.value = saved.draft || '';
        setStatus('saved', 'Saved');
        if (saved.submitted_at) showHanded(saved.submitted_at);
      } else { status.className = 'ws-save'; status.replaceChildren(); }
      // An empty plan starts from the author's outline (not counted as the learner's writing).
      if (fields.plan && !fields.plan.text.value && panel.plan.template) fields.plan.text.value = panel.plan.template;
      Object.values(fields).forEach((f) => { f.last = f.text.value; grow(f.text); });
      updateCount();
    });
  }
  open(false);
  updateCount();
  return {
    el: wrap,
    state: () => ({ panel: panel.id, plan: fields.plan ? fields.plan.text.value.slice(0, 3000) : undefined, draft: fields.draft.text.value.slice(0, 20000) }),
    resume: () => Object.values(fields).forEach((f) => grow(f.text)),
    hide: () => { Object.entries(fields).forEach(([name, f]) => { endBurst(f); report(name, f); snapshot(name, f); }); if (rubricOpen) { emit(panel.id, 'rubric', { visible_ms: Date.now() - rubricOpen }); rubricOpen = Date.now(); } save(false); }
  };
}
