/**
 * An activity on the console: what learners do, how the AI helps, when it is open, and its question
 * sets. How the AI helps is the Harness's teaching settings; the page shows what the AI reads with every
 * message, and what it would be told at a moment the teacher types, from the same code a run uses. No
 * Node built-ins.
 */
import { guidanceFrom } from '../../../harness/src/components/contract.js';
import { HELP_LADDER, treeHtml } from '../../../harness/src/ui/parts.js';
import { sourceName, TRACE_CSS, turnTree } from '../learner/watch.js';
import { SPEAK_UP } from '../../../harness/src/speakUp.js';
import { TEACHING_LIMITS, teachingContext, teachingSettings } from '../../../harness/src/utils/teaching.js';
import { MISCONCEPTIONS_SOURCE } from '../../../harness/src/utils/misconceptionsSource.js';
import { ITEM_TYPES, normalizeItems } from '../learner/questions.js';
import { activityKeys } from '../server/library.js';
import { changeCourse, courseAt, kindOfActivity } from './course.js';
import { addStep, changeStep, flowOf, moveStep, newRef, openingFrom, PANEL_WORDS, removeStep, reviewOf, STEP_LIMIT } from './flow.js';
import { choose, dropZone, esc, oneOf, say, text, toggle, withForms } from './forms.js';

// Large data, loaded when a page asks for it, so a server that never opens these starts small.
const misconceptions = () => import('../../../harness/src/utils/misconceptions.js');
const skills = () => import('../../../harness/src/utils/skills.js');
const research = () => import('../../../harness/src/components/guidance.js');
const refused = (message, status = 400, code = 'invalid_activity') => Object.assign(new Error(message), { status, code });
const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);
// Whose work something is, in a line that opens to the attribution it asks for.
const credit = (name, attribution) => {
  const lines = [attribution].flat().filter(Boolean);
  if (!name) return '';
  // A license's short name (CC BY 4.0) stays on one line.
  const said = esc(name).replace(/\bCC [A-Z-]+ [\d.]+/g, (license) => license.replaceAll(' ', '&nbsp;'));
  return lines.length ? `<details class="source-note"><summary>${said}</summary>${lines.map((line) => `<p>${esc(line)}</p>`).join('')}</details>` : `<p class="source-note">${said}</p>`;
};
const credits = (sources) => [...new Map(sources.filter(Boolean).map((source) => [sourceName(source), source])).entries()].map(([name, source]) => (name ? credit(`From ${name}`, source.attribution) : '')).join('');
// The Carnegie Skills Progressions' own names for its levels (skillsData.js).
const SKILL_LEVELS = ['Exploring', 'Analyzing', 'Integrating', 'Extending'];
const FORM = 'activity';
// How much the AI does, as one scale from the least to the most (HELP_LADDER): each level does what the one before does, and one thing more,
// named for that thing, with when to use it and what it sounds like. Not set is offered only where it is the choice now.
const forWhom = (level) => `Use it for ${level.for.charAt(0).toLowerCase()}${level.for.slice(1)} It sounds like “${level.sounds}”`;
function ladderPart(current) {
  const set = current || '';
  const stop = (level) => `<label class="stop"><input type="radio" name="teaching.help" value="${level.id}" form="${FORM}"${level.id === set ? ' checked' : ''}><span class="dot" aria-hidden="true"></span><span class="name">${esc(level.name)}</span></label>`;
  const says = (level) => `<div class="ladder-says" data-show-when="teaching.help=${level.id}" data-form="${FORM}"${level.id === set ? '' : ' hidden'}><p><strong>${esc(level.name)}.</strong> ${esc(level.adds)}</p><p class="v-note">${esc(forWhom(level))}</p></div>`;
  return `<fieldset class="ladder" id="help-ladder"><legend class="v-label">How much the AI does</legend>
<div class="ladder-scale"><span class="end" aria-hidden="true">Less</span><div class="stops">${HELP_LADDER.map(stop).join('')}</div><span class="end" aria-hidden="true">More</span></div>
${set ? '' : `<label class="unset"><input type="radio" name="teaching.help" value="" form="${FORM}" checked><span>Not set: the AI’s own instructions decide</span></label>`}
${HELP_LADDER.map(says).join('')}
<p class="v-note">At every level it says so when a learner has it, and with a question open, an AI with a reviewer never gives that question’s answer.</p>
<p class="v-note ladder-changes">What this changes: one paragraph of what the AI is told with every message (it lights up beside these settings) and what its reviewer holds a reply to. Not the AI, and not its steps.</p>
</fieldset>`;
}

const MOMENT_WORDS = { attempt: 'They gave an answer or some working', asks_answer: 'They want the answer', stuck: 'They don’t know how to go on', repeated: 'They have tried more than once', other: 'Nothing that calls for a teaching move', ...Object.fromEntries(Object.entries(SPEAK_UP).map(([kind, moment]) => [kind, `${moment.label}: the AI writes first`])) };
const KIND_WORDS = { chat: 'Talk with the AI', page: 'A page to read', questions: 'Questions', writing: 'Writing', reading: 'Reading', embed: 'A web page' };
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
export const withTeaching = (activity, change) => { activity.teaching = teachingSettings({ ...activity.teaching, ...change }); };
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

