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
import { icon } from './icons.js';
import { goalWords, goalsIn, isCheck } from './goals.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const HELP_WORDS = { step_up: 'asks first, then hints, then shows an example', ask_first: 'asks what they think first', hint: 'gives hints only, never the answer', explain: 'explains the idea directly, then has them try one', check_only: 'only checks their work' };
const KIND_WORDS = { chat: 'A conversation', page: 'A page to read', questions: 'Questions', writing: 'Writing', reading: 'Reading', embed: 'A web page', several: 'Several panels' };
const SIGN_IN = { code: 'with a personal code on a card', ask: 'by typing their name or ID', browser: 'without signing in: each browser is one learner' };

export const activitiesOf = (doc) => { const list = doc.course?.activities || []; const keys = activityKeys(list); return list.map((activity, index) => ({ ...activity, key: keys[index] })); };
const isOpen = (activity) => activity.release !== 'hidden';
// Open to learners now: for the whole class, or for one of its sections (which has a release of its own).
async function openerOf(here, code) {
  const releases = here.classes?.releases ? await here.classes.releases(code).catch(() => ({})) : {};
  return (activity) => isOpen(activity) || Object.values(releases[activity.key] || {}).some((own) => own && own.release !== 'hidden');
}

const card = (title, body, { id = '', className = '' } = {}) => `<section class="ask-card v-card ${className}"${id ? ` id="${esc(id)}" data-say-box` : ''}><h3>${esc(title)}</h3>${body}</section>`;
const copyRow = (label, link, state = '') => `<li><div><strong>${esc(label)}</strong>${state}<code>${esc(link)}</code></div><button class="v-btn is-small" type="button" data-copy="${esc(link)}">Copy</button></li>`;

// Opening something a learner would trip on says so first. No version: a card can be drawn before Ask's next change to the
// same course, and opening is about who can reach it, not about its words.
function openButton(code, activity, said = 'Open to learners.') {
  return `<button class="v-btn is-small" type="button" data-api="POST courses/${esc(code)}/activities/${esc(activity.key)}/release" data-body='{"release":"open"}' data-checks="courses/${esc(code)}/checks?activity=${esc(activity.key)}" data-busy="Opening…" data-said="${esc(said)}">Open to learners</button>`;
}
// Where an activity sits in a course, and what it is for: its unit, the goals it works toward, whether it is a check.
const placeWords = (doc, activity) => [(doc.course.units || []).find((unit) => unit.ref === activity.unit_ref)?.title, goalWords(activity, goalsIn(doc))].filter(Boolean);

const SHOWS = { page: 'to read', questions: 'to answer', writing: 'to write', reading: 'to read', embed: 'to try' };

/**
 * One activity as what learners do, so a teacher can see at a glance whether it is any good, and the way to try it. Once it is open,
 * how learners get to it, unless the conversation already has the course's links (context.shared: the courses it has them for).
 */
