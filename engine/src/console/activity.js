/**
 * An activity on the console: what learners do, how the AI helps, when it is open, and its question
 * sets. How the AI helps is the Harness's teaching settings; the page shows what the AI reads with every
 * message, and what it would be told at a moment the teacher types, from the same code a run uses. No
 * Node built-ins.
 */
import { teachingContext, teachingSettings } from '../../../harness/src/utils/teaching.js';
import { ITEM_TYPES, normalizeItems } from '../learner/questions.js';
import { forgetActivity, sectionsOf } from '../server/classList.js';
import { activityKeys } from '../server/library.js';
import { changeCourse, courseAt, kindOfActivity } from './course.js';
import { choose, esc, oneOf, say, text, toggle, withForms } from './forms.js';

// Large data, loaded when a page asks for it, so a server that never opens these starts small.
const misconceptions = () => import('../../../harness/src/utils/misconceptions.js');
const skills = () => import('../../../harness/src/utils/skills.js');
const refused = (message, status = 400, code = 'invalid_activity') => Object.assign(new Error(message), { status, code });
const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);
const FORM = 'activity';
const HELP = [
  { value: 'ask_first', label: 'Ask first', hint: 'It asks what they think or have tried, then builds on it.' },
  { value: 'hint', label: 'Hints only', hint: 'Hints and guiding questions, a step at a time, never the answer.' },
  { value: 'explain', label: 'Explain when stuck', hint: 'It explains and shows a worked example, then they try one.' },
  { value: 'check_only', label: 'Only check', hint: 'It says what is right and what to look at again in their own work.' },
  { value: '', label: 'Not set', hint: 'The agent’s own instructions decide.' }
];
const MOMENT_WORDS = { attempt: 'They gave an answer or some working', asks_answer: 'They want the answer', stuck: 'They don’t know how to go on', repeated: 'They have tried more than once', other: 'Nothing that calls for a teaching move' };
const KIND_WORDS = { chat: 'Talk with the AI', questions: 'Questions', writing: 'Writing', reading: 'Reading', embed: 'A web page' };
const TOOL_WORDS = { web: 'Web pages', knowledge: 'Its knowledge bases', memory: 'What it remembers of a learner', agents: 'Other agents' };
const QUESTION_TYPES = {
  single: { label: 'One right answer', hint: 'Choices, one per line. Put * before the right one.' },
  multiple: { label: 'Several right answers', hint: 'Choices, one per line. Put * before each right one.' },
  fill: { label: 'A word or number', hint: 'Accepted answers, one per line. Numbers and fractions compare as numbers.' },
  short: { label: 'A short answer', hint: 'Accepted answers, one per line. Leave empty for you to read instead.' },
  open: { label: 'A longer answer', hint: 'For you to read. Nothing is checked.' }
};

// --- Finding things in a document ----------------------------------------------------------------------

export function activityIn(doc, key) {
  const list = doc.course?.activities || [];
  const index = activityKeys(list).indexOf(key);
  if (index < 0) throw refused('That activity isn’t in this course anymore.', 404, 'activity_not_found');
  return { activity: list[index], index, list };
}
const withTeaching = (activity, change) => { activity.teaching = teachingSettings({ ...activity.teaching, ...change }); };
const agentsOf = (doc) => doc.agents || [];
// What an agent can reach, which is what a teacher can turn off for an activity.
function toolsOf(agent) {
  const found = new Set();
  for (const node of agent?.graph?.nodes || []) {
    const tools = node.config?.tools;
    if (!tools) continue;
    if (tools.fetch_url || tools.web) found.add('web');
    if (tools.knowledge_bases?.length || tools.knowledge_base_refs?.length) found.add('knowledge');
    if (tools.memory) found.add('memory');
    if (tools.agents?.length) found.add('agents');
  }
  return [...found];
}

// --- The page ------------------------------------------------------------------------------------------

function kindFields(activity, doc, code, locked) {
  const kind = kindOfActivity(activity);
  if (kind === 'several') {
    return `<p class="notice">This activity has ${activity.workspace.panels.length} panels${activity.workspace.steps?.length ? ` in ${activity.workspace.steps.length} steps` : ''} from its package. They stay as they are here. To change them, change the package on the Developer Platform and add it again.</p>`;
  }
  const panel = activity.workspace?.panels?.[0] || {};
  const sets = doc.question_sets || [];
  return `${oneOf('kind', 'What learners do', kind, Object.entries(KIND_WORDS).map(([value, label]) => ({ value, label }))).replaceAll('type="radio"', `type="radio" form="${FORM}"`)}
<div class="kind-fields" data-show-when="kind=questions" data-form="${FORM}">
${sets.length ? choose('panel.set_ref', 'Which questions', panel.set_ref || sets[0].ref, sets.map((set) => ({ value: set.ref, label: `${set.title} (${(set.items || []).length})` })), { form: FORM }) : '<p class="v-note">No questions yet: saving makes a set to fill in.</p>'}
${sets.length ? `<div class="actions">${sets.map((set) => `<a class="v-btn is-small" href="/console/courses/${esc(code)}/questions/${esc(set.ref)}">Edit ${esc(set.title)}</a>`).join('')}</div>` : ''}
${choose('panel.feedback', 'When they find out', panel.feedback || 'each', [{ value: 'each', label: 'After each answer' }, { value: 'end', label: 'Once all are answered' }, { value: 'none', label: 'Never: it’s a test' }], { form: FORM })}
${text('panel.tries', 'Tries per question', panel.tries ?? 3, { type: 'number', min: 0, max: 10, form: FORM, hint: '0 for as many as they like.' })}
${toggle('panel.hints', 'They can see the hints you write', panel.hints !== false).replace('type="checkbox"', `type="checkbox" form="${FORM}"`)}
</div>
<div class="kind-fields" data-show-when="kind=writing" data-form="${FORM}">
${text('panel.prompt', 'What to write', panel.prompt, { rows: 5, form: FORM })}
<div class="fields two">${text('panel.min_words', 'At least (words)', panel.min_words ?? '', { type: 'number', min: 1, form: FORM })}${text('panel.max_words', 'At most (words)', panel.max_words ?? '', { type: 'number', min: 1, form: FORM })}</div>
${text('panel.rubric_lines', 'What makes it good', (panel.rubric || []).map((row) => `${row.criterion}${row.description ? `: ${row.description}` : ''}`).join('\n'), { rows: 3, form: FORM, hint: 'One per line: a name, a colon, what it means. Learners see these, and so does the AI.' })}
${toggle('panel.lock_on_submit', 'Handed in once: they can’t change it afterwards', panel.lock_on_submit === true).replace('type="checkbox"', `type="checkbox" form="${FORM}"`)}
</div>
<div class="kind-fields" data-show-when="kind=reading" data-form="${FORM}" data-say-box>
${panel.file_ref ? `<p class="v-note">The reading: ${esc((doc.files || []).find((file) => file.ref === panel.file_ref)?.name || panel.file_ref)}</p>` : '<p class="v-note">No PDF yet.</p>'}
${locked ? '' : `<div class="v-form"><label class="v-label" for="reading-file">${panel.file_ref ? 'Replace it with a PDF' : 'Choose a PDF'}</label><input class="v-input" id="reading-file" type="file" accept=".pdf,application/pdf" data-upload="POST courses/${esc(code)}/activities/${esc(activity.key)}/reading"></div>`}${say()}
</div>
<div class="kind-fields" data-show-when="kind=embed" data-form="${FORM}">
${text('panel.url', 'Its address', panel.url, { type: 'url', form: FORM, placeholder: 'https://', hint: 'It has to allow being shown inside another page.' })}
</div>`;
}

