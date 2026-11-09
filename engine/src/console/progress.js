/**
 * A course's Progress tab: who has done what, one learner's work, and what to look at in an activity, with
 * suggested changes a teacher can accept. Everything here is behind the token, and read only but for
 * accepting. It reads through plain loaders and hands values to functions that only draw, so another host
 * can use the same pages. No Node built-ins.
 */
import { suggestChanges, applySuggestion } from '../../../harness/src/suggest.js';
import hardMoments from '../../../harness/src/tasks/hardMoments.js';
import { suggestion, treeHtml } from '../../../harness/src/ui/parts.js';
import { TRACE_CSS, turnTree } from '../learner/watch.js';
import { VIEW_CSS, viewParts } from '../../../harness/src/view.js';
import { answersSoFar } from '../learner/logic.js';
import { activityKeys } from '../server/library.js';
import { showCode } from '../server/classList.js';
import { activityIn } from './activity.js';
import { DETECTORS_CSS, detectorRoutes, detectorsPart } from './detectors.js';
import { changeCourse, courseAt } from './course.js';
import { courseHead, esc, plural, say, sectionChips, when, withForms } from './forms.js';

const refused = (message, status = 400, code = 'invalid_progress') => Object.assign(new Error(message), { status, code });
const DONE_HOW = { submitted: 'handed in', answered: 'every question answered', completed: 'the page said so', self: 'they said they were done', opened: 'opened' };

const activitiesIn = (doc) => { const list = doc.course.activities || []; const keys = activityKeys(list); return list.map((activity, i) => ({ ...activity, key: keys[i] })); };
// Learners' codes, sections' IDs and moments as a teacher knows them, in text the Harness wrote: this page is behind the token, and the words it joins are all escaped.
const withNames = (html, people, sections) => {
  let named = html.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z\b/g, (iso) => when(iso));
  for (const person of people) if (person.name) named = named.replaceAll(person.code, () => esc(person.name));
  for (const section of sections) named = named.replaceAll(section.id, () => esc(section.name));
  return named;
};
const subNav = (code, here) => `<nav class="sub" aria-label="In Progress"><a href="/console/courses/${esc(code)}/progress"${here === 'grid' ? ' aria-current="page"' : ''}>Who has done what</a><a href="/console/courses/${esc(code)}/progress/look"${here === 'look' ? ' aria-current="page"' : ''}>What to look at</a></nav>`;

// --- Who has done what ---------------------------------------------------------------------------------

const MARK = {
  done: ['✓', 'Done'],
  started: ['•', 'Started'],
  none: ['·', 'Not started']
};
const stateOf = (cell) => (cell?.done_at ? 'done' : cell?.opened_at ? 'started' : 'none');

function gridRow(person, { code, activities, cells, sections }) {
  const mine = cells[person.id] || {};
  const done = activities.filter((activity) => mine[activity.key]?.done_at).length;
  const section = sections.find((item) => item.id === person.section)?.name;
  const who = person.name || showCode(person.code);
  return `<tr>
<th scope="row" class="who"><a href="/console/courses/${esc(code)}/progress/${esc(person.id)}">${esc(who)}</a>
<small>${[section ? esc(section) : '', `${done} of ${activities.length} done`, person.last_seen_at ? `seen ${when(person.last_seen_at)}` : 'not signed in yet'].filter(Boolean).join(' · ')}</small></th>
${activities.map((activity) => { const state = stateOf(mine[activity.key]); const at = mine[activity.key]?.done_at || mine[activity.key]?.last_at; return `<td><span class="m ${state}" aria-hidden="true">${MARK[state][0]}</span><span class="sr">${esc(activity.title)}: ${MARK[state][1]}</span>${at ? `<small class="at">${when(at)}</small>` : ''}</td>`; }).join('')}
</tr>`;
}

