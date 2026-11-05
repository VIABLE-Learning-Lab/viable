/**
 * The console's courses: the list, starting one (blank, from an example, from a file), a course's
 * activities and its settings. A course is a package's document, changed through the library; nothing
 * here keeps anything of its own. No Node built-ins.
 */
import { activityKeys } from '../server/library.js';
import { readPackage } from '../server/runtime.js';
import { choose, courseHead, esc, FORMS_CSS, oneOf, plural, say, text, toggle, withForms } from './forms.js';
import { CONSOLE_SCRIPT } from './client.js';

const refused = (message, status = 400, code = 'invalid_course') => Object.assign(new Error(message), { status, code });
const ARCHIVE_BYTES = 50 * 1024 * 1024;
const KINDS = {
  chat: { label: 'Talk with the AI', hint: 'A conversation, with nothing beside it.' },
  questions: { label: 'Questions', hint: 'Questions to answer, with the AI beside them if you want.' },
  writing: { label: 'Writing', hint: 'A piece of writing, drafted and handed in.' },
  reading: { label: 'Reading', hint: 'A PDF to read and mark up.' },
  embed: { label: 'A web page', hint: 'A simulation, video or tool at an https address.' }
};
const HELP_WORDS = { ask_first: 'Ask first', hint: 'Hint', explain: 'Explain', check_only: 'Only check' };

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
// A file can say its chat page is on, and that means anyone can spend this server's keys: here it starts paused, for someone to turn on.
const paused = (doc) => { for (const agent of [doc, ...(doc?.agents || [])]) if (agent?.chat_page) agent.chat_page = { ...agent.chat_page, status: 'paused' }; return doc; };
const SAVING = '<p class="notice">This server has no store, so courses can’t be changed here. Start it with a data folder (<code>viable-engine start</code>), or deploy it with a store.</p>';

// --- The list -----------------------------------------------------------------------------------------

async function listBody({ library, classes, examples, settings, simple }) {
  const courses = await library.courses();
  const cards = await Promise.all(courses.map(async (entry) => {
    const { code } = entry;
    const facts = [plural((entry.doc.course.activities || []).length, 'activity', 'activities'), plural((await classes.people(code)).length, 'learner'), ...(entry.meta.status === 'closed' ? ['Closed'] : []), ...(entry.meta.version === 0 ? [`From ${entry.file}`] : [])];
    return `<li><a class="course-card v-card" href="/console/courses/${esc(code)}"><strong>${esc(entry.doc.course.title)}</strong><span class="v-note">${esc(facts.join(' · '))}</span></a></li>`;
  }));
  const { saving } = classes;
  const using = settings ? await settings.resolve() : null;
  return `<h1>Courses</h1>
<p class="v-lead">A course is one link for your learners: its activities, who is in it, and how far the AI may go in each.</p>
${saving ? '' : SAVING}
${saving && using && !using.roles.reply ? '<p class="notice">No model writes replies yet. <a href="/console/models">Set one up</a> and the AI in your activities starts working. You can build a course first.</p>' : ''}
${cards.length || simple ? '' : '<p class="v-note first-door">Only want a chat button for a website? <a href="/console/chat-pages">Start with a chat page</a>.</p>'}
${cards.length ? `<ul class="course-list">${cards.join('')}</ul>` : ''}
${saving ? `<section class="block" aria-labelledby="start-title">
<h2 id="start-title">Start a course</h2>
<div class="starts">
<form class="v-card start" id="new-blank" data-api="POST courses">
<h3>From nothing</h3>
<p class="v-note">A title, then add activities. It comes with a tutor, which you can change.</p>
${text('title', 'Its title', '', { required: true, maxlength: 160, placeholder: 'e.g. Fractions, period 2', autocomplete: 'off' })}
<div class="actions"><button class="v-btn is-primary" type="submit">Create</button></div>${say()}
</form>
${examples.length ? `<form class="v-card start" id="new-example" data-api="POST courses/from-example">
<h3>From an example</h3>
<p class="v-note">A whole working course to read, try and change.</p>
${choose('id', 'Which', examples[0].id, examples.map((example) => ({ value: example.id, label: example.title })))}
<div class="actions"><button class="v-btn" type="submit">Add it</button></div>${say()}
</form>` : ''}
<div class="v-card start" id="new-file" data-say-box>
<h3>From a file</h3>
<p class="v-note">A package (<code>.viable.zip</code> or <code>.viable.json</code>) from the VIABLE Developer Platform or another Engine. Learners, class lists and study data don’t travel in one.${simple ? '' : ' A chat page in it starts paused.'}</p>
<div class="v-form"><label class="v-label" for="package-file">Choose the file</label><input class="v-input" id="package-file" type="file" accept=".zip,.json" data-upload="POST courses/from-file"></div>${say()}
</div>
</div>
</section>` : ''}`;
}

