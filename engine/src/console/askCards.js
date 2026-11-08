/**
 * What Ask hands back: small cards a teacher uses, not only reads. A thread keeps which card it showed, never its contents, so a
 * card is drawn again from what is true now, with names only here on the teacher's page and never in what a model gets. Buttons
 * and forms are the console's own (client.js), so a card does what the page does. No Node built-ins.
 */
import { showCode } from '../server/classList.js';
import { activityKeys } from '../server/library.js';
import { kindOfActivity, courseAt } from './course.js';
import { flowOf, flowWords, PANEL_WORDS, reviewOf } from './flow.js';
import { esc, qrSvg, reachOf, say } from './forms.js';

const HELP_WORDS = { step_up: 'asks first, then hints, then shows an example', ask_first: 'asks what they think first', hint: 'gives hints only, never the answer', explain: 'explains when they are stuck', check_only: 'only checks their work' };
const KIND_WORDS = { chat: 'A conversation', page: 'A page to read', questions: 'Questions', writing: 'Writing', reading: 'Reading', embed: 'A web page', several: 'Several panels' };
const SIGN_IN = { code: 'with a personal code on a card', ask: 'by typing their name or ID', browser: 'without signing in: each browser is one learner' };

export const activitiesOf = (doc) => { const list = doc.course?.activities || []; const keys = activityKeys(list); return list.map((activity, index) => ({ ...activity, key: keys[index] })); };
const isOpen = (activity) => activity.release !== 'hidden';

const card = (title, body, { id = '', className = '' } = {}) => `<section class="ask-card v-card ${className}"${id ? ` id="${esc(id)}" data-say-box` : ''}><h3>${esc(title)}</h3>${body}</section>`;
const copyRow = (label, link, state = '') => `<li><div><strong>${esc(label)}</strong>${state}<code>${esc(link)}</code></div><button class="v-btn is-small" type="button" data-copy="${esc(link)}">Copy</button></li>`;

// Opening something a learner would trip on says so first.
function openButton(doc, code, activity, meta) {
  const trips = reviewOf(doc, activity).filter((note) => note.level === 'fix');
  return `<button class="v-btn is-small" type="button" data-api="POST courses/${esc(code)}/activities/${esc(activity.key)}/release" data-body='${esc(JSON.stringify({ version: meta.version, release: 'open' }))}' data-said="Open to learners."${trips.length ? ` data-confirm="${esc(`Learners can reach “${activity.title}” once it’s open, and ${trips.map((note) => note.says.charAt(0).toLowerCase() + note.says.slice(1)).join(' ')} Open it anyway?`)}" data-yes="Open it"` : ''}>Open it</button>`;
}

const SHOWS = { page: 'to read', questions: 'to answer', writing: 'to write', reading: 'to read', embed: 'to try' };

/** One activity as what learners do, so a teacher can see at a glance whether it is any good, and the way to try it. */
async function activityCard(here, spec) {
  const { code, doc, meta } = await courseAt(here.library, spec.course);
  const activity = activitiesOf(doc).find((item) => item.key === spec.activity);
  if (!activity) return card('This has moved on', '<p class="v-note">That activity isn’t in this course anymore.</p>');
  const steps = flowOf(doc, activity);
  const taught = activity.teaching || {};
  const notes = reviewOf(doc, activity);
  const row = (step, index) => `<li><span class="ask-flow-n">${index + 1}</span><div><strong>${esc(step.title)}</strong><small>${esc(step.panels.map((panel) => (panel.type === 'questions' ? `${panel.questions} question${panel.questions === 1 ? '' : 's'}` : SHOWS[panel.type] || PANEL_WORDS[panel.type])).join(', '))}${step.has_ai ? ', with the AI' : ''}</small>${step.says ? `<q>${esc(step.says)}</q>` : ''}</div></li>`;
  return card(activity.title, `<div class="ask-activity-head"><span class="v-pill${isOpen(activity) ? ' is-open' : ''}">${isOpen(activity) ? 'Open' : 'Hidden'}</span>${activity.minutes ? `<span class="v-note">About ${esc(activity.minutes)} minutes</span>` : ''}${taught.design?.label ? `<span class="v-note">Built on ${esc(taught.design.label)}</span>` : ''}</div>
${taught.goal ? `<p class="ask-goal">${esc(taught.goal)}</p>` : ''}
${steps.length ? `<ol class="ask-flow">${steps.map(row).join('')}</ol>` : `<p class="v-note">A conversation with the AI${activity.opening?.says ? `, which starts: “${esc(activity.opening.says)}”` : ''}.</p>`}
${notes.length ? `<ul class="ask-notes">${notes.map((note) => `<li class="is-${esc(note.level)}">${esc(note.says)}</li>`).join('')}</ul>` : ''}${say()}
<div class="actions"><a class="v-btn is-small is-primary" href="/console/api/courses/${esc(code)}/try/${esc(activity.key)}" target="_blank" rel="noopener">Try it as a learner</a><a class="v-btn is-small" href="/console/courses/${esc(code)}/activities/${esc(activity.key)}">See all of it</a>${isOpen(activity) ? '' : openButton(doc, code, activity, meta)}</div>`, { id: `activity-${code}-${activity.key}` });
}

