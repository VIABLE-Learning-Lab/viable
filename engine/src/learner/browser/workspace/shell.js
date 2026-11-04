// The workspace around the panels: its bar (the course, the title, a tab per panel with how far the
// learner is), the divider between the panels and the AI (dragged, or moved with the arrow keys; the
// learner's width is kept in this browser), the AI hidden to a rail and shown again, the AI as a
// corner panel or (on narrow screens) a sheet, and what the AI sees of the open panel, said in its
// header. Time on each panel is kept here: visible while it is the open tab and the page is in view,
// active while the learner does something in it (gaps over 2 minutes not counted).
import { CONFIG, IDLE, button, el, emit, flush, icon, recorded, store } from './core.js';

const TYPE_ICON = { writing: 'pen', questions: 'list', embed: 'puzzle', reading: 'book' };
const LAYOUT = { ai_width: 36, resizable: true, collapsible: true, ...(CONFIG.layout || {}) };
// Where the AI sits, read when the shell is made (the host may have taken it away for this learner).
let AI = CONFIG.ai || 'right';
let docked = AI === 'right' || AI === 'left';
let name = CONFIG.title || 'the assistant';
const narrow = matchMedia('(max-width: 860px)');
const saved = store.get('viable-chat::ws:' + location.pathname) || {};
const state = { width: clampWidth(saved.width ?? LAYOUT.ai_width), collapsed: LAYOUT.collapsible && Boolean(saved.collapsed), current: null };
function clampWidth(value) { const n = Number(value); return Number.isFinite(n) ? Math.min(60, Math.max(24, Math.round(n))) : 36; }

