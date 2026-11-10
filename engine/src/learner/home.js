/**
 * A course's home, the one door for its learners: who they are, on a shared computer whether it is still
 * them, then their activities (renderHome), one page of HTML. Pure: the host answers its endpoints
 * (…/home, …/join, …/section; the host's routes, such as server/learner.js here).
 */
import { BASE_CSS, escapeHtml, palette, scriptJson } from './shell.js';
import { themeOf } from './themes.js';

// What learners are told is kept, by the course's data level (as the activity pages say; nothing
// attention-level is recorded yet, so detailed reads as process).
const KEPT = {
  minimal: 'Your teacher can see your answers and work here, and how long each part takes.',
  process: 'Your teacher can see your answers and work here, and how you write it (pauses, changes, pastes).',
  detailed: 'Your teacher can see your answers and work here, and how you write it (pauses, changes, pastes).'
};

const HOME_CSS = `
body{min-height:100vh}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 20px;border-bottom:1px solid var(--line-2);background:color-mix(in srgb,var(--panel) 92%,transparent);backdrop-filter:blur(10px)}
.brand{display:flex;align-items:center;gap:10px;flex:1;min-width:0;font-weight:650}
.brand i{width:10px;height:10px;border-radius:2px;background:var(--accent);flex:none}
.brand span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:560px){.top{flex-wrap:wrap;row-gap:6px}.brand{flex-basis:100%}}
.me{display:flex;align-items:center;gap:8px;color:var(--ink-2);font-size:.86rem}
.me b{font-weight:620}.me small{color:var(--muted)}
.preview{padding:3px 10px;border-radius:999px;background:color-mix(in srgb,#f59e0b 18%,transparent);font-size:.74rem;font-weight:600;white-space:nowrap}
main{max-width:760px;margin:0 auto;padding:44px 20px 88px}
.hero h1{margin:0;font:var(--head-weight) clamp(1.7rem,4.2vw,2.35rem)/1.15 var(--font-head);letter-spacing:var(--head-track);text-wrap:balance}
.hero p{margin:12px 0 0;max-width:64ch;color:var(--ink-2);white-space:pre-line}
.hero .kept{display:flex;flex-wrap:wrap;gap:4px 12px;max-width:none;margin-top:10px;color:var(--muted);font-size:.8rem}
.hero .kept .btn.quiet{font-size:.8rem}
.bar{display:flex;align-items:center;gap:12px;margin-top:20px;color:var(--muted);font-size:.84rem;font-weight:600}
.bar span{flex:1;height:5px;border-radius:99px;background:var(--line);overflow:hidden}.bar i{display:block;height:100%;width:0;border-radius:inherit;background:var(--accent);transition:width .4s}
.next{display:flex;align-items:center;gap:16px;margin-top:30px;padding:18px 20px;border:var(--bw) solid var(--line);border-left:4px solid var(--accent);border-radius:var(--r);background:var(--panel);text-decoration:none;color:inherit;transition:border-color .15s,transform .15s,box-shadow .15s}
a.next:hover{border-color:var(--accent-line);border-left-color:var(--accent)}
.next .kind{width:46px;height:46px;border:0;border-radius:var(--r-sm);background:var(--accent);color:var(--on-accent)}
.next .text{flex:1;min-width:0}
.next small{display:block;color:var(--accent-text);font-size:.82rem;font-weight:650}
.next strong{display:block;margin-top:1px;font:var(--head-weight) 1.12rem/1.3 var(--font-head);letter-spacing:var(--head-track)}
.next p{margin:3px 0 0;color:var(--ink-2);font-size:.88rem;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.next .go svg{width:17px;height:17px}
.next .go{display:inline-flex;align-items:center;gap:6px;flex:none;padding:10px 16px;border-radius:var(--r-sm);background:var(--accent);color:var(--on-accent);font-weight:650;white-space:nowrap}
.unit{margin-top:36px}
.next+#units .unit:first-child{margin-top:36px}
.unit-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;padding:0 0 10px;border-bottom:1px solid var(--line)}
.unit-head h2{margin:0;font:var(--head-weight) 1.1rem/1.3 var(--font-head);letter-spacing:var(--head-track)}
.unit-head .dates{color:var(--muted);font-size:.8rem;font-weight:560}
.unit-head .count{margin-left:auto;color:var(--muted);font-size:.78rem;font-weight:620}.unit-head .count.all{color:var(--ok)}
.list{display:grid;margin:0;padding:0;list-style:none}
.list li+li{border-top:1px solid var(--line-2)}
.card{display:flex;align-items:center;gap:14px;margin:0 -10px;padding:14px 10px;border-radius:var(--r-sm);color:inherit;text-decoration:none;transition:background .15s}
a.card:hover{background:var(--line-2)}
a.card:focus-visible{outline:2px solid var(--ink);outline-offset:-2px}
.kind{position:relative;flex:none;display:grid;place-items:center;width:38px;height:38px;border:1.5px solid var(--accent-line);border-radius:50%;color:var(--accent-text)}
.ic{display:contents}.kind svg{width:18px;height:18px}
.card.done .kind{border-color:transparent;background:color-mix(in srgb,var(--ok) 14%,transparent);color:var(--ok)}
.card.locked .kind{border-color:var(--line);color:var(--muted)}
.kind .tick{position:absolute;right:-4px;bottom:-4px;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--ok);color:#fff;box-shadow:0 0 0 2px var(--panel)}
.kind .tick svg{width:11px;height:11px}
.card .body{flex:1;min-width:0}
.card strong{display:block;font-size:1rem;font-weight:640}
.card.locked strong{color:var(--ink-2)}
.card p{margin:2px 0 0;color:var(--ink-2);font-size:.88rem;line-height:1.5}
.card .meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.chip{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;background:var(--line-2);color:var(--ink-2);font-size:.74rem;font-weight:600}
.state{flex:none;display:inline-flex;align-items:center;gap:5px;font-size:.84rem;font-weight:640;color:var(--muted);white-space:nowrap}
.state svg{width:14px;height:14px}
.card.new:not(.locked) .state,.card.started .state{color:var(--accent-text)}
.card.done .state{color:var(--ok)}
@media (max-width:520px){.state{max-width:38%;white-space:normal;text-align:right;line-height:1.35}}
.empty{margin-top:30px;padding:26px;border:1px dashed var(--line);border-radius:var(--r);color:var(--muted);text-align:center}
.return{display:flex;justify-content:center;margin-top:34px}
.gate{min-height:calc(100vh - 56px);display:grid;place-items:center;padding:24px 16px}
.gate-card{width:100%;max-width:380px;display:grid;gap:12px;padding:26px;border:var(--bw) solid var(--line);border-radius:var(--r);background:var(--panel);box-shadow:var(--shadow);text-align:center}
.gate-card h1{margin:0;font:var(--head-weight) 1.35rem/1.25 var(--font-head);letter-spacing:var(--head-track)}
.gate-card p{margin:0;color:var(--ink-2);font-size:.92rem}
.gate-card input{width:100%;padding:12px 14px;border:var(--bw) solid var(--line);border-radius:var(--r-sm);background:var(--panel);color:var(--ink);font-size:1rem;text-align:center}
.gate-card input.code{font:600 1.05rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase}
.gate-card input:focus{border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft)}
.gate-card label{margin-bottom:-6px;color:var(--ink-2);font-size:.88rem;font-weight:620}
.err{color:var(--danger);font-size:.85rem}.err.note{color:var(--ink-2)}.btn.confirm{width:100%;margin-top:10px}.err input{margin-top:12px}#join-go[hidden]{display:none}
.choices{display:grid;gap:8px}
.skeleton{height:62px;margin:6px 0;border-radius:var(--r-sm);background:var(--line-2);animation:wait 1.2s ease-in-out infinite alternate}
@keyframes wait{to{opacity:.45}}
.info{margin-top:30px;padding:16px 20px 18px;border:var(--bw) solid var(--line);border-radius:var(--r);background:var(--panel)}
.info h2{margin:0 0 10px;font:var(--head-weight) 1.05rem/1.3 var(--font-head);letter-spacing:var(--head-track)}
.info>:not(h2)+:not(h2){margin-top:14px}
.info ul{margin:0;padding:0;list-style:none}
.info .people{display:grid;gap:6px}
.info .people li{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 12px}
.info .who strong{font-weight:640}.info .who small{margin-left:8px;color:var(--muted);font-size:.8rem;font-weight:600}
.info a{color:var(--accent-text);font-weight:600;text-decoration:none;overflow-wrap:anywhere}.info a:hover{text-decoration:underline}
.info .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px 20px}
.info h3{margin:0;color:var(--muted);font-size:.82rem;font-weight:650}
.info p{margin:3px 0 0;color:var(--ink-2);font-size:.9rem;white-space:pre-line;overflow-wrap:anywhere}
.info .links{display:flex;flex-wrap:wrap;gap:8px}
.info .links a{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border:1px solid var(--accent-line);border-radius:999px;font-size:.86rem}
.info .links a:hover{text-decoration:none;border-color:var(--accent)}
.info .links svg{width:13px;height:13px;flex:none}
@media (max-width:560px){.info{padding:14px 16px 16px}}
@media (max-width:560px){main{padding:30px 16px 64px}.next{flex-wrap:wrap}.next .text{flex:1 1 calc(100% - 64px)}.next .go{flex:1 1 100%;justify-content:center}.me small{display:none}.top{padding:10px 14px}}
`;