function kindFields(activity, doc, code, locked, simple, asked) {
  // A host that keeps no reading without its PDF is asked for one when the activity opens.
  const kind = asked === 'reading' && !activity.workspace ? 'reading' : kindOfActivity(activity);
  if (kind === 'several') {
    return `<p class="notice">This activity has ${activity.workspace.panels.length} panels${activity.workspace.steps?.length ? ` in ${activity.workspace.steps.length} steps` : ''} from its package. They stay as they are here. To change them, ${simple ? 'open this course on the VIABLE Developer Platform' : 'change the package on the VIABLE Developer Platform and add it again'}.</p>`;
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
${locked ? '' : dropZone({ id: 'reading-file', label: panel.file_ref ? 'Drop another PDF to replace it' : 'Drop a PDF here', accept: '.pdf,application/pdf', upload: `POST courses/${code}/activities/${activity.key}/reading` })}${say()}
</div>
<div class="kind-fields" data-show-when="kind=embed" data-form="${FORM}">
${text('panel.url', 'Its address', panel.url, { type: 'url', form: FORM, placeholder: 'https://', hint: 'It has to allow being shown inside another page.' })}
</div>`;
}

// --- What learners do --------------------------------------------------------------------------------

const onThisForm = (id, markup) => markup.replaceAll('type="radio"', `type="radio" form="${id}"`).replaceAll('type="checkbox"', `type="checkbox" form="${id}"`);

// What a panel holds, on its step's form. Names are the panel's: a panel can be in more than one step.
function panelFields(panel, doc, code, activityKey, locked) {
  const name = (field) => `panels.${panel.id}.${field}`;
  if (panel.type === 'page') return text(name('text'), 'What learners read', panel.text, { rows: Math.min(18, Math.max(6, String(panel.text ?? '').split('\n').length + 2)), maxlength: 12000, placeholder: 'Say what they are doing here, why it matters and how long it takes. Then the case itself: the story, the numbers, the sources.', hint: 'Markdown works: **bold**, lists, > a quote, [a link](https://…). Write the real thing: the case, the numbers, the task.' });
  if (panel.type === 'writing') return `${text(name('prompt'), 'What to write', panel.prompt, { rows: 4, maxlength: 8000 })}
<div class="fields two">${text(name('min_words'), 'At least (words)', panel.min_words ?? '', { type: 'number', min: 1 })}${text(name('max_words'), 'At most (words)', panel.max_words ?? '', { type: 'number', min: 1 })}</div>
${text(name('rubric_lines'), 'What makes it good', (panel.rubric || []).map((row) => `${row.criterion}${row.description ? `: ${row.description}` : ''}`).join('\n'), { rows: 3, hint: 'One per line: a name, a colon, what it means. Learners see these, and so does the AI.' })}
${toggle(name('lock_on_submit'), 'Handed in once: they can’t change it afterwards', panel.lock_on_submit === true)}`;
  if (panel.type === 'questions') {
    const set = (doc.question_sets || []).find((item) => item.ref === panel.set_ref);
    return `<div class="step-questions"><div><strong>${esc(String(set?.items?.length ?? 0))} question${set?.items?.length === 1 ? '' : 's'}</strong>${(set?.items || []).slice(0, 3).map((item) => `<small>${esc(String(item.prompt).slice(0, 90))}</small>`).join('')}</div>${set ? `<a class="v-btn is-small" href="/console/courses/${esc(code)}/questions/${esc(set.ref)}">Change the questions</a>` : ''}</div>
${choose(name('feedback'), 'When they find out', panel.feedback || 'each', [{ value: 'each', label: 'After each answer' }, { value: 'end', label: 'Once all are answered' }, { value: 'none', label: 'Not here', hint: 'A first call they’ll come back to, or a test.' }])}
<div class="fields two">${text(name('tries'), 'Tries per question', panel.tries ?? 3, { type: 'number', min: 0, max: 10, hint: '0 for as many as they like.' })}<div class="v-form step-hints">${toggle(name('hints'), 'They can see the hints', panel.hints !== false)}</div></div>`;
  }
  if (panel.type === 'embed') return text(name('url'), 'Its address', panel.url, { type: 'url', placeholder: 'https://', hint: 'It has to allow being shown inside another page.' });
  if (panel.type === 'reading') return `<p class="v-note">The reading: ${esc(panel.document?.title || (doc.files || []).find((file) => file.ref === panel.file_ref)?.name || 'no PDF yet')}.</p><div data-say-box>${locked ? '' : dropZone({ id: `reading-file-${panel.id}`, label: panel.file_ref || panel.document ? 'Drop another PDF to replace it' : 'Drop a PDF here', accept: '.pdf,application/pdf', upload: `POST courses/${code}/activities/${activityKey}/reading` })}${say()}</div>`;
  return '';
}

function stepCard(step, index, count, ctx) {
  const { doc, code, activity, api, locked, version, hasAi } = ctx;
  const formId = `step-form-${index}`;
  const shows = step.panels.map((panel) => (panel.type === 'questions' ? `${panel.questions} question${panel.questions === 1 ? '' : 's'}` : PANEL_WORDS[panel.type])).join(', ');
  const stepApi = `${api}/steps/${index}`;
  const aiFields = hasAi ? `${toggle('ai_on', 'The AI is beside them here', step.has_ai, { hint: 'Off keeps the thinking theirs: where they make a first try, or take a test. The server holds to this.' })}
<div class="step-ai" data-show-when="ai_on=true">
${step.only ? '' : text('brief', 'What the AI does here', step.brief, { rows: 3, maxlength: 1500, placeholder: 'e.g. Plays a friendly skeptic. Asks what evidence they rely on. Never says who is right.', hint: 'For the AI only. Say what it holds back, too.' })}
${text('says', 'What it says first', step.says, { rows: 2, maxlength: 800, placeholder: 'e.g. So what’s your call, and what moved you most?', hint: 'Its first message here, so nobody faces an empty box.' })}
${step.only ? '' : toggle('new_chat', 'A new conversation starts here', step.chat === 'new', { hint: 'Off, it remembers what was said in the steps before.' })}
</div>` : '';
  return `<li class="flow-step" id="step-${index + 1}" data-say-box>
<details id="step-open-${index + 1}"${count === 1 ? ' open' : ''}><summary><span class="flow-n">${index + 1}</span><span class="flow-what"><strong>${esc(step.title)}</strong><small>${esc(shows)}${step.has_ai ? ', with the AI' : ''}</small></span></summary>
<form class="fields flow-form" id="${formId}" data-api="PUT ${stepApi}" data-guard data-together>
<input type="hidden" name="version" value="${esc(version)}">
${step.only ? '' : text('title', 'What this step is called', step.title, { maxlength: 60 })}
${step.panels.map((panel) => panelFields(panel, doc, code, activity.key, locked)).join('')}
${aiFields}
${index ? toggle('back', 'They can go back to the steps before this one', step.back === true) : ''}
<div class="actions">
${count > 1 && !locked ? `<button class="v-btn is-small icon" type="button" aria-label="Move “${esc(step.title)}” up" data-api="POST ${stepApi}/move" data-body='${esc(JSON.stringify({ by: -1 }))}'${index === 0 ? ' disabled' : ''}>↑</button><button class="v-btn is-small icon" type="button" aria-label="Move “${esc(step.title)}” down" data-api="POST ${stepApi}/move" data-body='${esc(JSON.stringify({ by: 1 }))}'${index === count - 1 ? ' disabled' : ''}>↓</button>` : ''}
${locked ? '' : `<button class="v-btn is-small danger" type="button" data-api="DELETE ${stepApi}" data-confirm="Remove “${esc(step.title)}”? What learners did in it stays in their records." data-yes="Remove">Remove</button>`}</div>${say()}
</form></details></li>`;
}

function flowBlock(ctx) {
  const { doc, activity, api, locked, version, hasAi, asked } = ctx;
  const steps = flowOf(doc, activity);
  // A host that keeps no reading without its PDF asks for one when the activity opens.
  const waiting = !steps.length && (activity.workspace || asked === 'reading');
  const addButtons = locked || steps.length >= STEP_LIMIT ? '' : `<div class="flow-add" data-say-box><span class="v-note">${steps.length ? 'Add a step:' : 'Give them something to do:'}</span>${Object.entries({ page: 'A page to read', questions: 'Questions', writing: 'Writing', embed: 'A web page' }).map(([kind, label]) => `<button class="v-btn is-small" type="button" data-api="POST ${api}/steps" data-body='${esc(JSON.stringify({ kind }))}'>${esc(label)}</button>`).join('')}${say()}</div>`;
  const alone = !steps.length && !waiting && activity.agent_ref ? `<form class="fields flow-alone" id="opening-form" data-api="PUT ${api}/opening" data-guard data-together data-say-in="opening-say">
<input type="hidden" name="version" value="${esc(version)}">
<p class="v-note">Learners only talk with the AI here, with nothing else on screen. It should at least start the conversation.</p>
${text('says', 'What the AI says first', activity.opening?.says, { rows: 2, maxlength: 800, placeholder: 'e.g. Tell me what you think happened to the bees, and why.' })}
${text('starters_lines', 'Things a learner might say, as buttons', (activity.opening?.starters || []).join('\n'), { rows: 3, hint: 'Up to four, one per line.' })}
<span id="opening-say">${say()}</span>
</form>` : '';
  return `<section class="block" aria-labelledby="doing-title" id="what-they-do">
<h2 id="doing-title">What learners do</h2>
${steps.length ? `<ol class="flow">${steps.map((step, index) => stepCard(step, index, steps.length, { ...ctx, hasAi })).join('')}</ol>` : alone}
${waiting ? `<div class="flow-alone" data-say-box><p class="v-note">No PDF yet.</p>${locked ? '' : dropZone({ id: 'reading-file', label: 'Drop a PDF here', accept: '.pdf,application/pdf', upload: `POST ${api}/reading` })}${say()}</div>` : addButtons}
</section>`;
}

// What a teacher would want to fix before a class meets it. Fix: a learner would be stuck. The rest: it works, and could be better.
function beforeBlock(doc, activity) {
  const notes = reviewOf(doc, activity);
  if (!notes.length) return '';
  const fix = notes.filter((note) => note.level === 'fix');
  return `<aside class="before" aria-label="Before you open it"><h2>${fix.length ? 'Before you open it' : 'Worth a look'}</h2><ul>${notes.map((note) => `<li class="is-${esc(note.level)}">${esc(note.says)}</li>`).join('')}</ul></aside>`;
}

// The design it is built on, and what that rests on; or the ways it could be arranged, a sentence to Ask away.
async function designBlock(activity, code) {
  const { ACTIVITY_DESIGNS, designById } = await import('../../../harness/src/designs.js');
  const held = activity.teaching?.design ? designById(activity.teaching.design.id) : null;
  const ask = (design) => `/console/ask?course=${esc(code)}&amp;activity=${esc(activity.key)}#say=${esc(encodeURIComponent(`Rearrange this as ${design.label}, with real content in each step.`))}`;
  if (held) return `<details class="design" id="design-held"><summary><span class="v-note">Built on</span> <strong>${esc(held.label)}</strong></summary>
<p>${esc(held.shows)}</p><p class="v-note">What isn’t known: ${esc(held.unknown)}</p><p class="v-note">${esc(held.sources.join('; '))}</p></details>`;
  return `<details class="design" id="design-ways"><summary>Ways to arrange this, from research</summary>
<ul class="designs">${ACTIVITY_DESIGNS.map((design) => `<li><div><strong>${esc(design.label)}</strong><small>${esc(design.for)}</small><small>${esc(design.steps.map((step) => step.title).join(' → '))}</small></div><a class="v-btn is-small" href="${ask(design)}">Ask to arrange it so</a></li>`).join('')}</ul></details>`;
}

// What the AI in this activity does with a message, read from the agent itself, in the open: what changes when another is chosen, and what that costs.
// Where it can be changed: on the VIABLE Developer Platform from the Learning Platform, on this server's own page of the agent from the Engine.
function aiFlowPart(agent, agentLink, simple) {
  if (!agent) return '';
  const nodes = agent.graph?.nodes || [];
  const reviewed = nodes.filter((node) => node.type === 'vetting');
  const knows = nodes.some((node) => node.type === 'knowledge' || node.config?.tools?.knowledge_bases?.length || node.config?.tools?.knowledge_base_refs?.length);
  const web = nodes.some((node) => node.config?.tools?.fetch_url || node.config?.tools?.web);
  const tries = Math.max(...reviewed.map((node) => Number(node.config?.max_attempts) || 3), 0);
  const steps = ['A learner writes', ...(knows ? ['It looks in its materials'] : []), ...(web ? ['It may read web pages'] : []), 'It writes a reply from what you set here', ...(reviewed.length ? ['A second reader checks it'] : []), 'The learner sees it'];
  const link = agentLink ? ` <a href="${esc(agentLink)}"${simple ? ' target="_blank" rel="noopener"' : ''}>See or change its steps${simple ? ' on the VIABLE Developer Platform' : ''}</a>. A change there reaches every activity that uses it.` : '';
  return `<div class="ai-flow-part" id="ai-path"><ol class="ai-flow" aria-label="What happens with a message">${steps.map((words) => `<li${words === 'A second reader checks it' ? ' class="is-on"' : ''}><span>${esc(words)}</span></li>`).join('')}</ol>
<p class="v-note">${reviewed.length ? `A reply that doesn’t pass is rewritten, up to ${tries} times, so a reply takes about ten seconds.` : 'Nothing checks the reply, so it comes in a few seconds, and one may give an answer away.'}${link}</p></div>`;
}

// What a reviewer reads (VETTING): only the reply unless the teacher chooses, and where the AI's own step says, that.
function reviewerPart(agent, activity, onForm) {
  const reviewed = (agent?.graph?.nodes || []).filter((node) => node.type === 'vetting');
  if (!reviewed.length) return '';
  const fixed = reviewed.find((node) => node.config?.reviewer_reads)?.config.reviewer_reads;
  if (fixed) return `<p class="v-note">Its reviewer reads ${fixed === 'message' ? 'the reply and the learner’s message' : 'only the reply'}: ${esc(agent.name)} says so itself.</p>`;
  return onForm(oneOf('teaching.reviewer_reads', 'What its reviewer reads', activity.teaching?.reviewer_reads || 'reply', [
    { value: 'reply', label: 'Only the reply', hint: 'A learner can’t argue with it. But it can’t tell their own idea from one handed to them, so now and then a good reply is held back and rewritten.' },
    { value: 'message', label: 'The reply and the learner’s message', hint: 'Fewer good replies held back, and it also holds back replies that don’t answer them. A learner who knows it is there could write to it to try to get an answer through.' }
  ]));
}

// When the AI writes first (speakUp.js): each moment a menu with Never first, only where the activity has it (questions to answer,
// writing to do), what a note on their writing does and is about once one is chosen, and how often once any is. Each menu is the
// setting's own field, so Save keeps them with the rest. base: where the fields live (a section's own moments use the same menus).
function speaksUpPart(activity, steps, { base = 'teaching.speaks_up', set = activity.teaching?.speaks_up || {}, legend = 'When the AI writes first, unasked', id = 'speaks-up', note = true } = {}) {
  const kinds = new Set([...(activity.workspace?.panels || []).map((panel) => panel.type), ...steps.flatMap((step) => step.panels.map((panel) => panel.type))]);
  const pick = (name, label, value, options, more = {}) => choose(`${base}.${name}`, label, value, options, { form: FORM, ...more });
  const writes = kinds.has('writing');
  const onWriting = set.writing || set.handed_in || {};
  const rows = [
    pick('quiet', 'They’ve been quiet on a step', set.quiet?.minutes ?? '', [{ value: '', label: 'Never' }, ...[2, 3, 5, 10].map((n) => ({ value: n, label: `After ${n} minutes` }))]),
    pick('alone', 'They’ve worked a while without asking', set.alone?.minutes ?? '', [{ value: '', label: 'Never' }, ...[5, 10, 15].map((n) => ({ value: n, label: `After ${n} minutes` }))]),
    ...(kinds.has('questions') ? [
      pick('wrong', 'An answer is wrong', set.wrong?.after ?? '', [{ value: '', label: 'Never' }, { value: 1, label: 'The first time' }, { value: 2, label: 'The second time' }]),
      pick('right', 'An answer is right', set.right?.every ?? '', [{ value: '', label: 'Never' }, { value: 1, label: 'Every time' }, { value: 2, label: 'Every second one' }, { value: 3, label: 'Every third one' }])
    ] : []),
    ...(writes ? [
      pick('writing', 'While they write', set.writing?.words ?? '', [{ value: '', label: 'Never' }, ...[100, 200, 400].map((n) => ({ value: n, label: `About every ${n} words` }))]),
      pick('handed_in', 'They hand in writing', set.handed_in ? 'yes' : '', [{ value: '', label: 'Never' }, { value: 'yes', label: 'Right away' }])
    ] : [])
  ];
  return `<fieldset class="speaks" id="${esc(id)}"><legend class="v-label">${esc(legend)}</legend>
<div class="speaks-pick">${rows.join('')}</div>
${writes ? `<div class="speaks-pick speaks-writing" data-show-when="${base}.writing!=;${base}.handed_in!=" data-form="${FORM}">
${pick('how', 'On their writing, it', onWriting.how || (set.writing ? 'ask' : 'point'), [{ value: 'ask', label: 'Asks how it’s going', hint: 'Says nothing about the text.' }, { value: 'point', label: 'Points to a place to look again', hint: 'Which sentence or part, not what is wrong.' }, { value: 'fix', label: 'Says what to fix', hint: 'One or two things, and what to change. They make the change.' }])}
${pick('focus', 'About', onWriting.focus || '', [{ value: '', label: 'Whatever matters most' }, { value: 'language', label: 'Spelling and grammar' }, { value: 'ideas', label: 'Ideas and structure' }, { value: 'rubric', label: 'What makes it good' }])}
</div>` : ''}
<div class="speaks-pick speaks-often" data-show-when="${['quiet', 'alone', 'wrong', 'right', 'writing', 'handed_in'].map((name) => `${base}.${name}!=`).join(';')}" data-form="${FORM}">
${pick('most', 'At most, in a step', set.most || 2, [1, 2, 3, 5].map((n) => ({ value: n, label: n === 1 ? 'Once' : `${n} times` })))}
${pick('gap', 'At least apart', set.gap || 3, [1, 3, 5, 10].map((n) => ({ value: n, label: `${n} minute${n === 1 ? '' : 's'}` })))}
</div>
${note ? '<p class="v-note">Off unless you choose: help that comes unasked can also interrupt their thinking. The page asks only when a moment comes, and the server holds to how often. Each time is one message, billed like any other, and learners see that the AI began. While they write it reads their draft, as it does when they ask.</p>' : ''}
</fieldset>`;
}

function standardBlock(activity, api, locked) {
  const chosen = activity.teaching?.standard;
  const shown = chosen ? `<div class="chosen"><div><strong>${esc(chosen.code || (chosen.kind === 'skill' ? 'Skill' : 'Standard'))}${chosen.level?.name ? ` · ${esc(chosen.level.name)}` : ''}</strong><p>${esc(chosen.description)}</p>${credits([chosen.source])}</div>${locked ? '' : `<button class="v-btn is-small" type="button" data-api="DELETE ${api}/standard" aria-label="Remove the standard or skill">Remove</button>`}</div>` : '';
  return `<div class="part" id="standard" data-say-box>
<h3>Standard or skill <small>optional</small></h3>
${shown || `<p class="v-note">Collaboration, communication or critical thinking, from the Carnegie Skills Progressions. If you choose one, the AI gets its words, and what a learner at that level does, with each message.</p>
<form class="find" id="find-skill" data-search="${api}/find-skill" data-into="skills-found">
<label class="sr" for="skill-q">Search durable skills</label><input class="v-input" id="skill-q" name="q" type="search" placeholder="A durable skill, such as evidence or feedback" autocomplete="off">
<label class="sr" for="skill-level">Level learners work toward</label><select class="v-input" id="skill-level" name="level">${SKILL_LEVELS.map((name, index) => `<option value="${index + 1}"${index === 1 ? ' selected' : ''}>${name}</option>`).join('')}</select>
<button class="v-btn is-small" type="submit">Find</button>
</form>
<div id="skills-found" class="found"></div>`}
${say()}
</div>`;
}

// What research says to do at each moment, for a person to choose from: the AI gets only what is chosen, and at most two pieces with each message.
const MOMENT_FOR = { attempt: 'giving an answer', asks_answer: 'asking for the answer', stuck: 'stuck', repeated: 'still not there after trying' };
function guidanceLibrary(activity, api, frameworks) {
  const chosen = activity.teaching?.guidance || [];
  const held = new Set(chosen.map((item) => item.text));
  const full = chosen.length >= TEACHING_LIMITS.guidance;
  const piece = (framework) => (item, index) => `<li><p>${esc(item.text)}<small>${esc([item.when ? `For a learner ${item.when.map((moment) => MOMENT_FOR[moment]).join(' or ')}` : 'When what they say calls for it', item.source].filter(Boolean).join(' · '))}</small></p>${held.has(item.text) ? '<span class="v-note">Chosen</span>' : full ? '' : `<button class="v-btn is-small" type="button" data-api="POST ${api}/guidance" data-body='${esc(JSON.stringify({ component: framework.id, item: index + 1 }))}' data-said="Added.">Add</button>`}</li>`;
  return `<p class="v-note">A sentence or two for the AI, in our words, each naming the studies it draws on. Most of the research is on human tutors, so each topic says what isn’t known. Up to ${TEACHING_LIMITS.guidance}.</p>
${frameworks.map((framework) => `<details class="framework" id="g-${esc(framework.id.split('/')[1])}"><summary><strong>${esc(framework.label)}</strong> <small>${framework.runs.items.length}</small></summary>
<p class="v-note">${esc(framework.summary)}</p>
<details class="shows" id="s-${esc(framework.id.split('/')[1])}"><summary>What the research shows, and what isn’t known</summary><p>${esc(framework.evidence.original)}</p><p>${esc(framework.evidence.unknown)}</p></details>
<ul class="picked">${framework.runs.items.map(piece(framework)).join('')}</ul>
</details>`).join('')}`;
}
function guidanceBlock(activity, api, locked) {
  const chosen = activity.teaching?.guidance || [];
  return `<div class="part" id="guidance" data-say-box>
<h3>Guidance from research <small>optional · with each message it gets at most two pieces that fit the moment</small></h3>
${chosen.length ? `<ul class="picked">${chosen.map((item, index) => `<li><div><p>${esc(item.text)}</p>${credit(item.source, item.attribution)}</div>${locked ? '' : `<button class="v-btn is-small" type="button" data-api="DELETE ${api}/guidance/${index}" data-said="Removed.">Remove</button>`}</li>`).join('')}</ul>` : ''}
${locked ? '' : `<details class="library" id="guidance-library" data-load="${api}/guidance-library"><summary>${chosen.length ? 'Choose more' : 'Choose from what research says'}</summary><div data-loaded></div></details>`}
${say()}
</div>`;
};

function misconceptionsBlock(activity, api, locked) {
  const chosen = activity.teaching?.misconceptions || [];
  return `<div class="part" id="misconceptions" data-say-box>
<h3>Misconceptions to listen for <small>optional · for math</small></h3>
${chosen.length ? `<ul class="picked">${chosen.map((item) => `<li><p>${esc(item.description)}<small>${esc(item.construct?.description)}</small></p>${locked ? '' : `<button class="v-btn is-small" type="button" data-api="DELETE ${api}/misconceptions/${esc(item.id)}" aria-label="Remove “${esc(item.description)}”">Remove</button>`}</li>`).join('')}</ul>` : '<p class="v-note">The AI gets the one that fits what a learner just did, on the turn it fits.</p>'}
${locked || chosen.length >= 8 ? '' : `<form class="find" id="find-misconception" data-search="${api}/find-misconception" data-into="misconceptions-found">
<label class="sr" for="misconception-q">Search misconceptions by words</label><input class="v-input" id="misconception-q" name="q" type="search" placeholder="Words, such as adding fractions" autocomplete="off">
<button class="v-btn is-small" type="submit">Find</button>
</form>
<div id="misconceptions-found" class="found"></div>`}
${credits([...chosen.map((item) => item.source), ...(locked || chosen.length >= 8 ? [] : [MISCONCEPTIONS_SOURCE])])}
${say()}
</div>`;
}

// A section's own help level, note and moments the AI writes first at. A note about one person would go to a model, so it says who to write about.
function sectionsBlock(activity, sections, code, steps) {
  if (!sections.length) return '';
  const own = activity.teaching?.sections || {};
  const speaks = (section) => (own[section.id]?.speaks_up === 'off' ? 'off' : own[section.id]?.speaks_up ? 'own' : '');
  const levels = [{ value: '', label: 'As the activity' }, ...HELP_LADDER.map((level) => ({ value: level.id, label: level.name }))];
  const differ = sections.filter((section) => own[section.id]);
  return `<details class="for-sections" id="for-sections"${differ.length ? ' open' : ''}><summary>Different for a section${differ.length ? `: ${esc(differ.map((section) => section.name).join(', '))}` : ''}</summary>
<small class="v-note">Write about the group, not one learner: notes go to the AI model.</small>
${sections.map((section) => `<div class="kind-fields"><div class="for-section"><strong>${esc(section.name)}</strong><a href="/console/api/courses/${esc(code)}/try?section=${esc(encodeURIComponent(section.key))}&amp;open=${esc(activity.key)}" target="_blank" rel="noopener">Try it as this group</a></div>
${choose(`teaching.sections.${section.id}.help`, 'How much the AI does', own[section.id]?.help ?? '', levels, { form: FORM })}
${text(`teaching.sections.${section.id}.note`, 'A note the AI reads for this group', own[section.id]?.note, { rows: 2, maxlength: 500, form: FORM })}
${choose(`teaching.sections.${section.id}.speaks`, 'When the AI writes first', speaks(section), [{ value: '', label: 'As the activity' }, { value: 'off', label: 'Never, for this group' }, { value: 'own', label: 'At moments of its own' }], { form: FORM })}
<div data-show-when="teaching.sections.${esc(section.id)}.speaks=own" data-form="${FORM}">${speaksUpPart(activity, steps, { base: `teaching.sections.${section.id}.speaks_up`, set: speaks(section) === 'own' ? own[section.id].speaks_up : {}, legend: `${section.name}’s moments`, id: `speaks-up-${section.id}`, note: false })}</div>
</div>`).join('')}</details>`;
}

const readsBlock = (activity, api, sections, steps) => {
  const taught = teachingContext(activity.teaching);
  const speaks = Object.keys(SPEAK_UP).filter((kind) => activity.teaching?.speaks_up?.[kind]);
  const own = sections.filter((section) => activity.teaching?.sections?.[section.id]);
  return `<aside class="reads" aria-labelledby="reads-title">
<h2 id="reads-title">What the AI is told</h2>
<p class="v-note">Your settings here, in the words the AI gets with every message. You don’t edit it: change a setting and it changes too, before you save.</p>
<pre class="said" id="reads-now" data-reads="${api}/reads" aria-live="polite">${esc(taught?.text || 'Nothing yet: set a goal or how much the AI does.')}</pre>
${steps.filter((step) => step.has_ai && (step.brief || step.says)).map((step, index) => `<details class="for-group" id="reads-step-${index}"><summary>And in “${esc(step.title)}”</summary><pre class="said">${esc([step.brief ? `In this step: ${step.brief}` : '', step.says ? `You began this step by saying: “${step.says}”` : ''].filter(Boolean).join('\n'))}</pre></details>`).join('')}
${own.map((section) => `<details class="for-group"><summary>For ${esc(section.name)}</summary><pre class="said">${esc(teachingContext(activity.teaching, section.id)?.text || '')}</pre></details>`).join('')}
<h3>Try a moment</h3>
<p class="v-note">Type what a learner might say${speaks.length ? ', or pick a moment the AI writes first' : ''}, and see what the AI would be told then. No model is called, so it costs nothing.</p>
<form class="moment" id="try-moment" data-search="${api}/brief" data-into="moment-found">
<label class="sr" for="moment-q">What a learner might say</label><textarea class="v-input" id="moment-q" name="message" rows="2" placeholder="e.g. is 1/2 + 1/3 = 2/5?"></textarea>
<div class="moment-go"><button class="v-btn is-small" type="submit">Show me</button>${speaks.length ? `<span class="v-note">or when it writes first:</span>${speaks.map((kind) => `<button class="v-btn is-small is-quiet" type="submit" name="event" value="${kind}">${esc({ quiet: 'Quiet', wrong: 'Wrong answer', handed_in: 'Handed in' }[kind])}</button>`).join('')}` : ''}</div>
</form>
<div id="moment-found"></div>
</aside>`;
};

// What fewer teachers need, in one place that says what is set inside it: the rest of what reaches the AI, and what reaches the teacher.
function moreForTheAi({ activity, api, locked, sections, code, tools, off, hears, reads, simple, onForm, steps = [] }) {
  const t = activity.teaching || {};
  const count = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : '');
  const set = [t.standard ? (t.standard.code || (t.standard.kind === 'skill' ? 'a skill' : 'a standard')) : '', count(t.misconceptions?.length, 'misconception', 'misconceptions'), count(t.guidance?.length, 'piece of research', 'pieces of research'), count(Object.keys(t.sections || {}).length, 'section of its own', 'sections of their own'), count(off.length, 'tool off', 'tools off'), t.turn_brief === false ? 'every setting with every message' : '', t.watch_for ? 'something to hear about' : ''].filter(Boolean);
  return `<details class="more-ai" id="more-ai"${set.length ? ' data-set' : ''}><summary><strong>More ways to shape the AI</strong><small>${set.length ? `Set here: ${esc(set.join(', '))}` : 'A standard or skill, misconceptions, research, a section of its own, what it may use'}</small></summary>
<div class="fields">
${onForm(toggle('teaching.turn_brief', 'Give the AI only what each moment needs', t.turn_brief !== false, { hint: 'It reads what the learner just did, then gets your goal and limit, a teaching move, and only the parts of your settings this message calls for. Off, it gets all of them with every message.' }))}
${text('teaching.watch_for', 'What you want to hear about', t.watch_for, { rows: 2, maxlength: 500, form: FORM, hint: 'For you, in Progress. It is never sent to the AI.' })}
${sectionsBlock(activity, sections, code, steps)}
${tools.length ? `<fieldset class="one-of"><legend class="v-label">What the AI may not use here</legend><div class="tools">${tools.map((name) => onForm(toggle('teaching.tools_off', TOOL_WORDS[name], off.includes(name), { value: name }))).join('')}</div></fieldset>` : ''}
${simple ? '' : `<fieldset class="one-of"><legend class="v-label">How learners may talk to it</legend><div class="tools">
${onForm(toggle('voice_on', 'Speak to it', hears && activity.voice?.input !== false, { hint: hears ? 'A microphone beside the message box.' : 'Needs a model that hears learners, in Models.', disabled: !hears }))}
${onForm(toggle('images_on', 'Attach photos', Boolean(reads.images) && activity.attachments?.images !== false, { hint: reads.images ? 'Such as a photo of their working.' : 'Needs a reply model that reads images, in Models.', disabled: !reads.images }))}
${onForm(toggle('files_on', 'Attach PDFs', Boolean(reads.files) && activity.attachments?.files !== false, { hint: reads.files ? 'Up to 8 MB each.' : 'Needs a reply model that reads PDFs, in Models.', disabled: !reads.files }))}
</div></fieldset>`}
</div>
${standardBlock(activity, api, locked)}
${misconceptionsBlock(activity, api, locked)}
${guidanceBlock(activity, api, locked)}
</details>`;
}