function standardBlock(activity, api, locked) {
  const chosen = activity.teaching?.standard;
  const shown = chosen ? `<div class="chosen"><div><strong>${esc(chosen.code || (chosen.kind === 'skill' ? 'Skill' : 'Standard'))}${chosen.level?.name ? ` · ${esc(chosen.level.name)}` : ''}</strong><p>${esc(chosen.description)}</p></div>${locked ? '' : `<button class="v-btn is-small" type="button" data-api="DELETE ${api}/standard" aria-label="Remove the standard or skill">Remove</button>`}</div>` : '';
  return `<div class="part" id="standard" data-say-box>
<h3>Standard or skill <small>optional</small></h3>
${shown || `<p class="v-note">If you choose one, the AI gets its words, and what a learner at that level does, with each message.</p>
<form class="find" id="find-skill" data-search="${api}/find-skill" data-into="skills-found">
<label class="sr" for="skill-q">Search durable skills</label><input class="v-input" id="skill-q" name="q" type="search" placeholder="A durable skill, such as evidence or feedback" autocomplete="off">
<label class="sr" for="skill-level">Level learners work toward</label><select class="v-input" id="skill-level" name="level"><option value="1">Emerging</option><option value="2" selected>Developing</option><option value="3">Proficient</option><option value="4">Advanced</option></select>
<button class="v-btn is-small" type="submit">Find</button>
</form>
<div id="skills-found" class="found"></div>`}
${say()}
</div>`;
}

// Guidance comes with a package or from viable-harness component add. Here it is shown, as it goes into what the AI reads.
const guidanceBlock = (activity) => {
  const chosen = activity.teaching?.guidance || [];
  return chosen.length ? `<div class="part" id="guidance"><h3>Guidance from research <small>each turn takes at most two that fit the moment</small></h3>
<ul class="picked">${chosen.map((item) => `<li><p>${esc(item.text)}${item.source ? `<small>${esc(item.source)}</small>` : ''}</p></li>`).join('')}</ul></div>` : '';
};

function misconceptionsBlock(activity, api, locked) {
  const chosen = activity.teaching?.misconceptions || [];
  return `<div class="part" id="misconceptions" data-say-box>
<h3>Misconceptions to listen for <small>optional · for math · from Eedi’s graph</small></h3>
${chosen.length ? `<ul class="picked">${chosen.map((item) => `<li><p>${esc(item.description)}<small>${esc(item.construct?.description)}</small></p>${locked ? '' : `<button class="v-btn is-small" type="button" data-api="DELETE ${api}/misconceptions/${esc(item.id)}" aria-label="Remove “${esc(item.description)}”">Remove</button>`}</li>`).join('')}</ul>` : '<p class="v-note">The AI gets the one that fits what a learner just did, on the turn it fits.</p>'}
${locked || chosen.length >= 8 ? '' : `<form class="find" id="find-misconception" data-search="${api}/find-misconception" data-into="misconceptions-found">
<label class="sr" for="misconception-q">Search misconceptions by words</label><input class="v-input" id="misconception-q" name="q" type="search" placeholder="Words, such as adding fractions" autocomplete="off">
<button class="v-btn is-small" type="submit">Find</button>
</form>
<div id="misconceptions-found" class="found"></div>`}
${say()}
</div>`;
}

// A section's own help level and note for the AI. A note about one person would go to a model, so it says who to write about.
function sectionsBlock(activity, sections, code) {
  if (!sections.length) return '';
  const own = activity.teaching?.sections || {};
  const levels = [{ value: '', label: 'As the activity' }, ...HELP.filter((level) => level.value).map(({ value, label }) => ({ value, label }))];
  const differ = sections.filter((section) => own[section.id]);
  return `<details class="for-sections" id="for-sections"${differ.length ? ' open' : ''}><summary>Different for a section${differ.length ? `: ${esc(differ.map((section) => section.name).join(', '))}` : ''}</summary>
<small class="v-note">Write about the group, not one learner: notes go to the AI model.</small>
${sections.map((section) => `<div class="kind-fields"><div class="for-section"><strong>${esc(section.name)}</strong><a href="/course/${esc(code)}?try=1&amp;section=${esc(encodeURIComponent(section.key))}&amp;open=${esc(activity.key)}" target="_blank" rel="noopener">Try it as this group</a></div>
${choose(`teaching.sections.${section.id}.help`, 'How far it may go', own[section.id]?.help ?? '', levels, { form: FORM })}
${text(`teaching.sections.${section.id}.note`, 'A note the AI reads for this group', own[section.id]?.note, { rows: 2, maxlength: 500, form: FORM })}
</div>`).join('')}</details>`;
}