// The course's information, the same for anyone with the link (an email only where the teacher
// shows it): its people, office hours, how to get help, links. Nothing when it has none.
const INFO_ROLE = { teacher: 'Teacher', teaching_assistant: 'Teaching assistant' };
const OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';
function infoCard(info) {
  if (!info) return '';
  const people = info.people.map((person) => {
    const role = person.role === 'other' ? person.role_label : INFO_ROLE[person.role];
    return `<li><span class="who"><strong>${escapeHtml(person.name)}</strong>${role ? `<small>${escapeHtml(role)}</small>` : ''}</span>${person.email ? `<a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a>` : ''}</li>`;
  }).join('');
  const fact = (title, text) => (text ? `<div><h3>${title}</h3><p>${escapeHtml(text)}</p></div>` : '');
  const links = info.links.map((link) => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}${OUT}</a></li>`).join('');
  return `<section class="info" aria-labelledby="info-title"><h2 id="info-title">About this course</h2>${people ? `<ul class="people">${people}</ul>` : ''}${info.office_hours || info.help ? `<div class="facts">${fact('Office hours', info.office_hours)}${fact('How to get help', info.help)}</div>` : ''}${links ? `<ul class="links">${links}</ul>` : ''}</section>`;
}

/**
 * course: { code, title, description, audience, data_level, shared_devices, appearance, info, alsoSeen }.
 * how: how the course recognizes learners ({ identify, link_param, confirm_new }). ask: what the form
 * says when it asks who they are ({ title, text, label, code, email, autocomplete }): the host decides
 * what it takes. reenter: "Not you?" asks for a code, and offers to start fresh. tellsCode: the home says the
 * code a learner can come back with. badge: a line beside
 * the course's name. host: { slots: { beforeConversation, sheet } }, each { css, html, note, script } of
 * the host's own, trusted: its html goes in a place of its own before the course, its note beside what
 * the page says is kept, and its script may set window.VIABLE_SLOTS.
 */
export function renderHome({ course, how, ask = {}, query = '', visitorKey = 'viable-chat:visitor', preview = false, badge = null, reenter = false, tellsCode = false, host = {} }, nonce) {
  const copy = ask;
  const { color = null, theme = null } = course.appearance || {};
  const before = host.slots?.beforeConversation || {};
  const sheet = host.slots?.sheet || {};
  const config = { code: course.code, query, visitorKey, identify: how.identify, linkParam: how.identify === 'link' ? how.link_param : null, shared: Boolean(course.shared_devices) && !preview, preview: Boolean(preview), confirmNew: Boolean(how.confirm_new), audience: course.audience, reenter: Boolean(reenter) };
  return `<!doctype html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${escapeHtml(course.title)}</title>
<style nonce="${nonce}">${palette(color, theme)}${BASE_CSS}${before.css || ''}${sheet.css || ''}${HOME_CSS}${themeOf(theme).home}</style>
</head>
<body>
<header class="top"><div class="brand"><i aria-hidden="true"></i><span>${escapeHtml(course.title)}</span></div>${badge ? `<span class="preview">${escapeHtml(badge)}</span>` : ''}<div id="me" class="me" hidden></div></header>
<div id="gate" class="gate" hidden>
  <form id="join" class="gate-card" hidden>
    <h1>${escapeHtml(copy.title)}</h1>
    <p>${escapeHtml(copy.text)}</p>
    <label for="entry">${escapeHtml(copy.label)}</label>
    <input id="entry" class="${copy.code ? 'code' : ''}" type="${copy.email ? 'email' : 'text'}" inputmode="${copy.email ? 'email' : 'text'}" autocomplete="${copy.autocomplete || 'off'}" autocapitalize="${copy.code ? 'characters' : 'off'}" spellcheck="false" maxlength="120" aria-describedby="join-err" required>
    <p id="join-err" class="err" role="alert" hidden></p>
    <button id="join-go" class="btn" type="submit">Continue</button>
    ${reenter ? '<button id="join-fresh" class="btn ghost" type="button">Start fresh</button>' : ''}
  </form>
  <div id="who" class="gate-card" hidden>
    <h1 id="who-title" tabindex="-1"></h1>
    <p>This computer may be shared. Make sure your work goes to you.</p>
    <button id="who-yes" class="btn" type="button">Yes, that’s me</button>
    <button id="who-no" class="btn ghost" type="button">No, I’m someone else</button>
  </div>
  <div id="pick" class="gate-card" hidden>
    <h1 tabindex="-1">Which class are you in?</h1>
    <p>Choose once; your teacher can change it later.</p>
    <div id="pick-list" class="choices"></div>
  </div>
  <div id="slot" hidden>${before.html || ''}</div>
</div>
<main id="main" class="sheet">
  <section class="hero"><h1 tabindex="-1">${escapeHtml(course.title)}</h1>${course.description ? `<p>${escapeHtml(course.description)}</p>` : ''}<p class="kept"><span>${escapeHtml(KEPT[course.data_level] || KEPT.minimal)}${course.alsoSeen ? ` ${escapeHtml(course.alsoSeen)}` : ''}</span>${before.note || ''}</p>${tellsCode ? '<p id="your-code" class="kept" hidden></p>' : ''}<div id="bar" class="bar" hidden><span><i></i></span><b></b></div></section>
  ${infoCard(course.info)}
  <div id="next"></div>
  <div id="units"><div class="unit"><div class="list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></div></div>
  <div id="ret" class="return" hidden></div>
</main>
${before.script || sheet.script ? `<script nonce="${nonce}">${sheet.script || ''}\n${before.script || ''}</script>` : ''}
<script nonce="${nonce}">
const CONFIG = ${scriptJson(config)};
${HOME_SCRIPT}
</script>
</body>
</html>`;
}

// The home's behavior: who the learner is (and on a shared computer, whether it's still them), their
// section, the host's own step if it has one, then the course; an activity opened first comes back here
// and goes on.
const HOME_SCRIPT = String.raw`(() => {
  const $ = (id) => document.getElementById(id);
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');
  let visitor = read(CONFIG.visitorKey);
  const firstHere = !visitor;
  if (!visitor) { visitor = newId(); write(CONFIG.visitorKey, visitor); }
  const base = '/course/' + CONFIG.code;
  const post = async (path, body) => {
    const res = await fetch(base + path + CONFIG.query, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor, ...body }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error((data.error && data.error.message) || 'That didn’t work. Try again.'), { code: data.error && data.error.code });
    return data;
  };
  // A personal code reads K7Q2-M9XC; any other kind of code is shown as it is.
  const shown = (learner) => learner.name || learner.personal_code || (/^[0-9A-Z]{8}$/.test(learner.code || '') ? learner.code.slice(0, 4) + '-' + learner.code.slice(4) : learner.code);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const when = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const day = (d) => new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
  // Focus goes to what is asked now (its field, or its card's heading), and to the course once the asking is done.
  const show = (which) => {
    const asked = !which && !$('gate').hidden;
    $('gate').hidden = !which; $('main').hidden = Boolean(which); ['join', 'who', 'pick', 'slot'].forEach((id) => { $(id).hidden = id !== which; });
    if (which === 'join') setTimeout(() => ($('join-err').querySelector('input') || $('entry')).focus(), 50);
    else if (which === 'who' || which === 'pick' || asked) setTimeout(() => $(which || 'main').querySelector('h1').focus(), 50);
  };
  const ROLE = { check: 'Check', pretest: 'Before you start', posttest: 'Check what you learned', survey: 'Survey' };
  const STATE = { new: 'Start', started: 'Continue', done: 'Done' };
  // Each kind of activity's icon (fixed markup, never learner or author text), and the marks beside them.
  const PATHS = {
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    questions: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    writing: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    reading: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    embed: '<rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 12h4"/><path d="M8 10v4"/><circle cx="15.5" cy="11" r=".8"/><circle cx="17.5" cy="13" r=".8"/>',
    test: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    survey: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'
  };
  const icon = (name) => { const span = el('span', 'ic'); span.setAttribute('aria-hidden', 'true'); span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + PATHS[name] + '</svg>'; return span; };
  const kindIcon = (card) => { const box = el('span', 'kind'); box.append(icon(PATHS[card.kind] ? card.kind : 'chat')); if (card.progress === 'done') { const tick = el('span', 'tick'); tick.append(icon('check')); box.append(tick); } return box; };
  // On a shared computer, who is here is asked again on each visit and after 20 idle minutes (the
  // activity pages check the same mark).
  const HERE = 'viable-course:here', IDLE_MS = 20 * 60 * 1000;
  const fresh = () => { try { return Date.now() - Number(sessionStorage.getItem(HERE) || 0) < IDLE_MS; } catch (e) { return false; } };
  const here = () => { try { sessionStorage.setItem(HERE, String(Date.now())); } catch (e) { /* storage unavailable */ } };
  // Nobody has been here on this browser before: there is no one else they could be.
  if (firstHere) here();
  // On a shared computer, back after 20 idle minutes: “Are you …?” comes first, before anything opens.
  // Not when each browser is its own learner: there is no one to ask about, and nothing would ever
  // mark the visit fresh, so every click would be held back (as the activity pages).
  const asks = CONFIG.shared && CONFIG.identify !== 'browser';
  const stale = (event) => {
    if (fresh()) { here(); return; }
    if (!asks || $('main').hidden) return;
    event.preventDefault(); event.stopImmediatePropagation(); load();
  };
  ['pointerdown', 'keydown', 'click'].forEach((type) => document.addEventListener(type, stale, true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && asks && !$('main').hidden && !fresh()) load(); });
  const params = new URLSearchParams(location.search);
  const opening = params.get('open');
  // A personal link's code and a panel's ID leave the address once read.
  const linkCode = params.get('join'), linkId = CONFIG.linkParam ? params.get(CONFIG.linkParam) : null;
  if (linkCode || linkId || opening) { ['join', 'open'].forEach((key) => params.delete(key)); if (CONFIG.linkParam) params.delete(CONFIG.linkParam); history.replaceState(null, '', location.pathname + (String(params) ? '?' + params : '')); }
  let typedIn = false;
  async function join(said) {
    $('join-go').disabled = true; $('join-err').hidden = true; $('join-err').replaceChildren();
    // Someone who has just typed who they are stays on the home long enough to see their code.
    try { await post('/join', said); here(); typedIn = said.entry != null; await load(); }
    catch (error) {
      show('join');
      const err = $('join-err'); err.hidden = false; err.className = 'err'; err.textContent = error.message;
      // A name or ID the course hasn't seen: the learner confirms it, so a typo doesn't make a second person.
      if (error.code === 'entry_new') {
        err.className = 'err note';
        const yes = el('button', 'btn confirm', 'Yes, continue as “' + said.entry.trim() + '”'); yes.type = 'button';
        yes.onclick = () => join({ ...said, confirm_new: true });
        err.append(el('br'), yes);
      }
      // A name or ID someone has signed in with, on another device: it takes their code.
      if (error.code === 'code_required' || (said.code && CONFIG.identify === 'ask')) {
        const box = el('input', 'code'); box.type = 'text'; box.autocomplete = 'off'; box.placeholder = 'Your personal code'; box.setAttribute('aria-label', 'Your personal code');
        const go = el('button', 'btn confirm', 'Use my personal code'); go.type = 'button';
        go.onclick = () => join({ code: box.value });
        box.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); go.click(); } };
        err.append(el('br'), box, go);
        // One way on at a time: changing the name brings its own button back.
        $('join-go').hidden = true;
        $('entry').addEventListener('input', () => { err.replaceChildren(); err.hidden = true; $('join-go').hidden = false; }, { once: true });
      }
    } finally { $('join-go').disabled = false; }
  }
  $('join').addEventListener('submit', (e) => { e.preventDefault(); const value = $('entry').value; join(CONFIG.identify === 'code' ? { code: value } : CONFIG.identify === 'link' ? { link: value } : { entry: value }); });
  function forget() {
    try { Object.keys(localStorage).filter((key) => key.startsWith('viable-chat:')).forEach((key) => localStorage.removeItem(key)); } catch (e) { /* storage unavailable */ }
    try { sessionStorage.removeItem(HERE); } catch (e) { /* storage unavailable */ }
    visitor = newId(); write(CONFIG.visitorKey, visitor);
    if (CONFIG.reenter) { renderMe(null); $('entry').value = ''; show('join'); return; }
    load();
  }
  if ($('join-fresh')) $('join-fresh').onclick = () => { post('/join', { fresh: true }).then(() => { here(); return load(); }, (error) => { const err = $('join-err'); err.hidden = false; err.className = 'err'; err.textContent = error.message; }); };
  $('who-yes').onclick = () => { here(); load(); };
  $('who-no').onclick = forget;
  function renderMe(learner) {
    const me = $('me');
    if (!learner || (!learner.name && !learner.code)) { me.hidden = true; return; }
    me.replaceChildren(el('b', null, shown(learner)), ...(learner.section ? [el('small', null, '· ' + learner.section)] : []));
    if (CONFIG.identify !== 'browser') { const other = el('button', 'btn quiet', CONFIG.shared ? 'Sign out' : 'Not you?'); other.type = 'button'; other.onclick = forget; me.append(other); }
    me.hidden = false;
    const told = $('your-code');
    if (told) { const line = el('span'); line.append('Your personal code is ', el('strong', null, shown({ ...learner, name: null })), '. Write it down: it brings back your work on another computer.'); told.replaceChildren(line); told.hidden = false; }
  }
  // A host's own step before the course, and whatever else it adds to this page.
  const slots = window.VIABLE_SLOTS || {};
  const hostPage = { post, load, base, query: CONFIG.query, audience: CONFIG.audience, box: $('slot'), open: () => show('slot') };
  if (slots.courseReady) slots.courseReady(hostPage);
  function render(data) {
    renderMe(data.learner);
    const cards = data.units.flatMap((unit) => unit.activities);
    const done = cards.filter((card) => card.progress === 'done').length;
    if (cards.length) { $('bar').hidden = false; $('bar').querySelector('i').style.width = Math.round(done / cards.length * 100) + '%'; $('bar').querySelector('b').textContent = done + ' of ' + cards.length + ' done'; }
    const href = (card) => base + '/' + encodeURIComponent(card.key) + CONFIG.query;
    const next = cards.find((card) => card.state === 'open' && card.progress === 'started') || cards.find((card) => card.state === 'open' && card.progress === 'new');
    const nextBox = $('next'); nextBox.replaceChildren();
    if (next) {
      const a = el('a', 'next'); a.href = href(next);
      const text = el('div', 'text'); text.append(el('small', null, next.progress === 'started' ? 'Continue where you left off' : 'Up next'), el('strong', null, next.title));
      if (next.summary) text.append(el('p', null, next.summary));
      const go = el('span', 'go', next.progress === 'started' ? 'Continue' : 'Start'); go.append(icon('arrow'));
      a.append(kindIcon(next), text, go);
      if (next.role === 'survey') a.onclick = (e) => { e.preventDefault(); survey(next); };
      nextBox.append(a);
    }
    const units = $('units'); units.replaceChildren();
    if (!cards.length) units.append(el('p', 'empty', 'Nothing here yet. Your teacher will open activities when it’s time.'));
    data.units.forEach((unit) => {
      if (!unit.activities.length) return;
      const box = el('section', 'unit');
      if (unit.title) {
        const head = el('header', 'unit-head');
        head.append(el('h2', null, unit.title));
        if (unit.starts_on) head.append(el('span', 'dates', day(unit.starts_on) + (unit.ends_on ? ' – ' + day(unit.ends_on) : '')));
        const finished = unit.activities.filter((card) => card.progress === 'done').length;
        head.append(el('span', 'count' + (finished === unit.activities.length ? ' all' : ''), finished === unit.activities.length ? 'All done' : finished + ' of ' + unit.activities.length + ' done'));
        box.append(head);
        box.setAttribute('aria-label', unit.title);
      }
      const list = el('ol', 'list');
      unit.activities.forEach((card) => {
        const open = card.state === 'open';
        const row = el(open ? 'a' : 'div', 'card ' + card.progress + (open ? '' : ' locked'));
        if (open) { row.href = href(card); if (card.role === 'survey') row.onclick = (e) => { e.preventDefault(); survey(card); }; }
        const body = el('div', 'body'); body.append(el('strong', null, card.title));
        if (card.summary) body.append(el('p', null, card.summary));
        const meta = el('div', 'meta');
        if (card.not_for_learners) meta.append(el('span', 'chip', 'Not open to learners'));
        if (ROLE[card.role]) meta.append(el('span', 'chip', ROLE[card.role]));
        if (card.minutes) meta.append(el('span', 'chip', 'About ' + card.minutes + ' min'));
        if (card.state === 'open' && card.closes_at && card.progress !== 'done') meta.append(el('span', 'chip', 'Until ' + when(card.closes_at)));
        if (meta.childElementCount) body.append(meta);
        const label = (slots.cardState && slots.cardState(card)) || (card.state === 'upcoming' ? 'Opens ' + when(card.opens_at) : card.state === 'closed' ? (card.progress === 'done' ? 'Done' : 'Closed') : card.progress === 'done' ? 'Done' : STATE[card.progress]);
        const state = el('span', 'state', label);
        if (!open && card.progress !== 'done') state.prepend(icon('lock'));
        else if (open && card.progress !== 'done') state.append(icon('arrow'));
        row.append(kindIcon(card), body, state);
        const li = el('li'); li.append(row); list.append(li);
      });
      box.append(list); units.append(box);
    });
    if (data.return_url) {
      const ret = $('ret'); ret.replaceChildren();
      const a = el('a', 'btn ghost', 'Finished? Return to ' + new URL(data.return_url).hostname);
      a.href = data.return_url;
      ret.append(a); ret.hidden = false;
    }
    // Sent here first (a survey, or an activity before signing in or deciding): on to it now.
    if (opening && !(typedIn && $('your-code'))) { const card = cards.find((entry) => entry.key === opening && entry.state === 'open'); if (card) { if (card.role === 'survey') survey(card); else location.href = href(card); } }
  }
  async function survey(card) {
    try { const data = await post('/' + encodeURIComponent(card.key) + '/open', {}); if (data.redirect) location.href = data.redirect; }
    catch (error) { alert(error.message); }
  }
  async function load() {
    let data;
    try { data = await post('/home', {}); }
    catch (error) { $('units').replaceChildren(el('p', 'empty', error.message)); show(null); return; }
    if (data.needs === 'join') { renderMe(null); show('join'); return; }
    // A shared computer asks each new visit who is here.
    const name = data.learner && shown(data.learner);
    if (CONFIG.shared && name && !fresh()) { $('who-title').textContent = 'Are you ' + name + '?'; show('who'); return; }
    renderMe(data.learner);
    if (data.needs === 'section') {
      const list = $('pick-list'); list.replaceChildren();
      data.sections.forEach((entry) => { const b = el('button', 'btn ghost', entry.name); b.type = 'button'; b.onclick = async () => { b.disabled = true; try { await post('/section', { section: entry.key }); load(); } catch (error) { alert(error.message); b.disabled = false; } }; list.append(b); });
      show('pick'); return;
    }
    if (data.needs && slots.beforeCourse) { slots.beforeCourse(data, hostPage); return; }
    show(null);
    render(data);
  }
  if (linkCode) join({ code: linkCode });
  else if (linkId) join({ link: linkId });
  else load();
})();`;