async function courseCard(here, spec) {
  const { code, doc, meta } = await courseAt(here.library, spec.course);
  const list = activitiesOf(doc);
  return card(doc.course.title, `${list.length ? `<ul class="ask-rows ask-activities">${list.map((activity) => `<li><div><a href="/console/courses/${esc(code)}/activities/${esc(activity.key)}"><strong>${esc(activity.title)}</strong></a><small>${esc(flowWords(doc, activity))}${activity.teaching?.help ? `. The AI ${esc(HELP_WORDS[activity.teaching.help])}` : ''}</small></div><span class="v-pill${isOpen(activity) ? ' is-open' : ''}">${isOpen(activity) ? 'Open' : 'Hidden'}</span><span class="ask-row-do">${isOpen(activity) ? '' : openButton(doc, code, activity, meta)}</span></li>`).join('')}</ul>` : '<p class="v-note">No activities yet.</p>'}${say()}
<div class="actions"><a class="v-btn is-small is-primary" href="/console/api/courses/${esc(code)}/try" target="_blank" rel="noopener">Try it as a learner</a><a class="v-btn is-small" href="/console/courses/${esc(code)}">Change it</a><a class="v-btn is-small" href="/console/courses/${esc(code)}/share">Share</a></div>`, { id: `course-${code}` });
}

async function tryCard(here, spec) {
  const { code, doc } = await courseAt(here.library, spec.course);
  const activity = spec.activity ? activitiesOf(doc).find((item) => item.key === spec.activity) : null;
  return card(`Try ${activity ? `“${activity.title}”` : `“${doc.course.title}”`} as a learner`, `<p class="v-note">See what they see, and what the AI does. Nothing you do there counts in Progress.</p>
<div class="actions"><a class="v-btn is-small is-primary" href="/console/api/courses/${esc(code)}/try${activity ? `/${esc(activity.key)}` : ''}" target="_blank" rel="noopener">Try it</a></div>`);
}

async function shareCard(here, spec) {
  const { code, doc, meta } = await courseAt(here.library, spec.course);
  const { base, local } = reachOf(here.origin, here.addresses);
  const link = `${base}/course/${code}`;
  const list = activitiesOf(doc);
  const open = list.filter(isOpen);
  const sections = await here.classes.sections(code);
  const note = meta.status === 'closed' ? '<p class="notice">This course is closed, so its link doesn’t open it. Open it again in Settings.</p>'
    : !open.length ? '<p class="notice">Nothing is open yet, so learners would find an empty course. Open an activity first.</p>' : '';
  return card(`Give your class “${doc.course.title}”`, `${note}${local && !here.addresses?.length ? '<p class="notice">This address only opens on this computer. <a href="/console/courses/' + esc(code) + '/share">To reach it from elsewhere</a></p>' : ''}
<div class="ask-share"><div>
<p class="v-note">The course’s link stays the same all term. What they can open changes as activities open.</p>
<p class="ask-link"><code>${esc(link)}</code></p>
${here.joinAt ? `<p class="v-note">With no link to hand, they can go to <strong>${esc(here.joinAt)}</strong> and type <strong>${esc(showCode(code))}</strong>.</p>` : ''}
<div class="actions"><button class="v-btn is-small is-primary" type="button" data-copy="${esc(link)}">Copy link</button><a class="v-btn is-small" href="/console/courses/${esc(code)}/share/poster">Show to the class</a></div>
</div>${qrSvg(link, { label: `QR code for ${link}` })}</div>
${open.length ? `<details class="ask-more"${open.length <= 6 ? ' open' : ''}><summary>A link for each activity</summary><ul class="ask-rows">${list.map((activity) => copyRow(activity.title, `${link}/${activity.key}`, isOpen(activity) ? '' : ' <span class="v-note">hidden for now</span>')).join('')}</ul></details>` : ''}
${sections.length ? `<details class="ask-more" open><summary>A link for each section</summary><ul class="ask-rows">${sections.map((section) => copyRow(section.name, `${link}?section=${encodeURIComponent(section.key)}`)).join('')}</ul></details>` : ''}`);
}

