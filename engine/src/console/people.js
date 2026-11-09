/**
 * A course's People tab: how learners say who they are, the class list and its cards, and sections. The
 * class list is in the store (server/classList.js), and how they sign in is in the package. Each page loads
 * what it shows and hands plain values to a function that only draws, so another host can use the same
 * pages. No Node built-ins.
 */
import { activityKeys } from '../server/library.js';
import { PEOPLE_LIMITS, cleanEntry, readClassLines, showCode } from '../server/classList.js';
import { changeCourse, courseAt } from './course.js';
import { choose, courseHead, esc, hereOnly, oneOf, plural, qrSvg, reachOf, say, sectionChips, text, toggle, when, withForms } from './forms.js';
import { icon } from './icons.js';

const refused = (message, status = 400, code = 'invalid_people') => Object.assign(new Error(message), { status, code });
const SAVING = '<p class="notice">This server has no store, so it can’t keep a class list, and each browser is one learner. Start it with a data folder (<code>viable-engine start</code>), or deploy it with a store.</p>';

// A cell for a CSV: quoted when it must be, and never read as a formula by a spreadsheet.
const csvCell = (value) => {
  let cell = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
};

const IDENTIFY = [
  { value: 'code', label: 'Personal codes on cards', hint: 'You print a card for each learner, and only codes on your list open the course. Children do best with this: nothing to spell, and their work follows the code on any computer.' },
  { value: 'ask', label: 'They type their name or student ID', hint: 'The first time, on one device. Anywhere else they use the personal code they are shown then, so nobody can open a classmate’s work by typing their name. A name nobody has used yet goes to whoever types it first: where that matters, use personal codes.' },
  { value: 'browser', label: 'Nobody signs in', hint: 'Each browser is one learner, shown a personal code to come back with. Fine for one sitting. On another computer, without that code, they are someone new.' }
];
const FROM = [
  { value: 'link', label: 'By their section’s link', hint: 'Give each class its own link or QR code: opening it puts them in that section. Someone who opens the course’s own link is asked which class they’re in, once.' },
  { value: 'choose', label: 'They choose once', hint: 'Asked on their first visit. You can move anyone later.' },
  { value: 'roster', label: 'From your class list only', hint: 'The list says who is in which section. Anyone not on it has none until you move them.' }
];
const SERVER_WAY = {
  class: 'This server was started with a class code, and that decides who gets in, whatever this says. Each person who has it becomes a learner with a code of their own, not someone on your list.',
  proxy: 'On this server people sign in through your school, and that decides who is who, whatever this says.'
};
const wayOf = (course) => (course.identify === 'code' || course.identify === 'ask' ? course.identify : 'browser');
const entryWord = (course) => (course.identify === 'ask' && course.identify_ask && course.identify_ask !== 'name' ? 'Student ID' : 'Name');

// --- What it draws ------------------------------------------------------------------------------------

function howBlock({ course, code, version, locked, signIn, simple }) {
  const way = wayOf(course);
  // A way set on the Developer Platform that this page can't express stays as it is, and is changed there.
  const other = simple && (course.identify === 'link' || (course.identify === 'ask' && !['name', 'student_id', null, undefined].includes(course.identify_ask)));
  const summary = simple && course.identify === 'link' ? 'They come from another site, with an ID on their link.' : other ? `They type their ${course.identify_ask === 'email' ? 'school email' : 'participant ID'}${course.identify_match === 'roster' ? ', and only those on your list get in.' : '.'}` : way === 'code' ? 'Personal codes on cards. Only codes on your list open the course.' : way === 'ask' ? `They type their ${entryWord(course) === 'Name' ? 'name' : 'student ID'}${course.identify_match === 'roster' ? ', and only those on your list get in.' : '.'}` : 'Nobody signs in: each browser is one learner.';
  return `<section class="v-card set" aria-labelledby="how-title" data-say-box id="how-box">
<h2 id="how-title">How learners say who they are</h2>
${signIn ? `<p class="notice">${esc(SERVER_WAY[signIn])}</p>` : ''}
<p class="now">${esc(summary)}</p>
${course.identify === 'link' && !simple ? '<p class="v-note">Its package takes an ID from each learner’s link, which this server doesn’t do: each browser is one learner until you choose here.</p>' : ''}
${other ? '<p class="v-note">This is set on the VIABLE Developer Platform. Change it there.</p>' : ''}
${locked || other ? '' : `<details id="how-change"><summary>Change this</summary>
<form class="how-form" id="how" data-api="PUT courses/${esc(code)}/people/how">
<input type="hidden" name="version" value="${version}">
${oneOf('identify', 'How they sign in', way, simple ? IDENTIFY.map((item) => (item.value === 'browser' ? { ...item, hint: 'Each browser is one learner. Fine for one sitting. On another computer, they are someone new.' } : item)) : IDENTIFY)}
<div class="kind-fields" data-show-when="identify=ask">
${choose('identify_ask', 'What they type', course.identify_ask === 'student_id' ? 'student_id' : 'name', [{ value: 'name', label: 'Their name' }, { value: 'student_id', label: 'Their student ID' }])}
${choose('identify_match', 'Who gets in', course.identify_match === 'roster' ? 'roster' : 'any', [{ value: 'any', label: 'Anyone with the link: a new one is shown back to them to check' }, { value: 'roster', label: 'Only those on your class list' }])}
</div>
<div class="actions"><button class="v-btn is-primary" type="submit">Save</button></div>${say()}
</form>
</details>`}
</section>`;
}

function personRow(person, { code, sections, locked }) {
  const who = person.name || showCode(person.code);
  const shown = person.listed ? '' : '<small class="tag">Not on the list</small>';
  return `<tr>
<th scope="row" data-label="Name"><a href="/console/courses/${esc(code)}/people/${esc(person.id)}">${esc(who)}</a>${shown}</th>
${sections.length ? `<td data-label="Section">${locked ? esc(sections.find((section) => section.id === person.section)?.name || '') : `<label class="sr" for="move-${esc(person.id)}">Section for ${esc(who)}</label><select class="v-input small" id="move-${esc(person.id)}" name="section" data-api="PUT courses/${esc(code)}/people/${esc(person.id)}" data-say-in="list-status"><option value="">No section</option>${sections.map((section) => `<option value="${esc(section.id)}"${section.id === person.section ? ' selected' : ''}>${esc(section.name)}</option>`).join('')}</select>`}</td>` : ''}
<td data-label="Personal code">${person.personal === false ? '<span class="v-note">None yet</span>' : `<code class="code">${esc(showCode(person.code))}</code>`}</td>
<td data-label="Last seen" class="seen">${person.last_seen_at ? when(person.last_seen_at) : '<span class="v-note">Not yet</span>'}</td>
</tr>`;
}