const readsBlock = (activity, api, sections) => {
  const taught = teachingContext(activity.teaching);
  const own = sections.filter((section) => activity.teaching?.sections?.[section.id]);
  return `<aside class="reads" aria-label="What the AI reads">
<h2>What the AI reads</h2>
<p class="v-note">With every message, after you save:</p>
<pre class="said">${esc(taught?.text || 'Nothing yet: set a goal or how far it may go.')}</pre>
${own.map((section) => `<details class="for-group"><summary>For ${esc(section.name)}</summary><pre class="said">${esc(teachingContext(activity.teaching, section.id)?.text || '')}</pre></details>`).join('')}
<h3>At one moment</h3>
<p class="v-note">Type what a learner might say to see what the AI would be told. No model is called.</p>
<form class="moment" id="try-moment" data-search="${api}/brief" data-into="moment-found">
<label class="sr" for="moment-q">What a learner might say</label><textarea class="v-input" id="moment-q" name="message" rows="2" placeholder="e.g. is 1/2 + 1/3 = 2/5?"></textarea>
<button class="v-btn is-small" type="submit">Show me</button>
</form>
<div id="moment-found"></div>
</aside>`;
};

async function activityBody({ library, store, settings, origin }, match) {
  const entry = await courseAt(library, match[1]);
  const { doc, meta, code } = entry;
  const found = activityIn(doc, match[2]);
  const activity = { ...found.activity, key: match[2] };
  const api = `courses/${esc(code)}/activities/${esc(activity.key)}`;
  const locked = !store;
  const units = doc.course.units || [];
  const agents = agentsOf(doc);
  const agent = agents.find((item) => item.ref === activity.agent_ref);
  const kind = kindOfActivity(activity);
  const tools = toolsOf(agent);
  const using = settings ? await settings.resolve() : null;
  const hears = Boolean(using?.roles.hearing);
  const reads = using?.roles.reply?.model ? using.reads(using.roles.reply.model) : {};
  const off = activity.teaching?.tools_off || [];
  const scheduled = activity.release === 'hidden' && activity.opens_at;
  const release = scheduled ? 'scheduled' : activity.release || 'open';
  const onForm = (markup) => markup.replaceAll('type="radio"', `type="radio" form="${FORM}"`).replaceAll('type="checkbox"', `type="checkbox" form="${FORM}"`);
  const sections = await sectionsOf(store, code);
  return {
    title: `${activity.title} · ${doc.course.title}`,
    body: `<nav class="crumbs" aria-label="Where you are"><a href="/console/courses">Courses</a> / <a href="/console/courses/${esc(code)}">${esc(doc.course.title)}</a></nav>
<h1>${esc(activity.title)}</h1>
<div class="share-line"><span class="v-pill">${esc({ open: 'Open', hidden: 'Hidden', scheduled: 'Scheduled' }[release])}</span><a class="v-btn is-small" href="/course/${esc(code)}/${esc(activity.key)}?try=1" target="_blank" rel="noopener">Try it</a></div>
<form id="${FORM}" data-api="PUT ${api}" data-guard data-say-in="save-bar"><input type="hidden" name="version" value="${meta.version}"></form>
<div class="two-sides">
<div class="edit">
<section class="block" aria-labelledby="doing-title">
<h2 id="doing-title">The activity</h2>
<div class="fields">
${text('title', 'Title', activity.title, { required: true, maxlength: 160, form: FORM })}
${text('summary', 'A line about it', activity.summary, { maxlength: 600, form: FORM, hint: 'On the course’s home.' })}
<div class="fields two">
${text('minutes', 'Minutes it takes', activity.minutes ?? '', { type: 'number', min: 1, max: 600, form: FORM })}
${units.length ? choose('unit_ref', 'Unit', activity.unit_ref ?? '', [{ value: '', label: 'None' }, ...units.map((unit) => ({ value: unit.ref, label: unit.title }))], { form: FORM }) : ''}
</div>
${kindFields(activity, doc, code, locked)}
</div>
</section>
<section class="block" aria-labelledby="help-title">
<h2 id="help-title">How the AI helps</h2>
<div class="fields">
${choose('agent_ref', 'Which AI', activity.agent_ref ?? '', [...(kind === 'chat' ? [] : [{ value: '', label: 'No AI in this activity' }]), ...agents.map((item) => ({ value: item.ref, label: item.name }))], { form: FORM })}
${agent ? `<small class="v-note"><a href="/console/agents/${esc(agent.slug || agent.ref)}">See or change ${esc(agent.name)}</a></small>` : ''}
${text('teaching.goal', 'Goal', activity.teaching?.goal, { rows: 2, maxlength: 1000, form: FORM, placeholder: 'e.g. Explain each step of a two-step word problem in their own words.', hint: 'What learners should be able to do by the end.' })}
${onForm(oneOf('teaching.help', 'How far it may go', activity.teaching?.help ?? '', HELP, { hint: 'An instruction to the AI, not a lock. To keep it out, choose no AI above.' }))}
${onForm(toggle('teaching.turn_brief', 'Give the AI only what each moment needs', activity.teaching?.turn_brief !== false, { hint: 'It reads what the learner just did, then gets your goal and limit, a teaching move, and only the parts of your settings this message calls for. Off, it gets all of them with every message.' }))}
${text('teaching.watch_for', 'What you want to hear about', activity.teaching?.watch_for, { rows: 2, maxlength: 500, form: FORM, hint: 'For you, in Progress. It is never sent to the AI.' })}
${sectionsBlock(activity, sections, code)}
${tools.length ? `<fieldset class="one-of"><legend class="v-label">What the AI may not use here</legend><div class="tools">${tools.map((name) => onForm(toggle('teaching.tools_off', TOOL_WORDS[name], off.includes(name), { value: name }))).join('')}</div></fieldset>` : ''}
${agent ? `<fieldset class="one-of"><legend class="v-label">How learners may talk to it</legend><div class="tools">
${onForm(toggle('voice_on', 'Speak to it', hears && activity.voice?.input !== false, { hint: hears ? 'A microphone beside the message box.' : 'Needs a model that hears learners, in Models.', disabled: !hears }))}
${onForm(toggle('images_on', 'Attach photos', Boolean(reads.images) && activity.attachments?.images !== false, { hint: reads.images ? 'Such as a photo of their working.' : 'Needs a reply model that reads images, in Models.', disabled: !reads.images }))}
${onForm(toggle('files_on', 'Attach PDFs', Boolean(reads.files) && activity.attachments?.files !== false, { hint: reads.files ? 'Up to 8 MB each.' : 'Needs a reply model that reads PDFs, in Models.', disabled: !reads.files }))}
</div></fieldset>` : ''}
</div>
${standardBlock(activity, api, locked)}
${misconceptionsBlock(activity, api, locked)}
${guidanceBlock(activity)}
</section>
<section class="block" aria-labelledby="open-title">
<h2 id="open-title">When it is open</h2>
<div class="fields">
${onForm(oneOf('release', 'For learners', release, [
    { value: 'hidden', label: 'Hidden', hint: 'Not on the course’s home, and its address says it isn’t open.' },
    { value: 'open', label: 'Open', hint: 'On the course’s home now.' },
    { value: 'scheduled', label: 'Opens at a time', hint: 'On the home with its time, until it opens.' }
  ]))}
<div data-show-when="release=scheduled" data-form="${FORM}">${text('opens_at', 'Opens', '', { type: 'datetime-local', form: FORM, 'data-iso': activity.opens_at || '' })}</div>
<div data-show-when="release=open|scheduled" data-form="${FORM}">${text('closes_at', 'Closes', '', { type: 'datetime-local', form: FORM, 'data-iso': activity.closes_at || '', hint: 'Empty to stay open.' })}</div>
${choose('done_when', 'It counts as done', activity.done_when || 'auto', [{ value: 'auto', label: 'When its work is finished, or they say so if nothing can tell' }, { value: 'self', label: 'When they say so' }, { value: 'opened', label: 'When they open it' }], { form: FORM })}
</div>
</section>
<div class="save-bar" id="save-bar"><button class="v-btn is-primary" type="submit" form="${FORM}"${locked ? ' disabled' : ''}>Save</button><span class="v-note">Learners get it on their next message.</span>${say()}</div>
<section class="block" aria-labelledby="more-title" data-say-box>
<h2 id="more-title">More</h2>
<div class="actions">
<button class="v-btn is-small" type="button" data-api="POST ${api}/copy" ${locked ? 'disabled' : ''}>Make a copy</button>
<button class="v-btn is-small danger" type="button" data-api="DELETE ${api}" data-confirm="Remove “${esc(activity.title)}” from the course? What learners did in it stays in their records, and an older version of the course still has it." data-yes="Remove" ${locked ? 'disabled' : ''}>Remove it</button>
</div>${say()}
</section>
</div>
${readsBlock(activity, api, sections)}
</div>`,
    css: ACTIVITY_CSS
  };
}