async function activityCard(here, spec, context = {}) {
  const { code, doc, meta } = await courseAt(here.library, spec.course);
  const activity = activitiesOf(doc).find((item) => item.key === spec.activity);
  const opened = await openerOf(here, code);
  if (!activity) return card('This has moved on', '<p class="v-note">That activity isn’t in this course anymore.</p>');
  const steps = flowOf(doc, activity);
  const taught = activity.teaching || {};
  const notes = reviewOf(doc, activity);
  const row = (step, index) => `<li><span class="ask-flow-n">${index + 1}</span><div><strong>${esc(step.title)}</strong><small>${esc(step.panels.map((panel) => (panel.type === 'questions' ? `${panel.questions} question${panel.questions === 1 ? '' : 's'}` : SHOWS[panel.type] || PANEL_WORDS[panel.type])).join(', '))}${step.has_ai ? ', with the AI' : ''}</small>${step.says ? `<q>${esc(step.says)}</q>` : ''}</div></li>`;
  const reach = opened(activity) && !context.shared?.has(code) ? await reachPart(here, code, doc, meta, opened) : null;
  return card(activity.title, `<div class="ask-activity-head"><span class="v-pill${opened(activity) ? ' is-open' : ''}">${opened(activity) ? 'Open' : 'Hidden'}</span>${isCheck(activity) ? '<span class="ask-tag">Check</span>' : ''}${placeWords(doc, activity).map((words) => `<span class="v-note">${esc(words)}</span>`).join('')}${activity.minutes ? `<span class="v-note">About ${esc(activity.minutes)} minutes</span>` : ''}${taught.design?.label ? `<span class="v-note">Built on ${esc(taught.design.label)}</span>` : ''}</div>
${taught.goal ? `<p class="ask-goal">${esc(taught.goal)}</p>` : ''}
${steps.length ? `<ol class="ask-flow">${steps.map(row).join('')}</ol>` : `<p class="v-note">A conversation with the AI${activity.opening?.says ? `, which starts: “${esc(activity.opening.says)}”` : ''}.</p>`}
${notes.length ? `<ul class="ask-notes">${notes.map((note) => `<li class="is-${esc(note.level)}">${esc(note.says)}</li>`).join('')}</ul>` : ''}${say()}
<div class="actions"><a class="v-btn is-small is-primary" href="/console/api/courses/${esc(code)}/try/${esc(activity.key)}" target="_blank" rel="noopener">Try it as a learner</a><a class="v-btn is-small" href="/console/courses/${esc(code)}/activities/${esc(activity.key)}">See all of it</a>${opened(activity) ? '' : openButton(code, activity, 'Open to learners. Their link is below.')}</div>
${reach ? `<div class="ask-reach"><h4>${reach.ready ? 'Learners can open it now' : 'Before learners can open it'}</h4>${reach.html}</div>` : ''}`, { id: `activity-${code}-${activity.key}` });
}

// The course whole, as its page has it: unit by unit, each activity with what learners do, what it is for and whether it is
// open, and what this message made or changed marked (spec.added, spec.changed: keys).
async function courseCard(here, spec) {
  const { code, doc } = await courseAt(here.library, spec.course);
  const list = activitiesOf(doc);
  const opened = await openerOf(here, code);
  const goals = goalsIn(doc);
  const added = new Set(spec.added || []);
  const changed = new Set(spec.changed || []);
  const row = (activity) => {
    const mark = added.has(activity.key) ? '<span class="ask-tag is-new">New</span>' : changed.has(activity.key) ? '<span class="ask-tag">Changed</span>' : '';
    const what = [flowWords(doc, activity), activity.teaching?.help ? `The AI ${HELP_WORDS[activity.teaching.help]}` : '', goalWords(activity, goals)].filter(Boolean).join(' · ');
    return `<li><div><span class="ask-row-title"><a href="/console/courses/${esc(code)}/activities/${esc(activity.key)}"><strong>${esc(activity.title)}</strong></a>${isCheck(activity) ? '<span class="ask-tag">Check</span>' : ''}${mark}</span><small>${esc(what)}</small></div><span class="v-pill${opened(activity) ? ' is-open' : ''}">${opened(activity) ? 'Open' : 'Hidden'}</span><span class="ask-row-do">${opened(activity) ? '' : openButton(code, activity)}</span></li>`;
  };
  const units = doc.course.units || [];
  const loose = list.filter((activity) => !units.some((unit) => unit.ref === activity.unit_ref));
  const groups = [...units.map((unit) => ({ title: unit.title, items: list.filter((activity) => activity.unit_ref === unit.ref) })), ...(loose.length ? [{ title: units.length ? 'Not in a unit' : null, items: loose }] : [])];
  const body = list.length || units.length ? groups.map((group) => `${group.title ? `<p class="ask-unit">${esc(group.title)}</p>` : ''}${group.items.length ? `<ul class="ask-rows ask-activities">${group.items.map(row).join('')}</ul>` : '<p class="v-note ask-unit-empty">No activity yet.</p>'}`).join('') : '<p class="v-note">No activities yet.</p>';
  const counts = [goals.length ? `${goals.length} goal${goals.length === 1 ? '' : 's'}` : '', list.length ? `${list.length} activit${list.length === 1 ? 'y' : 'ies'}` : '', list.filter(opened).length ? `${list.filter(opened).length} open` : 'All hidden from learners'].filter(Boolean).join(' · ');
  // What is left before learners come, where the course is: the same checks Open to learners asks about.
  const left = list.length && here.classes ? (await courseChecks(here, code, doc).catch(() => [])).filter((item) => !item.ok) : [];
  const ready = left.length ? `<div class="ask-ready"><p class="ask-unit">Before learners come</p><ul class="ask-checks">${left.map(checkRow).join('')}</ul></div>` : '';
  return card(doc.course.title, `<p class="v-note ask-card-sub">${esc(counts)}</p>${body}${ready}${say()}
<div class="actions"><a class="v-btn is-small is-primary" href="/console/api/courses/${esc(code)}/try" target="_blank" rel="noopener">Try it as a learner</a><a class="v-btn is-small" href="/console/courses/${esc(code)}">See the course</a><a class="v-btn is-small" href="/console/courses/${esc(code)}/share">Share</a></div>`, { id: `course-${code}` });
}