function progressView({ code, title, origin, addresses, tabs, closed, activities, people, cells, sections, filter, locked, asTable }) {
  const shown = people.filter((person) => (!filter ? true : filter === 'none' ? !person.section : person.section === filter));
  const doneOf = (activity) => shown.filter((person) => cells[person.id]?.[activity.key]?.done_at).length;
  return `${courseHead({ title, code, origin, addresses, tabs, current: 'Progress', closed })}
${locked ? '<p class="notice">This server has no store, so it keeps nothing to show here. Start it with a data folder (<code>viable-engine start</code>), or deploy it with a store.</p>' : ''}
${subNav(code, 'grid')}
<section class="block" aria-labelledby="grid-title">
<h2 id="grid-title" class="sr">Who has done what</h2>
${people.length && activities.length ? `${sectionChips(sections, filter, `/console/courses/${code}/progress`)}
${shown.length ? `<div class="grid-wrap" tabindex="0" role="region" aria-labelledby="grid-title"><table class="grid">
<thead><tr><th scope="col" class="who">${plural(shown.length, 'learner')}</th>${activities.map((activity, i) => `<th scope="col" class="col"><span class="long" data-tip="${esc(activity.title)}">${esc(activity.title)}</span><span class="short" aria-hidden="true">${i + 1}</span><small>${doneOf(activity)}/${shown.length}<span class="word"> done</span></small></th>`).join('')}</tr></thead>
<tbody>${shown.map((person) => gridRow(person, { code, activities, cells, sections })).join('')}</tbody>
</table></div>
<ol class="legend-activities" aria-label="The activities, by number">${activities.map((activity) => `<li>${esc(activity.title)}</li>`).join('')}</ol>
<p class="legend"><span class="m done" aria-hidden="true">${MARK.done[0]}</span> done <span class="m started" aria-hidden="true">${MARK.started[0]}</span> started <span class="m none" aria-hidden="true">${MARK.none[0]}</span> not started</p>` : '<p class="v-empty">Nobody in this section yet.</p>'}` : `<p class="v-empty">${people.length ? 'No activities yet. Add one on Activities to follow who has done what.' : `Nobody here yet. <a href="/console/courses/${esc(code)}/people">Add your class list</a>, or share the course’s link.`}</p>`}
</section>
<section class="block" aria-labelledby="take-title">
<h2 id="take-title">To take with you</h2>
${asTable ? `<p class="v-note">A row for each learner: their name, section and what they’ve done. It has their names, so keep it private.</p>
<div class="actions take"><a class="v-btn is-small" href="/console/api/courses/${esc(code)}/progress.csv">Download progress (CSV)</a></div>` : `<p class="v-note">The records name each learner by their personal code, never by name. The class list is the only file that joins names and codes, so keep the two apart. A code opens that learner’s work, so keep both private.</p>
<div class="actions take"><a class="v-btn is-small" href="/console/api/courses/${esc(code)}/records.json">Download the records (JSON)</a><a class="v-btn is-small" href="/console/api/courses/${esc(code)}/people.csv">Download the class list (CSV)</a></div>`}
</section>`;
}

