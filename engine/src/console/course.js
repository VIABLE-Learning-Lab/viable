/**
 * The console's courses: the list, starting one (blank, from an example, from a file), a course's
 * activities and its settings. A course is a package's document, changed through the library; nothing
 * here keeps anything of its own. No Node built-ins.
 */
import { HELP_NAMES } from '../../../harness/src/ui/parts.js';
import { THEMES } from '../learner/themes.js';
import { flowWords } from './flow.js';
import { activityKeys, cutWords, slugOf } from '../server/library.js';
import { readPackage } from '../server/runtime.js';
import { icon } from './icons.js';
import { choose, courseHead, dropZone, esc, FORMS_CSS, oneOf, plural, say, text, toggle, withForms } from './forms.js';
import { addGoals, courseGoalsPart, GOAL_LIMITS, goalsIn, goalsPart, goalWords, GOALS_CSS, isCheck, removeGoal } from './goals.js';

const refused = (message, status = 400, code = 'invalid_course') => Object.assign(new Error(message), { status, code });
const ARCHIVE_BYTES = 50 * 1024 * 1024;
const KINDS = {
  page: { label: 'A page to read', hint: 'What you write, with the AI beside it if you want. You can add steps after it.' },
  chat: { label: 'A conversation alone', hint: 'Only the AI on screen. Say what it opens with on the next page.' },
  questions: { label: 'Questions', hint: 'Questions to answer, with the AI beside them if you want.' },
  writing: { label: 'Writing', hint: 'A piece of writing, drafted and handed in.' },
  reading: { label: 'Reading', hint: 'A PDF to read and mark up.' },
  embed: { label: 'A web page', hint: 'A simulation, video or tool at an https address.' }
};

// What every blank course starts with: replies from the model the console sets, and How the AI helps added to each.
export const starterTutor = (ref = 'tutor', name = 'Tutor') => ({
  ref, name, description: 'A patient tutor. It follows How the AI helps in each activity.',
  graph: {
    version: 1, name, entry: 'input', variables: {},
    nodes: [
      { id: 'input', type: 'input', config: { guidance: 'What the learner says.' }, next: 'reply', x: 40, y: 200 },
      { id: 'reply', type: 'llm', config: { model: 'default', includeHistory: true, system: 'You are a patient tutor. Keep replies short, ask one question at a time, and leave the thinking with the learner.' }, next: 'output', x: 280, y: 200 },
      { id: 'output', type: 'output', config: { text: '{{reply.content}}' }, x: 520, y: 200 }
    ]
  }
});
const blankPackage = (title) => ({ format: 'viable.course-package', version: 1, title, agents: [starterTutor()], course: { title, audience: 'adults', identify: 'browser', sections_from: 'none', data_level: 'minimal', keep_recordings: false, units: [], activities: [] } });

/** What a course's address finds in the library: { id, doc, meta, code }. */
export async function courseAt(library, code) {
  const found = library.course ? await library.course(code) : (await library.courses()).find((entry) => entry.code === code);
  if (!found) throw refused('That course isn’t here.', 404, 'course_not_found');
  return found;
}
// What waits under Archived, by its address.
async function archivedAt(library, code) {
  const found = (library.archived ? await library.archived() : []).find((entry) => entry.code === code);
  if (!found) throw refused('That course isn’t under Archived.', 404, 'course_not_found');
  return found;
}
// A file can say its chat page is on, and that means anyone can spend this server's keys: here it starts paused, for someone to turn on.
const paused = (doc) => { for (const agent of [doc, ...(doc?.agents || [])]) if (agent?.chat_page) agent.chat_page = { ...agent.chat_page, status: 'paused' }; return doc; };
const SAVING = '<p class="notice">This server has no store, so courses can’t be changed here. Start it with a data folder (<code>viable-engine start</code>), or deploy it with a store.</p>';

// --- The list -----------------------------------------------------------------------------------------

async function listBody(tools) {
  const { library, classes, settings, simple } = tools;
  const [courses, archived] = await Promise.all([library.courses(), library.archived ? library.archived() : []]);
  const cards = await Promise.all(courses.map(async (entry) => {
    const { code } = entry;
    const facts = [plural((entry.doc.course.activities || []).length, 'activity', 'activities'), plural((await classes.people(code)).length, 'learner'), ...(entry.meta.version === 0 ? [`From ${entry.file}`] : [])];
    return `<li><a class="course-card" href="/console/courses/${esc(code)}"><span><strong>${esc(entry.doc.course.title)}</strong><small>${esc(facts.join(' · '))}</small></span>${entry.meta.status === 'closed' ? '<span class="v-pill">Closed</span>' : ''}</a></li>`;
  }));
  const { saving } = classes;
  const using = settings ? await settings.resolve() : null;
  return `<div class="page-head"><div><h1>Courses</h1>
<p class="v-lead">A course is one link for your learners: its activities, who is in it, and how far the AI may go in each.</p></div>
${saving && cards.length ? '<a class="v-btn is-primary" href="/console/new-course">New course</a>' : ''}</div>
${saving ? '' : SAVING}
${saving && using && !using.roles.reply ? '<p class="notice">No model writes replies yet. <a href="/console/models">Set one up</a> and the AI in your activities starts working. You can build a course first.</p>' : ''}
${cards.length || simple ? '' : '<p class="v-note first-door">Only want a chat button for a website? <a href="/console/chat-pages">Start with a chat page</a>.</p>'}
${cards.length ? `<ul class="course-list">${cards.join('')}</ul>` : ''}
${saving && !cards.length ? await startParts(tools) : ''}
${archived.length ? archivedPart(archived, { forGood: !library.archives, just: tools.url?.searchParams.get('archived'), keeps: library.keeps }) : ''}`;
}

// An activity taken off a course waits at the foot of its activities: learners can't open it, and it comes back as it was, last in the
// course, or is deleted. Where a host keeps what learners did, deleting takes it out of the course; here it takes their work too.
function archivedActivitiesPart(list, { code, forGood, just, keeps = null }) {
  const sure = (entry) => (forGood ? `This deletes “${entry.title}” and what learners did in it from this server. It can’t be undone.` : `Delete “${entry.title}” for good? It leaves the course, and you can’t bring it back.${keeps ? ` ${keeps}` : ''}`);
  const row = (entry) => `<li id="archived-activity-${esc(entry.ref)}"${entry.ref === just ? ' class="is-just"' : ''} data-say-box><div><strong>${esc(entry.title)}</strong><small>${entry.ref === just ? 'Archived just now' : `Archived <time data-local datetime="${esc(entry.archived_at)}">${esc(String(entry.archived_at).slice(0, 10))}</time>`}</small></div>
<div class="actions"><button class="v-btn is-small" type="button" data-api="POST courses/${esc(code)}/archived-activities/${esc(entry.ref)}/restore" data-busy="Restoring…">Restore</button><button class="v-btn is-small danger" type="button" data-api="DELETE courses/${esc(code)}/archived-activities/${esc(entry.ref)}" data-confirm="${esc(sure(entry))}" data-yes="Delete">Delete</button></div><p class="say" data-say role="status"></p></li>`;
  return `<details class="archived" id="archived-activities"${just != null ? ' open' : ''}><summary>Archived <small>${list.length}</small></summary>
<p class="v-note">Learners can’t open these. Restore one to have it back as it was, last in the course, or delete it.</p>
<ul class="archived-list">${list.map(row).join('')}</ul>
</details>`;
}