const ACTIVITY_CSS = `.two-sides{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,330px);gap:clamp(24px,4vw,48px);align-items:start}
.reads{position:sticky;top:20px;display:grid;gap:10px;margin-top:clamp(28px,4vw,44px);padding:18px;border-radius:var(--radius);background:var(--field-mist)}
.reads h2{font-size:1.0625rem;font-weight:600;letter-spacing:0}
.reads h3{margin-top:8px;font-size:.9375rem;font-weight:600;letter-spacing:0}
.said{margin:0;padding:10px 12px;max-height:46vh;overflow:auto;border-radius:var(--radius-sm);background:var(--surface);color:var(--public-text);font:400 .84rem/1.5 var(--font-public);white-space:pre-wrap;overflow-wrap:anywhere}
.moment{display:grid;gap:8px;justify-items:start}
.moment textarea{min-height:0}
.moment-read{margin:8px 0 6px;color:var(--public-ink);font-size:.9375rem;font-weight:600}
.part{display:grid;gap:10px;margin-top:22px}
.part h3{font-size:.875rem;font-weight:600;letter-spacing:0;color:var(--public-ink)}
.part h3 small{color:var(--muted);font-weight:400}
.find{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.find input{flex:1 1 240px;min-height:38px;padding:6px 12px}
.find select{flex:0 0 auto;width:auto;min-height:38px;padding:6px 12px}
.found ul{display:grid;gap:6px;margin:0;padding:0;list-style:none}
.found li>button,.found .pick{display:grid;gap:2px;width:100%;padding:10px 12px;border:1px solid var(--public-rule);border-radius:var(--radius-sm);background:var(--surface);color:var(--public-text);font:inherit;text-align:left;cursor:pointer}
.found li>button:hover,.found .pick:hover{border-color:var(--ink-blue)}
.found strong{color:var(--public-ink);font-weight:600}
.found h4{margin:10px 0 4px;color:var(--muted);font-size:.8125rem;font-weight:400;letter-spacing:0}
.chosen{display:flex;gap:12px;justify-content:space-between;align-items:start;padding:12px 14px;border-radius:var(--radius-sm);background:var(--field-sage)}
.chosen p{margin:2px 0 0;font-size:.9375rem;line-height:1.45}
.picked{display:grid;gap:6px;margin:0;padding:0;list-style:none}
.picked li{display:flex;gap:12px;justify-content:space-between;align-items:start;padding:10px 12px;border-radius:var(--radius-sm);background:var(--field-mist)}
.picked p{margin:0;font-size:.9375rem;line-height:1.45}
.picked small{display:block;color:var(--muted);font-size:.8125rem}
.tools{display:grid;gap:10px}
.kind-fields{display:grid;gap:14px;padding:14px 16px;border-left:2px solid var(--public-rule)}
.kind-fields[hidden]{display:none}
.for-sections{display:grid;gap:10px}
.for-sections summary{color:var(--ink-blue);font-size:.9375rem;cursor:pointer}
.for-sections[open]>small{display:block;margin:6px 0 10px}
.for-sections .kind-fields+.kind-fields{margin-top:12px}
.for-section{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;font-size:.9375rem}
.for-section strong{color:var(--public-ink);font-weight:600}
.for-group summary{color:var(--ink-blue);font-size:.875rem;cursor:pointer}
.for-group .said{margin-top:6px}
.save-bar{position:sticky;bottom:0;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:26px -10px 0;padding:12px 10px;background:color-mix(in srgb,var(--page,var(--public-page)) 92%,transparent);backdrop-filter:blur(6px)}
.danger{border-color:var(--pencil-red);color:var(--pencil-red)}
@media (max-width:980px){.two-sides{grid-template-columns:minmax(0,1fr)}.reads{position:static;margin-top:26px}}`;

