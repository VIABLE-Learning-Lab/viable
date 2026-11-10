// What every panel shares: the page's workspace settings, small DOM helpers and icons, and the event
// queue (batched to …/events every 10 s or 25 events, and as a beacon when the visitor leaves).
const node = document.getElementById('ws-config');
export const CONFIG = node ? JSON.parse(node.textContent || '{}') : {};
// Where the page's own endpoints are (…/events, …/draft, …/questions): the page's address, unless
// the page says otherwise.
export const BASE = CONFIG.base || location.pathname.replace(/\/$/, '');
// A course activity's endpoints carry what its address carried.
export const QUERY = (CONFIG.course && CONFIG.course.query) || '';
const VISITOR_KEY = (CONFIG.course && CONFIG.course.visitorKey) || 'viable-chat:visitor';
const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
export const store = {
  get: (key) => read(key),
  set: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }
};
export const visitor = () => read(VISITOR_KEY);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');
export const session = newId().slice(0, 24);
export const IDLE = 120000;

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
export function button(cls, label, onClick) {
  const b = el('button', cls);
  b.type = 'button';
  if (label != null) b.append(...(Array.isArray(label) ? label : [label]));
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
/** The foot of a panel that has none of its own, holding the way on in steps (api.onward()); nothing without steps. */
export function onwardFoot(api, cls = 'ws-foot') {
  const onward = api.onward ? api.onward() : null;
  if (!onward) return null;
  const foot = el('footer', cls);
  foot.append(el('span', 'ws-grow'), onward);
  return foot;
}
/** Asks in place of a footer's own controls, with the page's buttons: resolves true for yes, and puts the footer back, focus too. */
export function askIn(foot, text, yes, no = 'Not yet') {
  return new Promise((resolve) => {
    const kept = [...foot.childNodes];
    const from = document.activeElement;
    const sure = el('div', 'ws-sure');
    sure.setAttribute('role', 'group');
    sure.setAttribute('aria-label', text);
    const answer = (value) => { foot.replaceChildren(...kept); if (foot.contains(from)) from.focus(); resolve(value); };
    const go = button('ws-btn primary', yes, () => answer(true));
    sure.append(el('p', 'ws-sure-text', text), button('ws-btn ghost', no, () => answer(false)), go);
    sure.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); answer(false); } });
    foot.replaceChildren(sure);
    go.focus();
  });
}
// Paragraphs and line breaks of an author's text, without markup.
// What an author wrote (a question and its choices, a hint, an explanation, a writing task) as the chat
// shows a reply: Markdown with code, math, tables and diagrams. A single line stays inline (a choice
// reading "1." is not a list); without the renderer, plain paragraphs.
export function rich(text, cls) {
  const value = String(text || '');
  const inline = !value.includes('\n');
  const box = el(inline ? 'span' : 'div', 'md' + (inline ? ' md-inline' : '') + (cls ? ' ' + cls : ''));
  box.append(window.ViableRender ? window.ViableRender.render(value, { inline }) : paragraphs(value));
  return box;
}
export function paragraphs(text, cls) {
  const out = document.createDocumentFragment();
  String(text || '').split(/\n{2,}/).forEach((para) => {
    const p = el('p', cls);
    para.split('\n').forEach((line, i) => { if (i) p.append(document.createElement('br')); p.append(line); });
    out.append(p);
  });
  return out;
}
export const words = (text) => (String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

// Icons (24-unit strokes, as the chat's), by name.
const PATHS = {
  down: '<path d="m6 9 6 6 6-6"/>',
  pen: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  list: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  puzzle: '<path d="M15.4 6.5V5a2 2 0 1 0-4 0v1.5H8a1 1 0 0 0-1 1V11h1.5a2 2 0 1 1 0 4H7v3.5a1 1 0 0 0 1 1h3.5V18a2 2 0 1 1 4 0v1.5H19a1 1 0 0 0 1-1V15h-1.5a2 2 0 1 1 0-4H20V7.5a1 1 0 0 0-1-1z"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 4.2A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2"/><path d="M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a9 9 0 0 0 5.4-1.6"/><path d="m2 2 20 20"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  rubric: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4 12.5 3.5 3.5 0 0 0 6.5 19z"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  redo: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  marker: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'
};
export function icon(name, size = 16) {
  const span = el('span', 'ws-i');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return span;
}

// What learners are told is kept, by the course's data level (../workspace.js recordedAt; nothing
// attention-level is recorded yet, so detailed reads as process), and who else sees it where the host
// says so.
export function recorded() {
  const level = CONFIG.course && CONFIG.course.level;
  return 'Your teacher can see your answers and work here' + (level === 'process' || level === 'detailed' ? ', and how you write it (pauses, changes, pastes).' : ', and how long each part takes.')
    + (CONFIG.course && CONFIG.course.alsoSeen ? ' ' + CONFIG.course.alsoSeen : '');
}

// --- Events ----------------------------------------------------------------------------------------
let queue = [];
let seq = 0;
// The activity's version this page shows; the server says when the teacher has changed it since (stale).
const VERSION = CONFIG.course && CONFIG.course.version ? { version: CONFIG.course.version } : {};
const stale = (data) => { if (data && data.stale) window.dispatchEvent(new Event('viable:stale')); };
// Every event goes to the server, which keeps what the course's data level allows (workspace.js recordedAt).
export function emit(panel, type, data, item) {
  queue.push({ panel, type, data, item: item ?? null, at: new Date().toISOString(), seq: seq++ });
  if (queue.length >= 25) flush();
}
export function flush(beacon) {
  if (!queue.length || !visitor()) return;
  const events = queue.splice(0, 100);
  const body = JSON.stringify({ visitor: visitor(), session, events, ...VERSION });
  if (beacon && navigator.sendBeacon) { navigator.sendBeacon(BASE + '/events' + QUERY, new Blob([body], { type: 'application/json' })); return; }
  // A batch the server didn't take (busy, offline) goes back in line, up to a few minutes' worth.
  const retry = () => { queue = events.concat(queue).slice(-500); };
  fetch(BASE + '/events' + QUERY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).then((res) => {
    if (!res.ok && ![400, 403, 413].includes(res.status)) retry();
    else if (res.ok) res.json().then(stale, () => {});
  }, retry);
}
setInterval(() => flush(false), 10000);

export async function post(path, body) {
  const res = await fetch(BASE + path + QUERY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor: visitor(), session, ...VERSION, ...body }), keepalive: true });
  const data = await res.json().catch(() => ({}));
  stale(data);
  if (!res.ok) throw Object.assign(new Error((data.error && data.error.message) || 'That couldn’t be sent. Try again.'), { status: res.status, code: data.error && data.error.code, details: data.error && data.error.details });
  return data;
}

// The visitor may use the page once the chat script says so (after they said who they are and
// whatever else the host asks): window.VIABLE_READY, or the viable:ready event.
export const ready = new Promise((resolve) => {
  if (window.VIABLE_READY) resolve();
  else window.addEventListener('viable:ready', () => resolve(), { once: true });
});

// The AI's answers on this page (to tell a paste of one from the learner's own writing).
export const replies = [];