// What waits under Archived: learners can't open it, and it can come back as it was or be deleted. Where a host keeps what learners did
// (library.archives), deleting takes it out of the teacher's courses; here it takes it, and their work, off the server.
function archivedPart(list, { forGood, just, keeps = null }) {
  const sure = (entry) => (forGood ? `This deletes “${entry.title}”, its versions and everything its learners did from this server. It can’t be undone.` : `Delete “${entry.title}” for good? It leaves your courses, and you can’t bring it back.${keeps ? ` ${keeps}` : ''}`);
  const row = (entry) => `<li id="archived-${esc(entry.code)}"${entry.code === just ? ' class="is-just"' : ''} data-say-box><div><strong>${esc(entry.title)}</strong><small>${entry.code === just ? 'Archived just now' : `Archived <time data-local datetime="${esc(entry.archived_at)}">${esc(entry.archived_at.slice(0, 10))}</time>`}</small></div>
<div class="actions"><button class="v-btn is-small" type="button" data-api="POST archived/${esc(entry.code)}/restore" data-busy="Restoring…">Restore</button><button class="v-btn is-small danger" type="button" data-api="DELETE archived/${esc(entry.code)}" data-confirm="${esc(sure(entry))}"${forGood ? ' data-type="DELETE"' : ''} data-yes="Delete">Delete</button></div>${say()}</li>`;
  return `<details class="archived" id="archived"${just != null ? ' open' : ''}><summary>Archived <small>${list.length}</small></summary>
<p class="v-note">Learners can’t open these. Restore one to have it back as it was, with its learners and their work, or delete it.</p>
<ul class="archived-list">${list.map(row).join('')}</ul>
</details>`;
}

const AUDIENCE_WORDS = { children: 'For children', teens: 'For teens', adults: 'For adults' };

// What an example holds, so a person can choose one without opening each.
async function exampleRow(example) {
  const { doc } = await example.read();
  const list = doc.course?.activities || [];
  const minutes = list.reduce((sum, activity) => sum + (activity.minutes || 0), 0);
  const facts = [AUDIENCE_WORDS[doc.course?.audience], plural(list.length, 'activity', 'activities'), ...(minutes ? [`about ${minutes} minutes`] : [])].filter(Boolean);
  return `<li class="example" id="example-${esc(example.id)}" data-say-box>
<div class="example-head"><div><h3>${esc(example.title)}</h3>${example.summary ? `<p>${esc(example.summary)}</p>` : ''}<small>${esc(facts.join(' · '))}</small></div>
<button class="v-btn is-small" type="button" data-api="POST courses/from-example" data-body='${esc(JSON.stringify({ id: example.id }))}' data-busy="Copying it…">Use this</button></div>
${list.length ? `<details id="inside-${esc(example.id)}"><summary>What’s in it</summary><ul>${list.map((activity) => `<li><strong>${esc(activity.title)}</strong><small>${esc(kindWords(activity))}</small></li>`).join('')}</ul></details>` : ''}
${say()}
</li>`;
}

// The ways to start a course. A title is the shortest, so it comes first; an example shows what it holds before it is copied.
async function startParts({ examples = [], simple }) {
  return `<section class="block start-part" aria-labelledby="blank-title" data-say-box>
<h2 id="blank-title">Start with a title</h2>
<form id="new-blank" class="new-blank" data-api="POST courses" data-busy="Making it…">
<label class="sr" for="new-title">Course title</label>
<input class="v-input" id="new-title" name="title" required maxlength="160" autocomplete="off" placeholder="e.g. Fractions, period 2">
<button class="v-btn is-primary" type="submit">Create course</button>
</form>
<p class="v-note">It starts empty, with a tutor you can change. Learners see nothing until you open an activity.</p>
${say()}
</section>
${examples.length ? `<section class="block start-part" aria-labelledby="examples-title">
<h2 id="examples-title">Or start from an example</h2>
<p class="v-note">A whole working course. You get your own copy, to read, try and change.</p>
<ul class="examples">${(await Promise.all(examples.map(exampleRow))).join('')}</ul>
</section>` : ''}
<section class="block start-part" id="new-file" aria-labelledby="file-title" data-say-box>
<h2 id="file-title">Or bring a course file</h2>
<p class="v-note">A package from the VIABLE Developer Platform or another VIABLE Engine. Learners, class lists and study data don’t travel in one.${simple ? '' : ' A chat page in it starts paused.'}</p>
${dropZone({ id: 'package-file', accept: '.zip,.json', upload: 'POST courses/from-file', hint: '.viable.zip or .viable.json' })}
${say()}
</section>
<p class="v-note start-ask">Rather say it in your own words? <a href="/console/ask">Tell Ask what you’re teaching</a>, and it sets up the course.</p>`;
}

// Archived, on Courses and at the foot of a course's activities: the same list, restored or deleted from it.
const ARCHIVED_CSS = `.archived{margin-top:36px;border-top:1px solid var(--public-rule);padding-top:14px}
.archived summary{width:fit-content;color:var(--public-text);font-size:.9375rem;font-weight:600;cursor:pointer}
.archived summary small{margin-left:4px;color:var(--muted);font-weight:400}
.archived>.v-note{margin:10px 0 0}
.archived-list{display:grid;gap:0;margin:8px 0 0;padding:0;list-style:none}
.archived-list li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;padding:12px 0;border-bottom:1px solid var(--public-rule)}
.archived-list li>div:first-child{display:grid;gap:2px;min-width:0}
.archived-list strong{color:var(--public-text);font-weight:600;overflow-wrap:anywhere}
.archived-list small{color:var(--muted);font-size:.8125rem}
.archived-list .actions{display:flex;flex-wrap:wrap;gap:8px}
.archived-list li.is-just strong{color:var(--public-ink)}
.archived-list .danger{border-color:var(--pencil-red);color:var(--pencil-red)}`;
const LIST_CSS = `.page-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px 32px}
.page-head>div{flex:1 1 320px;min-width:0}
.course-list{display:grid;gap:10px;margin:28px 0 0;padding:0;list-style:none}
.course-card{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border:1px solid var(--public-rule);border-radius:var(--radius);background:var(--surface);color:var(--public-ink);text-decoration:none;transition:border-color .16s ease}
.course-card:hover{border-color:var(--public-rule-strong)}
.course-card>span:first-child{display:grid;gap:2px;min-width:0}
.course-card strong{font-size:1.0625rem;font-weight:600;overflow-wrap:anywhere}
.course-card small{color:var(--muted);font-size:.875rem}
.first-door{margin-top:14px}
${ARCHIVED_CSS}
.start-part{display:grid;gap:12px;max-width:720px}
.start-part>h2+*{margin-top:0}
.new-blank{display:flex;flex-wrap:wrap;gap:10px}
.new-blank .v-input{flex:1 1 280px;min-width:0}
.new-blank .v-btn{flex:none}
.examples{display:grid;gap:0;margin:0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.example{display:grid;gap:8px;padding:16px 0;border-bottom:1px solid var(--public-rule)}
.example-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
.example h3{font-size:1rem;font-weight:600;letter-spacing:0;line-height:1.35}
.example p{margin:4px 0 0;color:var(--public-text);font-size:.9375rem;line-height:1.5}
.example small{display:block;margin-top:4px;color:var(--muted);font-size:.8125rem}
.example .v-btn{flex:none}
.example summary{width:fit-content;padding:2px 0;color:var(--ink-blue);font-size:.875rem;cursor:pointer}
.example details ul{display:grid;gap:8px;margin:8px 0 2px;padding:0;list-style:none}
.example details strong{display:block;color:var(--public-ink);font-size:.9375rem;font-weight:500}
.example details li small{margin-top:0}
.start-ask{margin-top:28px;max-width:720px}
@media (max-width:520px){.example-head{flex-direction:column;gap:10px}}`;

// --- A course's activities ----------------------------------------------------------------------------