// --- Question sets --------------------------------------------------------------------------------------

const setIn = (doc, ref) => {
  const set = (doc.question_sets || []).find((item) => item.ref === ref);
  if (!set) throw refused('That question set isn’t in this course anymore.', 404, 'set_not_found');
  return set;
};
const choiceLines = (item) => (item.choices || []).map((choice) => `${(item.type === 'single' ? item.answer?.choice === choice.id : item.answer?.choices?.includes(choice.id)) ? '* ' : ''}${choice.text}`).join('\n');

function questionForm(item, code, ref, version, index, count) {
  const api = `courses/${esc(code)}/questions/${esc(ref)}/items/${esc(encodeURIComponent(item.id))}`;
  const known = Object.hasOwn(QUESTION_TYPES, item.type);
  const type = QUESTION_TYPES[item.type];
  return `<li class="v-card question" id="q-${esc(item.id)}" data-say-box>
<form id="qf-${esc(item.id)}" class="fields" data-api="PUT ${api}">
<input type="hidden" name="version" value="${version}">
<p class="q-type"><strong>Question ${index + 1}</strong> · ${esc(type?.label || item.type)}</p>
${known ? `${text('prompt', 'The question', item.prompt, { rows: 2, required: true })}
${['single', 'multiple'].includes(item.type) ? text('choices', 'Choices', choiceLines(item), { rows: Math.max(4, (item.choices || []).length + 1), hint: type.hint, placeholder: 'One choice\n* The right one' }) : ''}
${['fill', 'short'].includes(item.type) ? text('accept', 'Accepted answers', (item.answer?.accept || []).join('\n'), { rows: 2, hint: type.hint }) : ''}
${item.type === 'open' ? `<p class="v-note">${esc(type.hint)}</p>` : ''}
${text('hints', 'Hints', (item.hints || []).join('\n'), { rows: 2, hint: 'One per line, shown one at a time. Optional.' })}
${text('explanation', 'Why, shown after they answer', item.explanation, { rows: 2 })}
<div class="actions"><button class="v-btn" type="submit">Save</button></div>` : `<p class="v-note">${esc(item.prompt)}</p><p class="notice">This kind of question comes from its package and stays as it is here.</p>`}
</form>
<div class="actions q-move">
<button class="v-btn is-small icon" type="button" data-api="POST ${api}/move" data-body='${esc(JSON.stringify({ by: -1 }))}' aria-label="Move question ${index + 1} up"${index === 0 ? ' disabled' : ''}>↑</button>
<button class="v-btn is-small icon" type="button" data-api="POST ${api}/move" data-body='${esc(JSON.stringify({ by: 1 }))}' aria-label="Move question ${index + 1} down"${index === count - 1 ? ' disabled' : ''}>↓</button>
<button class="v-btn is-small" type="button" data-api="DELETE ${api}" data-confirm="Remove question ${index + 1}?" data-yes="Remove">Remove</button>
</div>${say()}
</li>`;
}

async function questionsBody({ library }, match) {
  const entry = await courseAt(library, match[1]);
  const { doc, meta, code } = entry;
  const set = setIn(doc, match[2]);
  const items = set.items || [];
  return {
    title: `${set.title} · ${doc.course.title}`,
    body: `<nav class="crumbs" aria-label="Where you are"><a href="/console/courses">Courses</a> / <a href="/console/courses/${esc(code)}">${esc(doc.course.title)}</a></nav>
<h1>${esc(set.title)}</h1>
<form class="block set-title" id="set-title" data-api="PUT courses/${esc(code)}/questions/${esc(set.ref)}">
<input type="hidden" name="version" value="${meta.version}">
${text('title', 'Its name', set.title, { required: true, maxlength: 160 })}
<div class="actions"><button class="v-btn is-small" type="submit">Save name</button></div>${say()}
</form>
<section class="block" aria-label="Questions">
${items.length ? `<ol class="questions">${items.map((item, index) => questionForm(item, code, set.ref, meta.version, index, items.length)).join('')}</ol>` : '<p class="v-empty">No questions yet. Add the first one below.</p>'}
</section>
<section class="block" aria-labelledby="add-q">
<h2 id="add-q">Add a question</h2>
<div class="actions add-types" data-say-box>${Object.entries(QUESTION_TYPES).map(([type, { label }]) => `<button class="v-btn is-small" type="button" data-api="POST courses/${esc(code)}/questions/${esc(set.ref)}/items" data-body='${esc(JSON.stringify({ type }))}'>${esc(label)}</button>`).join('')}${say()}</div>
</section>`,
    css: `.questions{display:grid;gap:14px;margin:0;padding:0;list-style:none}.question{display:grid;gap:12px}.q-type{margin:0;font-size:.9375rem}.q-type strong{font-weight:600;color:var(--public-ink)}.q-move .icon{padding:0 11px}.set-title{display:grid;gap:10px;max-width:520px}.notice{margin:0;padding:12px 16px;border-radius:var(--radius-sm);background:var(--query-soft);color:var(--public-ink)}`
  };
}

