/**
 * The try-out's own few pages: the launcher, the resources, and what the teacher's page gets here so
 * a suggestion can be accepted. Everything else a person sees is the real learner page. Pure: strings
 * from what is served. No Node built-ins.
 */
import { scriptJson } from '../learner/shell.js';
import { h, PARTS_CSS, treeHtml, vettingRounds } from '../ui/parts.js';
import { markSvg, themeCss } from '../ui/theme.js';
import { TARGET_NAMES } from '../server/targets.js';
import { graphOf } from '../server/runtime.js';
import { TOUR_KEY } from './tour.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
const REPOSITORY = 'https://github.com/VIABLE-Learning-Lab/viable-harness';
const FIELDS = ['', 'is-sage', 'is-stone', 'is-lilac'];
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const SHARED_CSS = `body{min-height:100vh}
.wrap{width:min(1180px,100%);margin:0 auto;padding-inline:clamp(16px,4vw,40px)}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;padding-block:16px}
.brand{display:inline-flex;align-items:center;gap:10px;margin-right:auto;color:var(--public-ink);font-weight:600;text-decoration:none}
.brand small{display:block;color:var(--muted);font-size:.8125rem;font-weight:400;line-height:1.2}
.bar nav{display:flex;flex-wrap:wrap;gap:4px 18px}
.bar nav a{padding:6px 0;color:var(--public-text);font-size:.9375rem;font-weight:500;text-decoration:none}
.bar nav a:hover{color:var(--public-ink)}
.foot{display:flex;flex-wrap:wrap;gap:6px 18px;padding-block:28px 40px;color:var(--muted);font-size:.875rem}
.foot p{margin:0}`;

const header = (where = 'Try it on your own computer') => `<header class="bar wrap"><a class="brand" href="/">${markSvg({ size: 34 })}<span>VIABLE harness<small>${where}</small></span></a><nav aria-label="This try-out"><a href="/teacher">The teacher’s page</a><a href="/resources">Resources</a></nav></header>`;

// What a course or chat page is, told from what it holds, so a package of anyone's reads the same way.
function shown(page, doc) {
  const graph = page.agent ? graphOf(page.agent) : null;
  const panels = page.workspace?.panels || [];
  const notes = [];
  if (graph?.nodes.some((node) => node.type === 'vetting')) notes.push('A reviewer checks every reply');
  else if (graph) notes.push('No reviewer');
  if (graph?.nodes.some((node) => node.type === 'knowledge')) notes.push('Answers from its own files');
  if (panels.some((panel) => panel.type === 'questions')) notes.push('Questions beside the AI');
  if (panels.some((panel) => panel.type === 'reading')) notes.push('A reading beside the AI');
  if (panels.some((panel) => panel.type === 'writing')) notes.push('An essay beside the AI');
  for (const panel of panels) if (panel.type === 'embed') notes.push(`Its lab loads from ${new URL(panel.url).hostname}`);
  if ((doc?.course?.activities || []).some((activity) => activity.voice?.input)) notes.push('You type here: voice needs VIABLE');
  return notes;
}

function cardsOf({ courses, chats }) {
  const cards = [];
  for (const course of courses.values()) {
    const activities = [...course.activities.values()];
    const first = activities.find((activity) => activity.agent) ?? activities[0];
    if (!first) continue;
    const starter = (first.workspace?.panels || []).flatMap((panel) => panel.starters || [])[0] ?? null;
    const vets = first.agent && graphOf(first.agent).nodes.some((node) => node.type === 'vetting');
    cards.push({ title: course.doc.title || course.title, text: course.doc.description || course.description, href: `/course/${course.code}/${first.key}`, doc: course.doc, ask: vets ? 'Just tell me the answer.' : starter, notes: shown(first, course.doc), vets });
  }
  for (const page of chats.values()) {
    // A package with a course shows once: its chat page is a link on the course's card.
    const card = cards.find((item) => item.doc === page.agent?.doc);
    if (card) card.chat = `/chat/${page.slug}`;
    else cards.push({ title: page.settings.title, text: page.agent?.description ?? null, href: `/chat/${page.slug}`, ask: page.settings.starters?.[0] ?? null, notes: shown(page, null), vets: graphOf(page.agent).nodes.some((node) => node.type === 'vetting') });
  }
  return cards.sort((a, b) => Number(Boolean(b.vets)) - Number(Boolean(a.vets)));
}