export const kindOfActivity = (activity) => {
  const panels = activity.workspace?.panels || [];
  // A workspace with nothing in it yet is a reading waiting for its PDF.
  if (!panels.length) return activity.workspace ? 'reading' : 'chat';
  return panels.length === 1 ? panels[0].type : 'several';
};
const kindWords = (activity, doc = null) => {
  const kind = kindOfActivity(activity);
  const what = doc ? flowWords(doc, activity) : kind === 'several' ? `${(activity.workspace.steps || activity.workspace.panels).length} ${activity.workspace.steps ? 'steps' : 'panels'}` : KINDS[kind].label;
  return [what, ...(!doc && kind !== 'chat' ? [activity.agent_ref && activity.workspace?.ai !== 'off' ? 'AI beside it' : 'No AI'] : []), ...(activity.minutes ? [`${activity.minutes} min`] : []), ...(activity.teaching?.help ? [HELP_NAMES[activity.teaching.help]] : [])].join(' · ');
};
/** A unit's days in words: "Nov 9 – 13", "Nov 30 – Dec 4", "From Nov 9", "Until Nov 13". */
export function daysWords(starts, ends) {
  const day = (key, options) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...options });
  if (starts && ends) {
    const [a, b] = [new Date(`${starts}T00:00:00Z`), new Date(`${ends}T00:00:00Z`)];
    if (starts === ends) return day(starts, { month: 'short', day: 'numeric' });
    if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${day(starts, { month: 'short', day: 'numeric', year: 'numeric' })} – ${day(ends, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    return a.getUTCMonth() === b.getUTCMonth() ? `${day(starts, { month: 'short', day: 'numeric' })} – ${b.getUTCDate()}` : `${day(starts, { month: 'short', day: 'numeric' })} – ${day(ends, { month: 'short', day: 'numeric' })}`;
  }
  return starts ? `From ${day(starts, { month: 'short', day: 'numeric' })}` : `Until ${day(ends, { month: 'short', day: 'numeric' })}`;
}

const stateWords = (activity) => (activity.release === 'hidden' && activity.opens_at ? `Opens ${new Date(activity.opens_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC` : activity.release === 'hidden' ? 'Hidden' : 'Open');

// Open or hide it for one section at once, mid-class. Kept on this server, not as a course version.
function forSections(activity, code, sections, own, open) {
  if (!sections.length) return '';
  const api = `courses/${esc(code)}/activities/${esc(activity.key)}/for-section`;
  const differ = sections.filter((section) => own[section.id]);
  // One already closed can still be opened again for one section.
  const closed = activity.closes_at && Date.parse(activity.closes_at) <= Date.now();
  const row = (section) => {
    const mine = own[section.id]?.release;
    const shown = mine ? mine === 'open' : open && !closed;
    const body = (release) => esc(JSON.stringify({ section: section.id, release }));
    return `<li><strong>${esc(section.name)}</strong><span class="v-note">${mine === 'open' ? 'Open for this section' : mine === 'hidden' ? 'Hidden from this section' : `As the course: ${closed ? 'Closed' : esc(stateWords(activity))}`}</span><span class="actions"><button class="v-btn is-small" type="button" data-api="POST ${api}" data-body='${body(shown ? 'hidden' : 'open')}'>${shown ? 'Hide' : 'Open'}</button>${mine ? `<button class="v-btn is-small" type="button" data-api="POST ${api}" data-body='${body(null)}'>As the course</button>` : ''}</span></li>`;
  };
  return `<details class="by-section" id="for-${esc(activity.key)}"><summary>For one section${differ.length ? `: ${esc(differ.map((section) => `${section.name} ${own[section.id].release === 'open' ? 'open' : 'hidden'}`).join(', '))}` : ''}</summary><ul>${sections.map(row).join('')}</ul></details>`;
}

function activityRow(activity, code, version, index, count, locked, sections, own, doc, goals = []) {
  const key = esc(activity.key);
  const api = `courses/${esc(code)}/activities/${key}`;
  const open = activity.release !== 'hidden';
  const units = doc.course.units || [];
  // Into another unit from here, as its menu says it: the row moves under that unit's heading.
  const unitMenu = units.length && !locked ? `<select class="v-input small row-unit" name="unit_ref" data-api="POST ${api}/unit" aria-label="Unit for ${esc(activity.title)}">${[{ ref: '', title: 'No unit' }, ...units].map((unit) => `<option value="${esc(unit.ref)}"${(activity.unit_ref || '') === unit.ref ? ' selected' : ''}>${esc(unit.title)}</option>`).join('')}</select>` : '';
  return `<li class="row" id="activity-${key}" data-key="${key}"${locked ? '' : ` data-drag-item="${key}"`} data-say-box>
${locked ? '' : `<span class="drag-handle" data-drag="activity" aria-hidden="true">${icon('grip', 16)}</span>`}
<div class="row-what">${isCheck(activity) ? `<span class="row-title"><a href="/console/courses/${esc(code)}/activities/${key}"><strong>${esc(activity.title)}</strong></a><span class="row-tag">Check</span></span>` : `<a href="/console/courses/${esc(code)}/activities/${key}"><strong>${esc(activity.title)}</strong></a>`}<span class="v-note">${esc([kindWords(activity, doc), goalWords(activity, goals)].filter(Boolean).join(' · '))}</span></div>
<span class="v-pill${open ? ' is-open' : ''}">${esc(stateWords(activity))}</span>
<div class="actions row-do">
${locked ? '' : `<button class="v-btn is-small" type="button" data-api="POST ${api}/release" data-body='${esc(JSON.stringify({ version, release: open ? 'hidden' : 'open' }))}'${open ? '' : ` data-checks="courses/${esc(code)}/checks?activity=${key}"`} data-said="${open ? 'Hidden from learners.' : 'Open to learners.'}">${open ? 'Hide' : 'Open'}</button>`}
<a class="v-btn is-small" href="/console/api/courses/${esc(code)}/try/${key}" target="_blank" rel="noopener">Try it</a>
${unitMenu}
${locked ? '' : `<span class="row-move"><button class="v-btn is-small icon" type="button" aria-label="Move ${esc(activity.title)} up" data-api="POST ${api}/move" data-body='${esc(JSON.stringify({ version, by: -1 }))}'${index === 0 ? ' disabled' : ''}><span class="turned">${icon('chevron', 15)}</span></button><button class="v-btn is-small icon" type="button" aria-label="Move ${esc(activity.title)} down" data-api="POST ${api}/move" data-body='${esc(JSON.stringify({ version, by: 1 }))}'${index === count - 1 ? ' disabled' : ''}>${icon('chevron', 15)}</button></span>`}
</div>
${locked ? '' : forSections(activity, code, sections, own, open)}
${say()}
</li>`;
}

async function activitiesBody({ library, classes, origin, addresses, signIn, tabs, simple, url, goalHelp = null }, match) {
  const entry = await courseAt(library, match[1]);
  const { doc, meta, code } = entry;
  const course = doc.course;
  const held = course.activities || [];
  const keys = activityKeys(held);
  const activities = held.map((activity, i) => ({ ...activity, key: keys[i] }));
  const locked = !classes.saving;
  const units = course.units || [];
  const inUnit = (ref) => activities.filter((activity) => (activity.unit_ref || null) === ref);
  // A course of codes with nobody listed is shut to everyone, and the link gives no hint of it. Only then does it matter who is on the list.
  const needsList = classes.saving && !signIn && course.identify === 'code';
  const [sections, releases, people, archived] = await Promise.all([classes.sections(code), classes.releases(code), needsList ? classes.people(code) : [], library.archivedActivities ? library.archivedActivities(entry.id) : []]);
  const shut = needsList && !people.some((person) => person.listed);
  // Up and down move a row within its own group, so the ends are the group's.
  const goals = goalsIn(doc);
  const rows = (list) => list.map((activity, index) => activityRow(activity, code, meta.version, index, list.length, locked, sections, releases[activity.key] || {}, doc, goals)).join('');
  const goalsHere = (unitRef) => goalsPart(goals, { code, doc, activities, unitRef, locked });
  const loose = activities.filter((activity) => !units.some((unit) => unit.ref === activity.unit_ref));
  const api = `courses/${esc(code)}`;
  // A unit is a section of the list itself: named, renamed and moved where it is, with its activities under it.
  const unitHead = (unit, index) => `<div class="unit-head" id="unit-${esc(unit.ref)}" data-say-box>
${locked ? '' : `<span class="drag-handle" data-drag="unit" aria-hidden="true">${icon('grip', 16)}</span>`}
<h2 class="unit">${esc(unit.title)} <small>${esc(plural(inUnit(unit.ref).length, 'activity', 'activities'))}${unit.starts_on || unit.ends_on ? `<span class="unit-dates">${esc(daysWords(unit.starts_on, unit.ends_on))}</span>` : ''}</small></h2>
${locked ? '' : `<div class="actions unit-do">
<button class="v-btn is-small" type="button" data-prefill="add-activity" data-prefill-field="unit_ref" data-prefill-value="${esc(unit.ref)}">${icon('plus', 14)}<span>Add an activity here</span></button>
<details class="unit-more" data-close-outside><summary class="v-btn is-small icon" aria-label="${esc(`More for ${unit.title}: name, dates, move or remove`)}" data-tip="Name, dates, move or remove">${icon('more', 16)}</summary>
<div class="unit-menu">
<form class="one-field" id="unit-edit-${esc(unit.ref)}" data-api="PUT ${api}/units/${esc(unit.ref)}">${text('title', 'Its name', unit.title, { required: true, maxlength: 160, autocomplete: 'off' })}
<fieldset class="unit-days"><legend class="v-label">Its dates <small>if it has them</small></legend><div class="unit-days-row">${text('starts_on', 'From', unit.starts_on || '', { type: 'date', 'data-empty': 'No start' })}${text('ends_on', 'To', unit.ends_on || '', { type: 'date', 'data-empty': 'No end', min: unit.starts_on || null, 'data-min-from': 'starts_on' })}</div><small class="v-note">Learners see them on the course’s home, beside the unit’s name. They don’t open or close anything.</small></fieldset>
<div class="actions"><button class="v-btn is-small is-primary" type="submit">Save</button></div>${say()}</form>
<div class="unit-menu-row"><button class="v-btn is-small" type="button" data-api="POST ${api}/units/${esc(unit.ref)}/move" data-body='{"by":-1}'${index === 0 ? ' disabled' : ''}><span class="turned">${icon('chevron', 14)}</span><span>Move up</span></button><button class="v-btn is-small" type="button" data-api="POST ${api}/units/${esc(unit.ref)}/move" data-body='{"by":1}'${index === units.length - 1 ? ' disabled' : ''}>${icon('chevron', 14)}<span>Move down</span></button></div>
<button class="v-btn is-small" type="button" data-prefill="add-goals" data-prefill-field="unit_ref" data-prefill-value="${esc(unit.ref)}">${icon('plus', 14)}<span>Add goals to this unit</span></button>
<button class="v-btn is-small danger" type="button" data-api="DELETE ${api}/units/${esc(unit.ref)}" data-confirm="${esc(`Remove the unit “${unit.title}”? Its activities and goals stay in the course, in no unit.`)}" data-yes="Remove the unit" data-danger data-said="Removed.">${icon('trash', 14)}<span>Remove the unit</span></button>
</div>
</details>
</div>`}
${say()}
</div>`;
  const rowsOf = (list, ref, empty) => `<ul class="rows" data-unit="${esc(ref)}" data-drop-group="${esc(ref)}">${rows(list)}${empty ? `<li class="unit-empty">${empty}</li>` : ''}</ul>`;
  const startOpen = !activities.length || url?.searchParams.get('add') === '1';
  return {
    title: course.title,
    body: `${courseHead({ title: course.title, code, origin, addresses, tabs, current: 'Activities', closed: meta.status === 'closed' })}
${locked ? SAVING : ''}
${shut ? `<p class="notice">Only personal codes on the class list open this course, and nobody is on it yet. <a href="/console/courses/${esc(code)}/people">Add your class</a>.</p>` : ''}
<section class="block" aria-label="Activities"${locked ? '' : ` data-arrange="PUT ${api}/arrangement"`}>
${locked ? '' : `<div class="list-tools">
<details class="add-panel"${startOpen ? ' open' : ' data-close-outside'}><summary class="v-btn is-primary">${icon('plus', 15)}<span>Add an activity</span></summary>
<form class="v-card add" id="add-activity" data-api="POST ${api}/activities">
<input type="hidden" name="version" value="${meta.version}">
${text('title', 'Its title', '', { required: true, maxlength: 160, autocomplete: 'off', placeholder: 'e.g. Practice: adding fractions' })}
${units.length ? choose('unit_ref', 'In the unit', '', [{ value: '', label: 'No unit' }, ...units.map((unit) => ({ value: unit.ref, label: unit.title }))]) : ''}
${oneOf('kind', 'What learners do first', 'page', Object.entries(KINDS).map(([value, kind]) => ({ value, label: kind.label, hint: kind.hint })))}
<div data-show-when="kind=embed">${text('url', 'Its address', '', { type: 'url', placeholder: 'https://' })}</div>
<div class="actions"><button class="v-btn is-primary" type="submit">Add it</button>${startOpen && !activities.length ? '' : '<button class="v-btn" type="button" data-close>Cancel</button>'}<span class="v-note">It stays hidden from learners until you open it.</span></div>${say()}
</form>
</details>
<details class="add-unit" data-close-outside><summary class="v-btn">${icon('plus', 15)}<span>Add a unit</span></summary>
<form class="v-card one-field" id="add-unit" data-api="POST ${api}/units">
${text('title', 'Its name', '', { required: true, maxlength: 160, autocomplete: 'off', placeholder: 'e.g. Week 1: Fractions', hint: 'A heading on the course’s home that groups activities, such as a week or a topic.' })}
<div class="actions"><button class="v-btn is-primary" type="submit">Add the unit</button><button class="v-btn" type="button" data-close>Cancel</button></div>${say()}
</form>
</details>
</div>`}
${courseGoalsPart(goals, { code, doc, activities, locked, help: goalHelp })}
${!activities.length && !units.length ? '<p class="v-empty">No activities yet. Add the first one above: it stays hidden from learners until you open it.</p>' : units.length
    ? `${units.map((unit, index) => `<div class="unit-block" data-unit="${esc(unit.ref)}"${locked ? '' : ` data-drag-block="${esc(unit.ref)}"`}>${unitHead(unit, index)}${goalsHere(unit.ref)}${rowsOf(inUnit(unit.ref), unit.ref, locked ? 'Nothing in this unit.' : 'Nothing here yet: add an activity here, or drag one in.')}</div>`).join('')}${loose.length
      ? `<div class="loose-block"><div class="unit-head"><h2 class="unit">Not in a unit <small>${esc(plural(loose.length, 'activity', 'activities'))}</small></h2></div>${rowsOf(loose, '', '')}</div>`
      : locked ? '' : `<div class="loose-block is-empty"><p class="unit loose-drop">Not in a unit</p>${rowsOf([], '', 'Drop it here to take it out of its unit.')}</div>`}`
    : rowsOf(activities, '', '')}
</section>
${archived.length ? archivedActivitiesPart(archived, { code, forGood: !library.archives, just: url?.searchParams.get('archived-activity'), keeps: library.keeps }) : ''}`,
    css: `${ACTIVITIES_CSS}\n${GOALS_CSS}`
  };
}

const ACTIVITIES_CSS = `.unit{margin:26px 0 8px;font-size:1.0625rem;font-weight:600;letter-spacing:0}
.rows{margin:0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px 14px;align-items:center;padding:14px 0;border-bottom:1px solid var(--public-rule)}
.row-what{display:grid;gap:2px;min-width:0}
.row-what a{color:var(--public-ink);text-decoration:none}
.row-what a:hover{text-decoration:underline}
.row-what strong{font-weight:600}
.row .say{grid-column:1/-1}
.by-section{grid-column:1/-1}
.by-section summary{padding:4px 0;color:var(--ink-blue);font-size:.875rem;cursor:pointer}
.by-section ul{display:grid;gap:6px;margin:8px 0 0;padding:0;list-style:none}
.by-section li{display:grid;grid-template-columns:minmax(0,180px) minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:6px 10px;border-radius:var(--radius-sm);background:var(--field-mist)}
.by-section strong{color:var(--public-ink);font-size:.9375rem;font-weight:600}
.by-section .v-note{font-size:.875rem}
.row .icon{padding:0 11px}
.v-pill.is-open{border-color:transparent;background:var(--field-sage);color:var(--public-ink)}
.row>.v-pill{max-width:15em;white-space:normal}
/* Adding: an activity or a unit, opened where the list starts */
.list-tools{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;margin-bottom:6px}
.list-tools>details>summary{list-style:none;display:inline-flex;align-items:center;gap:6px}
.list-tools>details>summary::-webkit-details-marker{display:none}
.list-tools>details[open]{flex-basis:100%}
.list-tools>details[open]>summary{margin-bottom:10px}
.list-tools>details[open]>form{animation:v-rise .18s var(--ease-out,cubic-bezier(.22,1,.36,1))}
.add{display:grid;gap:14px}
.add .one-of-list{grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))}
.add .actions{align-items:center}
.add-unit form{max-width:520px}
/* A unit is a section of the list: its name, what is in it, and what can be done to it, where it is */
.unit-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 14px;margin:26px 0 8px}
.unit-head .unit{margin:0}
.unit small{margin-left:6px;color:var(--muted);font-size:.8125rem;font-weight:400}
.unit-dates{margin-left:8px;padding:1px 8px;border-radius:var(--radius-pill);background:var(--field-mist);color:var(--public-text);white-space:nowrap}
.unit-days{display:grid;gap:8px;margin:0;padding:0;border:0;min-width:0}
.unit-days legend small{margin-left:4px;color:var(--muted);font-weight:400}
.unit-days-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.unit-days .v-form{gap:4px}
.unit-days .v-label{font-size:.8125rem;font-weight:500;color:var(--muted)}
.unit-days .vd-face{min-height:40px;padding:6px 10px;font-size:.9375rem}
.unit-do{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.unit-do .v-btn span{margin-left:2px}
.page .list-tools>details>summary::before,.page .unit-more>summary::before{display:none}
.unit-more{position:relative}
.unit-more>summary{list-style:none}.unit-more>summary::-webkit-details-marker{display:none}
.unit-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:6;display:grid;gap:10px;width:min(340px,calc(100vw - 32px));padding:12px;border:1px solid var(--public-rule);border-radius:var(--radius);background:var(--surface);box-shadow:0 18px 40px -20px rgb(10 16 28/.4);transform-origin:top right;animation:v-rise .16s var(--ease-out,cubic-bezier(.22,1,.36,1))}
.unit-menu-row{display:flex;gap:6px}
.unit-menu .v-btn{justify-content:flex-start;gap:6px}
.unit-menu>.v-btn{justify-self:start}
.unit-head .say{flex-basis:100%}
/* Dragging: a handle at a row's or a unit's start, the row left in place as where it will land, and a copy under the pointer */
.unit-empty{padding:12px 0;color:var(--muted);font-size:.9375rem;list-style:none;border-bottom:1px solid var(--public-rule)}
.rows>.unit-empty:not(:only-child){display:none}
.loose-block.is-empty{display:none}
.is-arranging .loose-block.is-empty{display:block}
.loose-drop{margin:26px 0 8px;color:var(--muted)}
.drag-handle{display:grid;place-items:center;width:24px;height:32px;border-radius:6px;color:var(--muted);cursor:grab;touch-action:none;opacity:.55;transition:opacity .12s ease,background-color .12s ease}
.row:hover>.drag-handle,.unit-head:hover>.drag-handle,.drag-handle:active{opacity:1}
.drag-handle:hover{background:var(--field-mist)}
@media (hover:none){.drag-handle{opacity:.8}}
.row{grid-template-columns:24px minmax(0,1fr) auto auto}
.row>.drag-handle{grid-row:1;grid-column:1}
.row>.row-what{grid-column:2}
.row:not(:has(>.drag-handle)){grid-template-columns:minmax(0,1fr) auto auto}
.row:not(:has(>.drag-handle))>.row-what{grid-column:1}
.unit-head{justify-content:flex-start}
.unit-head>.unit{flex:1}
.drag-ghost{padding:10px 14px}
.drag-ghost .actions,.drag-ghost .by-section,.drag-ghost .say,.drag-ghost .unit-do{display:none}
.row-unit{width:auto;max-width:200px}
.row-unit.v-menu-button{min-height:34px;padding:0 12px;font-size:.875rem}
.row-move{display:inline-flex;gap:6px}
@media (prefers-reduced-motion:reduce){.list-tools>details[open]>form,.unit-menu{animation:none}}
/* On a phone the menu opens under the unit's heading, its width, not off the screen's edge */
@media (max-width:720px){.unit-head{position:relative}.unit-more{position:static}.unit-menu{left:0;right:0;width:auto}}
@media (max-width:720px){.row{grid-template-columns:24px minmax(0,1fr) auto}.row-do{grid-column:2/-1}.by-section li{grid-template-columns:minmax(0,1fr)}}
${ARCHIVED_CSS}`;

// --- A course's settings ------------------------------------------------------------------------------

// What learners see of a course: a look, drawn small so it can be chosen by eye, and a color that is the course's own. The page keeps them readable, whichever is chosen.
// The colours a course is offered, by name; exported so a host's own settings can offer the same.
export const COURSE_COLORS = [['#2447a6', 'Blue'], ['#0e7c86', 'Teal'], ['#1f6b55', 'Green'], ['#6b3fa0', 'Purple'], ['#b8336a', 'Pink'], ['#b03a2e', 'Red'], ['#c26a12', 'Orange'], ['#2a2f36', 'Ink']];
function looksPart(course, code) {
  const held = Object.hasOwn(THEMES, course.appearance?.theme || '') ? course.appearance.theme : 'clear';
  const color = course.appearance?.color || '';
  return `<fieldset class="looks"><legend class="v-label">How it looks to learners</legend>
<div class="look-list">${Object.entries(THEMES).map(([id, theme]) => `<label class="look"><input class="sr" type="radio" name="appearance.theme" value="${esc(id)}"${id === held ? ' checked' : ''}><span class="look-sample look-${esc(id)}"><b>${esc(theme.name)}</b><span class="look-line"></span><span class="look-line short"></span><span class="look-go"></span></span></label>`).join('')}</div>
<div class="swatches" role="radiogroup" aria-label="The course’s color"><label class="swatch"><input class="sr" type="radio" name="appearance.color" value=""${color ? '' : ' checked'}><span class="swatch-own">The look’s own</span></label>${COURSE_COLORS.map(([hex, name], index) => `<label class="swatch" data-tip="${esc(name)}"><input class="sr" type="radio" name="appearance.color" value="${esc(hex)}"${hex === color ? ' checked' : ''}><span class="swatch-dot swatch-${index}" aria-hidden="true"></span><span class="sr">${esc(name)}</span></label>`).join('')}</div>
<small class="v-note">Learners’ pages follow this, on the course’s home and in every activity. <a href="/console/api/courses/${esc(code)}/try" target="_blank" rel="noopener">See it as a learner</a> once it’s saved.</small>
</fieldset>`;
}
const LOOKS_CSS = `.looks{display:grid;gap:10px;margin:0;padding:0;border:0}
.looks legend{padding:0;margin-bottom:6px}
.look-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.look{cursor:pointer}
.look-sample{display:grid;gap:7px;padding:12px;border:1.5px solid var(--public-rule);border-radius:var(--radius-sm);transition:border-color .12s ease}
.look-sample b{font-weight:600;font-size:.9375rem;line-height:1.2}
.look-line{height:5px;border-radius:3px;opacity:.28;background:currentColor}
.look-line.short{width:62%}
.look-go{width:44px;height:12px;margin-top:2px;border-radius:6px}
.look:hover .look-sample{border-color:var(--public-rule-strong)}
.look input:checked+.look-sample{border-color:var(--ink-blue);box-shadow:0 0 0 1px var(--ink-blue)}
.look input:focus-visible+.look-sample,.swatch input:focus-visible+span{outline:2px solid var(--ink-blue);outline-offset:2px}
${Object.entries(THEMES).map(([id, theme]) => `.look-${id}{background:${theme.light.bg};color:${theme.light.ink};font-family:${theme.type.font}}.look-${id} b{font-family:${theme.type.head}}.look-${id} .look-go{background:${theme.accent}}`).join('\n')}
.swatches{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.swatch{display:inline-flex;cursor:pointer}
.swatch-own{padding:4px 12px;border:1.5px solid var(--public-rule);border-radius:var(--radius-pill);font-size:.875rem}
.swatch input:checked+.swatch-own{border-color:var(--ink-blue);color:var(--public-ink)}
.swatch-dot{width:26px;height:26px;border:2px solid transparent;border-radius:50%;background-clip:padding-box}
.swatch input:checked+.swatch-dot{box-shadow:0 0 0 2px var(--surface),0 0 0 4px var(--ink-blue)}
${COURSE_COLORS.map(([hex], index) => `.swatch-${index}{background-color:${hex}}`).join('')}`;

async function settingsBody({ library, classes, origin, addresses, tabs }, match) {
  const entry = await courseAt(library, match[1]);
  const { doc, meta, code } = entry;
  const course = doc.course;
  const locked = !classes.saving;
  const given = meta.version === 0;
  const versions = (meta.versions || []).map((item) => `<li><span>Version ${item.version} · <time datetime="${esc(item.at)}">${esc(item.at.slice(0, 16).replace('T', ' '))} UTC</time>${item.note ? ` · ${esc(item.note)}` : ''}</span>${item.version === meta.version ? '<span class="v-note">This one</span>' : `<button class="v-btn is-small" type="button" data-api="POST courses/${esc(code)}/restore" data-body='${esc(JSON.stringify({ to: item.version }))}' data-confirm="Go back to version ${item.version}? Learners see it at once. Who can sign in, what is open and which chat pages are on stay as they are now. What you have now stays as a version too." data-said="Back to version ${item.version}.">Go back to this</button>`}</li>`).join('');
  return {
    title: `Settings · ${course.title}`,
    body: `${courseHead({ title: course.title, code, origin, addresses, tabs, current: 'Settings', closed: meta.status === 'closed' })}
${locked ? SAVING : ''}
${given && !locked ? `<p class="notice">This course comes from <code>${esc(entry.file)}</code>. The first change makes a copy on this server, at the same link with the same learners, and the file is no longer read.</p>` : ''}
<form class="block settings" id="course-settings" data-api="PUT courses/${esc(code)}" data-guard>
<input type="hidden" name="version" value="${meta.version}">
${text('title', 'Title', course.title, { required: true, maxlength: 160 })}
${text('description', 'What it is', course.description, { rows: 3, maxlength: 4000, hint: 'Learners see this on the course’s home.' })}
${oneOf('audience', 'Who it is for', course.audience || 'adults', [
    { value: 'adults', label: 'Adults', hint: 'University and adult learners.' },
    { value: 'teens', label: 'Teenagers', hint: 'Ages 13 to 17.' },
    { value: 'children', label: 'Children', hint: 'Under 13: the page uses simpler words and bigger controls.' }
  ])}
${looksPart(course, code)}
${toggle('shared_devices', 'Learners share computers', course.shared_devices, { hint: 'Each visit asks who is here, and so does the page after 20 idle minutes.' })}
${oneOf('data_level', 'What is kept of what learners do', course.data_level || 'minimal', [
    { value: 'minimal', label: 'The least', hint: 'Who has done what, and the conversations. No writing history or events.' },
    { value: 'process', label: 'How they worked', hint: 'Also answers as they go and drafts of their writing.' },
    { value: 'detailed', label: 'In detail', hint: 'Also each step in their writing and reading.' }
  ])}
${text('learner_daily_messages', 'Messages to the AI per learner, per day', course.learner_daily_messages ?? '', { type: 'number', min: 0, max: 1000, hint: 'Empty for no limit of its own.' })}
<div class="actions"><button class="v-btn is-primary" type="submit"${locked ? ' disabled' : ''}>Save</button></div>${say()}
</form>
<section class="block" aria-labelledby="file-title" data-say-box>
<h2 id="file-title">The course as a file</h2>
<p class="v-note">Download it to keep it, or to open it somewhere else: the VIABLE Developer Platform (Courses → Import), or a server of your own with the Engine. It holds the activities, the agents and their files. Learners, class lists and their work stay here.</p>
<div class="actions file-actions"><a class="v-btn" href="/console/api/courses/${esc(code)}/download">Download</a></div>
</section>
${versions ? `<section class="block" aria-labelledby="versions-title" data-say-box>
<h2 id="versions-title">Versions</h2>
<p class="v-note">Each save is kept, the latest 30. Going back keeps what you have now as well.</p>
<ul class="versions">${versions}</ul>${say()}
</section>` : ''}
${locked || given ? '' : `<section class="block" aria-labelledby="end-title" data-say-box>
<h2 id="end-title">Close, archive or delete</h2>
<dl class="end-ways">
<div><dt>Hide</dt><dd>One activity, from the course’s page: learners don’t see it until you open it again.</dd></div>
<div><dt>Close</dt><dd>The whole course: learners can’t open it or save work until you open it again. What they did stays.</dd></div>
${library.archive ? `<div><dt>Archive</dt><dd>Closed, and off your list: it waits under Archived at the foot of your courses, to restore as it was, with its learners and their work.</dd></div>
<div><dt>Delete</dt><dd>From Archived, for good.${library.archives ? (library.keeps ? ` ${esc(library.keeps)}` : ' What learners did is kept.') : ' Everything its learners did goes with it, off this server.'}</dd></div>` : `<div><dt>Delete</dt><dd>For good: the course and its versions are gone from this server, with every learner’s work in it. Download it first if you may want it.</dd></div>`}
</dl>
<div class="end">
<div class="actions"><button class="v-btn" type="button" data-api="POST courses/${esc(code)}/status" data-body='${esc(JSON.stringify({ status: meta.status === 'closed' ? 'open' : 'closed' }))}'${meta.status === 'closed' ? '' : ` data-confirm="${esc(`Close “${course.title}”? Learners can’t open it or save work until you open it again, and anyone in it now loses what they haven’t saved. What they did stays.`)}" data-yes="Close it"`} data-said="${meta.status === 'closed' ? 'Open again.' : 'Closed.'}">${meta.status === 'closed' ? 'Open it again' : 'Close this course'}</button>
${library.archive ? `<button class="v-btn" type="button" data-api="POST courses/${esc(code)}/archive" data-confirm="Archive “${esc(course.title)}”? Learners can’t open it until you restore it." data-yes="Archive">Archive this course</button>` : `<button class="v-btn danger" type="button" data-api="DELETE courses/${esc(code)}" data-confirm="This deletes “${esc(course.title)}”, its versions and everything its learners did. It can’t be undone." data-type="DELETE" data-yes="Delete">Delete this course</button>`}</div>
</div>${say()}
</section>`}`,
    css: `${LOOKS_CSS}\n.settings{display:grid;gap:18px;max-width:640px}.versions{margin:12px 0 0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}.versions li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 14px;padding:10px 0;border-bottom:1px solid var(--public-rule)}.file-actions{margin-top:12px}.end{display:grid;gap:18px;margin-top:14px}.end-ways{display:grid;gap:8px;max-width:62ch;margin:12px 0 0}.end-ways>div{display:grid;grid-template-columns:5.5em minmax(0,1fr);gap:2px 12px}.end-ways dt{color:var(--public-ink);font-weight:600}.end-ways dd{margin:0;color:var(--public-text)}@media (max-width:480px){.end-ways>div{grid-template-columns:minmax(0,1fr)}}.danger{border-color:var(--pencil-red);color:var(--pencil-red)}.danger:hover{border-color:var(--pencil-red);background:color-mix(in srgb,var(--pencil-red) 8%,transparent)}`
  };
}

// --- Changes ------------------------------------------------------------------------------------------

const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);
const go = (path, said) => ({ go: path, ...(said ? { said } : {}) });
const courseGo = (code, more = '') => go(`/console/courses/${code}${more}`);

