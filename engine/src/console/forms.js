/**
 * The markup the console's pages share: fields, switches, the course's heading and tabs. Plain strings,
 * every value escaped here. No Node built-ins.
 */
import { encode } from 'uqr';
import { escapeHtml as esc } from '../learner/shell.js';
import { CONSOLE_SCRIPT } from './client.js';

export { esc };
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A page's render, with the look and the script these forms need. */
export const withForms = (body) => async (tools, match) => { const made = await body(tools, match); return { ...made, css: `${FORMS_CSS}\n${made.css}`, script: CONSOLE_SCRIPT }; };
export const attrs = (more = {}) => Object.entries(more).filter(([, value]) => value != null && value !== false).map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${esc(value)}"`)).join('');

let counter = 0;
const fresh = (name) => `f-${String(name).replace(/[^\w-]/g, '-')}-${counter += 1}`;
const hintOf = (hint) => (hint ? `<small class="v-note">${esc(hint)}</small>` : '');

/** A labelled text field. rows makes it a textarea. */
export function text(name, label, value, { hint = '', rows = 0, type = 'text', id = null, ...more } = {}) {
  const at = id || fresh(name);
  const control = rows
    ? `<textarea class="v-input" id="${at}" name="${esc(name)}" rows="${rows}"${attrs(more)}>${esc(value ?? '')}</textarea>`
    : `<input class="v-input" id="${at}" name="${esc(name)}" type="${esc(type)}" value="${esc(value ?? '')}"${attrs(more)}>`;
  return `<div class="v-form"><label class="v-label" for="${at}">${esc(label)}</label>${control}${hintOf(hint)}</div>`;
}

/** A labelled select. options: [{ value, label }]. */
export function choose(name, label, value, options, { hint = '', id = null, ...more } = {}) {
  const at = id || fresh(name);
  const rows = options.map((option) => `<option value="${esc(option.value ?? '')}"${String(option.value ?? '') === String(value ?? '') ? ' selected' : ''}>${esc(option.label)}</option>`).join('');
  return `<div class="v-form"><label class="v-label" for="${at}">${esc(label)}</label><select class="v-input" id="${at}" name="${esc(name)}"${attrs(more)}>${rows}</select>${hintOf(hint)}</div>`;
}

/** One of several, each with a line saying what it means. options: [{ value, label, hint }]. */
export function oneOf(name, label, value, options, { hint = '' } = {}) {
  return `<fieldset class="one-of"><legend class="v-label">${esc(label)}</legend>${hintOf(hint)}<div class="one-of-list">${options.map((option) => `<label class="one"><input type="radio" name="${esc(name)}" value="${esc(option.value ?? '')}"${String(option.value ?? '') === String(value ?? '') ? ' checked' : ''}><span><strong>${esc(option.label)}</strong>${option.hint ? `<small>${esc(option.hint)}</small>` : ''}</span></label>`).join('')}</div></fieldset>`;
}

/** A switch with what it does beside it. value set: one of a list of that name (data-many). */
export function toggle(name, label, on, { hint = '', value = null, disabled = false } = {}) {
  return `<label class="toggle"><input type="checkbox" name="${esc(name)}"${value == null ? '' : ` value="${esc(value)}" data-many`}${on ? ' checked' : ''}${disabled ? ' disabled' : ''}><span><strong>${esc(label)}</strong>${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;
}

export const say = () => '<p class="say" data-say role="status"></p>';

const round = (n) => Math.round(n * 1000) / 1000;

/** A QR code as inline SVG: round dots on white, with the three corner marks drawn whole, in either light or dark so phones can read it. */
export function qrSvg(text, { label = 'QR code' } = {}) {
  const { data, size } = encode(text, { ecc: 'M', border: 0 });
  const QUIET = 4;
  const inMark = (x, y) => (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
  let dots = '';
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (data[y][x] && !inMark(x, y)) dots += `M${round(x + 0.08)},${y + 0.5}a.42,.42 0 1,0 .84,0a.42,.42 0 1,0 -.84,0`;
  const mark = (x, y) => `<path fill-rule="evenodd" d="M${x + 2},${y}h3a2,2 0 0 1 2,2v3a2,2 0 0 1 -2,2h-3a2,2 0 0 1 -2,-2v-3a2,2 0 0 1 2,-2zM${x + 2},${y + 1}h3a1,1 0 0 1 1,1v3a1,1 0 0 1 -1,1h-3a1,1 0 0 1 -1,-1v-3a1,1 0 0 1 1,-1z"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="1"/>`;
  const total = size + QUIET * 2;
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="${esc(label)}"><rect width="${total}" height="${total}" fill="#fff"/><g transform="translate(${QUIET} ${QUIET})" fill="#0f172a"><path d="${dots}"/>${mark(0, 0)}${mark(size - 7, 0)}${mark(0, size - 7)}</g></svg>`;
}

/** What a page says when its address only opens on this computer. */
export function hereOnly({ local, others }, addresses) {
  if (!local) return '';
  if (addresses.length) return `<p class="notice">The address you opened this page at only opens on this computer. This is where others on this network reach it.${others.length ? ` It also answers at ${others.map((item) => `<code>${esc(item)}</code>`).join(', ')}.` : ''}</p>`;
  return '<p class="notice">This address only opens on this computer, so nobody else can reach it. Start the server with <code>--host 0.0.0.0</code> for people on this network, or deploy it, then open this page again.</p>';
}

/** A moment: in the reader's own time once the page's script has run, in UTC until then. */
export const when = (iso) => (iso ? `<time data-local datetime="${esc(iso)}">${esc(iso.slice(0, 16).replace('T', ' '))} UTC</time>` : '');