const GRID_CSS = `.sub{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:16px;font-size:.9375rem}
.sub a{color:var(--muted);text-decoration:none}
.sub a:hover{color:var(--public-ink)}
.sub a[aria-current=page]{color:var(--public-ink);font-weight:600;text-decoration:underline 2px var(--ink-blue);text-underline-offset:.35em}
.grid-wrap{margin-top:12px;overflow-x:auto}
.grid{width:100%;border-collapse:separate;border-spacing:0;font-size:.9375rem}
.grid th,.grid td{padding:8px 10px;border-bottom:1px solid var(--public-rule);text-align:center;vertical-align:middle}
.grid thead th{color:var(--muted);font-size:.8125rem;font-weight:600;vertical-align:bottom}
.grid .who{position:sticky;left:0;z-index:1;min-width:190px;max-width:260px;background:var(--public-page);color:var(--public-ink);font-weight:400;text-align:left}
.grid .who a{font-weight:600;text-decoration:none}
.grid .who a:hover{text-decoration:underline}
.grid .who small{display:block;color:var(--muted);font-size:.8125rem;line-height:1.4}
.col{min-width:84px;max-width:130px}
.col .long{display:-webkit-box;overflow:hidden;color:var(--public-text);-webkit-line-clamp:2;-webkit-box-orient:vertical}
.col .short{display:none}
.col small{display:block;font-weight:400}
.m{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:7px;font-weight:700;line-height:1}
.m.done{background:var(--pass-soft);color:var(--pass-green)}
.m.started{background:var(--field-mist);color:var(--ink-blue)}
.m.none{color:var(--muted)}
.at{display:none}
.legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:10px 0 0;color:var(--muted);font-size:.875rem}
.legend-activities{display:none;margin:10px 0 0;padding-left:1.4em;color:var(--muted);font-size:.875rem}
.take{margin-top:12px}
@media (max-width:640px){.grid th,.grid td{padding:8px 6px}.grid .who{min-width:0;width:44vw;max-width:44vw;overflow-wrap:anywhere;box-shadow:1px 0 0 var(--public-rule)}.col{min-width:34px}.col .long{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.col .short{display:block;color:var(--public-ink)}.col small{font-size:.6875rem}.col .word{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.legend-activities{display:block}}`;

// --- One learner's work --------------------------------------------------------------------------------