// One box takes a class list however it comes: names typed one a line, columns copied from a spreadsheet, a file a
// school's system exported, names from an email. Nothing is added until the teacher has seen who each line becomes.
const addForm = (course, code, sections) => {
  const ids = entryWord(course) !== 'Name';
  return `<form class="add-people" id="paste" data-api="POST courses/${esc(code)}/people" data-preview="POST courses/${esc(code)}/people/preview" data-into="paste-preview">
<div class="paste-in" data-drop>
${text('list', ids ? 'Their student IDs' : 'Who is in this class', '', { rows: 7, id: 'paste-list', spellcheck: 'false', autocomplete: 'off', placeholder: ids ? 'S1042\nS1043\nS1044' : 'Ada Lovelace\nAlan Turing\nGrace Hopper', hint: `${ids ? 'Type one on each line' : 'Type a name on each line'}, or paste a list as it comes: columns from a spreadsheet, a file from your school’s system, names from an email. You see who each line becomes before anyone is added.` })}
<div class="paste-file"><label class="v-btn is-small" for="paste-file">${icon('upload', 14)}<span>Open a file</span></label><input class="sr" id="paste-file" type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,text/tab-separated-values" data-read-into="list" data-sheets-in="paste-sheets"><small class="v-note">An Excel, CSV or text file, read on this computer. Or copy the columns from any spreadsheet and paste them.</small><div class="paste-sheets" id="paste-sheets" role="group" aria-label="Which sheet to read"></div></div>
</div>
<div class="v-form paste-section"><label class="v-label" for="paste-section">In the section</label><input class="v-input" id="paste-section" name="section" data-list="paste-sections" autocomplete="off" maxlength="${PEOPLE_LIMITS.sectionName}" placeholder="${sections.length ? 'None' : 'None: everyone is one class'}"><datalist id="paste-sections">${sections.map((section) => `<option value="${esc(section.name)}">`).join('')}</datalist><small class="v-note">For lines that don’t say one. A new name makes that section.</small></div>
<div class="paste-preview" id="paste-preview" aria-live="polite"></div>
<div class="actions"><button class="v-btn is-primary" type="submit" disabled>Add to the list</button><span class="v-note">Each person gets a personal code.</span></div>${say()}
</form>`;
};

const ROLE_WORDS = { name: 'Name', first: 'First name', last: 'Last name', section: 'Section', skip: 'Leave out' };
const ID_ROLES = ['name', 'section', 'skip'];

/** Who each line of a pasted list becomes, against the list as it is: drawn before anything is added. */
function previewView({ code, read, people, sections, ids }) {
  const listed = people.filter((person) => person.listed);
  const sectionName = (id) => sections.find((section) => section.id === id)?.name || '';
  const seen = new Map();
  const rows = read.lines.map((line) => {
    if (!line.name) return { ...line, kind: 'out', words: 'Left out: no name' };
    if (line.name.length > PEOPLE_LIMITS.name) return { ...line, kind: 'out', words: `Left out: over ${PEOPLE_LIMITS.name} characters` };
    const key = line.name.toLowerCase();
    if (seen.has(key)) return { ...line, kind: 'twice', words: `Same name as line ${seen.get(key)}` };
    seen.set(key, line.row);
    const same = listed.filter((person) => (person.name || '').toLowerCase() === key);
    if (!same.length) return { ...line, kind: 'new', words: 'New' };
    const now = sectionName(same[0].section);
    if (same.length === 1 && line.section && now.toLowerCase() !== line.section.toLowerCase()) return { ...line, kind: 'moves', words: now ? `Moves from ${now}` : 'Moves into it', id: same[0].id };
    return { ...line, kind: 'same', words: same.length > 1 ? `${same.length} here with this name` : 'Already on the list', twin: true, section_id: same[0].section };
  });
  const count = (kind) => rows.filter((row) => row.kind === kind).length;
  const fresh = count('new');
  const moves = count('moves');
  const same = count('same');
  const twice = count('twice');
  const out = count('out');
  const roles = ids ? ID_ROLES : Object.keys(ROLE_WORDS);
  const columns = read.columns.length > 1 ? `<fieldset class="pv-columns"><legend class="v-label">What each column holds</legend>
<input type="hidden" name="shape" value="${esc(read.shape)}">
<div class="pv-cols">${read.columns.map((column, i) => `<div class="pv-col${column.role === 'skip' ? ' is-out' : ''}"><label class="sr" for="pv-col-${i}">Column ${i + 1}${column.heading ? `, “${esc(column.heading)}”` : ''}</label><select class="v-input small" id="pv-col-${i}" name="columns.${i}">${roles.map((role) => `<option value="${role}"${role === column.role ? ' selected' : ''}>${esc(ids && role === 'name' ? 'Student ID' : ROLE_WORDS[role])}</option>`).join('')}</select><small>${column.heading ? `<b>${esc(column.heading)}</b> ` : ''}${esc(column.samples.join(', ') || 'Empty')}</small></div>`).join('')}</div>
</fieldset>` : '';
  const said = [
    fresh ? `<strong>${esc(plural(fresh, 'new person', 'new people'))}</strong>` : 'Nobody new',
    moves ? `${esc(plural(moves, 'person moves', 'people move'))} to the section given` : '',
    same ? `${esc(plural(same, 'line is', 'lines are'))} someone already here` : '',
    twice ? `${esc(plural(twice, 'line repeats', 'lines repeat'))} a name above` : '',
    out ? `${esc(plural(out, 'line is', 'lines are'))} left out` : ''
  ].filter(Boolean);
  const notes = [
    read.headed ? 'The first line reads as headings, so it isn’t a person.' : '',
    read.turned || read.columns.some((column) => column.role === 'last') ? `Names read first name, then last: ${esc(rows.find((row) => row.name)?.name || '')}.` : '',
    read.fresh.length ? `It makes ${esc(plural(read.fresh.length, 'section'))}: ${esc(read.fresh.join(', '))}.` : ''
  ].filter(Boolean);
  const shown = (name) => (name.length > 60 ? `${name.slice(0, 60)}…` : name);
  const row = (line) => `<tr class="pv-${line.kind}"><td class="pv-line">${line.row}</td><th scope="row">${esc(shown(line.name)) || '<span class="v-note">No name</span>'}</th><td class="pv-section">${esc(line.section)}</td><td class="pv-what"><span class="pv-tag">${esc(line.words)}</span>${line.twin && !ids ? `<button class="v-btn is-small pv-twin" type="button" data-api="POST courses/${esc(code)}/people" data-body="${esc(JSON.stringify({ name: line.name, section: line.section_id || null }))}" data-confirm="${esc(`Add another ${line.name}, someone new with the same name? Each gets their own personal code.`)}" data-yes="Add another" aria-label="${esc(`Add another ${line.name}`)}">Add another</button>` : ''}</td></tr>`;
  return {
    fresh,
    moves,
    html: `${columns}
<p class="pv-sum">${said.join(', ')}.${notes.length ? ` <span class="v-note">${notes.join(' ')}</span>` : ''}</p>
<div class="pv-wrap"><table class="v-table pv-table"><thead><tr><th scope="col" class="pv-line">Line</th><th scope="col">${esc(ids ? 'Student ID' : 'Name')}</th><th scope="col">Section</th><th scope="col">What happens</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>`
  };
}