async function activityBody({ library, classes, records, settings, origin, simple, url, agentPage }, match) {
  const entry = await courseAt(library, match[1]);
  const { doc, meta, code } = entry;
  const found = activityIn(doc, match[2]);
  const activity = { ...found.activity, key: match[2] };
  const api = `courses/${esc(code)}/activities/${esc(activity.key)}`;
  const locked = !classes.saving;
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
  const sections = await classes.sections(code);
  return {
    title: activity.title,
    body: `<nav class="crumbs" aria-label="Where you are"><a href="/console/courses">Courses</a> / <a href="/console/courses/${esc(code)}">${esc(doc.course.title)}</a></nav>
<h1>${esc(activity.title)}</h1>
<div class="share-line"><a class="v-pill status-pill" href="#details" data-tip="Open, hide or schedule it">${esc({ open: 'Open', hidden: 'Hidden', scheduled: 'Scheduled' }[release])}</a><a class="v-btn is-small" href="/console/api/courses/${esc(code)}/try/${esc(activity.key)}" target="_blank" rel="noopener">Try it</a><a class="v-btn is-small" href="/console/ask?course=${esc(code)}&amp;activity=${esc(activity.key)}">Ask about it</a></div>
<form id="${FORM}" data-api="PUT ${api}" data-guard data-together data-say-in="save-bar"><input type="hidden" name="version" value="${meta.version}"></form>
${beforeBlock(doc, activity)}
<div class="act-tabs" role="tablist" aria-label="This activity">
<button type="button" role="tab" id="tab-btn-learners" aria-controls="tab-learners" data-tab="learners" aria-selected="true">What learners do<span class="tab-dot" aria-hidden="true"></span></button>
<button type="button" role="tab" id="tab-btn-ai" aria-controls="tab-ai" data-tab="ai" aria-selected="false" tabindex="-1">How the AI helps<span class="tab-dot" aria-hidden="true"></span></button>
<button type="button" role="tab" id="tab-btn-details" aria-controls="tab-details" data-tab="details" aria-selected="false" tabindex="-1">Details<span class="tab-dot" aria-hidden="true"></span></button>
</div>
<div class="act-panel" id="tab-learners" role="tabpanel" aria-labelledby="tab-btn-learners">
${await designBlock(activity, code)}
${flowBlock({ doc, code, activity, api, locked, version: meta.version, hasAi: Boolean(agent), asked: url?.searchParams.get('kind') })}
</div>
<div class="act-panel" id="tab-ai" role="tabpanel" aria-labelledby="tab-btn-ai" hidden>
<div class="two-sides">
<div class="edit">
<section class="block" aria-labelledby="help-title">
<h2 id="help-title" class="sr">How the AI helps</h2>
${agent ? `<div class="fields">
${text('teaching.goal', 'Goal', activity.teaching?.goal, { rows: 2, maxlength: 1000, form: FORM, placeholder: 'e.g. Explain each step of a two-step word problem in their own words.', hint: 'What learners should be able to do by the end.' })}
${ladderPart(activity.teaching?.help)}
${speaksUpPart(activity, flowOf(doc, activity))}
${text('teaching.role', 'Who the AI is here', activity.teaching?.role, { rows: 2, maxlength: 600, form: FORM, placeholder: 'e.g. A friendly skeptic who asks for evidence', hint: 'Optional. A role gives a conversation a reason: a skeptic, a beginner to teach, someone in a scene.' })}
</div>` : ''}
<div class="fields which-ai">
${choose('agent_ref', 'Which AI', activity.agent_ref ?? '', [...(kind === 'chat' ? [] : [{ value: '', label: 'No AI in this activity' }]), ...agents.map((item) => ({ value: item.ref, label: item.name, hint: item.description || '' }))], { form: FORM })}
${aiFlowPart(agent, agent ? (simple ? agentPage?.(agent.ref) : `/console/agents/${(agents.find((item) => item.ref === agent.ref) || {}).slug || agent.ref}`) : null, simple)}
${reviewerPart(agent, activity, onForm)}
</div>
${agent ? moreForTheAi({ activity, api, locked, sections, code, tools, off, hears, reads, simple, onForm, steps: flowOf(doc, activity) }) : ''}
</section>
${records?.tried && agent ? `<details class="block tried" id="tried" data-load="${api}/tried"><summary><strong>What the AI did in your tries</strong><small>Each message you sent with Try it, with what the Harness read, each draft and what the reviewer said. Kept with the run, so it is here in any browser.</small></summary><div data-loaded><p class="v-note">Loading…</p></div></details>` : ''}
</div>
<div class="beside">${readsBlock(activity, api, sections, flowOf(doc, activity))}</div>
</div>
</div>
<div class="act-panel narrow" id="tab-details" role="tabpanel" aria-labelledby="tab-btn-details" hidden>
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
<section class="block" aria-labelledby="about-title">
<h2 id="about-title">How it shows on the course</h2>
<div class="fields">
${text('title', 'Title', activity.title, { required: true, maxlength: 160, form: FORM })}
${text('summary', 'A line about it', activity.summary, { maxlength: 600, form: FORM, hint: 'On the course’s home: what they will do, in words that make them want to.' })}
<div class="fields two">
${text('minutes', 'Minutes it takes', activity.minutes ?? '', { type: 'number', min: 1, max: 600, form: FORM })}
${units.length ? choose('unit_ref', 'Unit', activity.unit_ref ?? '', [{ value: '', label: 'None' }, ...units.map((unit) => ({ value: unit.ref, label: unit.title }))], { form: FORM }) : ''}
</div>
</div>
</section>
<section class="block" aria-labelledby="more-title" data-say-box>
<h2 id="more-title">More</h2>
<div class="actions">
<button class="v-btn is-small" type="button" data-api="POST ${api}/copy" ${locked ? 'disabled' : ''}>Make a copy</button>
<button class="v-btn is-small" type="button" data-api="DELETE ${api}" data-confirm="Archive “${esc(activity.title)}”? Learners can’t open it. It waits under Archived at the foot of the course, to restore or delete." data-yes="Archive" ${locked ? 'disabled' : ''}>Archive it</button>
</div>${say()}
</section>
</div>
<div class="save-bar" id="save-bar" data-save-bar><button class="v-btn is-primary" type="submit" form="${FORM}" disabled${locked ? ' data-locked' : ''}>Save</button><span class="v-note" data-when-changed>Not saved yet.</span><span class="v-note" data-when-saved>Learners get what you save on their next message.</span>${say()}</div>
`,
    css: `${ACTIVITY_CSS}\n${TRACE_CSS}`,
    script: ACTIVITY_SCRIPT
  };
}