const LAUNCHER_CSS = `${SHARED_CSS}
.hero{background:var(--field-mist)}
.hero-body{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);gap:clamp(28px,5vw,72px);align-items:center;padding-block:clamp(28px,5vw,72px) clamp(36px,6vw,84px)}
.hero h1{max-width:13em}
.hero .v-lead{max-width:34em;margin:20px 0 0}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin:26px 0 0}
.mode{max-width:36em;margin:22px 0 0;padding-top:14px;border-top:1px solid var(--public-rule-strong);color:var(--public-text);font-size:.9375rem;line-height:1.5}
.mode.warning{border-top:0;padding-top:0;margin-top:10px;color:var(--pencil-red);font-weight:500}
.scene{padding:clamp(20px,2.6vw,30px);border-radius:var(--radius-lg);background:var(--surface);box-shadow:var(--public-shadow)}
.scene .who{margin:0;color:var(--muted);font-size:.8125rem;font-weight:600}
.scene .asked{margin:2px 0 16px;color:var(--public-ink);font-size:clamp(1.375rem,2.4vw,1.75rem);font-weight:300;line-height:1.2;letter-spacing:-.025em}
.scene .round-body{grid-template-columns:minmax(0,1fr)}
.scene figcaption{margin:16px 0 0;padding-top:10px;border-top:1px solid var(--public-rule);color:var(--muted);font-size:.8125rem;line-height:1.4}
.band{padding-block:clamp(36px,5vw,72px)}
.band>.wrap>h2{max-width:18em}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:26px 0 0;padding:0;list-style:none}
.card{position:relative;display:flex;flex-direction:column;height:100%;padding:22px 22px 18px;border-radius:var(--radius-lg);transition:transform .2s var(--ease-out)}
.card h3{font-size:1.3125rem;font-weight:400}
.card h3 a{color:var(--public-ink);text-decoration:none}
.card h3 a::after{content:"";position:absolute;inset:0;border-radius:var(--radius-lg)}
.card h3 a:focus-visible{outline:0}
.card h3 a:focus-visible::after{outline:2px solid var(--ink-blue);outline-offset:2px}
.card p{margin:10px 0 0;font-size:.9375rem;line-height:1.45}
.card .ask{margin-top:auto;padding-top:14px;color:var(--public-ink);font-size:.9375rem;line-height:1.35}
.card .ask span{display:block;color:var(--muted);font-size:.8125rem}
.card ul{display:flex;flex-wrap:wrap;gap:0 12px;margin:12px 0 0;padding:10px 0 0;border-top:1px solid var(--public-rule-strong);list-style:none;color:var(--muted);font-size:.8125rem;line-height:1.5}
.card .also{position:relative;z-index:1;margin-top:8px;font-size:.875rem}
.card:hover{transform:translateY(-2px)}
.live{background:var(--field-stone)}
.live-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(20px,4vw,48px);margin-top:18px}
.live h3{margin:0 0 8px}
.live p{margin:0 0 12px;max-width:36em}
.after-code{margin-top:12px}
.copy-row{display:flex;justify-content:flex-end;margin-top:8px}
.prompt{white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-width:980px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){.hero-body,.live-body{grid-template-columns:minmax(0,1fr)}}
@media (max-width:560px){.cards{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:reduce){.card{transition:none}.card:hover{transform:none}}`;

// Only in a try-out started with --tour, or a static copy. Any site can send a person to /?tour=1.
const TOUR_START = (tour) => `const tour = ${scriptJson(tour)};
  if (new URLSearchParams(location.search).has('tour')) {
    // Only the try-out's own: on a static copy this origin is the hosting site's.
    try { Object.keys(localStorage).filter((key) => key.startsWith('viable-chat:') || key.startsWith('viable-try:')).forEach((key) => localStorage.removeItem(key)); sessionStorage.setItem(${scriptJson(TOUR_KEY)}, tour); } catch { /* A private window plays nothing. */ }
    await fetch('/try/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    location.replace(tour);
    return;
  }`;

const LAUNCHER_SCRIPT = (tour) => `(async function () {
  ${tour ? TOUR_START(tour) : ''}
  for (const button of document.querySelectorAll('[data-copy]')) {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const text = document.getElementById(button.dataset.copy).textContent;
      try { await navigator.clipboard.writeText(text); button.textContent = 'Copied'; } catch { button.textContent = 'Select it and copy'; }
    });
  }
})();`;