const previewButton = (fresh, moves) => (fresh && moves ? `Add ${plural(fresh, 'person', 'people')}, move ${moves}` : fresh ? `Add ${plural(fresh, 'person', 'people')}` : moves ? `Move ${plural(moves, 'person', 'people')}` : 'Nothing to add');

function listBlock({ code, course, version, people, sections, filter, locked, signIn }) {
  const listed = people.filter((person) => person.listed);
  const inFilter = people.filter((person) => (!filter ? true : filter === 'none' ? !person.section : person.section === filter));
  const counts = Object.fromEntries(sections.map((section) => [section.id, people.filter((person) => person.section === section.id).length]));
  counts.none = people.filter((person) => !person.section).length;
  const signedIn = people.filter((person) => person.last_seen_at).length;
  const shut = !signIn && course.identify === 'code' && !listed.length;
  // A list that does nothing yet says so, and the way to make it count is a button here, not a setting to go and find.
  const unused = !locked && !signIn && wayOf(course) === 'browser' && listed.length > 0;
  const cards = `/console/courses/${esc(code)}/people/cards${filter ? `?section=${esc(filter)}` : ''}`;
  const add = locked ? '' : addForm(course, code, sections);
  return `<section class="block" aria-labelledby="list-title">
<div class="list-head"><h2 id="list-title">The class list${people.length ? ` <small>${esc(`${plural(listed.length, 'person', 'people')}, ${signedIn} signed in${people.length > listed.length ? `, ${people.length - listed.length} not on the list` : ''}`)}</small>` : ''}</h2>
${people.length ? `<div class="actions">${add ? `<button class="v-btn is-small" type="button" data-prefill="paste">${icon('plus', 14)}<span>Add people</span></button>` : ''}${listed.length ? `<a class="v-btn is-small is-primary" href="${cards}">Print cards</a>` : ''}<a class="v-btn is-small" href="/console/api/courses/${esc(code)}/people.csv" data-tip="The only file that joins names and personal codes, so keep it somewhere private.">Download</a></div>` : ''}</div>
${shut ? '<p class="notice">Nobody is on the list yet, so nobody can open this course. Add your class below.</p>' : ''}
${unused ? `<div class="notice list-unused" data-say-box><p>This list isn’t in use yet: learners come in without signing in, so nothing ties them to a name here. With personal codes on cards, each one comes in as the person on the list.</p><div class="actions"><button class="v-btn is-small is-primary" type="button" data-api="PUT courses/${esc(code)}/people/how" data-body='${esc(JSON.stringify({ version, identify: 'code' }))}' data-said="They come in with personal codes now. Print the cards.">Use personal codes</button></div>${say()}</div>` : ''}
${people.length ? `${sectionChips(sections, filter, `/console/courses/${code}/people`, counts)}
<div id="list-status">${say()}</div>
${inFilter.length ? `<div class="list-wrap"><table class="v-table people" aria-labelledby="list-title">
<thead><tr><th scope="col">${esc(entryWord(course))}</th>${sections.length ? '<th scope="col">Section</th>' : ''}<th scope="col">Personal code</th><th scope="col">Last seen</th></tr></thead>
<tbody>${inFilter.map((person) => personRow(person, { code, sections, locked })).join('')}</tbody>
</table></div>` : '<p class="v-empty">Nobody in this section yet.</p>'}
${add ? `<details class="adds" id="add-people"><summary class="v-btn">${icon('plus', 15)}<span>Add people</span></summary><div class="v-card adds-card">${add}</div></details>` : ''}` : add ? `<p class="v-lead">Nobody here yet.</p><div class="v-card adds-card is-first">${add}</div>` : '<p class="v-empty">Nobody here yet.</p>'}
</section>`;
}

function sectionRow(section, { code, base, count, locked }) {
  const link = `${base}/course/${code}?section=${encodeURIComponent(section.key)}`;
  return `<li class="section-row" id="section-${esc(section.id)}" data-say-box>
${locked ? `<strong>${esc(section.name)}</strong>` : `<form class="section-form" id="sf-${esc(section.id)}" data-api="PUT courses/${esc(code)}/sections/${esc(section.id)}">
${text('name', 'Name', section.name, { required: true, maxlength: PEOPLE_LIMITS.sectionName })}
${text('key', 'Link key', section.key, { required: true, maxlength: 24, pattern: '[a-z0-9][a-z0-9\\-]*' })}
<button class="v-btn is-small" type="submit">Save</button>
</form>`}
<div class="actions section-do"><span class="v-note">${esc(plural(count, 'learner'))}${count ? '. Move them before removing it.' : ''}</span><button class="v-btn is-small" type="button" data-copy="${esc(link)}">Copy its link</button>${locked ? '' : `<button class="v-btn is-small" type="button" data-api="DELETE courses/${esc(code)}/sections/${esc(section.id)}" data-confirm="Remove “${esc(section.name)}”? Its link stops working, and what you set for it on activities goes too." data-yes="Remove"${count ? ' disabled' : ''}>Remove</button>`}</div>
${say()}
</li>`;
}

function sectionsBlock({ code, course, version, sections, people, base, locked }) {
  const from = course.sections_from || 'none';
  const shownFrom = from === 'none' ? 'roster' : from;
  return `<section class="v-card set" aria-labelledby="sections-title" id="sections-box">
<h2 id="sections-title">Sections</h2>
<p class="now">${sections.length ? `${esc(sections.map((section) => section.name).join(' · '))}` : 'None: everyone is one class.'}</p>
${sections.length ? `<p class="v-note">${esc(FROM.find((item) => item.value === shownFrom).label)}.</p>` : '<p class="v-note">A class period or a group, each with its own link. You can open an activity for one section, and How the AI helps can differ.</p>'}
${locked ? '' : `<details id="sections-change"><summary>${sections.length ? 'Change these' : 'Add a section'}</summary>
${sections.length ? `<ul class="section-rows">${sections.map((section) => sectionRow(section, { code, base, count: people.filter((person) => person.section === section.id).length, locked })).join('')}</ul>` : ''}
<form class="add-section" id="add-section" data-api="POST courses/${esc(code)}/sections">
<label class="sr" for="section-name">A new section’s name</label><input class="v-input" id="section-name" name="name" required maxlength="${PEOPLE_LIMITS.sectionName}" placeholder="e.g. Period 2" autocomplete="off">
<button class="v-btn is-small" type="submit">Add a section</button>${say()}
</form>
${sections.length ? `<form class="from-form" id="from" data-api="PUT courses/${esc(code)}/people/sections-from">
<input type="hidden" name="version" value="${version}">
${oneOf('sections_from', 'Where a learner’s section comes from', shownFrom, FROM)}
<div class="actions"><button class="v-btn is-small" type="submit">Save</button></div>${say()}
</form>` : ''}
</details>`}
</section>`;
}