async function classListCard(here, spec) {
  const { code, doc } = await courseAt(here.library, spec.course);
  const people = (await here.classes.people(code)).filter((person) => person.listed);
  const way = doc.course.identify === 'code' || doc.course.identify === 'ask' ? doc.course.identify : 'browser';
  const fieldId = `ask-list-${code}`;
  return card(`The class list of “${doc.course.title}”`, `<p class="v-note">${people.length ? `${people.length} on the list. ` : ''}Learners come in ${esc(SIGN_IN[way])}. <a href="/console/courses/${esc(code)}/people">Change that on People</a>.</p>
<form class="ask-list" id="${esc(fieldId)}-form" data-api="POST courses/${esc(code)}/people" data-busy="Adding…">
<label class="v-label" for="${esc(fieldId)}">Paste your class list, one name per line</label>
<textarea class="v-input" id="${esc(fieldId)}" name="list" rows="5" placeholder="Ada Lovelace&#10;Grace Hopper, Period 2">${esc(spec.prefill || '')}</textarea>
<p class="v-note">This goes straight to the list. The AI doesn’t read it, and names never reach a model.</p>
<div class="actions"><button class="v-btn is-small is-primary" type="submit">Add to the list</button>${people.length ? `<a class="v-btn is-small" href="/console/courses/${esc(code)}/people/cards">Print code cards</a>` : ''}<a class="v-btn is-small" href="/console/courses/${esc(code)}/people">See everyone</a></div>${say()}
</form>`, { id: `${fieldId}-card` });
}

async function progressCard(here, spec) {
  const { code, doc } = await courseAt(here.library, spec.course);
  const [people, cells] = await Promise.all([here.classes.people(code), here.records.cells(code)]);
  const list = activitiesOf(doc).filter(isOpen);
  const count = (key, field) => Object.values(cells).filter((mine) => mine[key]?.[field]).length;
  return card(`Who has done what in “${doc.course.title}”`, `<p class="v-note">${people.length} learner${people.length === 1 ? '' : 's'}.</p>
${list.length ? `<ul class="ask-rows">${list.map((activity) => `<li><div><strong>${esc(activity.title)}</strong><small>${count(activity.key, 'opened_at')} started · ${count(activity.key, 'done_at')} done</small></div></li>`).join('')}</ul>` : ''}
<div class="actions"><a class="v-btn is-small is-primary" href="/console/courses/${esc(code)}/progress">See each learner</a><a class="v-btn is-small" href="/console/courses/${esc(code)}/progress/look">What to look at</a></div>`);
}