export function createShell({ panels, factories }) {
  AI = CONFIG.ai || 'right';
  docked = AI === 'right' || AI === 'left';
  name = CONFIG.title || 'the assistant';
  const root = document.getElementById('ws');
  const shell = root.parentElement;
  const views = new Map();
  const clocks = new Map(panels.map((panel) => [panel.id, { visible: 0, active: 0, since: 0, last: 0 }]));
  document.body.classList.add('ws-ready');

  // --- The bar and its tabs ---
  const bar = el('header', 'ws-bar');
  const lead = el('div', 'ws-lead');
  if (CONFIG.course && CONFIG.course.url) {
    const back = el('a', 'ws-back');
    back.href = CONFIG.course.url;
    back.title = CONFIG.course.title || 'Course';
    back.append(icon('left', 15), el('span', null, CONFIG.course.title || 'Course'));
    lead.append(back);
  }
  lead.append(el('h1', 'ws-name', CONFIG.workspace_title || CONFIG.title || ''));
  bar.append(lead);
  const tabs = el('div', 'ws-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Parts of this activity');
  const badges = new Map();
  panels.forEach((panel) => {
    const tab = button('ws-tab', [icon(TYPE_ICON[panel.type] || 'panel', 15), el('span', 'ws-tab-label', panel.title)], () => open(panel));
    tab.setAttribute('role', 'tab');
    tab.id = 'ws-tab-' + panel.id;
    tab.setAttribute('aria-controls', 'ws-body');
    const badge = el('span', 'ws-badge');
    badge.hidden = true;
    tab.append(badge);
    badges.set(panel.id, badge);
    tabs.append(tab);
  });
  if (panels.length > 1) bar.append(tabs);
  // A course activity: a preview's reminder, "I'm done" where the learner says so (the chat script posts
  // it), and without an AI (whose header says who this is) a way to hand the computer on.
  const handOn = CONFIG.course && AI === 'off' && CONFIG.course.identify && CONFIG.course.identify !== 'browser' && !CONFIG.course.preview;
  if (CONFIG.course && (CONFIG.course.preview || CONFIG.course.done === 'button' || handOn)) {
    const end = el('div', 'ws-end');
    if (CONFIG.course.preview) end.append(el('span', 'ws-preview', 'Preview: not counted'));
    if (handOn) end.append(button('ws-out', CONFIG.course.shared ? 'Sign out' : 'Not you?', () => {
      // Talking stops and the microphone is let go before anything of this learner is cleared.
      if (window.VIABLE_CHAT && window.VIABLE_CHAT.hush) window.VIABLE_CHAT.hush();
      try { Object.keys(localStorage).filter((key) => key.startsWith('viable-chat:')).forEach((key) => localStorage.removeItem(key)); sessionStorage.removeItem('viable-course:here'); } catch (e) { /* storage unavailable */ }
      location.href = CONFIG.course.url;
    }));
    if (CONFIG.course.done === 'button') { const done = button('ws-done', 'I’m done'); done.setAttribute('data-done', ''); end.append(done); }
    bar.append(end);
  }
  const body = el('div', 'ws-body');
  body.id = 'ws-body';
  body.setAttribute('role', panels.length > 1 ? 'tabpanel' : 'region');
  root.append(bar, body);

  // --- Time on each panel ---
  const touch = () => { const clock = state.current && clocks.get(state.current.id); if (!clock) return; const now = Date.now(); if (clock.last) clock.active += Math.min(now - clock.last, IDLE); clock.last = now; };
  function pause() {
    const clock = state.current && clocks.get(state.current.id);
    if (!clock || !clock.since) return;
    clock.visible += Date.now() - clock.since; clock.since = 0; clock.last = 0;
    if (clock.visible > 1000) emit(state.current.id, 'view', { visible_ms: clock.visible, active_ms: clock.active });
    clock.visible = 0; clock.active = 0;
  }
  function resume() { const clock = state.current && clocks.get(state.current.id); if (clock && !document.hidden) { clock.since = Date.now(); clock.last = Date.now(); } }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((type) => root.addEventListener(type, touch, { passive: true }));
  const leaving = () => { pause(); views.forEach((view) => view.hide && view.hide()); flush(true); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) leaving(); else { resume(); views.get(state.current?.id)?.resume?.(); } });
  window.addEventListener('pagehide', leaving);

  function open(panel) {
    if (state.current && state.current.id === panel.id) return;
    pause();
    if (state.current) views.get(state.current.id)?.hide?.();
    state.current = panel;
    tabs.querySelectorAll('.ws-tab').forEach((tab) => { const on = tab.id === 'ws-tab-' + panel.id; tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; });
    if (!views.has(panel.id)) views.set(panel.id, (factories[panel.type] || factories.embed)(panel, api));
    body.replaceChildren(views.get(panel.id).el);
    body.scrollTop = 0;
    views.get(panel.id).resume?.();
    resume();
    sees();
    if (window.VIABLE_CHAT && window.VIABLE_CHAT.refresh) window.VIABLE_CHAT.refresh();
  }
  // Arrow keys move between tabs (the tablist pattern).
  tabs.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const i = panels.findIndex((panel) => panel.id === state.current?.id);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? panels.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + panels.length) % panels.length;
    e.preventDefault();
    open(panels[next]);
    document.getElementById('ws-tab-' + panels[next].id)?.focus();
  });

  // --- The AI: docked beside the panels, hidden to a rail, a corner panel, or a sheet ---
  const app = shell.querySelector('.app');
  const floating = document.getElementById('ws-ai');
  const closeButton = document.getElementById('close');
  const split = el('div', 'ws-split');
  split.setAttribute('role', 'separator');
  split.setAttribute('aria-orientation', 'vertical');
  split.setAttribute('aria-label', 'Resize the assistant');
  split.setAttribute('aria-valuemin', '24');
  split.setAttribute('aria-valuemax', '60');
  split.append(el('span', 'ws-grip'));
  const rail = button('ws-rail', [avatarClone(), el('span', 'ws-rail-label', 'Ask ' + name)], () => setCollapsed(false));
  rail.setAttribute('aria-label', 'Show ' + name);
  if (docked && AI !== 'off') {
    shell.insertBefore(split, app);
    shell.append(rail);
    if (!LAYOUT.resizable) split.classList.add('fixed');
  }
  if (docked && LAYOUT.collapsible) {
    const hide = button('icon-btn ws-hide', icon('panel', 18), () => setCollapsed(true));
    hide.setAttribute('aria-label', 'Hide ' + name);
    hide.setAttribute('data-tip', 'Hide');
    hide.setAttribute('data-tip-at', 'below');
    app.querySelector('.top')?.append(hide);
  }

  let layoutTimer = 0;
  const remember = () => store.set('viable-chat::ws:' + location.pathname, { width: state.width, collapsed: state.collapsed });
  const reportLayout = () => { clearTimeout(layoutTimer); layoutTimer = setTimeout(() => { if (state.current) emit(state.current.id, 'layout', { ai_width: state.width, collapsed: state.collapsed, ai_open: document.body.classList.contains('ai-open') }); }, 800); };
  function applyWidth() {
    document.body.style.setProperty('--ai-w', `clamp(320px, ${state.width}vw, calc(100vw - 420px))`);
    split.setAttribute('aria-valuenow', String(state.width));
    split.setAttribute('aria-valuetext', `${state.width}% of the window`);
  }
  function setCollapsed(on) {
    if (!LAYOUT.collapsible && on) return;
    state.collapsed = on;
    document.body.classList.toggle('ai-collapsed', on);
    remember(); reportLayout();
    if (!on) setTimeout(() => document.getElementById('input')?.focus(), 60);
    else rail.focus();
  }
  applyWidth();
  if (docked) document.body.classList.toggle('ai-collapsed', state.collapsed);

  // Dragging the divider: the AI's share follows the pointer (frames would swallow the moves, so
  // they ignore the pointer while dragging). Double-click puts it back to the page's width.
  split.addEventListener('pointerdown', (e) => {
    if (!LAYOUT.resizable || e.button !== 0) return;
    e.preventDefault();
    split.setPointerCapture(e.pointerId);
    document.body.classList.add('ws-dragging');
    const move = (ev) => {
      const x = ev.clientX / window.innerWidth * 100;
      state.width = clampWidth(AI === 'left' ? x : 100 - x);
      applyWidth();
    };
    const up = () => { split.removeEventListener('pointermove', move); document.body.classList.remove('ws-dragging'); remember(); reportLayout(); };
    split.addEventListener('pointermove', move);
    split.addEventListener('pointerup', up, { once: true });
    split.addEventListener('pointercancel', up, { once: true });
  });
  split.addEventListener('dblclick', () => { state.width = clampWidth(LAYOUT.ai_width); applyWidth(); remember(); reportLayout(); });
  split.tabIndex = LAYOUT.resizable ? 0 : -1;
  split.addEventListener('keydown', (e) => {
    if (!LAYOUT.resizable) return;
    // Moving the divider toward the panels widens the AI.
    const delta = { ArrowLeft: AI === 'left' ? -2 : 2, ArrowRight: AI === 'left' ? 2 : -2 }[e.key];
    if (delta) state.width = clampWidth(state.width + delta);
    else if (e.key === 'Home') state.width = 24;
    else if (e.key === 'End') state.width = 60;
    else if (e.key === 'Enter' && LAYOUT.collapsible) { setCollapsed(true); return; }
    else return;
    e.preventDefault();
    applyWidth(); remember(); reportLayout();
  });

  // The AI as a corner panel (ai: corner) or, on narrow screens, a sheet opened from the button.
  function setOpen(on) {
    document.body.classList.toggle('ai-open', on);
    if (floating) floating.setAttribute('aria-expanded', String(on));
    if (on) setTimeout(() => document.getElementById('input')?.focus(), 60);
    syncFloating(); reportLayout();
  }
  function syncFloating() {
    const isFloating = AI === 'corner' || (AI !== 'off' && narrow.matches);
    if (floating) floating.hidden = !isFloating || document.body.classList.contains('ai-open');
    if (closeButton) closeButton.hidden = !isFloating;
  }
  if (floating) {
    floating.replaceChildren(avatarClone(), el('span', null, 'Ask ' + name));
    floating.setAttribute('aria-label', 'Ask ' + name);
    floating.addEventListener('click', () => setOpen(true));
  }
  if (closeButton) closeButton.addEventListener('click', () => { if (AI === 'corner' || narrow.matches) setOpen(false); });
  narrow.addEventListener('change', syncFloating);

  // --- What the AI sees of the open panel, in its header ---
  const who = app ? app.querySelector('.who') : null;
  const chip = el('details', 'ws-sees');
  const chipSummary = el('summary');
  const pop = el('div', 'ws-sees-pop');
  chip.append(chipSummary, pop);
  if (who && AI !== 'off') who.append(chip);
  document.addEventListener('click', (e) => { if (chip.open && !chip.contains(e.target)) chip.open = false; });
  function seesSentence(panel) {
    const parts = panel.sees || [];
    if (!parts.length) return name + ' doesn’t see this tab. Tell it what you need.';
    const list = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1) : parts[0];
    return 'When you ask ' + name + ' something, it sees ' + list + (panel.type === 'questions' ? ', never the right answer.' : '.');
  }
  function sees() {
    const panel = state.current;
    if (!panel) return;
    const parts = panel.sees || [];
    chipSummary.replaceChildren(icon(parts.length ? 'eye' : 'eyeOff', 13), el('span', null, parts.length ? 'Sees ' + (parts.length > 2 ? parts.slice(0, 2).join(', ') + '…' : parts.join(' and ')) : 'Doesn’t see this tab'));
    pop.replaceChildren(el('strong', null, panel.title), el('p', null, seesSentence(panel)));
    pop.append(el('p', 'ws-muted', recorded()));
  }

  const api = {
    touch,
    seesSentence,
    setBadge(panelId, text, done) {
      const badge = badges.get(panelId);
      if (!badge) return;
      badge.hidden = !text;
      badge.textContent = text || '';
      badge.classList.toggle('done', Boolean(done));
    },
    aiAvailable: AI !== 'off',
    // Puts a question in the chat box, showing the AI first wherever it is.
    askAi(text) {
      if (AI === 'off') return;
      if (state.collapsed) setCollapsed(false);
      if (AI === 'corner' || narrow.matches) setOpen(true);
      if (window.VIABLE_CHAT) window.VIABLE_CHAT.prefill(text);
    },
    current: () => state.current
  };

  // The chat's empty state, for the open panel: what the AI can help with here.
  const DEFAULT_STARTERS = {
    writing: (panel) => (panel.sees || []).some((part) => /draft/.test(part)) ? ['Help me get started', 'What should my plan cover?', 'Give me feedback on my draft using the rubric'] : ['Help me understand the task', 'How could I plan this?'],
    questions: (panel) => (panel.sees || []).length ? ['Explain what this question is asking', 'Give me a hint, not the answer'] : ['I have a question about this topic'],
    embed: () => ['What should I try next?', 'Explain what just happened'],
    reading: (panel) => (panel.sees || []).length ? ['Explain this page in simpler words', 'What are the main ideas here?', 'Ask me a question about this page'] : ['I have a question about this reading']
  };
  return {
    open,
    views,
    intro() {
      const panel = state.current;
      if (!panel) return null;
      const starters = panel.starters && panel.starters.length ? panel.starters : (DEFAULT_STARTERS[panel.type] || (() => []))(panel);
      return { title: 'Ask about ' + panel.title, lead: seesSentence(panel), starters };
    },
    state: () => (state.current && views.get(state.current.id) ? views.get(state.current.id).state() : null),
    start: () => { resume(); syncFloating(); },
    api
  };
}

function avatarClone() {
  const template = document.getElementById('avatar');
  const node = template && template.content.firstElementChild ? template.content.firstElementChild.cloneNode(true) : el('span', 'ws-dot');
  return node;
}