/** Where a class reaches this server: this page's own address, unless that only opens on this computer. addresses: where it listens on this network. */
export function reachOf(origin, addresses = []) {
  const local = /^https?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])(?::\d+)?$/.test(origin);
  return { local, base: local && addresses.length ? addresses[0] : origin, others: local ? addresses.slice(1) : [] };
}

/** Links to show one section's people, or all. counts: how many in each, by section ID, with none for those in no section. */
export function sectionChips(sections, current, path, counts = null) {
  if (!sections.length) return '';
  const count = (id) => (counts ? ` <small>${counts[id] || 0}</small>` : '');
  const chip = (id, label) => `<li><a class="chip" href="${esc(path)}${id ? `?section=${esc(id)}` : ''}"${current === id ? ' aria-current="true"' : ''}>${esc(label)}${id === '' ? '' : count(id)}</a></li>`;
  return `<nav aria-label="Show one section"><ul class="chips">${chip('', 'Everyone')}${sections.map((section) => chip(section.id, section.name)).join('')}${chip('none', 'No section')}</ul></nav>`;
}

/** A course's heading: where it is, its link and its tabs. tabs: pages with a courseTab. */
export function courseHead({ title, code, origin, addresses = [], tabs, current, closed = false }) {
  const { local, base } = reachOf(origin, addresses);
  const link = `${base}/course/${code}`;
  return `<nav class="crumbs" aria-label="Where you are"><a href="/console/courses">Courses</a></nav>
<h1>${esc(title)}</h1>
${closed ? '<p class="notice">This course is closed: learners can’t open it. Open it again in Settings.</p>' : `<div class="share-line"><code>${esc(link)}</code><button class="v-btn is-small" type="button" data-copy="${esc(link)}">Copy link</button><a class="v-btn is-small" href="/console/courses/${esc(code)}/share">Share</a><a class="v-btn is-small" href="/course/${esc(code)}?try=1" target="_blank" rel="noopener">Try it</a></div>
${local && !addresses.length ? '<p class="v-note here-only">This address only opens on this computer. <a href="/console/courses/' + esc(code) + '/share">To reach it from elsewhere</a></p>' : ''}`}
<nav class="tabs" aria-label="This course"><ul>${tabs.map((tab) => `<li><a href="/console/courses/${esc(code)}${tab.tabPath}"${tab.courseTab === current ? ' aria-current="page"' : ''}>${esc(tab.courseTab)}</a></li>`).join('')}</ul></nav>`;
}

export const FORMS_CSS = `.page .v-lead{max-width:62ch;margin:10px 0 0}
.block{margin-top:clamp(28px,4vw,44px)}
.block>h2+*{margin-top:12px}
.block>h2+.v-note{margin-bottom:14px}
.v-note{margin:0}
small.v-note{font-size:.8125rem}
.say{margin:0;color:var(--muted);font-size:.9375rem;overflow-wrap:anywhere}
.say:empty{display:none}
.say.bad{color:var(--pencil-red)}
.say.good{color:var(--pass-green)}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.fields{display:grid;gap:16px}
.fields.two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.crumbs{margin-bottom:6px;font-size:.9375rem}
.crumbs a{color:var(--muted)}
.share-line{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.share-line code{padding:5px 10px;border-radius:var(--radius-sm);background:var(--field-mist);font-size:.875rem;overflow-wrap:anywhere}
.here-only{margin-top:6px;font-size:.875rem}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 0;padding:0;list-style:none}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border:1px solid var(--public-rule);border-radius:var(--radius-pill);color:var(--public-text);font-size:.875rem;text-decoration:none}
.chip:hover{border-color:var(--public-rule-strong)}
.chip[aria-current=true]{border-color:var(--ink-blue);background:var(--field-mist);color:var(--public-ink);font-weight:600}
.chip small{color:var(--muted);font-size:.8125rem;font-weight:400}
.tabs{margin-top:22px;border-bottom:1px solid var(--public-rule);overflow-x:auto}
.tabs ul{display:flex;gap:4px;margin:0;padding:0;list-style:none}
.tabs a{display:block;padding:9px 14px;border-bottom:2px solid transparent;color:var(--public-text);text-decoration:none;white-space:nowrap}
.tabs a:hover{color:var(--public-ink)}
.tabs a[aria-current=page]{border-bottom-color:var(--ink-blue);color:var(--public-ink);font-weight:600}
fieldset.one-of{margin:0;padding:0;border:0;display:grid;gap:8px}
fieldset.one-of>legend{padding:0;margin-bottom:6px}
.one-of-list{display:grid;gap:6px}
.one{display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px;padding:10px 12px;border:1px solid var(--public-rule);border-radius:var(--radius-sm);cursor:pointer}
.one:hover{border-color:var(--public-rule-strong)}
.one:has(input:checked){border-color:var(--ink-blue);background:var(--field-mist)}
.one input,.toggle input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--ink-blue)}
.one span,.toggle span{display:grid;gap:1px}
.one strong,.toggle strong{font-weight:600;color:var(--public-ink);font-size:.9375rem}
.one small,.toggle small{color:var(--muted);font-size:.875rem;line-height:1.45}
.toggle{display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px;cursor:pointer}
dialog.ask{max-width:min(460px,calc(100vw - 32px));padding:22px;border:0;border-radius:var(--radius);background:var(--surface);color:var(--public-ink);box-shadow:var(--public-shadow)}
dialog.ask::backdrop{background:rgb(0 0 0/.35)}
dialog.ask p{margin:0 0 14px;line-height:1.5}
dialog.ask label{display:grid;gap:6px;margin-bottom:14px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:640px){.fields.two{grid-template-columns:minmax(0,1fr)}}
@media (max-width:420px){.tabs a{padding:9px 10px}}`;