// Text fields into what an item holds, then the same check a package's items get.
function itemFrom(body, held) {
  const prompt = clean(body.prompt, 4000);
  if (!prompt) throw refused('Write the question.');
  const lines = (value) => String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const item = { ...held, prompt, hints: lines(body.hints).slice(0, 5), explanation: clean(body.explanation, 2000) };
  if (!item.explanation) delete item.explanation;
  if (['single', 'multiple'].includes(held.type)) {
    const rows = lines(body.choices).map((line, i) => ({ id: String.fromCharCode(97 + i), right: line.startsWith('*'), text: line.replace(/^\*\s*/, '') }));
    if (rows.length < 2) throw refused('Give at least two choices, one per line.');
    if (rows.length > 12) throw refused('A question holds at most 12 choices.');
    const right = rows.filter((row) => row.right).map((row) => row.id);
    if (!right.length) throw refused('Put * before the right answer.');
    if (held.type === 'single' && right.length > 1) throw refused('This kind has one right answer. Mark one with *.');
    item.choices = rows.map(({ id, text: words }) => ({ id, text: words }));
    item.answer = held.type === 'single' ? { choice: right[0] } : { choices: right };
  } else if (['fill', 'short'].includes(held.type)) {
    const accept = lines(body.accept);
    if (held.type === 'fill' && !accept.length) throw refused('Give at least one accepted answer.');
    item.answer = accept.length ? { accept } : {};
  }
  try { normalizeItems([item]); } catch (error) { throw refused(error.message); }
  return item;
}
const QUESTION_READY = (type) => ({
  single: { prompt: 'A new question', choices: [{ id: 'a', text: 'A right answer' }, { id: 'b', text: 'Another choice' }], answer: { choice: 'a' } },
  multiple: { prompt: 'A new question', choices: [{ id: 'a', text: 'A right answer' }, { id: 'b', text: 'Another choice' }], answer: { choices: ['a'] } },
  fill: { prompt: 'A new question', answer: { accept: ['An accepted answer'] } },
  short: { prompt: 'A new question', answer: {} },
  open: { prompt: 'A new question', answer: {} }
}[type]);
const newRef = (base, taken) => { const start = String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'set'; let ref = start; for (let n = 2; taken.has(ref); n += 1) ref = `${start}-${n}`; return ref; };

// --- Changes -----------------------------------------------------------------------------------------------