// An answer as the learner gave it: a choice's words, an order, the blanks, or what they wrote.
function answerWords(item, response) {
  if (response == null || response === '') return '';
  const choice = (id) => item?.choices?.find((entry) => entry.id === id)?.text ?? String(id);
  let value = response;
  if (/^\s*\[/.test(response)) { try { value = JSON.parse(response); } catch { value = response; } }
  if (Array.isArray(value)) return value.map((entry) => (item?.choices ? choice(entry) : String(entry))).join(item?.type === 'order' ? ' → ' : ' · ');
  return item?.type === 'single' ? choice(value) : String(value);
}

function panelWork(panel, work, sets) {
  const title = panel.title ? `<h3>${esc(panel.title)}</h3>` : '';
  if (panel.type === 'writing') {
    const draft = work.drafts[panel.id];
    if (!draft) return `${title}<p class="v-note">Nothing written yet.</p>`;
    return `${title}<p class="v-note">${draft.submitted_at ? `Handed in ${when(draft.submitted_at)}` : `Not handed in, last saved ${when(draft.updated_at)}`} · ${plural(draft.words || 0, 'word')}</p>
${draft.plan ? `<h4>Plan</h4><div class="text">${esc(draft.plan)}</div>` : ''}${draft.draft ? `<h4>Draft</h4><div class="text">${esc(draft.draft)}</div>` : ''}`;
  }
  if (panel.type === 'questions') {
    const items = sets.find((set) => set.ref === panel.set_ref)?.items || [];
    const by = answersSoFar(work.answers[panel.id] || []);
    return `${title}<ol class="answers">${items.map((item) => {
      const mine = by[item.id];
      return `<li><p class="prompt">${esc(item.prompt)}</p>${mine ? `<p class="answer"><span>${esc(answerWords(item, mine.response)) || '—'}</span>${mine.correct === true ? ' <span class="v-mark pass">Right</span>' : mine.correct === false ? ' <span class="v-mark fail">Not right</span>' : ''} <small>${plural(mine.tries, 'try', 'tries')}</small></p>` : '<p class="v-note">Not answered.</p>'}</li>`;
    }).join('')}</ol>`;
  }
  if (panel.type === 'reading') {
    const notes = (work.notes[panel.id] || []).filter((note) => !note.deleted_at);
    if (!notes.length) return `${title}<p class="v-note">No highlights yet.</p>`;
    return `${title}<ul class="highlights">${notes.map((note) => `<li><blockquote>${esc(note.target?.selector?.find((entry) => entry.type === 'TextQuoteSelector')?.exact || '')}</blockquote>${note.note ? `<p>${esc(note.note)}</p>` : ''}${note.page ? `<small>Page ${esc(note.page)}</small>` : ''}</li>`).join('')}</ul>`;
  }
  return '';
}

// What the AI did behind a reply: what the Harness read, each draft and the reviewer's word, loaded when it is opened.
const behind = (code, turn) => (turn.run_id ? `<details class="behind" id="did-${esc(turn.run_id)}" data-load="courses/${esc(code)}/runs/${esc(turn.run_id)}/record"><summary>What the AI did</summary><div data-loaded><p class="v-note">Loading…</p></div></details>` : '');
function conversations(turns, who, code = null) {
  if (!turns.length) return '';
  const byConversation = new Map();
  for (const turn of turns) byConversation.set(turn.conversation_id, [...(byConversation.get(turn.conversation_id) || []), turn]);
  return `<h3>With the AI</h3>${[...byConversation.values()].map((list, i) => `<details class="talk" id="talk-${esc(list[0].run_id)}" open><summary>${byConversation.size > 1 ? `Conversation ${i + 1}, ` : ''}${plural(list.length, 'message')}, from ${when(list[0].started_at)}</summary>
${list.map((turn) => `<div class="turn">${turn.first || turn.signals?.source === 'ai_first' ? '<p class="by">The AI wrote first, unasked</p>' : `<p class="by">${esc(who)}</p><div class="text">${esc(turn.message)}</div>`}<p class="by">The AI${turn.rating === -1 ? ' · <span class="v-mark fail">They said this didn’t help</span>' : turn.rating === 1 ? ' · <span class="v-mark pass">They said this helped</span>' : ''}</p><div class="text">${esc(turn.reply)}</div>${code ? behind(code, turn) : ''}</div>`).join('')}
</details>`).join('')}`;
}

function learnerView({ code, courseTitle, person, section, activities, sets, work, cut, shown, records = false }) {
  const who = person.name || showCode(person.code);
  const touched = activities.filter((activity) => work.progress[activity.key] || work.turns[activity.key]?.length);
  const untouched = activities.filter((activity) => !touched.includes(activity));
  return `<nav class="crumbs" aria-label="Where you are"><a href="/console/courses">Courses</a> / <a href="/console/courses/${esc(code)}">${esc(courseTitle)}</a> / <a href="/console/courses/${esc(code)}/progress">Progress</a></nav>
<h1>${esc(who)}</h1>
<p class="v-note facts">${[person.name ? `Personal code ${esc(showCode(person.code))}` : '', section ? esc(section) : '', person.last_seen_at ? `Last seen ${when(person.last_seen_at)}` : 'Not signed in yet'].filter(Boolean).join(' · ')} · <a href="/console/courses/${esc(code)}/people/${esc(person.id)}">Change on People</a></p>
${cut ? `<p class="notice">This shows their latest ${shown} messages with the AI.</p>` : ''}
${touched.length ? touched.map((activity) => {
    const row = work.progress[activity.key];
    const state = row?.done_at ? `Done ${when(row.done_at)}${DONE_HOW[row.done_how] ? ` (${DONE_HOW[row.done_how]})` : ''}` : row?.opened_at ? `Started ${when(row.opened_at)}, last worked ${when(row.last_at)}` : '';
    return `<section class="block work" aria-labelledby="w-${esc(activity.key)}" id="activity-${esc(activity.key)}"><h2 id="w-${esc(activity.key)}">${esc(activity.title)}</h2>${state ? `<p class="v-note">${state}</p>` : ''}
${(activity.workspace?.panels || []).map((panel) => panelWork(panel, { drafts: work.drafts[activity.key] || {}, answers: work.answers[activity.key] || {}, notes: work.notes[activity.key] || {} }, sets)).join('')}
${conversations(work.turns[activity.key] || [], who, records ? code : null)}</section>`;
  }).join('') : '<p class="v-empty block">Nothing here yet.</p>'}
${touched.length && untouched.length ? `<p class="v-note block">Not started: ${esc(untouched.map((activity) => activity.title).join(', '))}.</p>` : ''}`;
}

const WORK_CSS = `.facts{margin:8px 0 0}
.work{display:grid;gap:10px}
.work h3{margin-top:10px;font-size:1rem;font-weight:600;letter-spacing:0}
.work h4{margin-top:4px;color:var(--muted);font-size:.8125rem;font-weight:600}
.text{padding:10px 12px;border-radius:var(--radius-sm);background:var(--field-mist);color:var(--public-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.answers{display:grid;gap:12px;margin:0;padding-left:1.4em}
.prompt{margin:0;color:var(--public-ink)}
.answer{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:2px 0 0}
.answer small{color:var(--muted)}
.highlights{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.highlights blockquote{margin:0;padding-left:12px;border-left:2px solid var(--public-rule-strong);color:var(--public-ink)}
.highlights p{margin:4px 0 0}
.highlights small{color:var(--muted)}
.talk summary{color:var(--ink-blue);font-size:.9375rem;cursor:pointer}
.turn{display:grid;gap:4px;margin-top:12px}
.by{margin:0;color:var(--muted);font-size:.8125rem;font-weight:600}
.by .v-mark{font-size:.8125rem}
.turn .text+.by{margin-top:4px}`;

// --- What to look at ---------------------------------------------------------------------------------

function momentsPart({ moments, unhelpful, code, people }) {
  const nameOf = (learnerCode) => { const person = people.find((item) => item.code === learnerCode); return { who: person?.name || showCode(learnerCode), id: person?.id }; };
  const link = ({ who, id }) => (id ? `<a href="/console/courses/${esc(code)}/progress/${esc(id)}">${esc(who)}</a>` : esc(who));
  if (!moments.length && !unhelpful.length) return '<p class="v-note">Nothing yet. This shows anyone trying again and again without getting there, and replies rated as no help.</p>';
  return `<ul class="moments">
${moments.map((moment) => `<li><strong>${link(nameOf(moment.learner))}</strong>${moment.skills.length ? `<p>Many tries on ${esc(moment.skills.join(', '))} without getting there.</p>` : ''}${moment.turns.length ? `<p>Has tried again and again in a conversation, so the AI was asked to tell them their teacher can help.</p>${moment.turns.slice(-1).map((turn) => (turn.message ? `<blockquote>${esc(turn.message)}</blockquote>` : '')).join('')}` : ''}</li>`).join('')}
${unhelpful.map(({ learner, turn }) => `<li><strong>${link(nameOf(learner))}</strong><p>Said a reply didn’t help.</p><blockquote>${esc(turn.reply)}</blockquote></li>`).join('')}
</ul>`;
}

function suggestionCard(item, { settings, code, activityKey, version, named }) {
  return `<div class="change-card" id="s-${esc(String(item.id).replace(/[^A-Za-z0-9_-]/g, '-'))}" data-say-box>${named(treeHtml(suggestion(item, { settings })))}
${item.patch ? `<div class="actions accept"><button class="v-btn is-primary" type="button" data-api="POST courses/${esc(code)}/activities/${esc(activityKey)}/suggestions/accept" data-body='${esc(JSON.stringify({ id: item.id, version }))}' data-said="Accepted. Learners get it on their next message.">Accept this change</button><a class="v-btn" href="/console/courses/${esc(code)}/activities/${esc(activityKey)}">Edit first</a></div>${say()}` : ''}
</div>`;
}

// How long the checks made learners wait, with where to change it: care against waiting is theirs to weigh.
function waitLine(runs, agentSlug) {
  const checked = runs.map((run) => (run?.steps || []).filter((step) => step.nodeType === 'vetting')).filter((steps) => steps.length);
  if (!checked.length) return '';
  const middle = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const seconds = Math.round(middle(checked.map((steps) => steps.reduce((sum, step) => sum + (step.durationMs || 0), 0))) / 1000);
  const tries = checked.map((steps) => steps.reduce((sum, step) => sum + (step.output?.attempts || 0), 0));
  const average = tries.reduce((sum, value) => sum + value, 0) / tries.length;
  // A host whose records don't say how long a check took has nothing to report.
  if (!seconds && !average) return '';
  return `<p class="v-note">Checking took about ${seconds} s a reply, at ${average.toFixed(1)} tries a reply, with nothing on the page meanwhile. Too long? ${agentSlug ? `<a href="/console/agents/${esc(agentSlug)}">Allow fewer tries</a>, or choose` : 'Choose'} a faster reviewer in <a href="/console/models">Models</a>. More care is the other way.</p>`;
}

function lookView({ code, title, origin, addresses, tabs, closed, activities, activity, version, parts, moments, unhelpful, accepted, people, sections, detectors = '' }) {
  const chips = `<nav aria-label="Choose an activity"><ul class="chips">${activities.map((item) => `<li><a class="chip" href="/console/courses/${esc(code)}/progress/look?activity=${esc(item.key)}"${item.key === activity?.key ? ' aria-current="true"' : ''}>${esc(item.title)}</a></li>`).join('')}</ul></nav>`;
  const head = `${courseHead({ title, code, origin, addresses, tabs, current: 'Progress', closed })}${subNav(code, 'look')}`;
  if (!activity) return `${head}<p class="v-empty block">No activity here has an AI yet, so there is nothing to look at.</p>`;
  const named = (html) => withNames(html, people, sections);
  const body = `<section class="block" aria-labelledby="replies-title">
<h2 id="replies-title">How replies went</h2>
${parts.opening ? `<p class="opening">${parts.opening}</p>` : ''}
${parts.runs ? `${parts.tally}${parts.waited}<div class="flow">${named(parts.vetting)}</div>` : '<p class="v-note">Nothing yet. This fills in as learners talk with the AI.</p>'}
</section>
<section class="block" aria-labelledby="hard-title">
<h2 id="hard-title">Hard moments</h2>
${momentsPart({ moments, unhelpful, code, people })}
${parts.heard ? `<h3 class="sub-head">Misconceptions heard</h3><div class="flow">${named(parts.misconceptions)}</div>` : ''}
</section>
${detectors}
${parts.settings?.watch_for ? `<section class="block" aria-labelledby="watch-title">
<h2 id="watch-title">What you wanted to hear about</h2>
<p class="watch">${esc(parts.settings.watch_for)}</p>
<p class="v-note">For you only: it is never sent to the AI. Read for it in each learner’s conversations. Nothing here picks it out for you.</p>
</section>` : ''}
<section class="block" id="suggestions" aria-labelledby="changes-title">
<h2 id="changes-title">Suggested changes</h2>
${parts.changes.length ? parts.changes.map((item) => suggestionCard(item, { settings: parts.settings, code, activityKey: activity.key, version, named })).join('') : '<p class="v-note">None right now. A suggestion shows here with what to change, why and the evidence for it, once there is enough of it.</p>'}
${accepted.length ? `<h3 class="sub-head">Done</h3><ul class="done-list">${[...accepted].reverse().map((item) => `<li><span class="v-mark pass">Accepted</span> ${named(esc(item.change))} <small>${when(item.at)}</small></li>`).join('')}</ul><p class="v-note">A change you accepted comes back only if what learners do after it calls for it again.</p>` : ''}
</section>`;
  return `${head}${chips}${body}`;
}

const LOOK_CSS = `.opening{margin:12px 0 0;color:var(--public-ink);font-size:1.0625rem}
.flow>*+*{margin-top:16px}
.flow{margin-top:16px}
.flow h3,.sub-head{margin-top:22px;font-size:1rem;font-weight:600;letter-spacing:0}
.tally{margin:14px 0 0}
.moments{display:grid;gap:14px;margin:12px 0 0;padding:0;list-style:none}
.moments p{margin:2px 0 0}
.moments blockquote{margin:6px 0 0;padding-left:12px;border-left:2px solid var(--public-rule-strong);color:var(--public-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.watch{margin:12px 0 8px;color:var(--public-ink)}
.change-card{margin-top:14px}
.accept{margin-top:12px}
.done-list{display:grid;gap:8px;margin:10px 0 0;padding:0;list-style:none}
.done-list small{color:var(--muted)}
.done-list+.v-note{margin-top:8px;font-size:.875rem}
@media (max-width:760px){.suggestion{grid-template-columns:minmax(0,1fr)}.round-body{grid-template-columns:minmax(0,1fr)}}`;

// --- What it reads -------------------------------------------------------------------------------------

async function gridBody({ library, classes, records, origin, addresses, tabs, url }, match) {
  const { doc, meta, code } = await courseAt(library, match[1]);
  const [people, sections, cells] = await Promise.all([classes.people(code), classes.sections(code), records.cells(code)]);
  return { title: `Progress · ${doc.course.title}`, css: GRID_CSS, body: progressView({ code, title: doc.course.title, origin, addresses, tabs, closed: meta.status === 'closed', activities: activitiesIn(doc), people, cells, sections, filter: url.searchParams.get('section') || '', asTable: Boolean(records.csv), locked: !records.saving }) };
}

async function learnerBody({ library, classes, records }, match) {
  const { doc, code } = await courseAt(library, match[1]);
  const person = (await classes.people(code)).find((item) => item.id === match[2]);
  if (!person) throw refused('That learner isn’t in this course anymore.', 404, 'learner_not_found');
  const section = (await classes.sections(code)).find((item) => item.id === person.section)?.name || null;
  const { work, cut, shown } = await records.work(code, person.id);
  return { title: `${person.name || showCode(person.code)} · ${doc.course.title}`, css: `${WORK_CSS}\n${TRACE_CSS}\n.behind{margin:6px 0 4px}.behind>summary{color:var(--ink-blue);font-size:.875rem}.behind[open]>summary{margin-bottom:8px}`, body: learnerView({ records: Boolean(records?.turn),  code, courseTitle: doc.course.title, person, section, activities: activitiesIn(doc), sets: doc.question_sets || [], work, cut, shown }) };
}

// An activity's evidence, and what it suggests. What was accepted comes back only on what learners did since.
async function evidenceOf({ classes, records }, code, activity) {
  const accepted = await classes.accepted(code, activity.key);
  const { records: held, runs } = await records.of(code, { activity: activity.key });
  const teaching = activity.teaching ?? null;
  const done = new Set(accepted.map((item) => item.id));
  const since = accepted.at(-1)?.at;
  const again = since ? suggestChanges({ teaching, ...await records.of(code, { activity: activity.key, since }) }).filter((item) => done.has(item.id)) : [];
  return { accepted, records: held, runs, suggestions: [...suggestChanges({ teaching, runs, records: held }).filter((item) => !done.has(item.id)), ...again] };
}

async function lookBody({ library, classes, records, store, origin, addresses, tabs, url, simple }, match) {
  const { doc, meta, code } = await courseAt(library, match[1]);
  const activities = activitiesIn(doc).filter((activity) => activity.agent_ref);
  const activity = activities.find((item) => item.key === url.searchParams.get('activity')) || activities[0] || null;
  const common = { code, title: doc.course.title, origin, addresses, tabs, closed: meta.status === 'closed', activities, version: meta.version };
  if (!activity || !records.saving) return { title: `What to look at · ${doc.course.title}`, css: GRID_CSS, body: lookView({ ...common, activity: null }) };
  const [people, sections, evidence] = await Promise.all([classes.people(code), classes.sections(code), evidenceOf({ classes, records }, code, activity)]);
  const parts = viewParts({ teaching: activity.teaching ?? null, records: evidence.records, runs: evidence.runs, suggestions: evidence.suggestions });
  const unhelpful = evidence.records.flatMap((record) => record.turns.filter((turn) => turn.rating === -1).map((turn) => ({ learner: record.user, turn })));
  return { title: `What to look at · ${doc.course.title}`, css: `${GRID_CSS}\n${VIEW_CSS}\n${LOOK_CSS}\n${DETECTORS_CSS}`, body: lookView({ ...common, activity, detectors: store ? await detectorsPart({ store }, code, people) : '', parts: { ...parts, runs: evidence.runs.length, waited: waitLine(evidence.runs, simple ? null : doc.agents?.find((agent) => agent.ref === activity.agent_ref)?.slug),  heard: parts.heardList.length }, moments: hardMoments.build({ records: evidence.records }).moments, unhelpful, accepted: evidence.accepted, people, sections }) };
}

export const progressPages = [
  {
    id: 'course-progress', title: 'Progress', section: 'courses', nav: false, courseTab: 'Progress', tabPath: '/progress',
    match: /^courses\/([\w-]+)\/progress$/,
    render: withForms(gridBody),
    api: [
      ...detectorRoutes,
      // A host that keeps its own table of who has done what offers that instead of the records.
      // What the AI did behind one reply of the course's, as the preview's panel shows it, from what its run kept.
      ['GET', /^courses\/([\w-]+)\/runs\/(agtr_[\w-]{6,80})\/record$/, async ({ library, records }, match) => {
        const { code } = await courseAt(library, match[1]);
        const turn = records?.turn ? await records.turn(code, match[2]) : null;
        return { html: turn ? treeHtml(turnTree(turn.events)) : '<p class="v-note">This reply’s record isn’t kept.</p>' };
      }],
      ['GET', /^courses\/([\w-]+)\/progress\.csv$/, async ({ library, records }, match) => {
        const { code } = await courseAt(library, match[1]);
        if (!records.csv) throw refused('Download the records instead.', 404, 'not_found');
        const { filename, csv } = await records.csv(code);
        return new Response(csv, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      }],
      ['GET', /^courses\/([\w-]+)\/records\.json$/, async ({ library, records }, match) => {
        const { code } = await courseAt(library, match[1]);
        if (!records.saving) throw refused('This server has no store, so it keeps no records.', 409, 'no_store');
        return new Response(JSON.stringify({ object: 'course.records', course: code, ...await records.of(code) }), { status: 200, headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="records-${code}.json"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      }],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/suggestions\/accept$/, async ({ library, classes, records }, match, body) => {
        const { doc, code } = await courseAt(library, match[1]);
        if (!records.saving) throw refused('This server has no store, so nothing can be changed here.', 409, 'no_store');
        const activity = activitiesIn(doc).find((item) => item.key === match[2]);
        if (!activity) throw refused('That activity isn’t in this course anymore.', 404, 'activity_not_found');
        const { suggestions } = await evidenceOf({ classes, records }, code, activity);
        const found = suggestions.find((item) => item.id === body?.id);
        if (!found) throw refused('That suggestion isn’t here anymore. Look again.', 409, 'suggestion_gone');
        if (!found.patch) throw refused('This one changes no setting: read the evidence, then decide.', 400, 'nothing_to_apply');
        await changeCourse(library, code, body.version, (draft) => { const held = activityIn(draft, match[2]).activity; held.teaching = applySuggestion(held.teaching, found); }, 'Accepted a suggested change');
        await classes.keepAccepted(code, match[2], { id: found.id, change: found.change });
        return {};
      }]
    ]
  },
  { id: 'course-look', title: 'What to look at', section: 'courses', nav: false, match: /^courses\/([\w-]+)\/progress\/look$/, render: withForms(lookBody), api: [] },
  { id: 'course-work', title: 'A learner’s work', section: 'courses', nav: false, match: /^courses\/([\w-]+)\/progress\/(lrn_[\w-]+)$/, render: withForms(learnerBody), api: [] }
];