async function addFromFile({ library, request }, _match, bytes) {
  const name = decodeURIComponent(request.headers.get('x-file-name') || 'package');
  let read;
  try { read = await readPackage(bytes, name); } catch (error) { throw refused(error.message); }
  const { code } = await library.add(paused(read.doc), { zip: read.zip, title: name });
  return code ? courseGo(code) : go('/console/agents');
}

/** Every change to a course: what it says changes, on the version the person saw. */
export const changeCourse = async (library, code, version, work, note) => {
  const entry = await courseAt(library, code);
  return library.change(entry.id, version, work, note);
};

export const coursePages = [
  {
    id: 'courses', title: 'Courses',
    render: async (tools) => ({ body: await listBody(tools), css: `${FORMS_CSS}\n${LIST_CSS}` }),
    api: [
      // What opening an activity asks first: its checks that aren't met, and the course's, each with where to fix it.
      ['GET', /^courses\/([\w-]+)\/checks$/, async (here, match) => {
        const { code, doc } = await courseAt(here.library, match[1]);
        const { courseChecks } = await import('./askCards.js');
        const activity = here.url.searchParams.get('activity') || null;
        return { unmet: (await courseChecks(here, code, doc, { activity })).filter((item) => !item.ok).map(({ words, href, label }) => ({ words, href, label })) };
      }],
      ['POST', /^courses$/, async ({ library }, _match, body) => {
        const title = clean(body?.title, 160);
        if (!title) throw refused('Give it a title.');
        const { code } = await library.add(blankPackage(title));
        return courseGo(code);
      }],
      ['POST', /^courses\/from-example$/, async ({ library, examples }, _match, body) => {
        const example = examples.find((item) => item.id === body?.id);
        if (!example) throw refused('That example isn’t here.', 404, 'example_not_found');
        const read = await example.read();
        const { code } = await library.add(paused(read.doc), { zip: read.zip ?? null, dir: read.dir ?? null });
        return code ? courseGo(code) : go('/console/courses');
      }],
      ['POST', /^courses\/from-file$/, addFromFile, { bytes: ARCHIVE_BYTES }],
      ['PUT', /^courses\/([\w-]+)$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], body?.version, (doc) => {
          const title = clean(body.title, 160);
          if (!title) throw refused('Give it a title.');
          doc.title = title;
          doc.course.title = title;
          doc.course.description = clean(body.description, 4000) || null;
          if (['adults', 'teens', 'children'].includes(body.audience)) doc.course.audience = body.audience;
          doc.course.shared_devices = body.shared_devices === true;
          if (body.appearance) doc.course.appearance = { ...doc.course.appearance, theme: Object.hasOwn(THEMES, body.appearance.theme || '') ? body.appearance.theme : null, color: /^#[0-9a-f]{6}$/i.test(String(body.appearance.color || '')) ? body.appearance.color : null };
          if (['minimal', 'process', 'detailed'].includes(body.data_level)) doc.course.data_level = body.data_level;
          doc.course.learner_daily_messages = Number.isInteger(body.learner_daily_messages) && body.learner_daily_messages > 0 ? Math.min(body.learner_daily_messages, 1000) : null;
        }, 'Settings');
        return { said: 'Saved. Learners see this on their next visit.' };
      }],
      ['DELETE', /^courses\/([\w-]+)$/, async ({ library, classes }, match) => {
        const entry = await courseAt(library, match[1]);
        await library.remove(entry.id);
        await classes.forgetCourse(entry);
        return go('/console/courses');
      }],
      // Archived: off learners' pages and the list, kept as it is; the list opens where it went.
      ['POST', /^courses\/([\w-]+)\/archive$/, async ({ library }, match) => {
        const entry = await courseAt(library, match[1]);
        await library.archive(entry.id);
        return go(`/console/courses?archived=${encodeURIComponent(entry.code)}#archived`);
      }],
      ['POST', /^archived\/([\w-]+)\/restore$/, async ({ library }, match) => {
        await library.unarchive((await archivedAt(library, match[1])).id);
        return go('/console/courses');
      }],
      ['POST', /^courses\/([\w-]+)\/archived-activities\/([\w-]+)\/restore$/, async ({ library }, match) => {
        await library.restoreActivity((await courseAt(library, match[1])).id, match[2]);
        return go(`/console/courses/${match[1]}`);
      }],
      ['DELETE', /^courses\/([\w-]+)\/archived-activities\/([\w-]+)$/, async ({ library, classes }, match) => {
        const { key } = await library.deleteActivity((await courseAt(library, match[1])).id, match[2]);
        // Where the host keeps what learners did, it has nothing here to forget.
        if (key) await classes.forgetActivity(match[1], key);
        return go(`/console/courses/${match[1]}?archived-activity=#archived-activities`);
      }],
      ['DELETE', /^archived\/([\w-]+)$/, async ({ library, classes }, match) => {
        const entry = await archivedAt(library, match[1]);
        await library.remove(entry.id);
        // Where the host keeps what learners did, it has nothing here to forget.
        if (entry.doc) await classes.forgetCourse(entry);
        return go('/console/courses?archived=#archived');
      }],
      // Trying it as a learner: where that is differs by host, so a page links here and is sent on.
      ['GET', /^courses\/([\w-]+)\/try(?:\/([\w-]+))?$/, async ({ library, tryLink, url }, match) => {
        const { code } = await courseAt(library, match[1]);
        return new Response(null, { status: 302, headers: { location: await tryLink(code, match[2] || null, { section: url.searchParams.get('section') || null, open: url.searchParams.get('open') || null }), 'cache-control': 'no-store' } });
      }],
      ['GET', /^courses\/([\w-]+)\/download$/, async ({ library }, match) => {
        const entry = await courseAt(library, match[1]);
        const file = await library.download(entry.id);
        return new Response(file.bytes, { status: 200, headers: { 'content-type': file.type, 'content-disposition': `attachment; filename="${file.name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      }],
      ['POST', /^courses\/([\w-]+)\/restore$/, async ({ library }, match, body) => {
        const entry = await courseAt(library, match[1]);
        await library.restore(entry.id, body?.to);
        return { said: `Back to version ${body?.to}.` };
      }],
      ['POST', /^courses\/([\w-]+)\/status$/, async ({ library }, match, body) => {
        const entry = await courseAt(library, match[1]);
        await library.setStatus(entry.id, body?.status);
        return {};
      }],
      // Goals, one a line: what learners will be able to do, in the whole course or a unit.
      ['POST', /^courses\/([\w-]+)\/goals$/, async ({ library }, match, body) => {
        let added = 0;
        await changeCourse(library, match[1], null, (doc) => { added = addGoals(doc, String(body?.text ?? '').split('\n'), body?.unit_ref ? String(body.unit_ref) : null); }, 'Added goals');
        return { said: `Added ${plural(added, 'goal')}. Say which activities work toward ${added === 1 ? 'it' : 'them'} in each activity’s Details.` };
      }],
      ['PUT', /^courses\/([\w-]+)\/goals\/([\w.-]+)$/, async ({ library }, match, body) => {
        const words = clean(body?.text, GOAL_LIMITS.text);
        if (!words) throw refused('Write what learners will be able to do.');
        await changeCourse(library, match[1], null, (doc) => {
          const goal = (doc.course.goals || []).find((item) => item.ref === match[2]);
          if (!goal) throw refused('That goal isn’t in this course anymore.', 404, 'goal_not_found');
          goal.text = words;
          if (body?.unit_ref !== undefined) goal.unit_ref = body.unit_ref && (doc.course.units || []).some((unit) => unit.ref === body.unit_ref) ? body.unit_ref : null;
        }, 'Changed a goal');
        return { said: 'Saved.' };
      }],
      ['DELETE', /^courses\/([\w-]+)\/goals\/([\w.-]+)$/, async ({ library }, match) => {
        await changeCourse(library, match[1], null, (doc) => removeGoal(doc, match[2]), 'Removed a goal');
        return { said: 'Removed.' };
      }],
      // A unit at a time, by its ref: renaming one keeps what is in it (the list of titles, below, is Ask's way).
      ['POST', /^courses\/([\w-]+)\/units$/, async ({ library }, match, body) => {
        const title = clean(body?.title, 160);
        if (!title) throw refused('Give the unit a name.');
        await changeCourse(library, match[1], null, (doc) => {
          const units = doc.course.units ||= [];
          if (units.length >= 60) throw refused('A course has at most 60 units.');
          if (units.some((unit) => unit.title.toLowerCase() === title.toLowerCase())) throw refused(`There is already a unit called “${title}”.`);
          const taken = new Set(units.map((unit) => unit.ref));
          const start = cutWords(slugOf(title, 'unit'), 40);
          let ref = start;
          for (let n = 2; taken.has(ref); n += 1) ref = `${start}-${n}`;
          units.push({ ref, title });
        }, `Added the unit ${title}`);
        return { said: `Added “${title}”. Put activities in it from their row, or add one here.` };
      }],
      // The whole order at once, as dragging leaves it: units in the order sent, and activities in the order sent, each in
      // the unit given (unit_ref null for none). Anything not named keeps its place after those that are.
      ['PUT', /^courses\/([\w-]+)\/arrangement$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], null, (doc) => {
          const units = doc.course.units || [];
          if (Array.isArray(body?.units)) {
            const named = body.units.map((ref) => units.find((unit) => unit.ref === String(ref))).filter(Boolean);
            doc.course.units = [...new Set([...named, ...units])];
          }
          if (Array.isArray(body?.activities)) {
            const list = doc.course.activities || [];
            // Each keeps its own address however the list is ordered: a key read from its place is written down.
            activityKeys(list).forEach((key, i) => { list[i].key ||= key; });
            const known = new Set((doc.course.units || []).map((unit) => unit.ref));
            const placed = [];
            for (const item of body.activities) {
              const activity = list.find((entry) => entry.key === String(item?.key ?? ''));
              if (!activity || placed.includes(activity)) continue;
              if (item.unit_ref !== undefined) activity.unit_ref = item.unit_ref && known.has(item.unit_ref) ? item.unit_ref : null;
              placed.push(activity);
            }
            doc.course.activities = [...placed, ...list.filter((activity) => !placed.includes(activity))];
          }
        }, 'Arranged the course');
        return {};
      }],
      // A unit's name and its dates (YYYY-MM-DD, or empty for none), each changed only when it is sent.
      ['PUT', /^courses\/([\w-]+)\/units\/([\w-]+)$/, async ({ library }, match, body) => {
        const title = body?.title === undefined ? null : clean(body.title, 160);
        if (title === '') throw refused('Give the unit a name.');
        const dayIn = (value, words) => {
          if (value === undefined) return undefined;
          if (value == null || value === '') return null;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw refused(`${words}: give a day, such as 2026-11-09.`);
          return String(value);
        };
        const starts = dayIn(body?.starts_on, 'From');
        const ends = dayIn(body?.ends_on, 'To');
        let renamed = false;
        await changeCourse(library, match[1], null, (doc) => {
          const units = doc.course.units || [];
          const unit = units.find((item) => item.ref === match[2]);
          if (!unit) throw refused('That unit isn’t in this course anymore.', 404, 'unit_not_found');
          if (title && units.some((item) => item !== unit && item.title.toLowerCase() === title.toLowerCase())) throw refused(`There is already a unit called “${title}”.`);
          const from = starts === undefined ? unit.starts_on || null : starts;
          const to = ends === undefined ? unit.ends_on || null : ends;
          if (from && to && to < from) throw refused('It has to end on or after the day it starts.');
          renamed = Boolean(title && title !== unit.title);
          if (title) unit.title = title;
          if (starts !== undefined) unit.starts_on = starts;
          if (ends !== undefined) unit.ends_on = ends;
        }, title ? `Renamed or dated a unit: ${title}` : 'Dated a unit');
        return { said: renamed ? 'Saved. What is in it stays in it.' : 'Saved.' };
      }],
      ['DELETE', /^courses\/([\w-]+)\/units\/([\w-]+)$/, async ({ library }, match) => {
        await changeCourse(library, match[1], null, (doc) => {
          const units = doc.course.units || [];
          if (!units.some((item) => item.ref === match[2])) throw refused('That unit isn’t in this course anymore.', 404, 'unit_not_found');
          doc.course.units = units.filter((item) => item.ref !== match[2]);
          for (const item of [...(doc.course.activities || []), ...(doc.course.goals || [])]) if (item.unit_ref === match[2]) item.unit_ref = null;
        }, 'Removed a unit');
        return { said: 'Removed. Its activities stay in the course, in no unit.' };
      }],
      ['POST', /^courses\/([\w-]+)\/units\/([\w-]+)\/move$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], null, (doc) => {
          const units = doc.course.units || [];
          const at = units.findIndex((item) => item.ref === match[2]);
          const to = at + (body?.by < 0 ? -1 : 1);
          if (at >= 0 && to >= 0 && to < units.length) units.splice(to, 0, units.splice(at, 1)[0]);
        }, 'Moved a unit');
        return {};
      }],
      ['PUT', /^courses\/([\w-]+)\/units$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], body?.version, (doc) => {
          const titles = String(body.titles ?? '').split('\n').map((line) => line.trim().slice(0, 160)).filter(Boolean).slice(0, 60);
          const held = doc.course.units || [];
          // A line that keeps its title keeps its unit; a new one gets a new ref. An activity in a unit that's gone is in none.
          const refs = new Set(held.map((unit) => unit.ref));
          doc.course.units = titles.map((title) => {
            const found = held.find((unit) => unit.title === title);
            if (found) return found;
            let ref = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'unit';
            for (let n = 2; refs.has(ref); n += 1) ref = `${ref.replace(/-\d+$/, '')}-${n}`;
            refs.add(ref);
            return { ref, title };
          });
          const kept = new Set(doc.course.units.map((unit) => unit.ref));
          for (const item of [...(doc.course.activities || []), ...(doc.course.goals || [])]) if (item.unit_ref && !kept.has(item.unit_ref)) item.unit_ref = null;
        }, 'Units');
        return { said: 'Saved.' };
      }]
    ]
  },
  {
    id: 'new-course', title: 'New course', section: 'courses', nav: false,
    render: async (tools) => ({ body: `<nav class="crumbs" aria-label="Where you are"><a href="/console/courses">Courses</a></nav><h1>New course</h1>${tools.classes.saving ? await startParts(tools) : SAVING}`, css: `${FORMS_CSS}\n${LIST_CSS}` }),
    api: []
  },
  {
    id: 'course-activities', title: 'Activities', section: 'courses', nav: false, courseTab: 'Activities', tabPath: '',
    match: /^courses\/([\w-]+)$/,
    render: withForms(activitiesBody),
    api: []
  },
  {
    id: 'course-settings', title: 'Settings', section: 'courses', nav: false, courseTab: 'Settings', tabPath: '/settings',
    match: /^courses\/([\w-]+)\/settings$/,
    render: withForms(settingsBody),
    api: []
  }
];