const panelFrom = (body, held, doc, title) => {
  const kind = String(body.kind);
  if (kind === 'chat') return null;
  const panel = body.panel || {};
  const same = held?.type === kind ? held : {};
  if (kind === 'questions') {
    const sets = doc.question_sets ||= [];
    let ref = panel.set_ref;
    if (!sets.some((set) => set.ref === ref)) { ref = newRef(title, new Set(sets.map((set) => set.ref))); sets.push({ ref, title, items: [] }); }
    return { ...same, id: same.id || 'questions', type: 'questions', title: same.title ?? null, set_ref: ref, feedback: ['each', 'end', 'none'].includes(panel.feedback) ? panel.feedback : 'each', tries: Number.isInteger(panel.tries) ? Math.min(10, Math.max(0, panel.tries)) : 3, hints: panel.hints !== false, ai_sees: same.ai_sees || 'question' };
  }
  if (kind === 'writing') {
    const rubric = String(panel.rubric_lines ?? '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 12).map((line) => { const at = line.indexOf(':'); return at > 0 ? { criterion: line.slice(0, at).trim(), description: line.slice(at + 1).trim() } : { criterion: line, description: '' }; });
    return { ...same, id: same.id || 'writing', type: 'writing', title: same.title ?? 'Your writing', prompt: clean(panel.prompt, 8000), rubric, min_words: panel.min_words ?? null, max_words: panel.max_words ?? null, lock_on_submit: panel.lock_on_submit === true };
  }
  if (kind === 'embed') {
    if (!/^https:\/\//i.test(String(panel.url ?? ''))) throw refused('A web page needs its whole https address.');
    return { ...same, id: same.id || 'page', type: 'embed', title: same.title ?? null, url: clean(panel.url, 2000) };
  }
  if (kind === 'reading') return { highlights: true, notes: true, start_page: 1, ai_sees: 'page', ...same, id: same.id || 'reading', type: 'reading', title: same.title ?? 'The reading', file_ref: same.file_ref ?? null };
  throw refused('Choose what learners do.');
};

function applyForm(activity, body, doc) {
  const title = clean(body.title, 160);
  if (!title) throw refused('Give it a title.');
  activity.title = title;
  activity.summary = clean(body.summary, 600) || null;
  activity.minutes = Number.isInteger(body.minutes) && body.minutes > 0 ? Math.min(body.minutes, 600) : null;
  if (body.unit_ref !== undefined) activity.unit_ref = (doc.course.units || []).some((unit) => unit.ref === body.unit_ref) ? body.unit_ref : null;
  // A package's several panels and steps stay as they are; the form sends no kind for them.
  if (body.kind) {
    const held = activity.workspace?.panels?.[0] || null;
    const panel = panelFrom(body, held, doc, title);
    if (body.kind === 'reading' && !panel.file_ref) activity.workspace = held?.type === 'reading' ? activity.workspace : { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [] };
    else activity.workspace = panel ? { ai: activity.workspace?.ai || 'right', title: activity.workspace?.title ?? null, layout: activity.workspace?.layout || { ai_width: 36, resizable: true, collapsible: true }, panels: [panel] } : null;
  }
  const agents = agentsOf(doc);
  if (body.agent_ref !== undefined) {
    if (body.agent_ref && !agents.some((agent) => agent.ref === body.agent_ref)) throw refused('That AI isn’t in this course.');
    if (!body.agent_ref && !activity.workspace?.panels?.length) throw refused('A conversation needs an AI. Choose one, or choose something else for learners to do.');
    activity.agent_ref = body.agent_ref || null;
    if (activity.workspace) activity.workspace.ai = body.agent_ref ? (activity.workspace.ai === 'off' ? 'right' : activity.workspace.ai) : 'off';
  }
  const teaching = body.teaching || {};
  // Only when off: left out, each host keeps its own default, and a file that goes to the Developer Platform stays as it was.
  withTeaching(activity, { goal: teaching.goal, help: teaching.help || null, watch_for: teaching.watch_for, tools_off: teaching.tools_off ?? activity.teaching?.tools_off ?? [], turn_brief: teaching.turn_brief === false ? false : undefined, ...(teaching.sections ? { sections: teaching.sections } : {}) });
  if (body.voice_on !== undefined) activity.voice = { ...activity.voice, input: body.voice_on };
  if (body.images_on !== undefined || body.files_on !== undefined) activity.attachments = { ...activity.attachments, ...(body.images_on !== undefined ? { images: body.images_on } : {}), ...(body.files_on !== undefined ? { files: body.files_on } : {}) };
  const opens = body.release === 'scheduled' ? body.opens_at : null;
  if (body.release === 'scheduled' && !opens) throw refused('Say when it opens.');
  if (opens && body.closes_at && Date.parse(body.closes_at) <= Date.parse(opens)) throw refused('It has to close after it opens.');
  activity.release = body.release === 'open' ? 'open' : 'hidden';
  activity.opens_at = opens || null;
  activity.closes_at = body.release === 'hidden' ? null : body.closes_at || null;
  if (['auto', 'self', 'opened'].includes(body.done_when)) activity.done_when = body.done_when;
}

const pagesPath = (code, key) => `/console/courses/${code}/activities/${key}`;

export const activityPages = [
  {
    id: 'activity', title: 'Activity', section: 'courses', nav: false,
    match: /^courses\/([\w-]+)\/activities\/([\w-]+)$/,
    render: withForms(activityBody),
    api: [
      ['POST', /^courses\/([\w-]+)\/activities$/, async ({ library }, match, body) => {
        const title = clean(body?.title, 160);
        if (!title) throw refused('Give it a title.');
        const kind = Object.hasOwn(KIND_WORDS, body?.kind) ? body.kind : 'chat';
        const { doc } = await changeCourse(library, match[1], body.version, (draft) => {
          const activity = { title, summary: null, role: 'instruction', agent_ref: agentsOf(draft)[0]?.ref ?? null, workspace: null, minutes: null, voice: null, attachments: null, teaching: null, release: 'hidden', done_when: 'auto' };
          if (kind === 'questions') {
            const sets = draft.question_sets ||= [];
            const ref = newRef(title, new Set(sets.map((set) => set.ref)));
            sets.push({ ref, title, items: [] });
            activity.workspace = { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [{ id: 'questions', type: 'questions', title: null, set_ref: ref, feedback: 'each', tries: 3, hints: true, ai_sees: 'question' }] };
          } else if (kind === 'writing') activity.workspace = { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [{ id: 'writing', type: 'writing', title: 'Your writing', prompt: '', rubric: [] }] };
          else if (kind === 'reading') activity.workspace = { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [] };
          else if (kind === 'embed') {
            if (!/^https:\/\//i.test(String(body.url ?? ''))) throw refused('A web page needs its whole https address.');
            activity.workspace = { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [{ id: 'page', type: 'embed', title: null, url: clean(body.url, 2000) }] };
          }
          (draft.course.activities ||= []).push(activity);
        }, `Added ${title}`);
        const added = doc.course.activities.at(-1);
        return { go: pagesPath(match[1], added.key) };
      }],
      ['PUT', /^courses\/([\w-]+)\/activities\/([\w-]+)$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], body?.version, (doc) => applyForm(activityIn(doc, match[2]).activity, body, doc), clean(body?.title, 80));
        return { said: 'Saved. Learners get it on their next message.' };
      }],
      ['DELETE', /^courses\/([\w-]+)\/activities\/([\w-]+)$/, async ({ library, store }, match) => {
        await changeCourse(library, match[1], null, (doc) => { const { index, list } = activityIn(doc, match[2]); list.splice(index, 1); }, 'Removed an activity');
        await forgetActivity(store, match[1], match[2]);
        return { go: `/console/courses/${match[1]}` };
      }],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/release$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], body?.version, (doc) => { const { activity } = activityIn(doc, match[2]); activity.release = body.release === 'open' ? 'open' : 'hidden'; activity.opens_at = null; }, body?.release === 'open' ? 'Opened an activity' : 'Hid an activity');
        return {};
      }],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/move$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], body?.version, (doc) => {
          const { index, list } = activityIn(doc, match[2]);
          const to = index + (body.by < 0 ? -1 : 1);
          if (to >= 0 && to < list.length) list.splice(to, 0, list.splice(index, 1)[0]);
        }, 'Moved an activity');
        return {};
      }],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/copy$/, async ({ library }, match) => {
        const { doc } = await changeCourse(library, match[1], null, (draft) => {
          const { activity, index, list } = activityIn(draft, match[2]);
          const { key: _key, ...rest } = structuredClone(activity);
          list.splice(index + 1, 0, { ...rest, title: `${activity.title} (copy)`.slice(0, 160), release: 'hidden', opens_at: null, closes_at: null });
        }, 'Copied an activity');
        const at = doc.course.activities.findIndex((item) => item.key === match[2]);
        return { go: pagesPath(match[1], doc.course.activities[at + 1].key) };
      }],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/reading$/, async ({ library, request }, match, bytes) => {
        const name = decodeURIComponent(request.headers.get('x-file-name') || 'reading.pdf').replace(/[^\w. -]/g, '_').slice(0, 120);
        if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) throw refused('That isn’t a PDF.');
        const entry = await courseAt(library, match[1]);
        // The bytes go in first and the document names them after, so a search never looks for a file that isn't there.
        const ref = newRef(name.replace(/\.pdf$/i, ''), new Set((entry.doc.files || []).map((file) => file.ref)));
        const path = `files/${ref}.pdf`;
        await library.putFile(entry.id, path, bytes);
        try {
          await library.change(entry.id, null, (doc) => {
            const { activity } = activityIn(doc, match[2]);
            (doc.files ||= []).push({ ref, name, type: 'application/pdf', bytes: bytes.length, path });
            const held = activity.workspace?.panels?.find((panel) => panel.type === 'reading');
            const reading = { highlights: true, notes: true, start_page: 1, ai_sees: 'page', id: 'reading', type: 'reading', title: 'The reading', ...held, file_ref: ref };
            activity.workspace = { ai: activity.workspace?.ai || 'right', title: activity.workspace?.title ?? null, layout: activity.workspace?.layout || { ai_width: 36, resizable: true, collapsible: true }, panels: [reading] };
          }, `Reading: ${name}`);
        } catch (error) {
          await library.dropFile(entry.id, path);
          throw error;
        }
        return { said: 'Added. Save the rest of this page when you are ready.' };
      }, { bytes: 25 * 1024 * 1024 }],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/misconceptions$/, async ({ library }, match, body) => {
        const item = (await misconceptions()).misconceptionById(String(body?.id ?? ''));
        if (!item) throw refused('That misconception isn’t in the graph.', 404, 'misconception_not_found');
        await changeCourse(library, match[1], null, (doc) => { const { activity } = activityIn(doc, match[2]); withTeaching(activity, { misconceptions: [...(activity.teaching?.misconceptions || []), item].slice(0, 8) }); }, 'Added a misconception');
        return { said: 'Added.' };
      }],
      ['DELETE', /^courses\/([\w-]+)\/activities\/([\w-]+)\/misconceptions\/([\w-]+)$/, async ({ library }, match) => {
        await changeCourse(library, match[1], null, (doc) => { const { activity } = activityIn(doc, match[2]); withTeaching(activity, { misconceptions: (activity.teaching?.misconceptions || []).filter((item) => item.id !== match[3]) }); }, 'Removed a misconception');
        return { said: 'Removed.' };
      }],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/standard$/, async ({ library }, match, body) => {
        const skill = (await skills()).skillAtLevel(body?.skill, body?.level);
        if (!skill) throw refused('That skill isn’t in the framework.', 404, 'skill_not_found');
        const { object: _object, ...kept } = skill;
        await changeCourse(library, match[1], null, (doc) => withTeaching(activityIn(doc, match[2]).activity, { standard: kept }), 'Chose a skill');
        return { said: 'Added.' };
      }],
      ['DELETE', /^courses\/([\w-]+)\/activities\/([\w-]+)\/standard$/, async ({ library }, match) => {
        await changeCourse(library, match[1], null, (doc) => withTeaching(activityIn(doc, match[2]).activity, { standard: null }), 'Removed a standard or skill');
        return { said: 'Removed.' };
      }],
      ['GET', /^courses\/([\w-]+)\/activities\/([\w-]+)\/find-skill$/, async ({ url }, match) => {
        const found = (await skills()).findSkills(url.searchParams.get('q') || '');
        const level = url.searchParams.get('level') || '2';
        const api = `courses/${esc(match[1])}/activities/${esc(match[2])}/standard`;
        return { html: found.data.length ? `<ul>${found.data.slice(0, 12).map((item) => `<li><button type="button" data-api="POST ${api}" data-body='${esc(JSON.stringify({ skill: item.code, level }))}'><strong>${esc(item.skill)} · ${esc(item.code)}</strong><span>${esc(item.description)}</span></button></li>`).join('')}</ul>` : '<p class="v-note">No skill matches. Try other words.</p>' };
      }],
      ['GET', /^courses\/([\w-]+)\/activities\/([\w-]+)\/find-misconception$/, async ({ url }, match) => {
        const found = (await misconceptions()).findMisconceptions(url.searchParams.get('q') || '');
        const api = `courses/${esc(match[1])}/activities/${esc(match[2])}/misconceptions`;
        return { html: found.data.length ? found.data.map((construct) => `<h4>${esc(construct.description)}</h4><ul>${construct.misconceptions.slice(0, 6).map((item) => `<li><button type="button" data-api="POST ${api}" data-body='${esc(JSON.stringify({ id: item.id }))}'>${esc(item.description)}</button></li>`).join('')}</ul>`).join('') : '<p class="v-note">Nothing matches. Try other words.</p>' };
      }],
      ['GET', /^courses\/([\w-]+)\/activities\/([\w-]+)\/brief$/, async ({ library, url }, match) => {
        const { doc } = await courseAt(library, match[1]);
        const { activity } = activityIn(doc, match[2]);
        const message = clean(url.searchParams.get('message'), 1000);
        if (!message) return { html: '<p class="v-note">Type something first.</p>' };
        const { turnBrief } = await import('../../../harness/src/brief.js');
        const brief = await turnBrief(activity.teaching, { message });
        if (!brief) return { html: '<p class="v-note">Nothing is set yet, so the AI would get only its own instructions.</p>' };
        return { html: `<p class="moment-read">${esc(MOMENT_WORDS[brief.moment] || brief.moment)}</p><pre class="said">${esc(brief.text)}</pre>` };
      }]
    ]
  },
  {
    id: 'questions', title: 'Questions', section: 'courses', nav: false,
    match: /^courses\/([\w-]+)\/questions\/([\w-]+)$/,
    render: withForms(questionsBody),
    api: [
      ['PUT', /^courses\/([\w-]+)\/questions\/([\w-]+)$/, async ({ library }, match, body) => {
        const title = clean(body?.title, 160);
        if (!title) throw refused('Give it a name.');
        await changeCourse(library, match[1], body.version, (doc) => { setIn(doc, match[2]).title = title; }, 'Renamed a question set');
        return { said: 'Saved.' };
      }],
      ['POST', /^courses\/([\w-]+)\/questions\/([\w-]+)\/items$/, async ({ library }, match, body) => {
        if (!Object.hasOwn(QUESTION_TYPES, body?.type) || !ITEM_TYPES.includes(body.type)) throw refused('Choose a kind of question.');
        await changeCourse(library, match[1], null, (doc) => {
          const set = setIn(doc, match[2]);
          const items = set.items ||= [];
          const ids = new Set(items.map((item) => item.id));
          let id = `q${items.length + 1}`;
          for (let n = items.length + 2; ids.has(id); n += 1) id = `q${n}`;
          items.push({ id, type: body.type, ...QUESTION_READY(body.type) });
        }, 'Added a question');
        return { said: 'Added.' };
      }],
      ['PUT', /^courses\/([\w-]+)\/questions\/([\w-]+)\/items\/([\w-]+)$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], body?.version, (doc) => {
          const items = setIn(doc, match[2]).items || [];
          const index = items.findIndex((item) => item.id === match[3]);
          if (index < 0) throw refused('That question isn’t here anymore.', 404, 'question_not_found');
          items[index] = itemFrom(body, items[index]);
        }, 'Changed a question');
        return { said: 'Saved.' };
      }],
      ['POST', /^courses\/([\w-]+)\/questions\/([\w-]+)\/items\/([\w-]+)\/move$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], null, (doc) => {
          const items = setIn(doc, match[2]).items || [];
          const index = items.findIndex((item) => item.id === match[3]);
          const to = index + (body?.by < 0 ? -1 : 1);
          if (index >= 0 && to >= 0 && to < items.length) items.splice(to, 0, items.splice(index, 1)[0]);
        }, 'Moved a question');
        return {};
      }],
      ['DELETE', /^courses\/([\w-]+)\/questions\/([\w-]+)\/items\/([\w-]+)$/, async ({ library }, match) => {
        await changeCourse(library, match[1], null, (doc) => { const set = setIn(doc, match[2]); set.items = (set.items || []).filter((item) => item.id !== match[3]); }, 'Removed a question');
        return {};
      }]
    ]
  }
];