const LIST_CSS = `.course-list{display:grid;gap:12px;margin:24px 0 0;padding:0;list-style:none}
.course-card{display:grid;gap:4px;color:var(--public-ink);text-decoration:none;transition:box-shadow .16s ease}
.course-card strong{font-size:1.0625rem;font-weight:600}
.starts{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;align-items:start}
.start{display:grid;gap:12px}
.start h3{font-size:1rem;font-weight:600;letter-spacing:0}
.first-door{margin-top:14px}`;

// --- A course's activities ----------------------------------------------------------------------------

export const kindOfActivity = (activity) => {
  const panels = activity.workspace?.panels || [];
  // A workspace with nothing in it yet is a reading waiting for its PDF.
  if (!panels.length) return activity.workspace ? 'reading' : 'chat';
  return panels.length === 1 ? panels[0].type : 'several';
};
const kindWords = (activity) => {
  const kind = kindOfActivity(activity);
  const what = kind === 'several' ? `${activity.workspace.panels.length} panels` : KINDS[kind].label;
  return [what, ...(kind !== 'chat' ? [activity.agent_ref && activity.workspace?.ai !== 'off' ? 'AI beside it' : 'No AI'] : []), ...(activity.minutes ? [`${activity.minutes} min`] : []), ...(activity.teaching?.help ? [HELP_WORDS[activity.teaching.help]] : [])].join(' · ');
};
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

function activityRow(activity, code, version, index, count, locked, sections, own) {
  const key = esc(activity.key);
  const api = `courses/${esc(code)}/activities/${key}`;
  const open = activity.release !== 'hidden';
  return `<li class="row" id="activity-${key}" data-say-box>
<div class="row-what"><a href="/console/courses/${esc(code)}/activities/${key}"><strong>${esc(activity.title)}</strong></a><span class="v-note">${esc(kindWords(activity))}</span></div>
<span class="v-pill${open ? ' is-open' : ''}">${esc(stateWords(activity))}</span>
<div class="actions row-do">
${locked ? '' : `<button class="v-btn is-small" type="button" data-api="POST ${api}/release" data-body='${esc(JSON.stringify({ version, release: open ? 'hidden' : 'open' }))}' data-said="${open ? 'Hidden from learners.' : 'Open to learners.'}">${open ? 'Hide' : 'Open'}</button>`}
<a class="v-btn is-small" href="/console/api/courses/${esc(code)}/try/${key}" target="_blank" rel="noopener">Try it</a>
${locked ? '' : `<button class="v-btn is-small icon" type="button" aria-label="Move ${esc(activity.title)} up" data-api="POST ${api}/move" data-body='${esc(JSON.stringify({ version, by: -1 }))}'${index === 0 ? ' disabled' : ''}>↑</button><button class="v-btn is-small icon" type="button" aria-label="Move ${esc(activity.title)} down" data-api="POST ${api}/move" data-body='${esc(JSON.stringify({ version, by: 1 }))}'${index === count - 1 ? ' disabled' : ''}>↓</button>`}
</div>
${locked ? '' : forSections(activity, code, sections, own, open)}
${say()}
</li>`;
}