// Three parts of one form, as tabs: the one in the address opens (a part's own name, or anything inside it), and one holding
// something not saved yet has a dot. The AI's words follow the form: what changes shows beside it before anything is saved,
// with no model called.
const ACTIVITY_SCRIPT = String.raw`(() => {
  const tabs = () => [...document.querySelectorAll('.act-tabs [role=tab]')];
  const show = (id, focus) => {
    for (const tab of tabs()) {
      const on = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = document.getElementById('tab-' + tab.dataset.tab);
      if (panel) panel.hidden = !on;
      if (on && focus) tab.focus();
    }
  };
  const fromAddress = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (tabs().some((tab) => tab.dataset.tab === id)) return id;
    const inside = id && document.getElementById(id);
    const panel = inside && inside.closest('.act-panel');
    return panel ? panel.id.slice(4) : null;
  };
  const go = () => { const id = fromAddress(); if (id) show(id); };
  document.addEventListener('click', (event) => {
    const tab = event.target.closest && event.target.closest('.act-tabs [role=tab]');
    if (!tab) return;
    history.replaceState(null, '', '#' + tab.dataset.tab);
    show(tab.dataset.tab);
  });
  document.addEventListener('keydown', (event) => {
    const tab = event.target.closest && event.target.closest('.act-tabs [role=tab]');
    if (!tab) return;
    const all = tabs();
    const at = all.indexOf(tab);
    const next = { ArrowRight: all[(at + 1) % all.length], ArrowLeft: all[(at - 1 + all.length) % all.length], Home: all[0], End: all[all.length - 1] }[event.key];
    if (!next) return;
    event.preventDefault();
    history.replaceState(null, '', '#' + next.dataset.tab);
    show(next.dataset.tab, true);
  });
  window.addEventListener('hashchange', () => { go(); const bar = document.querySelector('.act-tabs'); if (bar && fromAddress()) bar.scrollIntoView({ block: 'nearest' }); });
  go();
  const changed = (item) => (['checkbox', 'radio'].includes(item.type) ? item.checked !== item.defaultChecked : item.tagName === 'SELECT' ? [...item.options].some((option) => option.selected !== option.defaultSelected) : item.type !== 'hidden' && item.type !== 'file' && item.value !== item.defaultValue);
  const dots = () => { for (const tab of tabs()) { const panel = document.getElementById('tab-' + tab.dataset.tab); tab.classList.toggle('is-changed', Boolean(panel) && [...panel.querySelectorAll('input[name],select[name],textarea[name]')].some(changed)); } };
  document.addEventListener('input', dots);
  document.addEventListener('change', dots);
  document.addEventListener('viable:refreshed', dots);
  let timer = 0;
  const follow = async () => {
    const now = document.getElementById('reads-now');
    const form = document.getElementById('activity');
    if (!now || !form) return;
    const value = (name) => { const field = form.elements[name] || [...form.elements].find((item) => item.name === name); if (!field) return null; return field.value ?? null; };
    const help = [...document.querySelectorAll('input[type=radio][name="teaching.help"]')].find((item) => item.checked)?.value ?? null;
    try {
      const answer = await window.viableConsole.call('POST ' + now.dataset.reads, { goal: document.querySelector('[name="teaching.goal"]')?.value ?? '', role: document.querySelector('[name="teaching.role"]')?.value ?? '', help });
      // What changed is marked for a moment, so a choice shows where it lands.
      const before = now.textContent.split('\n\n');
      const parts = String(answer.text).split('\n\n');
      now.replaceChildren(...parts.flatMap((part, index) => {
        const node = before.includes(part) ? document.createTextNode(part) : Object.assign(document.createElement('mark'), { textContent: part });
        return index < parts.length - 1 ? [node, document.createTextNode('\n\n')] : [node];
      }));
      // The box scrolls to what changed, in itself only.
      const changed = now.querySelector('mark');
      if (changed) now.scrollTop += changed.getBoundingClientRect().top - now.getBoundingClientRect().top - 8;
    } catch { /* it stays as it was */ }
  };
  document.addEventListener('input', (event) => { if (!/^teaching\.(goal|role|help)$/.test(event.target.name || '')) return; clearTimeout(timer); timer = setTimeout(follow, 350); });
})();`;