// A change learners would meet: it waits for a person's click on this card, and the model can't press it.
async function openCard(here, spec, { thread, id, state }) {
  const { doc } = await courseAt(here.library, spec.course);
  const activity = activitiesOf(doc).find((item) => item.key === spec.activity);
  const sectionName = spec.section ? (await here.classes.sections(spec.course)).find((item) => item.id === spec.section)?.name : null;
  const who = sectionName || 'everyone in the course';
  const title = activity?.title || 'This activity';
  if (state === 'done') return card(`“${title}” is ${spec.open ? `open for ${who}` : 'hidden'}`, `<p class="v-mark pass">You pressed ${spec.open ? 'Open' : 'Hide'}.</p>${say()}`, { id: `pending-${id}`, className: 'is-settled' });
  if (state === 'declined') return card(`“${title}” wasn’t changed`, `<p class="v-note">You said not yet. It stays as it was.</p>${say()}`, { id: `pending-${id}`, className: 'is-settled' });
  const api = `ask/${esc(thread)}/pending/${esc(id)}`;
  const [own, sections] = spec.open ? [{}, []] : await Promise.all([here.classes.releases(spec.course), here.classes.sections(spec.course)]);
  const stays = Object.entries(own[spec.activity] || {}).filter(([, item]) => item?.release !== 'hidden').map(([section]) => sections.find((item) => item.id === section)?.name).filter(Boolean);
  const help = activity?.teaching?.help ? `<li>The AI ${esc(HELP_WORDS[activity.teaching.help])}.</li>` : activity?.agent_ref ? '<li>You haven’t said how far the AI may go.</li>' : '<li>No AI in this activity.</li>';
  return card(spec.open ? `Open “${title}”?` : `Hide “${title}”?`, `${spec.open ? `<ul class="ask-facts"><li>For ${esc(who)}, from now.</li>${help}<li>You can hide it again at any time.</li></ul>` : `<p class="v-note">Learners can’t open it after this${stays.length ? `, except ${esc(stays.join(', '))}, where it is open on its own: change that on the course’s page` : ''}. What they did stays.</p>`}
<div class="actions"><button class="v-btn is-small is-primary" type="button" data-api="POST ${api}" data-body='{"yes":true}'>${spec.open ? 'Open it' : 'Hide it'}</button><button class="v-btn is-small" type="button" data-api="POST ${api}" data-body='{"yes":false}'>Not yet</button></div>${say()}`, { id: `pending-${id}`, className: 'is-waiting' });
}

// A change learners would meet, as a person's click: what it would be, in words.
async function changeCard(here, spec, { thread, id, state }) {
  const { doc } = await courseAt(here.library, spec.course);
  const activity = spec.activity ? activitiesOf(doc).find((item) => item.key === spec.activity) : null;
  const title = activity?.title || doc.course.title;
  if (state === 'done') return card(`“${title}” is changed`, `<p class="v-mark pass">You pressed Change it.</p>${say()}`, { id: `pending-${id}`, className: 'is-settled' });
  if (state === 'declined') return card(`“${title}” wasn’t changed`, `<p class="v-note">You said not yet. It stays as it was.</p>${say()}`, { id: `pending-${id}`, className: 'is-settled' });
  const api = `ask/${esc(thread)}/pending/${esc(id)}`;
  return card(`Change “${title}”?`, `<p class="v-note">Learners can reach this now, so they’d meet the change on their next visit.</p>
<ul class="ask-facts">${(spec.words || []).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
<div class="actions"><button class="v-btn is-small is-primary" type="button" data-api="POST ${api}" data-body='{"yes":true}'>Change it</button><button class="v-btn is-small" type="button" data-api="POST ${api}" data-body='{"yes":false}'>Not yet</button></div>${say()}`, { id: `pending-${id}`, className: 'is-waiting' });
}

// A file that read as a list of names: it stays off the model until a person says it isn't one.
const notAListCard = (_here, spec, { thread, id }) => (spec.allowed
  ? card(`“${spec.name}” isn’t a list`, `<p class="v-note">You said so, so the AI can read it. Say what to do with it.</p>${say()}`, { id: `list-${id}`, className: 'is-settled' })
  : card(`“${spec.name}” looks like a list of names`, `<p class="v-note">So the AI didn’t read it: names never reach a model. A class list goes on a course’s People page.</p>
<div class="actions"><button class="v-btn is-small" type="button" data-api="POST ask/${esc(thread)}/read-anyway/${esc(spec.material)}">It isn’t a list: let the AI read it</button></div>${say()}`, { id: `list-${id}` }));

const toolsCard = (here) => card('Other tools for your teaching', `<ul class="ask-rows">${(here.otherTools || []).map((tool) => `<li><div><a href="${esc(tool.url)}" target="_blank" rel="noopener"><strong>${esc(tool.name)}</strong></a><small>${esc(tool.summary)}</small></div></li>`).join('')}</ul>`);

const DRAW = { course: courseCard, activity: activityCard, try: tryCard, share: shareCard, 'class-list': classListCard, progress: progressCard, open: openCard, change: changeCard, 'not-a-list': notAListCard, tools: toolsCard };