/** The launcher: one quiet page, what's here as cards, how to take it live. */
export function launcherPage({ courses, chats, note, warning = null, rounds = null, exported = false, tour = false }, nonce) {
  const cards = cardsOf({ courses, chats });
  const featured = cards.find((card) => card.vets) ?? null;
  const first = featured ?? cards[0] ?? null;
  const others = TARGET_NAMES.filter((name) => name !== 'cloudflare').join(', ');
  const scene = featured && rounds ? `<figure class="scene" aria-label="An example of what the panel shows"><p class="who">The learner wrote</p><p class="asked">Just tell me the answer.</p>${treeHtml(vettingRounds(rounds, { watch: true }))}<figcaption>From the fractions tutor. The learner only ever sees the reply that passed.</figcaption></figure>` : '';
  const prompt = `I have a VIABLE course package, my-course.json. Follow the deploying-a-viable-course Skill in ${REPOSITORY} to put it on Cloudflare. Ask me only what you can’t work out, and stop before anything that costs money.`;
  const noun = cards.length === 1 ? 'What you opened' : cards.length === 6 ? 'Six examples to open' : `${cards.length} to open`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Try the VIABLE harness</title>
<style nonce="${nonce}">${themeCss({ fonts: 'url' })}
${PARTS_CSS}
${LAUNCHER_CSS}</style>
</head>
<body>
<div class="hero">
${header(exported ? 'Try it in your browser' : undefined)}
<main class="hero-body wrap" id="main">
<div>
<h1>${featured ? 'Ask the tutor for the answer. Watch what stops it.' : 'Open it, and watch what the AI does.'}</h1>
<p class="v-lead">These are real course pages. Beside each one, a panel shows what the AI did with every message: what the teacher set, the draft, the reviewer’s marks, and what reached the learner.</p>
${first ? `<div class="actions"><a class="v-btn is-primary" href="${esc(first.href)}">Open ${esc(featured ? 'the tutor' : first.title)}</a>${featured && tour ? `<a class="v-btn" href="/?tour=1">Watch it play by itself</a>` : ''}</div>` : ''}
<p class="mode">${esc(note)}</p>
${warning ? `<p class="mode warning" role="alert">${esc(warning)}</p>` : ''}
</div>
${scene}
</main>
</div>
<section class="band" aria-labelledby="open-title">
<div class="wrap">
<h2 id="open-title">${esc(noun)}</h2>
<ul class="cards">
${cards.map((card, i) => `<li><article class="card v-field ${FIELDS[i % FIELDS.length]}"><h3><a href="${esc(card.href)}">${esc(card.title)}</a></h3>${card.text ? `<p>${esc(card.text)}</p>` : ''}${card.ask ? `<p class="ask"><span>Try asking</span>${esc(card.ask)}</p>` : ''}<ul>${card.notes.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>${card.chat ? `<p class="also"><a href="${esc(card.chat)}">Open its chat page</a></p>` : ''}</article></li>`).join('\n')}
</ul>
</div>
</section>
<section class="band live" aria-labelledby="live-title">
<div class="wrap">
<h2 id="live-title">Take it live</h2>
<div class="live-body">
<div>
<h3>With two commands</h3>
<p>Your course, on a server you control. <code>inspect</code> says what a package needs and what won’t run where.</p>
${exported ? `<pre class="v-code">npx github:VIABLE-Learning-Lab/viable-harness</pre><p class="after-code">Or, with the harness installed:</p>` : ''}
<pre class="v-code">viable-harness inspect my-course.json
viable-harness deploy cloudflare my-course.json --out site</pre>
<p class="after-code">It also runs on ${esc(others)}: put that name in place of cloudflare.</p>
</div>
<div>
<h3>Or hand it to an AI assistant</h3>
<p>Paste this, with your package beside it.</p>
<pre class="v-code prompt" id="prompt">${esc(prompt)}</pre>
<div class="copy-row"><button class="v-btn is-small" type="button" data-copy="prompt" hidden>Copy</button></div>
</div>
</div>
</div>
</section>
<footer class="foot wrap"><p>The harness is open source under the MIT license.</p><p><a href="${REPOSITORY}">The repository</a></p></footer>
<script nonce="${nonce}">${LAUNCHER_SCRIPT(tour ? featured?.href ?? null : null)}</script>
</body>
</html>`;
}

const RESOURCES_CSS = `${SHARED_CSS}
.head{background:var(--field-sage)}
.head-body{padding-block:clamp(20px,4vw,48px) clamp(28px,5vw,60px)}
.head h1{max-width:14em}
.head .v-lead{max-width:36em;margin:16px 0 0}
.group{padding-block:clamp(24px,4vw,44px) 0}
.group>h2{max-width:20em}
.group>p{max-width:40em;margin:8px 0 0}
.items{margin:18px 0 0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.items>li{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:6px clamp(20px,4vw,48px);padding:16px 0;border-bottom:1px solid var(--public-rule)}
.items h3{font-size:1.125rem}
.items h3 a{color:var(--public-ink);text-decoration:none}
.items h3 a:hover{color:var(--ink-blue)}
.items p{margin:4px 0 0;font-size:.9375rem;line-height:1.45}
.items .meta{color:var(--muted);font-size:.8125rem}
.items pre{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-width:760px){.items>li{grid-template-columns:minmax(0,1fr)}}`;

/** The catalog as a page: what is connected first, with what each would do. Lists; loads nothing from elsewhere. */
export function resourcesPage(entries, { exported = false } = {}) {
  const at = (level) => entries.filter((entry) => entry.connect.level === level);
  const groups = [
    ['Built in', 'In the harness already, with nothing to download.', at(3)],
    ['Connected', 'One command, and it changes what you see: a test suite, a judge, a calibration set, knowledge to answer from.', at(2)],
    ['Fetchable', 'The harness brings it down for you, once its license is shown and accepted.', at(1)],
    ['Listed', 'Worth knowing, and not connected. Each says why.', at(0)]
  ].filter(([, , list]) => list.length);
  const row = (entry) => {
    const license = entry.license.spdx.length ? entry.license.spdx.join(', ') : 'License not stated';
    return `<li><div><h3><a href="${esc(entry.url)}" rel="noopener noreferrer">${esc(entry.name)}</a></h3><p>${esc(entry.summary)}</p><p class="meta">${esc(license)}, ${esc(entry.access)}</p></div><div><p>${esc(entry.connect.note)}</p>${entry.connect.command ? `<pre class="v-code">${esc(entry.connect.command)}</pre>` : ''}</div></li>`;
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Resources | VIABLE harness</title>
<style>${themeCss({ fonts: 'url' })}
${RESOURCES_CSS}</style>
</head>
<body>
<div class="head">
${header(exported ? 'Try it in your browser' : undefined)}
<main class="head-body wrap" id="main">
<h1>Resources that do something</h1>
<p class="v-lead">Open data, standards and tools for K-12 AI, with what each does in the harness. ${plural(entries.length, 'resource')}, the connected ones first. An entry describes a resource; it doesn’t endorse it.</p>
</main>
</div>
${groups.map(([title, text, list]) => `<section class="group wrap"><h2>${esc(title)}</h2><p>${esc(text)}</p><ul class="items">${list.map(row).join('\n')}</ul></section>`).join('\n')}
<footer class="foot wrap"><p>From the catalog in the harness: <code>viable-harness catalog</code>.</p></footer>
</body>
</html>`;
}

/** What the teacher's page gets in a try-out: where it is, and accepting a suggestion for this try. */
export function teacherExtras({ suggestions, page, activityUrl, made }, nonce) {
  // Everyone is in one class here, so a change for one section wouldn't show.
  const open = suggestions.filter((item) => item?.patch && item.id != null && !item.patch.sections).map((item) => ({ patch: item.patch, anchor: `suggestion-${String(item.id).replace(/[^A-Za-z0-9_-]/g, '-')}` }));
  const before = `<style>.try-strip{display:flex;flex-wrap:wrap;align-items:center;gap:4px 18px;padding:10px clamp(16px,4vw,40px);background:var(--code-bg);color:var(--code-ink);font-size:.9375rem}.try-strip a{color:inherit;text-decoration-color:currentColor}.try-strip span{margin-right:auto}.try-accept{margin-top:14px}.try-done{margin-top:14px;color:var(--pass-green);font-weight:600}</style><div class="try-strip"><span>${made ? 'A made-up class, so you can see what this page does. It lives in examples/class.' : 'What learners did in this try-out, on this computer.'}</span><a href="/">Back to the try-out</a></div>`;
  const after = `<script nonce="${nonce}">(function () {
  const open = ${scriptJson(open)};
  for (const { patch, anchor } of open) {
    const where = document.querySelector('#' + anchor + ' .grounds');
    if (!where) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v-btn is-primary is-small try-accept';
    button.textContent = 'Accept for this try';
    button.addEventListener('click', async () => {
      button.disabled = true;
      const res = await fetch('/try/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: ${scriptJson(page)}, patch }) }).catch(() => null);
      const line = document.createElement('p');
      line.className = 'try-done';
      if (res && res.ok) {
        line.append('Accepted for this try. ');
        const link = document.createElement('a');
        link.href = ${scriptJson(activityUrl)};
        link.textContent = 'Ask the tutor again, and watch what changes.';
        line.append(link);
      } else line.textContent = 'That didn’t save. Reload the page and try again.';
      button.replaceWith(line);
    });
    where.append(button);
  }
})();</script>`;
  return { before, after };
}