async function tryCard(here, spec) {
  const { code, doc } = await courseAt(here.library, spec.course);
  const activity = spec.activity ? activitiesOf(doc).find((item) => item.key === spec.activity) : null;
  return card(`Try ${activity ? `“${activity.title}”` : `“${doc.course.title}”`} as a learner`, `<p class="v-note">See what they see, and what the AI does. Nothing you do there counts in Progress.</p>
<div class="actions"><a class="v-btn is-small is-primary" href="/console/api/courses/${esc(code)}/try${activity ? `/${esc(activity.key)}` : ''}" target="_blank" rel="noopener">Try it</a></div>`);
}

// How learners reach a course: its link to copy, the poster to show the class, and a QR code to scan, with what would stop it working said first.
async function reachPart(here, code, doc, meta, opened) {
  const { base, local } = reachOf(here.origin, here.addresses);
  const link = `${base}/course/${code}`;
  const shut = here.classes?.saving && !here.signIn && doc.course.identify === 'code' && !(await here.classes.people(code)).some((person) => person.listed);
  const note = meta.status === 'closed' ? '<p class="notice">This course is closed, so its link doesn’t open it. Open it again in Settings.</p>'
    : !activitiesOf(doc).some(opened) ? '<p class="notice">Nothing is open yet, so learners would find an empty course. Open an activity first.</p>'
    : shut ? `<p class="notice">Only personal codes on the class list open this course, and nobody is on it yet. <a href="/console/courses/${esc(code)}/people">Add your class</a>.</p>` : '';
  return { link, ready: !note, html: `${note}${local && !here.addresses?.length ? '<p class="notice">This address only opens on this computer. <a href="/console/courses/' + esc(code) + '/share">To reach it from elsewhere</a></p>' : ''}
<div class="ask-share"><div>
<p class="v-note">The course’s link stays the same all term. What they can open changes as activities open.</p>
<p class="ask-link"><code>${esc(link)}</code></p>
${here.joinAt ? `<p class="v-note">With no link to hand, they can go to <strong>${esc(here.joinAt)}</strong> and type <strong>${esc(showCode(code))}</strong>.</p>` : ''}
<div class="actions"><button class="v-btn is-small is-primary" type="button" data-copy="${esc(link)}">Copy link</button><a class="v-btn is-small" href="/console/courses/${esc(code)}/share/poster">Show to the class</a></div>
</div>${qrSvg(link, { label: `QR code for ${link}` })}</div>` };
}