/** The whole tab, from plain values. */
function peopleView({ code, title, origin, addresses, tabs, closed, course, version, people, sections, filter, locked, signIn, simple }) {
  return `${courseHead({ title, code, origin, addresses, tabs, current: 'People', closed })}
${locked ? SAVING : ''}
${listBlock({ code, course, version, people, sections, filter, locked, signIn })}
<section class="block" aria-label="How this class is set up">
<div class="set-up">
${howBlock({ course, code, version, locked, signIn, simple })}
${sectionsBlock({ code, course, version, sections, people, base: reachOf(origin, addresses).base, locked })}
</div>
</section>`;
}

const PEOPLE_CSS = `.set-up{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
.list-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 16px}
.list-head h2 small{margin-left:6px;color:var(--muted);font-size:.9375rem;font-weight:400;letter-spacing:0}
.list-unused{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px}
.list-unused p{flex:1 1 320px;margin:0}
.list-unused .say{flex-basis:100%}
.adds{margin-top:18px}
.adds>summary.v-btn{list-style:none;display:inline-flex;align-items:center;gap:6px;width:auto}
.adds>summary::-webkit-details-marker{display:none}
.page .adds>summary::before{display:none}
.adds[open]>summary{margin-bottom:12px}
.adds-card{max-width:880px;animation:v-rise .18s var(--ease-out,cubic-bezier(.22,1,.36,1))}
.adds-card.is-first{margin-top:14px}
.add-people{display:grid;gap:16px}
.paste-in{display:grid;gap:8px}
.paste-in textarea{min-height:168px}
.paste-in.is-over textarea{border-color:var(--ink-blue);background:var(--field-mist)}
.paste-file{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.paste-file .v-note{font-size:.875rem}
.paste-sheets{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex-basis:100%}
.paste-sheets:empty{display:none}
.paste-sheets .v-btn[aria-pressed=true]{border-color:var(--ink-blue);background:var(--field-mist);color:var(--public-ink);font-weight:600}
.paste-section{max-width:360px}
.paste-preview{display:grid;gap:12px;padding-top:14px;border-top:1px solid var(--public-rule)}
.paste-preview:empty{display:none}
.pv-columns{display:grid;gap:8px;margin:0;padding:0;border:0}
.pv-cols{display:flex;flex-wrap:wrap;gap:8px}
.pv-col{display:grid;gap:4px;flex:1 1 150px;max-width:240px;min-width:0;padding:8px;border:1px solid var(--public-rule);border-radius:var(--radius-sm);background:var(--surface)}
.pv-col.is-out{border-style:dashed;background:transparent}
.pv-col small{overflow:hidden;color:var(--muted);font-size:.8125rem;text-overflow:ellipsis;white-space:nowrap}
.pv-col small b{color:var(--public-text);font-weight:600}
.pv-col .v-menu-button{min-height:34px;padding:0 10px;font-size:.875rem}
.pv-sum{margin:0;color:var(--public-ink);line-height:1.5}
.pv-sum .v-note{display:block;margin-top:2px;font-size:.875rem}
.pv-wrap{max-height:340px;overflow:auto;border:1px solid var(--public-rule);border-radius:var(--radius-sm)}
.pv-table{margin:0}
.pv-table thead th{position:sticky;top:0;z-index:1;background:var(--surface)}
.pv-table th,.pv-table td{padding:7px 12px;font-size:.9375rem;vertical-align:middle}
.pv-table tbody th{font-weight:600;overflow-wrap:break-word}
.pv-line{width:1%;color:var(--muted);font-variant-numeric:tabular-nums;text-align:right}
.pv-what,.pv-section{white-space:nowrap}
.pv-tag{display:inline-block;padding:1px 9px;border-radius:var(--radius-pill);background:var(--field-mist);color:var(--public-text);font-size:.8125rem}
.pv-new .pv-tag{background:var(--field-sage);color:var(--public-ink)}
.pv-moves .pv-tag{background:color-mix(in srgb,var(--ink-blue) 14%,transparent);color:var(--public-ink)}
.pv-same th,.pv-same td:not(.pv-what),.pv-twice th,.pv-twice td:not(.pv-what){color:var(--muted)}
.pv-out .pv-tag{background:color-mix(in srgb,var(--pencil-red) 12%,transparent);color:var(--pencil-red)}
.v-btn.pv-twin{min-height:28px;margin-left:6px;padding:0 6px;border-color:transparent;background:transparent;color:var(--ink-blue);font-size:.8125rem;font-weight:500}
.v-btn.pv-twin:hover{border-color:transparent;text-decoration:underline}
@media (prefers-reduced-motion:reduce){.adds-card{animation:none}}
.people .v-menu-button{min-height:32px;padding:3px 8px;border-color:transparent;background:transparent}
.people tr:hover .v-menu-button,.people .v-menu-button:focus-visible,.people .v-menu-button[aria-expanded=true]{border-color:var(--public-rule-strong)}
.set{display:grid;gap:6px;min-width:0}
.set h2{font-size:.9375rem;font-weight:600;letter-spacing:0;color:var(--muted)}
.set .notice{margin:4px 0}
.now{margin:0;color:var(--public-ink);font-size:1.0625rem;line-height:1.4;overflow-wrap:anywhere}
.list-facts{margin:12px 0 0;color:var(--public-ink)}
.list-do{margin-top:12px}
.list-do+.v-note{margin-top:8px;font-size:.875rem}
#list-status{position:sticky;top:8px;z-index:2;margin-top:8px}
#list-status .say:not(:empty){padding:6px 12px;border-radius:var(--radius-sm);background:var(--surface);box-shadow:var(--public-shadow)}
.list-wrap{margin-top:12px}
.people td,.people th{vertical-align:middle}
.people th a{display:inline-block;padding:2px 0;font-weight:600}
.people .tag{display:block;color:var(--muted);font-size:.8125rem;font-weight:400}
.people .small{min-height:36px;padding:4px 10px;font-size:.9375rem}
.code{font-size:.9375rem;letter-spacing:.04em;white-space:nowrap}
.seen{white-space:nowrap;font-size:.9375rem}
.add{display:grid;gap:12px}
.add h3{font-size:1rem;font-weight:600;letter-spacing:0}
.section-rows{display:grid;margin:10px 0 0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.section-row{display:grid;gap:8px;padding:12px 0;border-bottom:1px solid var(--public-rule)}
.section-form{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) auto;gap:8px;align-items:end}
.section-form .v-input{min-height:38px;padding:5px 10px;font-size:.9375rem}
.section-do{justify-content:flex-end}
.section-do .v-note{flex:1 1 auto;font-size:.875rem}
.add-section{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.add-section input{flex:1 1 160px;min-height:38px;padding:5px 10px}
.from-form{display:grid;gap:10px;margin-top:16px}
.how-form{display:grid;gap:14px;margin-top:12px}
details>summary{width:fit-content;margin-top:4px;color:var(--ink-blue);font-size:.9375rem;cursor:pointer}
.kind-fields{display:grid;gap:14px;padding:14px 16px;border-left:2px solid var(--public-rule)}
.kind-fields[hidden]{display:none}
@media (max-width:860px){.set-up{grid-template-columns:minmax(0,1fr)}}
@media (max-width:640px){.pv-line{display:none}.pv-what{white-space:normal}.pv-twin{margin:4px 0 0}.pv-col{max-width:none}.people,.people tbody,.people th,.people td{display:block}.people thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.people tr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;padding:12px 0;border-bottom:1px solid var(--public-rule)}.people td,.people tbody th{padding:0;border:0}.people tbody th,.people td[data-label=Section]{grid-column:1/-1}.people td[data-label=Section]{display:flex;align-items:center;gap:8px}.people td[data-label=Section] select{flex:1}.people td[data-label]::before{content:attr(data-label);display:block;color:var(--muted);font-size:.8125rem}.people td[data-label=Section]::before{display:inline}.section-form{grid-template-columns:minmax(0,1fr)}.section-form button{justify-self:start}}`;