const ACTIVITY_CSS = `.act-tabs{display:flex;gap:4px;margin:18px 0 6px;border-bottom:1px solid var(--public-rule);overflow-x:auto;scrollbar-width:none}
.act-tabs [role=tab]{position:relative;flex:none;padding:10px 14px 11px;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;background:none;color:var(--muted);font:inherit;font-size:.9375rem;font-weight:500;cursor:pointer;transition:color .15s var(--ease-out),border-color .15s var(--ease-out)}
.act-tabs [role=tab]:hover{color:var(--public-ink)}
.act-tabs [role=tab][aria-selected=true]{border-bottom-color:var(--ink-blue);color:var(--public-ink);font-weight:600}
.act-tabs [role=tab]:focus-visible{outline:2px solid var(--ink-blue);outline-offset:-2px;border-radius:var(--radius-sm)}
.tab-dot{display:none;position:absolute;top:9px;right:4px;width:6px;height:6px;border-radius:50%;background:var(--query-ochre)}
.act-tabs .is-changed .tab-dot{display:block}
.act-panel[hidden]{display:none}
.act-panel.narrow,#tab-learners{max-width:760px}
.status-pill{text-decoration:none}
.status-pill:hover{box-shadow:inset 0 0 0 1px var(--ink-blue-line)}
.before{margin-top:16px}
.two-sides{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,330px);gap:clamp(24px,4vw,48px);align-items:start}
.beside{position:sticky;top:20px;display:grid;gap:14px;margin-top:22px;max-height:calc(100vh - 40px);overflow:auto;scrollbar-width:thin}
.before{display:grid;gap:8px;padding:16px 18px;border:1px solid var(--public-rule);border-radius:var(--radius)}
.before h2{font-size:1rem;font-weight:600;letter-spacing:0}
.before ul{display:grid;gap:8px;margin:0;padding:0;list-style:none;font-size:.9rem;line-height:1.45}
.before li{position:relative;padding-left:14px;color:var(--public-text)}
.before li::before{content:"";position:absolute;left:0;top:.55em;width:6px;height:6px;border-radius:50%;background:var(--public-rule-strong)}
.before li.is-fix::before{background:var(--pencil-red)}
.design{margin-top:18px;font-size:.9375rem}
.design summary{color:var(--ink-blue);cursor:pointer}
.design summary strong{color:var(--public-ink);font-weight:600}
.design summary .v-note{color:var(--muted)}
.design p{margin:8px 0 0;line-height:1.5}
.designs{display:grid;gap:0;margin:10px 0 0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.designs li{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--public-rule)}
.designs div{display:grid;gap:2px;min-width:0}
.designs strong{color:var(--public-ink);font-weight:600}
.designs small{color:var(--muted);font-size:.8125rem;line-height:1.4}
.designs .v-btn{flex:none}
.flow{display:grid;gap:0;margin:0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.flow-step{border-bottom:1px solid var(--public-rule)}
.page .flow-step>details>summary{display:grid;grid-template-columns:28px minmax(0,1fr) 12px;gap:12px;align-items:center;padding:12px 2px;cursor:pointer}
.page .flow-step>details>summary::before{display:none}
.page .flow-step>details>summary::after{content:"";width:.5em;height:.5em;border-right:1.5px solid var(--muted);border-bottom:1.5px solid var(--muted);transform:rotate(-45deg);transition:transform .14s var(--ease-out)}
.page .flow-step>details[open]>summary::after{transform:rotate(45deg)}
.flow-n{display:grid;place-items:center;width:28px;height:28px;border:1px solid var(--public-rule-strong);border-radius:50%;color:var(--public-ink);font-size:.875rem;font-variant-numeric:tabular-nums}
.flow-what{display:grid;gap:1px;min-width:0}
.flow-what strong{color:var(--public-ink);font-weight:600}
.flow-what small{color:var(--muted);font-size:.8125rem}
.flow-form{padding:4px 0 18px 40px}
.flow-alone{gap:14px}
.flow-add{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}
.flow-add .say{flex-basis:100%}
.step-ai{display:grid;gap:14px;padding:14px 16px;border-left:2px solid var(--public-rule)}
.step-ai[hidden]{display:none}
.step-questions{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:var(--radius-sm);background:var(--field-mist)}
.step-questions>div{display:grid;gap:2px;min-width:0}
.step-questions strong{color:var(--public-ink);font-weight:600}
.step-questions small{color:var(--muted);font-size:.8125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.step-hints{align-content:end;padding-bottom:6px}
.ladder,.speaks{display:grid;gap:10px;min-width:0;margin:0;padding:0;border:0}
.ladder>legend,.speaks>legend{margin-bottom:6px;padding:0}
.speaks-pick .v-label{color:var(--public-text);font-weight:500}
.ladder-scale{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:10px;margin-top:2px}
.ladder-scale .end{padding-top:1px;color:var(--muted);font-size:.8125rem}
.stops{position:relative;display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}
.stops::before{content:"";position:absolute;left:10%;right:10%;top:9px;border-top:1.5px solid var(--public-rule-strong)}
.stop{position:relative;display:grid;justify-items:center;align-content:start;gap:7px;padding:0 2px;text-align:center;cursor:pointer}
.stop input{position:absolute;width:1px;height:1px;opacity:0}
.stop .dot{position:relative;width:19px;height:19px;border:1.5px solid var(--public-rule-strong);border-radius:50%;background:var(--surface);transition:background .15s var(--ease-out),border-color .15s var(--ease-out),box-shadow .15s var(--ease-out)}
.stop .name{color:var(--public-text);font-size:.8125rem;line-height:1.3}
.stop:hover .dot{border-color:var(--ink-blue)}
.stop input:checked+.dot{border-color:var(--ink-blue);background:var(--ink-blue);box-shadow:0 0 0 4px var(--ink-blue-line)}
.stop input:checked~.name{color:var(--ink-blue);font-weight:600}
.stop input:focus-visible+.dot{outline:2px solid var(--ink-blue);outline-offset:3px}
.ladder-changes{padding-left:10px;border-left:2px solid var(--ink-blue-line)}
.unset{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:.875rem}
.ladder-says{padding:12px 14px;border-radius:var(--radius-sm);background:var(--field-mist)}
.ladder-says[hidden]{display:none}
.ladder-says p{margin:0;color:var(--public-text);line-height:1.5}
.ladder-says p+p{margin-top:4px}
.ladder-says strong{color:var(--public-ink);font-weight:600}
.speaks-pick{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.speaks-pick[hidden]{display:none}
.speaks-writing,.speaks-often{padding:12px 14px;border-radius:var(--radius-sm);background:var(--field-mist)}
.which-ai{margin-top:22px;padding-top:18px;border-top:1px solid var(--public-rule)}
.ai-flow-part{display:grid;gap:8px}
.ai-flow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0;padding:0;list-style:none;font-size:.84rem}
.ai-flow li{display:inline-flex;align-items:center;gap:6px}
.ai-flow li:not(:last-child)::after{content:"→";color:var(--muted)}
.ai-flow span{padding:3px 10px;border-radius:999px;background:var(--field-mist);color:var(--public-text)}
.ai-flow .is-on span{background:var(--pass-soft);color:var(--pass-green);font-weight:600}
.more-ai{margin-top:22px;padding-top:16px;border-top:1px solid var(--public-rule)}
.more-ai>summary{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;row-gap:2px;cursor:pointer}
.more-ai>summary small{grid-column:2}
.more-ai>summary strong{color:var(--ink-blue);font-weight:600}
.more-ai>summary small{color:var(--muted);font-size:.8125rem;line-height:1.4}
.more-ai[open]>summary{margin-bottom:16px}
.tried>summary{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;row-gap:2px;cursor:pointer}
.tried>summary strong{color:var(--public-ink);font-size:1.0625rem;font-weight:600}
.tried>summary small{grid-column:2;color:var(--muted);font-size:.8125rem;line-height:1.4}
.tried[open]>summary{margin-bottom:14px}
.tried-list{display:grid;gap:14px;margin:0;padding:0;list-style:none}
.tried-list>li{padding:14px 16px;border:1px solid var(--public-rule);border-radius:var(--radius)}
.tell-ask{margin:10px 0 0}
.moment-go{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.said mark{border-radius:3px;background:var(--query-soft);color:inherit;animation:said-new 2.8s ease-out forwards}
@keyframes said-new{0%,55%{background:var(--query-soft)}100%{background:transparent}}
@media (prefers-reduced-motion:reduce){.said mark{animation:none}}
.reads{display:grid;gap:10px;padding:18px;border-radius:var(--radius);background:var(--field-mist)}
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
.find .v-menu-button{flex:0 0 auto;width:auto;min-height:38px;padding:6px 12px}
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
.source-note{min-width:0;margin:6px 0 0;color:var(--muted);font-size:.8125rem;line-height:1.45;overflow-wrap:anywhere}
.chosen>div,.picked li>div{min-width:0}
.source-note summary{width:fit-content;cursor:pointer}
.source-note summary:hover{color:var(--public-ink)}
.source-note p,.chosen .source-note p,.picked .source-note p{margin:6px 0 0;color:var(--muted);font-size:.8125rem;line-height:1.5}
.library{display:grid;gap:10px}
.library summary,.framework summary,.shows summary{color:var(--ink-blue);font-size:.9375rem;cursor:pointer}
.framework{margin-top:10px}
.framework summary strong{color:var(--public-ink);font-weight:600}
.framework summary small{color:var(--muted)}
.framework>.v-note,.shows{margin:8px 0}
.shows p{margin:6px 0 0;color:var(--public-text);font-size:.875rem;line-height:1.5}
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
.save-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:26px -10px 0;padding:12px 10px}
.save-bar.is-changed,.save-bar.is-saved{position:sticky;bottom:0;z-index:2;background:color-mix(in srgb,var(--page,var(--public-page)) 92%,transparent);backdrop-filter:blur(6px)}
.save-bar [data-when-changed],.save-bar.is-changed [data-when-saved],.save-bar.is-saved [data-when-saved]{display:none}
.save-bar.is-changed [data-when-changed]{display:inline}
.danger{border-color:var(--pencil-red);color:var(--pencil-red)}
@media (max-width:980px){.two-sides{grid-template-columns:minmax(0,1fr)}.beside{position:static;margin-top:26px;max-height:none}}
@media (max-width:560px){.flow-form{padding-left:0}.designs li{flex-direction:column;align-items:flex-start}.ladder-scale{grid-template-columns:minmax(0,1fr);gap:6px}.stops{grid-template-columns:minmax(0,1fr);gap:10px}.stops::before{left:9px;right:auto;top:10px;bottom:10px;border-top:0;border-left:1.5px solid var(--public-rule-strong)}.stop{grid-template-columns:19px minmax(0,1fr);justify-items:start;align-items:center;gap:12px;text-align:left}}`;

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