async function shareCard(here, spec) {
  const { code, doc, meta } = await courseAt(here.library, spec.course);
  const opened = await openerOf(here, code);
  const { link, html } = await reachPart(here, code, doc, meta, opened);
  const list = activitiesOf(doc);
  const open = list.filter(opened);
  const sections = await here.classes.sections(code);
  return card(`Give your class “${doc.course.title}”`, `${html}
${open.length ? `<details class="ask-more"${open.length <= 6 ? ' open' : ''}><summary>A link for each activity</summary><ul class="ask-rows">${list.map((activity) => copyRow(activity.title, `${link}/${activity.key}`, opened(activity) ? '' : ' <span class="v-note">hidden for now</span>')).join('')}</ul></details>` : ''}
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
  const [people, cells, opened] = await Promise.all([here.classes.people(code), here.records.cells(code), openerOf(here, code)]);
  const list = activitiesOf(doc).filter(opened);
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
  if (state === 'done') return card(`“${title}” is ${spec.open ? `open for ${who}` : 'hidden'}`, `<p class="v-mark pass">You pressed ${spec.open ? 'Open to learners' : 'Hide from learners'}.</p>${say()}`, { id: `pending-${id}`, className: 'is-settled' });
  if (state === 'declined') return card(`“${title}” wasn’t changed`, `<p class="v-note">You said not yet. It stays as it was.</p>${say()}`, { id: `pending-${id}`, className: 'is-settled' });
  const api = `ask/${esc(thread)}/pending/${esc(id)}`;
  const [own, sections] = spec.open ? [{}, []] : await Promise.all([here.classes.releases(spec.course), here.classes.sections(spec.course)]);
  const stays = Object.entries(own[spec.activity] || {}).filter(([, item]) => item?.release !== 'hidden').map(([section]) => sections.find((item) => item.id === section)?.name).filter(Boolean);
  const help = activity?.teaching?.help ? `<li>The AI ${esc(HELP_WORDS[activity.teaching.help])}.</li>` : activity?.agent_ref ? '<li>You haven’t said how far the AI may go.</li>' : '<li>No AI in this activity.</li>';
  return card(spec.open ? `Open “${title}”?` : `Hide “${title}”?`, `${spec.open ? `<ul class="ask-facts"><li>For ${esc(who)}, from now.</li>${help}<li>You can hide it again at any time.</li></ul>` : `<p class="v-note">Learners can’t open it after this${stays.length ? `, except ${esc(stays.join(', '))}, where it is open on its own: change that on the course’s page` : ''}. What they did stays.</p>`}
<div class="actions"><button class="v-btn is-small is-primary" type="button" data-api="POST ${api}" data-body='{"yes":true}'>${spec.open ? 'Open to learners' : 'Hide from learners'}</button><button class="v-btn is-small" type="button" data-api="POST ${api}" data-body='{"yes":false}'>Not yet</button></div>${say()}`, { id: `pending-${id}`, className: 'is-waiting' });
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

// Before learners come: what would stop the course working or trip them, each with where to fix it, and what is open. Drawn from what is
// true now, so pressing a fix and coming back shows it ticked.
/**
 * What would stop a course working for learners, each with where to fix it ({ ok, words, href, label }). With activity (a
 * key), the checks of that one activity and of the course around it: what opening it asks first.
 */
export async function courseChecks(here, code, doc, { activity = null } = {}) {
  const every = activitiesOf(doc);
  const list = activity ? every.filter((item) => item.key === activity) : every;
  const named = (activities) => activities.map((item) => `“${item.title}”`).join(', ');
  const place = (item) => `/console/courses/${code}/activities/${item.key}`;
  const checks = [];
  const check = (ok, words, href = null, label = 'Fix it') => checks.push({ ok, words, href, label });
  if (!activity) check(list.length > 0, list.length ? plural(list.length, 'activity', 'activities') : 'No activities yet', `/console/courses/${code}#add-title`, 'Add one');
  const aimless = list.filter((item) => !(item.teaching?.goal || item.teaching?.standard?.description));
  if (list.length) check(!aimless.length, aimless.length ? `No goal yet: ${named(aimless)}` : activity ? 'It has a goal' : 'Each activity has a goal', aimless[0] && place(aimless[0]), 'Set one');
  const tripping = list.filter((item) => reviewOf(doc, item).some((note) => note.level === 'fix'));
  if (list.length) check(!tripping.length, tripping.length ? `Learners would trip on something in ${named(tripping)}` : 'Nothing learners would trip on', tripping[0] && place(tripping[0]), 'See what');
  // How they get in: a course of codes with nobody on its list is shut to everyone, and its link gives no hint of it.
  if (here.classes?.saving && !here.signIn && doc.course.identify === 'code') {
    const listed = (await here.classes.people(code)).some((person) => person.listed);
    check(listed, listed ? 'Learners on the class list have their codes' : 'Only codes on the class list open it, and nobody is on it', `/console/courses/${code}/people`, 'Add your class');
  }
  if (here.settings) {
    const { roles } = await here.settings.resolve();
    check(Boolean(roles.reply), roles.reply ? 'A model writes the AI’s replies' : 'No model writes the AI’s replies yet', '/console/models', 'Choose one');
  }
  if (here.records?.tried && list.length) {
    const tried = (await Promise.all(list.map((item) => here.records.tried(code, item.key, 1).catch(() => [])))).some((turns) => turns.length);
    check(tried, tried ? 'You have tried it as a learner' : 'You haven’t tried it as a learner yet', `/console/api/courses/${code}/try${activity ? `/${activity}` : ''}`, 'Try it');
  }
  return checks;
}

// One thing to look at before learners come, with the way to it.
const checkRow = (item) => `<li class="${item.ok ? 'is-ok' : 'is-todo'}">${icon(item.ok ? 'check' : 'alert', 15)}<span>${esc(item.words)}</span>${!item.ok && item.href ? `<a class="v-btn is-small" href="${esc(item.href)}"${item.href.includes('/try') ? ' target="_blank" rel="noopener"' : ''}>${esc(item.label)}</a>` : ''}</li>`;

async function checklistCard(here, spec) {
  const { code, doc } = await courseAt(here.library, spec.course);
  const list = activitiesOf(doc);
  const named = (activities) => activities.map((activity) => `“${activity.title}”`).join(', ');
  const checks = await courseChecks(here, code, doc);
  const open = list.filter(await openerOf(here, code));
  const left = checks.filter((item) => !item.ok).length;
  const row = checkRow;
  return card(left ? `Before learners come: ${plural(left, 'thing')} to look at` : 'Ready for learners', `<ul class="ask-checks">${checks.map(row).join('')}</ul>
<p class="v-note">${open.length ? `Open to learners: ${esc(named(open))}.` : 'Nothing is open to learners yet: each activity opens with its own button, when you choose.'}</p>
<div class="actions"><a class="v-btn is-small" href="/console/courses/${esc(code)}">See the course</a><a class="v-btn is-small" href="/console/courses/${esc(code)}/share">Share</a></div>`, { id: `checklist-${code}` });
}

// A question with its likely answers as buttons: one press says it. Once the conversation has gone on, the choices are history.
const choicesCard = (_here, spec, { past = false } = {}) => card(spec.question, past
  ? `<p class="v-note">${esc(spec.choices.join(' · '))}</p>`
  : `<div class="ask-choices">${spec.choices.map((choice) => `<button class="chip" type="button" data-say-this="${esc(choice)}">${esc(choice)}</button>`).join('')}</div>
<p class="v-note">Or say it your own way below.</p>`);

// Text a model wrote, as paragraphs and line breaks with **bold**: nothing in it can be markup.
const prose = (text) => String(text).trim().split(/\n{2,}/).map((part) => `<p>${part.split('\n').map((line) => esc(line).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')).join('<br>')}</p>`).join('');

// Two ways to write something learners will read, side by side: one press chooses, and Ask puts it where it goes.
const versionsCard = (_here, spec, { past = false } = {}) => card(spec.question, past
  ? `<p class="v-note">${esc(spec.versions.map((version) => version.label).join(' · '))}</p>`
  : `<div class="ask-pair">${spec.versions.map((version) => `<div class="ask-pair-item"><h4>${esc(version.label)}</h4><div class="ask-pair-text">${prose(version.text)}</div><button class="v-btn is-small" type="button" data-say-this="${esc(`Use “${version.label}”.`)}">Use this one</button></div>`).join('')}</div>
<p class="v-note">Or say what to change below.</p>`);

// What a question takes as its answer, as the teacher checks it: the right choice marked, the answers accepted, or read by them.
const answerWords = (item) => {
  if (item.choices?.length) {
    const right = new Set([item.answer?.choice, ...(item.answer?.choices || [])].filter(Boolean));
    return `<ul class="ask-q-choices">${item.choices.map((choice) => `<li${right.has(choice.id) ? ' class="is-right"' : ''}>${right.has(choice.id) ? icon('check', 13) : ''}<span>${esc(choice.text)}</span>${right.has(choice.id) ? '<span class="sr"> (right)</span>' : ''}</li>`).join('')}</ul>`;
  }
  if (item.answer?.accept?.length) return `<p class="ask-q-answer">Accepted: ${esc(item.answer.accept.join(', '))}</p>`;
  return `<p class="ask-q-answer">${item.type === 'open' ? 'You read the answers.' : 'Any answer is kept for you to read.'}</p>`;
};

// The questions Ask wrote, to look over before learners meet them: each kept as it is, changed on its page, or removed.
async function questionsCard(here, spec) {
  const { code, doc } = await courseAt(here.library, spec.course);
  const activity = activitiesOf(doc).find((item) => item.key === spec.activity);
  if (!activity) return card('This has moved on', '<p class="v-note">That activity isn’t in this course anymore.</p>');
  const steps = activity.workspace?.steps || [];
  const parts = (activity.workspace?.panels || []).filter((panel) => panel.type === 'questions').map((panel) => ({
    title: steps.find((step) => (step.panels || []).includes(panel.id))?.title || panel.title,
    set: doc.question_sets?.find((set) => set.ref === panel.set_ref)
  })).filter((part) => part.set?.items?.length);
  const total = parts.reduce((sum, part) => sum + part.set.items.length, 0);
  if (!total) return card('No questions here now', `<p class="v-note">“${esc(activity.title)}” has no questions left.</p>`);
  const opened = (await openerOf(here, code))(activity);
  const row = (part, item, index) => `<li id="look-${esc(part.set.ref)}-${esc(item.id)}"><div class="ask-q"><p class="ask-q-prompt"><span class="ask-q-n">${index + 1}</span>${esc(item.prompt)}</p>${answerWords(item)}</div>
<div class="actions"><a class="v-btn is-small" href="/console/courses/${esc(code)}/questions/${esc(part.set.ref)}#q-${esc(item.id)}">Change</a><button class="v-btn is-small" type="button" data-api="DELETE courses/${esc(code)}/questions/${esc(part.set.ref)}/items/${esc(item.id)}" data-confirm="${esc(`Remove question ${index + 1}${parts.length > 1 ? ` of “${part.title}”` : ''}? ${opened ? 'Learners would no longer meet it.' : 'It goes from the activity.'}`)}" data-yes="Remove" data-danger data-said="Removed.">Remove</button></div></li>`;
  return card(`${plural(total, 'question')} to look over`, `<p class="v-note">${opened ? `Learners can meet these now.` : `Learners meet them once “${esc(activity.title)}” opens.`} Check each answer: keep what is right, and change or remove the rest.</p>
${parts.map((part) => `${parts.length > 1 ? `<h4 class="ask-q-step">${esc(part.title)}</h4>` : ''}<ol class="ask-qs">${part.set.items.map((item, index) => row(part, item, index)).join('')}</ol>`).join('')}`, { id: `questions-${code}-${activity.key}` });
}

// When each activity opens and closes, set here as on its page. Times show in the teacher's own time, by their browser.
async function scheduleCard(here, spec) {
  const { code, doc } = await courseAt(here.library, spec.course);
  const list = activitiesOf(doc);
  if (!list.length) return card(`When “${doc.course.title}” opens`, '<p class="v-note">No activities yet.</p>');
  const time = (iso) => `<time datetime="${esc(iso)}" data-local>${esc(iso.slice(0, 16).replace('T', ' '))}</time>`;
  const stateOf = (activity) => (activity.release !== 'hidden' ? (activity.closes_at ? `Open until ${time(activity.closes_at)}` : 'Open') : activity.opens_at ? `Opens ${time(activity.opens_at)}` : 'Hidden');
  const row = (activity) => {
    const open = activity.release !== 'hidden';
    return `<li data-say-box id="when-${esc(activity.key)}"><div class="ask-when-what"><strong>${esc(activity.title)}</strong><span class="v-note">${stateOf(activity)}</span></div>
<form class="ask-when-set" id="when-form-${esc(activity.key)}" data-api="POST courses/${esc(code)}/activities/${esc(activity.key)}/schedule" data-said="Saved."${open ? '' : ` data-checks="courses/${esc(code)}/checks?activity=${esc(activity.key)}" data-anyway="Set the time anyway"`}>
${open ? '' : `<label class="ask-when-field"><span>Opens</span><input class="v-input" type="datetime-local" name="opens_at" data-iso="${esc(activity.opens_at || '')}" data-default-time="08:00" data-empty="Not set" aria-label="When “${esc(activity.title)}” opens"></label>`}
<label class="ask-when-field"><span>Closes</span><input class="v-input" type="datetime-local" name="closes_at" data-iso="${esc(activity.closes_at || '')}" data-default-time="23:59" data-empty="Stays open" aria-label="When “${esc(activity.title)}” closes"></label>
<button class="v-btn is-small" type="submit">Save</button>${say()}</form></li>`;
  };
  return card(`When “${doc.course.title}” opens`, `<ul class="ask-when">${list.map(row).join('')}</ul>
<p class="v-note">An activity opens on its own at its time; empty, it waits for you to open it. Leave Closes empty to stay open.</p>`, { id: `schedule-${code}` });
}

const DRAW = { versions: versionsCard, questions: questionsCard, schedule: scheduleCard, choices: choicesCard, checklist: checklistCard, course: courseCard, activity: activityCard, try: tryCard, share: shareCard, 'class-list': classListCard, progress: progressCard, open: openCard, change: changeCard, 'not-a-list': notAListCard, tools: toolsCard };

/** A card as HTML, from what is true now. One whose course has gone says so. */
export async function drawCard(here, spec, context = {}) {
  try { return await DRAW[spec.kind](here, spec, context); } catch (error) {
    if (error?.status === 404) return card('This has moved on', `<p class="v-note">${esc(error.message)}</p>`);
    throw error;
  }
}

export const ASK_CARD_CSS = `.ask-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}
.ask-pair-item{display:grid;grid-template-rows:auto 1fr auto;gap:8px;min-width:0;padding:14px;border:1px solid var(--public-rule);border-radius:var(--radius)}
.ask-pair-item h4{margin:0;font-size:.875rem;font-weight:600}
.ask-pair-text{min-width:0;color:var(--public-ink);font-size:.9375rem;line-height:1.55;overflow-wrap:anywhere}.ask-pair-text p{margin:0 0 8px}.ask-pair-text p:last-child{margin:0}
.ask-pair-item .v-btn{justify-self:start}
.ask-qs{display:grid;gap:0;margin:8px 0 0;padding:0;list-style:none}
.ask-qs>li{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:8px 16px;padding:12px 0;border-top:1px solid var(--public-rule)}
.ask-q{display:grid;gap:6px;flex:1 1 280px;min-width:0}
.ask-q-prompt{display:flex;gap:8px;margin:0;color:var(--public-ink);font-weight:500;overflow-wrap:anywhere}
.ask-q-n{flex:none;color:var(--muted);font-variant-numeric:tabular-nums}
.ask-q-choices{display:grid;gap:3px;margin:0 0 0 22px;padding:0;list-style:none;font-size:.875rem;color:var(--public-text)}
.ask-q-choices li{display:flex;align-items:baseline;gap:6px}.ask-q-choices li.is-right{color:var(--public-ink);font-weight:600}.ask-q-choices .v-icon{flex:none;color:var(--pass-green);position:relative;top:.15em}
.ask-q-answer{margin:0 0 0 22px;color:var(--public-text);font-size:.875rem}
.ask-q-step{margin:14px 0 0;font-size:.875rem;font-weight:600;color:var(--public-ink)}
.ask-when{display:grid;gap:0;margin:0;padding:0;list-style:none}
.ask-when>li{display:grid;gap:8px;padding:12px 0;border-top:1px solid var(--public-rule)}
.ask-when-what{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px}
.ask-when-set{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 12px}
.ask-when-field{display:grid;gap:4px;flex:1 1 180px;max-width:240px;font-size:.8125rem;color:var(--muted)}
.ask-when-set .v-btn{min-height:36px}
.ask-choices{display:flex;flex-wrap:wrap;gap:8px}
.ask-choices .chip{background:transparent;font:inherit;font-size:.875rem;cursor:pointer}
.ask-choices .chip:hover{background:var(--field-mist);color:var(--public-ink)}
.ask-checks{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.ask-checks li{display:flex;align-items:baseline;gap:10px;min-height:30px}
.ask-checks li>.v-icon{flex:none;position:relative;top:.18em}
.ask-checks li span{flex:1;min-width:0}
.ask-checks .is-ok .v-icon{color:var(--pass-green)}
.ask-checks .is-todo .v-icon{color:var(--query-ochre)}
.ask-checks .is-todo span{color:var(--public-ink)}
.ask-card.v-card{display:grid;gap:12px;padding:16px 18px;border:1px solid var(--public-rule);box-shadow:none}
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
.ask-rows.ask-activities li{display:grid;grid-template-columns:minmax(0,1fr) 74px 140px;justify-content:initial}
.ask-unit{margin:6px 0 0;color:var(--public-ink);font-size:.875rem;font-weight:600}
.ask-unit+.ask-rows{margin-top:4px}
.ask-unit-empty{margin:2px 0 0;font-size:.875rem}
.ask-ready{display:grid;gap:6px;padding-top:4px}
.ask-card-sub{margin-top:-6px;font-size:.875rem}
.ask-row-title{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0}
.ask-tag{display:inline-block;padding:0 7px;border:1px solid var(--public-rule-strong);border-radius:var(--radius-pill);color:var(--public-text);font-size:.75rem;font-weight:600;line-height:1.6}
.ask-tag.is-new{border-color:var(--ink-blue-line,var(--ink-blue));color:var(--ink-blue)}
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
.ask-reach{display:grid;gap:10px;margin-top:4px;padding:14px 16px;border-radius:var(--radius-sm);background:var(--field-sage)}
.ask-reach h4{margin:0;color:var(--public-ink);font-size:.9375rem;font-weight:600;letter-spacing:0}
.ask-reach .ask-link code{background:var(--surface)}
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