async function activitiesBody({ library, classes, origin, addresses, signIn, tabs, simple }, match) {
  const entry = await courseAt(library, match[1]);
  const { doc, meta, code } = entry;
  const course = doc.course;
  const held = course.activities || [];
  const keys = activityKeys(held);
  const activities = held.map((activity, i) => ({ ...activity, key: keys[i] }));
  const locked = !classes.saving;
  const units = course.units || [];
  const inUnit = (ref) => activities.filter((activity) => (activity.unit_ref || null) === ref);
  const [sections, releases, people] = await Promise.all([classes.sections(code), classes.releases(code), classes.people(code)]);
  // A course of codes with nobody listed is shut to everyone, and the link gives no hint of it.
  const shut = classes.saving && !signIn && course.identify === 'code' && !people.some((person) => person.listed);
  const rows = (list) => list.map((activity) => activityRow(activity, code, meta.version, activities.indexOf(activity), activities.length, locked, sections, releases[activity.key] || {})).join('');
  const groups = [...units.map((unit) => ({ title: unit.title, list: inUnit(unit.ref) })), { title: units.length ? 'Not in a unit' : null, list: activities.filter((activity) => !units.some((unit) => unit.ref === activity.unit_ref)) }].filter((group) => group.title && units.length ? group.list.length || group.title !== 'Not in a unit' : group.list.length);
  return {
    title: `Activities · ${course.title}`,
    body: `${courseHead({ title: course.title, code, origin, addresses, tabs, current: 'Activities', closed: meta.status === 'closed' })}
${locked ? SAVING : ''}
${shut ? `<p class="notice">Only personal codes on the class list open this course, and nobody is on it yet. <a href="/console/courses/${esc(code)}/people">Add your class</a>.</p>` : ''}
<section class="block" aria-label="Activities">
${activities.length ? groups.map((group) => `${group.title ? `<h2 class="unit">${esc(group.title)}</h2>` : ''}<ul class="rows">${rows(group.list)}</ul>`).join('') : '<p class="v-empty">No activities yet. Add the first one below. It stays hidden from learners until you open it.</p>'}
</section>
${locked ? '' : `<section class="block" aria-labelledby="add-title">
<h2 id="add-title">Add an activity</h2>
<form class="v-card add" id="add-activity" data-api="POST courses/${esc(code)}/activities">
<input type="hidden" name="version" value="${meta.version}">
${text('title', 'Its title', '', { required: true, maxlength: 160, autocomplete: 'off', placeholder: 'e.g. Practice: adding fractions' })}
${oneOf('kind', 'What learners do', 'chat', Object.entries(KINDS).map(([value, kind]) => ({ value, label: kind.label, hint: kind.hint })))}
<div data-show-when="kind=embed">${text('url', 'Its address', '', { type: 'url', placeholder: 'https://' })}</div>
<div class="actions"><button class="v-btn is-primary" type="submit">Add it</button></div>${say()}
</form>
</section>
<section class="block" aria-labelledby="units-title">
<h2 id="units-title">Units</h2>
<p class="v-note">Optional: headings on the course’s home, such as weeks or topics. One per line, in order. An activity says which it belongs to on its own page.</p>
<form id="units" class="units" data-api="PUT courses/${esc(code)}/units">
<input type="hidden" name="version" value="${meta.version}">
${text('titles', 'Units', units.map((unit) => unit.title).join('\n'), { rows: Math.max(3, units.length + 1) })}
<div class="actions"><button class="v-btn" type="submit">Save units</button></div>${say()}
</form>
</section>`}`,
    css: ACTIVITIES_CSS
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
.by-section summary{color:var(--ink-blue);font-size:.875rem;cursor:pointer}
.by-section ul{display:grid;gap:6px;margin:8px 0 0;padding:0;list-style:none}
.by-section li{display:grid;grid-template-columns:minmax(0,180px) minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:6px 10px;border-radius:var(--radius-sm);background:var(--field-mist)}
.by-section strong{color:var(--public-ink);font-size:.9375rem;font-weight:600}
.by-section .v-note{font-size:.875rem}
.row .icon{padding:0 11px}
.v-pill.is-open{border-color:transparent;background:var(--field-sage);color:var(--public-ink)}
.add,.units{display:grid;gap:14px}
.units{max-width:520px}
@media (max-width:720px){.row{grid-template-columns:minmax(0,1fr) auto}.row-do{grid-column:1/-1}.by-section li{grid-template-columns:minmax(0,1fr)}}`;

// --- A course's settings ------------------------------------------------------------------------------

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
<h2 id="end-title">Close or ${library.archives ? 'archive' : 'delete'}</h2>
<div class="end">
<div><p class="v-note">Closed, learners can’t open it. Their work stays, and you can open it again.</p><button class="v-btn" type="button" data-api="POST courses/${esc(code)}/status" data-body='${esc(JSON.stringify({ status: meta.status === 'closed' ? 'open' : 'closed' }))}' data-said="${meta.status === 'closed' ? 'Open again.' : 'Closed.'}">${meta.status === 'closed' ? 'Open it again' : 'Close this course'}</button></div>
${library.archives ? `<div><p class="v-note">Archived, learners can’t open it and it leaves your list. What they did stays, on the VIABLE Developer Platform under Learners.</p><button class="v-btn danger" type="button" data-api="DELETE courses/${esc(code)}" data-confirm="This archives “${esc(course.title)}”: learners can’t open it any more." data-yes="Archive">Archive this course</button></div>` : `<div><p class="v-note">Deleted, the course and its versions are gone from this server, with every learner’s work in it. This can’t be undone. Download it first if you may want it.</p><button class="v-btn danger" type="button" data-api="DELETE courses/${esc(code)}" data-confirm="This deletes “${esc(course.title)}”, its versions and everything its learners did. It can’t be undone." data-type="DELETE" data-yes="Delete">Delete this course</button></div>`}
</div>${say()}
</section>`}`,
    css: `.settings{display:grid;gap:18px;max-width:640px}.versions{margin:12px 0 0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}.versions li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 14px;padding:10px 0;border-bottom:1px solid var(--public-rule)}.file-actions{margin-top:12px}.end{display:grid;gap:18px;margin-top:12px}.end>div{display:grid;gap:10px;justify-items:start}.danger{border-color:var(--pencil-red);color:var(--pencil-red)}.danger:hover{border-color:var(--pencil-red);background:color-mix(in srgb,var(--pencil-red) 8%,transparent)}`
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
    render: async (tools) => ({ body: await listBody(tools), css: `${FORMS_CSS}\n${LIST_CSS}`, script: CONSOLE_SCRIPT }),
    api: [
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
          for (const activity of doc.course.activities || []) if (activity.unit_ref && !kept.has(activity.unit_ref)) activity.unit_ref = null;
        }, 'Units');
        return { said: 'Saved.' };
      }]
    ]
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