// The moments as the menus say them (speaksUpPart). What a researcher wrote for a moment elsewhere (say) stays with it.
function speaksFrom(moments, held = {}) {
  if (!moments) return held;
  const kept = (name, value) => (value ? { ...value, ...(held[name]?.say ? { say: held[name].say } : {}) } : null);
  const writingAs = { ...(moments.how ? { how: moments.how } : {}), ...(moments.focus ? { focus: moments.focus } : {}) };
  return {
    quiet: kept('quiet', Number(moments.quiet) ? { minutes: Number(moments.quiet) } : null),
    alone: kept('alone', Number(moments.alone) ? { minutes: Number(moments.alone) } : null),
    wrong: kept('wrong', Number(moments.wrong) ? { after: Number(moments.wrong) } : null),
    right: kept('right', Number(moments.right) ? { every: Number(moments.right) } : null),
    writing: kept('writing', Number(moments.writing) ? { words: Number(moments.writing), ...writingAs } : null),
    handed_in: kept('handed_in', moments.handed_in === 'yes' ? writingAs : null),
    most: Number(moments.most) || held.most, gap: Number(moments.gap) || held.gap
  };
}

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
  const speaksUp = speaksFrom(teaching.speaks_up, activity.teaching?.speaks_up || {});
  // A section's own moments, from its menus, or never ('off'); as the activity, none of its own.
  const sections = teaching.sections && Object.fromEntries(Object.entries(teaching.sections).map(([id, entry]) => {
    const held = activity.teaching?.sections?.[id]?.speaks_up;
    const speaks = entry.speaks === undefined ? held : entry.speaks === 'off' ? 'off' : entry.speaks === 'own' ? speaksFrom(entry.speaks_up, held && held !== 'off' ? held : {}) : null;
    return [id, { help: entry.help, note: entry.note, ...(speaks ? { speaks_up: speaks } : {}) }];
  }));
  const reviewer = teaching.reviewer_reads === undefined ? activity.teaching?.reviewer_reads : teaching.reviewer_reads;
  withTeaching(activity, { ...(teaching.role !== undefined ? { role: teaching.role } : {}), ...(teaching.goal !== undefined ? { goal: teaching.goal } : {}), help: teaching.help === undefined ? activity.teaching?.help ?? null : teaching.help || null, ...(teaching.watch_for !== undefined ? { watch_for: teaching.watch_for } : {}), tools_off: teaching.tools_off ?? activity.teaching?.tools_off ?? [], turn_brief: teaching.turn_brief === false ? false : undefined, ...(sections ? { sections } : {}), speaks_up: speaksUp || null, reviewer_reads: reviewer || null });
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
          const activity = { title, summary: null, role: 'instruction', agent_ref: agentsOf(draft)[0]?.ref ?? null, workspace: null, minutes: null, voice: null, attachments: null, teaching: agentsOf(draft)[0] ? teachingSettings({ help: 'step_up' }) : null, release: 'hidden', done_when: 'auto' };
          if (kind === 'questions') {
            const sets = draft.question_sets ||= [];
            const ref = newRef(title, new Set(sets.map((set) => set.ref)));
            sets.push({ ref, title, items: [] });
            activity.workspace = { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [{ id: 'questions', type: 'questions', title: null, set_ref: ref, feedback: 'each', tries: 3, hints: true, ai_sees: 'question' }] };
          } else if (kind === 'page') activity.workspace = { ai: activity.agent_ref ? 'right' : 'off', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [{ id: 'page', type: 'page', title: 'Read this', text: '' }] };
          else if (kind === 'writing') activity.workspace = { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [{ id: 'writing', type: 'writing', title: 'Your writing', prompt: '', rubric: [] }] };
          else if (kind === 'reading') activity.workspace = { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [] };
          else if (kind === 'embed') {
            if (!/^https:\/\//i.test(String(body.url ?? ''))) throw refused('A web page needs its whole https address.');
            activity.workspace = { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [{ id: 'page', type: 'embed', title: null, url: clean(body.url, 2000) }] };
          }
          (draft.course.activities ||= []).push(activity);
        }, `Added ${title}`);
        const added = doc.course.activities.at(-1);
        return { go: `${pagesPath(match[1], added.key)}${kind === 'reading' && !added.workspace ? '?kind=reading' : ''}` };
      }],
      ['PUT', /^courses\/([\w-]+)\/activities\/([\w-]+)$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], body?.version, (doc) => applyForm(activityIn(doc, match[2]).activity, body, doc), clean(body?.title, 80));
        return { said: 'Saved. Learners get it on their next message.' };
      }],
      // Archived: off the course and learners' pages, waiting at the foot of the course to be restored or deleted.
      ['DELETE', /^courses\/([\w-]+)\/activities\/([\w-]+)$/, async ({ library, classes }, match) => {
        let held = null;
        await changeCourse(library, match[1], null, (doc) => { const { index, list } = activityIn(doc, match[2]); [held] = list.splice(index, 1); held.key = match[2]; }, 'Archived an activity');
        if (library.keepActivity) await library.keepActivity((await courseAt(library, match[1])).id, held);
        else await classes.forgetActivity(match[1], match[2]);
        return { go: `/console/courses/${match[1]}?archived-activity=${encodeURIComponent(match[2])}#archived-activities` };
      }],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/release$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], body?.version, (doc) => { const { activity } = activityIn(doc, match[2]); activity.release = body.release === 'open' ? 'open' : 'hidden'; activity.opens_at = null; if (body.release === 'open' && activity.closes_at && Date.parse(activity.closes_at) <= Date.now()) activity.closes_at = null; }, body?.release === 'open' ? 'Opened an activity' : 'Hid an activity');
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
          const { key: _key, id: _id, ...rest } = structuredClone(activity);
          // Its own questions: a copy made to change into something else mustn't change the original.
          for (const panel of rest.workspace?.panels || []) {
            const set = panel.type === 'questions' && draft.question_sets?.find((item) => item.ref === panel.set_ref);
            if (!set) continue;
            const ref = newRef(`${set.title} copy`, new Set(draft.question_sets.map((item) => item.ref)));
            draft.question_sets.push({ ...structuredClone(set), ref, title: `${set.title} (copy)`.slice(0, 160) });
            panel.set_ref = ref;
          }
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
      // A step at a time: its own form, so a long activity isn't one long save.
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/steps$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], null, (doc) => addStep(doc, activityIn(doc, match[2]).activity, String(body?.kind ?? '')), 'Added a step');
        return { said: 'Added. Fill it in below.' };
      }],
      ['PUT', /^courses\/([\w-]+)\/activities\/([\w-]+)\/steps\/(\d+)$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], body?.version, (doc) => changeStep(doc, activityIn(doc, match[2]).activity, Number(match[3]), body || {}), 'Changed a step');
        return { said: 'Saved. Learners get it on their next visit.' };
      }],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/steps\/(\d+)\/move$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], null, (doc) => moveStep(activityIn(doc, match[2]).activity, Number(match[3]), Number(body?.by) || 0), 'Moved a step');
        return {};
      }],
      ['DELETE', /^courses\/([\w-]+)\/activities\/([\w-]+)\/steps\/(\d+)$/, async ({ library }, match) => {
        await changeCourse(library, match[1], null, (doc) => removeStep(doc, activityIn(doc, match[2]).activity, Number(match[3])), 'Removed a step');
        return { said: 'Removed.' };
      }],
      ['PUT', /^courses\/([\w-]+)\/activities\/([\w-]+)\/opening$/, async ({ library }, match, body) => {
        await changeCourse(library, match[1], body?.version, (doc) => openingFrom(activityIn(doc, match[2]).activity, body || {}), 'Changed what the AI says first');
        return { said: 'Saved.' };
      }],
      // What the AI would read with this goal, limit and role: for the page to follow what is being typed. Nothing is saved or called.
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/reads$/, async ({ library }, match, body) => {
        const { doc } = await courseAt(library, match[1]);
        const { activity } = activityIn(doc, match[2]);
        const taught = teachingContext({ ...activity.teaching, goal: clean(body?.goal, TEACHING_LIMITS.goal), role: clean(body?.role, TEACHING_LIMITS.role), help: body?.help || null });
        return { text: taught?.text || 'Nothing yet: set a goal or how much the AI does.' };
      }],
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
      ['GET', /^courses\/([\w-]+)\/activities\/([\w-]+)\/guidance-library$/, async ({ library }, match) => {
        const { doc, code } = await courseAt(library, match[1]);
        return { html: guidanceLibrary(activityIn(doc, match[2]).activity, `courses/${esc(code)}/activities/${esc(match[2])}`, (await research()).GUIDANCE) };
      }],
      ['POST', /^courses\/([\w-]+)\/activities\/([\w-]+)\/guidance$/, async ({ library }, match, body) => {
        const framework = (await research()).GUIDANCE.find((item) => item.id === body?.component);
        const number = Number(body?.item);
        if (!framework || !Number.isInteger(number) || number < 1 || number > framework.runs.items.length) throw refused('That guidance isn’t here.', 404, 'guidance_not_found');
        const [taken] = guidanceFrom(framework, { chosen: [number] });
        await changeCourse(library, match[1], null, (doc) => {
          const { activity } = activityIn(doc, match[2]);
          const held = activity.teaching?.guidance || [];
          if (held.some((item) => item.text === taken.text)) return;
          if (held.length >= TEACHING_LIMITS.guidance) throw refused(`An activity keeps at most ${TEACHING_LIMITS.guidance} pieces of guidance. Remove one first.`);
          withTeaching(activity, { guidance: [...held, taken] });
        }, 'Chose guidance from research');
        return { said: 'Added.' };
      }],
      ['DELETE', /^courses\/([\w-]+)\/activities\/([\w-]+)\/guidance\/(\d+)$/, async ({ library }, match) => {
        await changeCourse(library, match[1], null, (doc) => { const { activity } = activityIn(doc, match[2]); withTeaching(activity, { guidance: (activity.teaching?.guidance || []).filter((_, index) => index !== Number(match[3])) }); }, 'Removed guidance');
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
        const { findSkills, skillsSource } = await skills();
        const found = findSkills(url.searchParams.get('q') || '');
        const level = url.searchParams.get('level') || '2';
        const api = `courses/${esc(match[1])}/activities/${esc(match[2])}/standard`;
        return { html: found.data.length ? `<ul>${found.data.slice(0, 12).map((item) => `<li><button type="button" data-api="POST ${api}" data-body='${esc(JSON.stringify({ skill: item.code, level }))}'><strong>${esc(item.skill)} · ${esc(item.code)}</strong><span>${esc(item.description)}</span></button></li>`).join('')}</ul>${credits([skillsSource()])}` : '<p class="v-note">No skill matches. Try other words.</p>' };
      }],
      ['GET', /^courses\/([\w-]+)\/activities\/([\w-]+)\/find-misconception$/, async ({ url }, match) => {
        const found = (await misconceptions()).findMisconceptions(url.searchParams.get('q') || '');
        const api = `courses/${esc(match[1])}/activities/${esc(match[2])}/misconceptions`;
        return { html: found.data.length ? found.data.map((construct) => `<h4>${esc(construct.description)}</h4><ul>${construct.misconceptions.slice(0, 6).map((item) => `<li><button type="button" data-api="POST ${api}" data-body='${esc(JSON.stringify({ id: item.id }))}'>${esc(item.description)}</button></li>`).join('')}</ul>`).join('') : '<p class="v-note">Nothing matches. Try other words.</p>' };
      }],
      // The teacher's own tries of it, the latest first, as What the AI did draws them: from what each run kept.
      ['GET', /^courses\/([\w-]+)\/activities\/([\w-]+)\/tried$/, async ({ library, records }, match) => {
        const { code, doc } = await courseAt(library, match[1]);
        const { activity } = activityIn(doc, match[2]);
        const turns = records?.tried ? await records.tried(code, match[2]) : [];
        if (!turns.length) return { html: '<p class="v-note">Nothing yet. Open Try it, write to the AI as a learner would, and each reply shows here with what happened behind it.</p>' };
        // A reply that isn't what the teacher wanted goes to Ask with what happened, for them to say what they wanted: their own try, never a learner's.
        const tellAsk = (events) => {
          const turn = events.find((event) => event.kind === 'turn') || {};
          const reached = events.find((event) => event.kind === 'reached');
          const held = events.filter((event) => event.kind === 'round' && event.round.verdict === 'fail').map((event) => event.round.feedback).filter(Boolean);
          const cut = (text, n) => (String(text || '').length > n ? `${String(text).slice(0, n)}…` : String(text || ''));
          const said = [`In a try of “${activity.title}”, ${turn.first ? `the AI wrote first (${(SPEAK_UP[turn.first]?.label || '').toLowerCase()})` : `I wrote as a learner: “${cut(turn.message, 300)}”`}.`, `The AI replied: “${cut(reached?.text, 400)}”.`, held.length ? `Its reviewer held back a draft: “${cut(held[0], 200)}”.` : '', 'That isn’t what I wanted: '].filter(Boolean).join(' ');
          return `<p class="tell-ask"><a class="v-btn is-small" href="/console/ask?course=${esc(code)}&amp;activity=${esc(match[2])}#say=${esc(encodeURIComponent(said))}">Not what you wanted? Tell Ask</a></p>`;
        };
        return { html: `<ol class="tried-list">${turns.reverse().map((turn, index) => `<li>${treeHtml(turnTree(turn.events, { fold: true, open: index === 0 }))}${tellAsk(turn.events)}</li>`).join('')}</ol>` };
      }],
      ['GET', /^courses\/([\w-]+)\/activities\/([\w-]+)\/brief$/, async ({ library, url }, match) => {
        const { doc } = await courseAt(library, match[1]);
        const { activity } = activityIn(doc, match[2]);
        const message = clean(url.searchParams.get('message'), 1000);
        // Or a moment the AI writes first at, with no words of a learner's.
        const event = Object.hasOwn(SPEAK_UP, url.searchParams.get('event') || '') ? url.searchParams.get('event') : null;
        if (!message && !event) return { html: '<p class="v-note">Type something first.</p>' };
        const { turnBrief } = await import('../../../harness/src/brief.js');
        const brief = await turnBrief(activity.teaching, { message: event ? '' : message, event });
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