function personView({ code, courseTitle, person, sections, closing = [], how, base, locked }) {
  const who = person.name || showCode(person.code);
  const api = `courses/${esc(code)}/people/${esc(person.id)}`;
  const link = `${base}/course/${code}?join=${person.code}`;
  const codeOpens = how !== 'browser';
  return `<nav class="crumbs" aria-label="Where you are"><a href="/console/courses">Courses</a> / <a href="/console/courses/${esc(code)}">${esc(courseTitle)}</a> / <a href="/console/courses/${esc(code)}/people">People</a></nav>
<h1>${esc(who)}</h1>
<p class="v-note person-facts">${person.listed ? 'On the list' : 'Not on the list'} · ${person.last_seen_at ? `Last seen ${when(person.last_seen_at)}` : 'Not signed in yet'}</p>
<p class="person-work"><a href="/console/courses/${esc(code)}/progress/${esc(person.id)}">See their work</a></p>
${locked ? '' : `<section class="block person-part" aria-labelledby="name-title">
<h2 id="name-title">${person.listed ? 'Their name' : 'Put them on the list'}</h2>
${person.listed ? '' : '<p class="v-note">Give them a name, and they are on your class list with their work and code as they are.</p>'}
<form class="one-field" id="rename" data-api="PUT ${api}">
${text('name', 'Name', person.name, { required: true, maxlength: PEOPLE_LIMITS.name, autocomplete: 'off' })}
<div class="actions"><button class="v-btn" type="submit">Save</button></div>${say()}
</form>
</section>
${sections.length ? `<section class="block person-part" aria-labelledby="section-title">
<h2 id="section-title">Their section</h2>
<form class="one-field" id="section" data-api="PUT ${api}">
${choose('section', 'Section', person.section || '', [{ value: '', label: 'No section' }, ...sections.map((section) => ({ value: section.id, label: section.name }))], { hint: 'What opens when for them follows it from now on. Their work stays as it is.' })}
<div class="actions"><button class="v-btn" type="submit">Move them</button></div>${say()}
</form>
</section>` : ''}
${locked ? '' : `<section class="block person-part" aria-labelledby="time-title">
<h2 id="time-title">Extra time</h2>
<form class="one-field" id="extra-time" data-api="PUT ${api}">
${toggle('extra_time', 'No timer moves them on', person.extra_time === true, { hint: 'A step set to open on its own waits until they say they’re ready, its minutes still the earliest. Any learner can also ask for five more minutes when one is about to open.' })}
<div class="actions"><button class="v-btn" type="submit">Save</button></div>${say()}
</form>
</section>
${moreTimePart({ api, who, person, closing })}`}
<section class="block person-part" aria-labelledby="code-title" data-say-box id="code-box">
<h2 id="code-title">Their personal code</h2>
${person.personal === false ? `<p class="v-note">They came by the link, so they have none, and another computer takes them for someone new. A code brings them back anywhere.</p>
<div class="actions"><button class="v-btn is-small" type="button" data-api="POST ${api}/new-code" data-said="They have a code now.">Give them a code</button></div>${say()}
</section>` : `<p class="big-code"><code class="code">${esc(showCode(person.code))}</code></p>
<div class="actions"><button class="v-btn is-small" type="button" data-copy="${esc(showCode(person.code))}">Copy</button><button class="v-btn is-small" type="button" data-copy="${esc(link)}">Copy their personal link</button><button class="v-btn is-small" type="button" data-api="POST ${api}/new-code" data-confirm="Give ${esc(who)} a new code? ${esc(showCode(person.code))} stops working, and any browser signed in with it is signed out. They need the new code to get back in." data-yes="New code" data-said="New code made. The old one no longer works.">New code</button></div>${say()}
</section>`}
<section class="block person-part" aria-labelledby="end-title" data-say-box id="end-box">
<h2 id="end-title">Take them off, or delete their work</h2>
${person.listed ? `<p class="v-note">Off the list, their name goes and any browser signed in as them is signed out. ${person.last_seen_at ? `Their work stays, under their code${codeOpens ? ', and their code no longer opens the course' : ''}.` : 'They haven’t signed in, so nothing else stays.'}</p>
<div class="actions"><button class="v-btn is-small" type="button" data-api="POST ${api}/remove" data-confirm="Take ${esc(who)} off the list?${person.last_seen_at ? ' Their work stays, under their code.' : ''}" data-yes="Take off the list">Take off the list</button></div>` : ''}
<p class="v-note">Deleting removes their conversations, drafts, answers and what the AI remembers of them, and takes them out of this course. This can’t be undone.</p>
<div class="actions"><button class="v-btn is-small danger" type="button" data-api="POST ${api}/forget" data-confirm="This deletes everything ${esc(who)} did in this course, and takes them out of it. It can’t be undone." data-type="DELETE" data-yes="Delete">Delete their work</button></div>${say()}
</section>`}`;
}