/** A card as HTML, from what is true now. One whose course has gone says so. */
export async function drawCard(here, spec, context = {}) {
  try { return await DRAW[spec.kind](here, spec, context); } catch (error) {
    if (error?.status === 404) return card('This has moved on', `<p class="v-note">${esc(error.message)}</p>`);
    throw error;
  }
}

export const ASK_CARD_CSS = `.ask-card.v-card{display:grid;gap:12px;padding:16px 18px;border:1px solid var(--public-rule);box-shadow:none}
.ask-card h3{font-size:1rem;font-weight:600;letter-spacing:0;color:var(--public-ink);overflow-wrap:anywhere}
.ask-card.is-waiting.v-card{border-color:var(--ink-blue)}
.ask-card.is-settled.v-card{background:transparent}
.ask-rows{display:grid;gap:0;margin:0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.ask-rows li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--public-rule)}
.ask-rows li>div{display:grid;gap:2px;min-width:0}
.ask-rows a{color:var(--public-ink);text-decoration:none}
.ask-rows a:hover{text-decoration:underline}
.ask-rows strong{font-weight:600}
.ask-rows small{color:var(--muted);font-size:.8125rem}
.ask-rows code{font-size:.8125rem;overflow-wrap:anywhere}
.ask-rows.ask-activities li{display:grid;grid-template-columns:minmax(0,1fr) 74px 92px;justify-content:initial}
.ask-activities .v-pill{justify-self:start}
.ask-row-do{display:flex;justify-content:flex-end}
.ask-activity-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:-4px}
.ask-activity-head .v-note{font-size:.875rem}
.ask-goal{margin:0;color:var(--public-text);line-height:1.5}
.ask-flow{display:grid;gap:0;margin:0;padding:0;list-style:none;counter-reset:none}
.ask-flow li{position:relative;display:grid;grid-template-columns:26px minmax(0,1fr);gap:10px;padding:8px 0}
.ask-flow li+li::before{content:"";position:absolute;left:12.5px;top:-6px;height:14px;border-left:1px solid var(--public-rule-strong)}
.ask-flow-n{display:grid;place-items:center;width:26px;height:26px;border:1px solid var(--public-rule-strong);border-radius:50%;color:var(--public-ink);font-size:.8125rem;font-variant-numeric:tabular-nums}
.ask-flow div{display:grid;gap:1px;min-width:0}
.ask-flow strong{color:var(--public-ink);font-weight:600}
.ask-flow small{color:var(--muted);font-size:.8125rem}
.ask-flow q{margin-top:3px;color:var(--public-text);font-size:.875rem;line-height:1.45;quotes:"“" "”"}
.ask-notes{display:grid;gap:6px;margin:0;padding:10px 12px;border-radius:var(--radius-sm);background:var(--field-mist);list-style:none;font-size:.875rem;line-height:1.45}
.ask-notes li{position:relative;padding-left:14px;color:var(--public-text)}
.ask-notes li::before{content:"";position:absolute;left:0;top:.55em;width:6px;height:6px;border-radius:50%;background:var(--public-rule-strong)}
.ask-notes li.is-fix::before{background:var(--pencil-red)}
.ask-share{display:grid;grid-template-columns:minmax(0,1fr) 132px;gap:16px;align-items:start}
.ask-share>div{display:grid;gap:10px}
.ask-share .qr{width:132px;height:auto;border-radius:var(--radius-sm)}
.ask-link{margin:0}
.ask-link code{display:inline-block;padding:7px 10px;border-radius:var(--radius-sm);background:var(--field-mist);color:var(--public-ink);font-size:.9375rem;overflow-wrap:anywhere}
.ask-more summary{color:var(--ink-blue);font-size:.9375rem;cursor:pointer}
.ask-more .ask-rows{margin-top:8px}
.ask-list{display:grid;gap:8px}
.ask-facts{display:grid;gap:4px;margin:0;padding-left:1.2em;color:var(--public-text);font-size:.9375rem}
@media (max-width:560px){.ask-share{grid-template-columns:minmax(0,1fr)}.ask-share .qr{width:180px}.ask-rows.ask-activities li{grid-template-columns:minmax(0,1fr) auto}.ask-activities .ask-row-do{grid-column:1/-1;justify-content:flex-start}}`;