// More time on one activity: what they have, and a way to give it on one that closes.
function moreTimePart({ api, who, person, closing }) {
  const closes = closing.filter((item) => item.usual);
  const given = closing.filter((item) => item.extension);
  const at = (iso) => `<time data-local datetime="${esc(iso)}">${esc(String(iso).slice(0, 16).replace('T', ' '))}</time>`;
  return `<section class="block person-part" aria-labelledby="more-title" data-say-box id="more-time">
<h2 id="more-title">More time on an activity</h2>
${closes.length || given.length ? `<p class="v-note">For ${esc(who)} alone: an activity stays open to them until the time you set, after it closes for everyone else. While they have it, no step timer in it moves them on.</p>` : ''}
${given.length ? `<ul class="more-list">${given.map((item) => `<li><div><strong>${esc(item.title)}</strong><span class="v-note">Open to them until ${at(item.extension)}${item.usual ? `, after it closes for everyone at ${at(item.usual)}` : ''}</span></div><button class="v-btn is-small" type="button" data-api="PUT ${api}/more-time" data-body="${esc(JSON.stringify({ activity: item.key, closes_at: null }))}" data-confirm="${esc(`Take back ${who}’s more time on “${item.title}”? It closes for them with everyone.`)}" data-yes="Take it back">Take it back</button></li>`).join('')}</ul>` : ''}
${closes.length ? `<form class="one-field more-form" id="more-time-form" data-api="PUT ${api}/more-time">
${choose('activity', 'Activity', closes[0].key, closes.map((item) => ({ value: item.key, label: item.title })), { hint: 'Only those that close are here. Each closes for them when it closes for their section.' })}
<div class="v-form"><label class="v-label" for="more-until">Open to them until</label><input class="v-input" id="more-until" name="closes_at" type="datetime-local" data-iso="" data-default-time="23:59" data-empty="Choose a day and time" required></div>
<div class="actions"><button class="v-btn" type="submit">Give more time</button></div>${say()}
</form>` : `<p class="v-note">None of this course’s activities closes${person.section ? ' for their section' : ''}, so there’s nothing to give more time on. When an activity closes is set on its page, under Details.</p>`}
${given.length && !closes.length ? say() : ''}
</section>`;
}

const PERSON_CSS = `.person-facts{margin:8px 0 0}
.person-work a{display:inline-block;padding:3px 0}
.person-part{max-width:560px}
.one-field{display:grid;gap:10px;margin-top:10px}
.big-code{margin:10px 0}
.big-code .code{font-size:1.375rem}
.code{letter-spacing:.04em;white-space:nowrap}
.danger{border-color:var(--pencil-red);color:var(--pencil-red)}
.person-part .actions{margin-top:10px}
.person-part>.v-note{margin-top:10px}
.more-list{display:grid;margin:10px 0 0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.more-list li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 14px;padding:10px 0;border-bottom:1px solid var(--public-rule)}
.more-list li>div{display:grid;gap:2px;min-width:0}
.more-list strong{color:var(--public-ink);font-weight:600;overflow-wrap:anywhere}
.more-list .v-note{font-size:.875rem}`;

function cardsView({ code, courseTitle, people, sections, reach, addresses, filter }) {
  const sectionName = (id) => sections.find((section) => section.id === id)?.name || '';
  const link = `${reach.base}/course/${code}`;
  const card = (person) => `<article class="person-card">
<h2>${esc(person.name)}</h2>
${person.section ? `<p class="card-section">${esc(sectionName(person.section))}</p>` : ''}
<p class="card-label">Your personal code</p>
<p class="card-code">${esc(showCode(person.code))}</p>
<div class="card-open">${qrSvg(`${link}?join=${person.code}`, { label: `QR code that signs ${person.name} in` })}<p><strong>${esc(courseTitle)}</strong><br>Scan this, or go to ${esc(link.replace(/^https?:\/\//, ''))} and type your code.</p></div>
</article>`;
  return `<div class="no-print"><nav class="crumbs" aria-label="Where you are"><a href="/console/courses">Courses</a> / <a href="/console/courses/${esc(code)}">${esc(courseTitle)}</a> / <a href="/console/courses/${esc(code)}/people">People</a></nav>
<h1>Cards</h1>
${hereOnly(reach, addresses)}
${sectionChips(sections, filter, `/console/courses/${code}/people/cards`)}
<p class="v-note">One card per learner on the list. The QR code signs them in, as their code does, so keep the cards with your class.</p>
<div class="actions cards-do"><button class="v-btn is-primary" type="button" data-print${people.length ? '' : ' disabled'}>Print ${plural(people.length, 'card')}</button></div></div>
${people.length ? `<div class="cards">${people.map(card).join('')}</div>` : '<p class="v-empty">Nobody on the list here yet.</p>'}`;
}

const CARDS_CSS = `.cards-do{margin-top:14px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px;margin-top:20px}
.person-card{display:grid;gap:2px;padding:16px;border:1px dashed var(--public-rule-strong);border-radius:var(--radius-sm);background:var(--surface);break-inside:avoid}
.person-card h2{font-size:1.125rem;font-weight:600;letter-spacing:0;line-height:1.3;overflow-wrap:anywhere}
.card-section{margin:0;color:var(--muted);font-size:.875rem}
.card-label{margin:8px 0 0;color:var(--muted);font-size:.8125rem}
.card-code{margin:0;color:var(--public-ink);font:700 1.5rem/1.2 var(--font-public-mono);letter-spacing:.06em}
.card-open{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px;align-items:center;margin-top:10px;font-size:.8125rem;line-height:1.4}
.card-open p{margin:0;overflow-wrap:anywhere}
.card-open .qr{display:block;width:100px;height:100px}
@media print{@page{margin:10mm}.side,.no-print{display:none!important}.console{display:block}.page{max-width:none;padding:0}.cards{grid-template-columns:repeat(2,minmax(0,1fr));margin:0;gap:6mm}.person-card{padding:5mm;border-color:#94a3b8;background:none}}`;

// --- What it reads and changes ------------------------------------------------------------------------

async function peopleBody({ library, classes, origin, addresses, tabs, signIn, url, simple }, match) {
  const { doc, meta, code } = await courseAt(library, match[1]);
  const [people, sections] = await Promise.all([classes.people(code), classes.sections(code)]);
  return { title: `People · ${doc.course.title}`, css: PEOPLE_CSS, body: peopleView({ code, title: doc.course.title, origin, addresses, tabs, closed: meta.status === 'closed', course: doc.course, version: meta.version, people, sections, simple, filter: url.searchParams.get('section') || '', locked: !classes.saving, signIn }) };
}

async function personBody({ library, classes, origin, addresses }, match) {
  const { doc, code } = await courseAt(library, match[1]);
  const person = (await classes.people(code)).find((item) => item.id === match[2]);
  if (!person) throw refused('That learner isn’t in this course anymore.', 404, 'learner_not_found');
  const [sections, closing] = await Promise.all([classes.sections(code), closingFor(classes, code, doc, person)]);
  return { title: `${person.name || showCode(person.code)} · ${doc.course.title}`, css: PERSON_CSS, body: personView({ code, courseTitle: doc.course.title, person, sections, closing, how: wayOf(doc.course), base: reachOf(origin, addresses).base, locked: !classes.saving }) };
}

async function cardsBody({ library, classes, origin, addresses, url }, match) {
  const { doc, code } = await courseAt(library, match[1]);
  const filter = url.searchParams.get('section') || '';
  const people = (await classes.people(code)).filter((person) => person.listed && (!filter || (filter === 'none' ? !person.section : person.section === filter)));
  return { title: `Cards · ${doc.course.title}`, css: CARDS_CSS, body: cardsView({ code, courseTitle: doc.course.title, people, sections: await classes.sections(code), reach: reachOf(origin, addresses), addresses, filter }) };
}

/** Each activity as it closes for one learner: when it closes for them with their section (usual), and the more time they have (extension). */
async function closingFor(classes, code, doc, person) {
  const [releases, extensions] = await Promise.all([classes.releases(code), classes.extensions ? classes.extensions(code, person.id) : {}]);
  const list = doc.course.activities || [];
  const keys = activityKeys(list);
  return list.map((activity, i) => {
    const own = person.section ? releases[keys[i]]?.[person.section] : null;
    return { key: keys[i], title: activity.title, usual: (own ? own.closes_at : activity.closes_at) || null, extension: extensions[keys[i]] || null };
  });
}

/** More time for one learner on one activity, or none (closes_at null): it stays open to them after it closes for everyone else. */
async function moreTime(tools, match, body) {
  const { code, doc } = await known(tools, match);
  if (!tools.classes.extend) throw refused('This server can’t give one learner more time.', 409, 'no_store');
  const person = (await tools.classes.people(code)).find((item) => item.id === match[2]);
  if (!person) throw refused('That learner isn’t in this course anymore.', 404, 'learner_not_found');
  const item = (await closingFor(tools.classes, code, doc, person)).find((entry) => entry.key === String(body?.activity ?? ''));
  if (!item) throw refused('That activity isn’t in this course anymore.', 404, 'activity_not_found');
  if (!item.usual && !item.extension) throw refused('It doesn’t close for them, so there’s no more time to give.');
  if (body?.closes_at == null || body.closes_at === '') {
    await tools.classes.extend(code, person.id, item.key, null);
    return { said: 'Taken back: it closes for them with everyone.' };
  }
  const until = Date.parse(body.closes_at);
  if (!Number.isFinite(until)) throw refused('Choose when it closes for them.');
  if (until <= Date.now()) throw refused('Choose a time that hasn’t passed.');
  if (item.usual && until <= Date.parse(item.usual)) throw refused('That’s before it closes for everyone. Choose a later time.');
  await tools.classes.extend(code, person.id, item.key, new Date(until).toISOString());
  return { said: `More time on “${item.title}”.` };
}

const known = async ({ library, classes }, match) => {
  if (!classes.saving) throw refused('This server has no store, so it can’t keep a class list.', 409, 'no_store');
  return courseAt(library, match[1]);
};

async function addPeople(tools, match, body) {
  const { code, doc } = await known(tools, match);
  const { classes, library } = tools;
  if (body?.name != null) {
    const name = cleanEntry(body.name).slice(0, PEOPLE_LIMITS.name);
    if (!name) throw refused('Type a name.');
    const sections = await classes.sections(code);
    const twin = (await classes.named(code, name)).some((person) => person.listed);
    await classes.add(code, { name, section: sections.some((section) => section.id === body.section) ? body.section : null, listed: true, last_seen_at: null });
    return { said: twin ? `Added. Someone else on the list is called ${name}: if learners type their names, these two need their personal codes.` : `Added ${name}.` };
  }
  const report = await classes.addLines(code, body?.list, linesOptions(body, entryWord(doc.course) !== 'Name'));
  // A list that names sections says where sections come from, on a course that had none.
  if (report.sections.length && (doc.course.sections_from || 'none') === 'none') await changeCourse(library, code, null, (draft) => { draft.course.sections_from = 'roster'; }, 'Sections from the class list');
  const parts = [
    report.added.length ? `Added ${plural(report.added.length, 'person', 'people')}.` : 'Nobody new to add.',
    report.moved.length ? `Moved ${report.moved.length} to the section given.` : '',
    report.sections.length ? `Made ${plural(report.sections.length, 'section')}: ${report.sections.join(', ')}.` : '',
    report.already.length ? `Skipped ${report.already.length} already on the list: ${report.already.slice(0, 5).join(', ')}${report.already.length > 5 ? '…' : ''}.` : '',
    report.too_long ? `Skipped ${report.too_long} too long to be a name (more than ${PEOPLE_LIMITS.name} characters).` : '',
    report.no_name ? `Skipped ${report.no_name} with no name.` : '',
    report.headed ? 'Left out the first line, which reads as headings.' : '',
    report.turned || report.columns?.some((column) => column.role === 'last') ? 'Names read first name, then last.' : ''
  ];
  return { said: parts.filter(Boolean).join(' ') };
}

// What a page's choices about a pasted list say to readClassLines: its columns as chosen for that shape of list, and the section for lines naming none.
const linesOptions = (body, ids) => ({ columns: body?.columns ?? null, shape: body?.shape ?? null, section: body?.section || '', ids });

/** Who a pasted list's lines would be, against the list as it is, changing nothing: the page shows it as it is typed. */
async function previewPeople(tools, match, body) {
  const { code, doc } = await known(tools, match);
  const empty = { html: '', ready: false, button: 'Add to the list' };
  if (!String(body?.list ?? '').trim()) return empty;
  const ids = entryWord(doc.course) !== 'Name';
  const [people, sections] = await Promise.all([tools.classes.people(code), tools.classes.sections(code)]);
  let read;
  try {
    read = readClassLines(body.list, sections, linesOptions(body, ids));
  } catch (error) {
    if (error.status !== 400) throw error;
    return { ...empty, html: `<p class="say bad">${esc(error.message)}</p>` };
  }
  const { html, fresh, moves } = previewView({ code, read, people, sections, ids });
  return { html, ready: fresh + moves > 0, button: previewButton(fresh, moves) };
}

async function changePerson(tools, match, body) {
  const { code } = await known(tools, match);
  const { classes } = tools;
  const change = {};
  if (body?.name !== undefined) {
    const name = cleanEntry(body.name).slice(0, PEOPLE_LIMITS.name);
    if (!name) throw refused('Type a name.');
    Object.assign(change, { name, listed: true });
  }
  if (body?.section !== undefined) {
    const section = body.section || null;
    if (section && !(await classes.sections(code)).some((item) => item.id === section)) throw refused('That section isn’t in this course anymore.', 404, 'section_not_found');
    change.section = section;
  }
  // Extra time, a teacher's accommodation: no timer in a step moves them on.
  if (body?.extra_time !== undefined) change.extra_time = body.extra_time === true;
  await classes.change(code, match[2], change);
  if (change.extra_time !== undefined && Object.keys(change).length === 1) return { said: change.extra_time ? 'Saved. A step set to open on its own now waits for them to say they’re ready.' : 'Saved. Steps open for them on their timers, as for everyone.' };
  return { said: change.section !== undefined ? 'Moved. What opens for them follows it from now on. Their work stays as it is.' : 'Saved. Their work and code stay as they were.' };
}

async function setHow({ library }, match, body) {
  const identify = ['code', 'ask', 'browser'].includes(body?.identify) ? body.identify : null;
  if (!identify) throw refused('Choose how learners sign in.');
  await changeCourse(library, match[1], body.version, (doc) => {
    doc.course.identify = identify;
    doc.course.identify_ask = identify === 'ask' && body.identify_ask === 'student_id' ? 'student_id' : identify === 'ask' ? 'name' : null;
    doc.course.identify_match = identify === 'ask' && body.identify_match === 'roster' ? 'roster' : 'any';
  }, 'How learners sign in');
  return { said: identify === 'browser' ? 'Saved. From their next visit, each browser is one learner.' : 'Saved. Learners are asked this way from their next visit, and anyone it doesn’t let in is signed out.' };
}

async function newSection(tools, match, body) {
  const { code, doc } = await known(tools, match);
  const { section } = await tools.classes.addSection(code, { name: body?.name });
  // The first section needs a way in: a link of its own is what most classes want.
  if ((doc.course.sections_from || 'none') === 'none') await changeCourse(tools.library, code, null, (draft) => { draft.course.sections_from = 'link'; }, 'Sections by their links');
  return { said: `Added ${section.name}. Its link is here and on Share.` };
}

async function dropSection(tools, match) {
  const { code, doc } = await known(tools, match);
  const left = await tools.classes.removeSection(code, match[2]);
  // What it set on activities goes with it, and with no sections left, nobody is asked for one.
  const noted = (doc.course.activities || []).some((activity) => activity.teaching?.sections?.[match[2]]);
  if (noted || !left.length) {
    await changeCourse(tools.library, code, null, (draft) => {
      for (const activity of draft.course.activities || []) if (activity.teaching?.sections?.[match[2]]) delete activity.teaching.sections[match[2]];
      if (!left.length) draft.course.sections_from = 'none';
    }, 'Removed a section');
  }
  return { said: 'Removed.' };
}

async function openFor(tools, match, body) {
  const { code, doc } = await known(tools, match);
  const section = (await tools.classes.sections(code)).find((item) => item.id === body?.section);
  if (!section) throw refused('That section isn’t in this course anymore.', 404, 'section_not_found');
  const list = doc.course.activities || [];
  const activity = list[activityKeys(list).indexOf(match[2])];
  if (!activity) throw refused('That activity isn’t in this course anymore.', 404, 'activity_not_found');
  const release = body.release === 'open' || body.release === 'hidden' ? body.release : null;
  // Open from now, until the activity's own close while that is ahead.
  await tools.classes.setRelease(code, match[2], section.id, release, activity.closes_at && Date.parse(activity.closes_at) > Date.now() ? activity.closes_at : null);
  return { said: release === 'open' ? `Open for ${section.name} now.` : release === 'hidden' ? `Hidden from ${section.name} now.` : `${section.name} follows the course again.` };
}

async function classListCsv({ library, classes, origin, addresses }, match) {
  const { doc, code } = await courseAt(library, match[1]);
  const [people, sections] = await Promise.all([classes.people(code), classes.sections(code)]);
  const { base } = reachOf(origin, addresses);
  const rows = [[entryWord(doc.course), 'Section', 'Personal code', 'Personal link', 'On the list', 'Last seen'], ...people.map((person) => [person.name || '', sections.find((section) => section.id === person.section)?.name || '', showCode(person.code), `${base}/course/${code}?join=${person.code}`, person.listed ? 'yes' : 'no', person.last_seen_at || ''])];
  // The mark at the start tells a spreadsheet it is UTF-8, so a name's accents survive.
  return new Response(`﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="class-list-${code}.csv"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

export const peoplePages = [
  {
    id: 'course-people', title: 'People', section: 'courses', nav: false, courseTab: 'People', tabPath: '/people',
    match: /^courses\/([\w-]+)\/people$/,
    render: withForms(peopleBody),
    api: [
      ['POST', /^courses\/([\w-]+)\/people$/, addPeople],
      ['POST', /^courses\/([\w-]+)\/people\/preview$/, previewPeople],
      ['GET', /^courses\/([\w-]+)\/people\.csv$/, classListCsv],
      ['PUT', /^courses\/([\w-]+)\/people\/how$/, setHow],
      ['PUT', /^courses\/([\w-]+)\/people\/sections-from$/, async ({ library }, match, body) => {
        if (!['link', 'choose', 'roster'].includes(body?.sections_from)) throw refused('Choose where a learner’s section comes from.');
        await changeCourse(library, match[1], body.version, (doc) => { doc.course.sections_from = body.sections_from; }, 'Where sections come from');
        return { said: 'Saved.' };
      }],
      ['PUT', /^courses\/([\w-]+)\/people\/(lrn_[\w-]+)$/, changePerson],
      ['PUT', /^courses\/([\w-]+)\/people\/(lrn_[\w-]+)\/more-time$/, moreTime],
      ['POST', /^courses\/([\w-]+)\/people\/(lrn_[\w-]+)\/new-code$/, async (tools, match) => { const { code } = await known(tools, match); await tools.classes.newCode(code, match[2]); return {}; }],
      ['POST', /^courses\/([\w-]+)\/people\/(lrn_[\w-]+)\/remove$/, async (tools, match) => { const { code } = await known(tools, match); await tools.classes.takeOff(code, match[2]); return { go: `/console/courses/${code}/people` }; }],
      ['POST', /^courses\/([\w-]+)\/people\/(lrn_[\w-]+)\/forget$/, async (tools, match) => {
        const { code } = await known(tools, match);
        if (!(await tools.classes.people(code)).some((person) => person.id === match[2])) throw refused('That learner isn’t in this course anymore.', 404, 'learner_not_found');
        await tools.classes.forget(code, match[2]);
        return { go: `/console/courses/${code}/people` };
      }],
      ['POST', /^courses\/([\w-]+)\/sections$/, newSection],
      ['PUT', /^courses\/([\w-]+)\/sections\/(sec_[\w-]+)$/, async (tools, match, body) => { const { code } = await known(tools, match); await tools.classes.changeSection(code, match[2], { name: body?.name, key: body?.key }); return { said: 'Saved.' }; }],
      ['DELETE', /^courses\/([\w-]+)\/sections\/(sec_[\w-]+)$/, dropSection],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/for-section$/, openFor]
    ]
  },
  { id: 'course-cards', title: 'Cards', section: 'courses', nav: false, match: /^courses\/([\w-]+)\/people\/cards$/, render: withForms(cardsBody), api: [] },
  { id: 'course-person', title: 'A learner', section: 'courses', nav: false, match: /^courses\/([\w-]+)\/people\/(lrn_[\w-]+)$/, render: withForms(personBody), api: [] }
];
