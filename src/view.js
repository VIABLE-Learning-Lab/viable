/**
 * The teacher's view: one self-contained HTML page that shows what the AI did with a class and why,
 * from learner records (schemas/learning-events.schema.json) and run traces (`run --json`). How the
 * AI helps as the teacher set it, what VETTING did with each reply, each learner's measures with what
 * they mean, and misconceptions heard. The page loads nothing from the internet, and every piece of
 * text from the data is escaped: learners and models wrote it.
 */
import { HELP_LEVELS, teachingSettings } from './utils/teaching.js';
import { METRICS, METRICS_VERSION } from './utils/researchMetrics.js';
import { measureLearner } from './measures.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const empty = (text) => `<p class="empty">${text}</p>`;
const quote = (text) => (text ? `<blockquote>${esc(text)}</blockquote>` : '<p class="muted">(none in the trace)</p>');

const HELP_NAMES = { ask_first: 'Ask first', hint: 'Hint', explain: 'Explain', check_only: 'Only check' };
// The VETTING step's own words for its exits (src/agents/steps/vetting.js).
export const OUTCOMES = {
  passed: ['Passed', 'the reviewer approved the reply'],
  unverified: ['Unverified', 'attempts ran out or a review couldn’t run'],
  attention: ['Needs attention', 'the reply model flagged a safety concern and wrote a caring reply, which isn’t reviewed']
};
export const VERDICTS = { pass: 'Passed', fail: 'Did not pass', error: 'The review couldn’t run', safety: 'Safety concern, not reviewed' };

/** Sorts files by shape: learner records (events), run traces (steps) and a course package's first activity with teaching settings. */
export function viewInputs(files) {
  const records = [];
  const runs = [];
  let activity = null;
  for (const { name, doc } of files) {
    if (doc?.format === 'viable.course-package') activity ??= (doc.course?.activities || []).find((item) => item?.teaching) ?? null;
    else if (Array.isArray(doc?.steps)) runs.push(doc);
    else if (Array.isArray(doc?.events)) records.push(doc);
    else throw new Error(`${name} isn't a learner record (learning events), a run's trace (run --json) or a course package.`);
  }
  // Without a package, the settings a run used.
  const ran = runs.find((run) => run.teaching);
  return { records, runs, teaching: activity?.teaching ?? ran?.teaching ?? null, title: activity?.title ?? ran?.activity ?? null };
}

function sourceNote(sources) {
  const lines = [...new Set(sources.flatMap((source) => [source.name, ...source.attribution]).filter(Boolean))];
  return lines.length ? `<p class="small muted">${lines.map(esc).join(' ')}</p>` : '';
}

function standardPart(standard) {
  const skill = standard.kind === 'skill';
  const where = skill
    ? (standard.level ? `level ${standard.level.number}${standard.level.name ? `, ${standard.level.name}` : ''}` : '')
    : [standard.jurisdiction, standard.grades.length ? `grade ${standard.grades.join(', ')}` : ''].filter(Boolean).join(', ');
  const list = (intro, items) => (items.length ? `<p>${intro}</p><ul>${items.map((item) => `<li>${item.code ? `${esc(item.code)}: ` : ''}${esc(item.description)}</li>`).join('')}</ul>` : '');
  return `<dt>${skill ? 'Durable skill' : 'Standard'}</dt><dd>
<p>${standard.code ? `<strong>${esc(standard.code)}</strong> ` : ''}${esc(standard.description)}${where ? ` <span class="muted">(${esc(where)})</span>` : ''}</p>
${list(skill ? 'At this level, the learner:' : 'It breaks into:', standard.learning_components.map(({ description }) => ({ description })))}
${list(skill ? 'The level before, to go back to when the learner needs it:' : 'Standards before it, to go back to when the learner needs them:', standard.prior)}
${sourceNote([standard.source])}</dd>`;
}

function teachingPart(settings) {
  if (!settings) return empty('No teaching settings were given. A course package, or a teaching settings file given with <code>--teaching</code>, would show here the goal, standard, help level and sections the AI is given.');
  const help = (level) => (level ? `<strong>${HELP_NAMES[level]}.</strong> The AI is told: “${esc(HELP_LEVELS[level])}”` : '<span class="muted">Not set: the agent’s own instructions decide.</span>');
  const rows = [
    settings.goal ? `<dt>Goal</dt><dd>${esc(settings.goal)}</dd>` : '',
    settings.standard ? standardPart(settings.standard) : '',
    `<dt>How far the AI may go</dt><dd>${help(settings.help)}</dd>`,
    settings.misconceptions ? `<dt>Misconceptions to listen for</dt><dd><ul>${settings.misconceptions.map((item) => `<li>${esc(item.description)} <span class="muted">(gets in the way of: ${esc(item.construct.description)})</span></li>`).join('')}</ul>${sourceNote(settings.misconceptions.map((item) => item.source))}</dd>` : '',
    settings.watch_for ? `<dt>What you want to hear about</dt><dd>${esc(settings.watch_for)}<p class="note">For you only: this is never sent to the AI.</p></dd>` : ''
  ];
  const sections = Object.entries(settings.sections || {});
  return `<p class="note">As the teacher set it. The AI is given the goal, the standard or skill, the misconceptions and the help level as part of the instructions of every step that writes a reply, and where the agent has a VETTING step, its reviewer checks replies against them too. They are instructions to the AI, not guarantees.</p>
<dl class="settings">${rows.join('')}</dl>
${sections.length ? `<h3>Sections with their own settings</h3>
<p class="note">A section’s own help level replaces the activity’s, and its note is added, for that section’s learners only; no other section’s AI is given them.</p>
<div class="scroll"><table>
<thead><tr><th scope="col">Section</th><th scope="col">How far the AI may go</th><th scope="col">Note to the AI</th></tr></thead>
<tbody>${sections.map(([id, own]) => `<tr><th scope="row"><code>${esc(id)}</code></th><td>${own.help ? help(own.help) : `<span class="muted">The activity’s${settings.help ? ` (${HELP_NAMES[settings.help]})` : ''}</span>`}</td><td>${own.note ? esc(own.note) : '<span class="muted">None</span>'}</td></tr>`).join('')}</tbody>
</table></div>` : ''}`;
}

function reviewsOf(runs) {
  return runs.flatMap((run, index) => (Array.isArray(run?.steps) ? run.steps : [])
    .filter((step) => step?.nodeType === 'vetting' && Object.hasOwn(OUTCOMES, String(step.output?.outcome)))
    .map((step) => ({ run: index + 1, agent: run.agent, step, message: typeof step.input?.message === 'string' ? step.input.message : run.steps.find((item) => item?.nodeType === 'input')?.output?.message, reply: run.output?.text })));
}

function reviewPart({ run, agent, step, message, reply }) {
  const { outcome, attempt_details: details, content } = step.output;
  const rounds = Array.isArray(details) ? details : [];
  const [label, why] = OUTCOMES[outcome];
  return `<article class="card ${outcome}">
<h4>Run ${run}${agent ? `, ${esc(agent)}` : ''}: <span class="outcome">${label}</span></h4>
<p class="muted">${label}: ${why}.</p>
<dl class="evidence">
<dt>The learner’s message</dt><dd>${quote(message)}</dd>
${rounds.map((round, i) => `<dt>Round ${esc(round.attempt ?? i + 1)}${i === 0 ? (round.source === 'draft' ? ', the draft (an earlier step’s answer)' : ', the draft') : ', a rewrite'}: <span class="verdict">${Object.hasOwn(VERDICTS, String(round.verdict)) ? VERDICTS[round.verdict] : esc(round.verdict)}</span></dt>
<dd>${quote(round.reply)}${round.feedback ? `<p><span class="label">The reviewer’s reason:</span> ${esc(round.feedback)}</p>` : ''}</dd>`).join('')}
<dt>Final reply (what the run replied)</dt><dd>${quote(reply || content || rounds.at(-1)?.reply)}</dd>
</dl></article>`;
}

function vettingPart(runs) {
  if (!runs.length) return empty('No runs were given. A run’s trace (the output of <code>viable-harness run --json</code>) would show here every reply VETTING reviewed, and the evidence for each one that didn’t pass.');
  const reviews = reviewsOf(runs);
  const untaught = runs.filter((run) => !run.teaching).length;
  const noTeaching = untaught ? `<p class="note">${untaught === runs.length ? 'None of these runs was' : `${count(untaught, 'run')} of ${runs.length} ${untaught === 1 ? 'was' : 'were'}`} given teaching settings.</p>` : '';
  if (!reviews.length) return `${empty(`None of these ${count(runs.length, 'run')} has a VETTING step, so no reply was reviewed by a second model. An agent with a VETTING step would show its reviews here.`)}${noTeaching}`;
  const tally = Object.fromEntries(Object.keys(OUTCOMES).map((key) => [key, reviews.filter((item) => item.step.output.outcome === key).length]));
  const flagged = reviews.filter((item) => item.step.output.outcome !== 'passed');
  return `<p class="note">VETTING has a second model review a reply before the learner sees it; a reply that fails is rewritten with the reviewer’s reason. ${count(reviews.length, 'reply', 'replies')} reviewed in ${count(runs.length, 'run')}.</p>${noTeaching}
<dl class="counts">${Object.entries(OUTCOMES).map(([key, [label]]) => `<div class="${key}"><dt>${label}</dt><dd>${tally[key]}</dd></div>`).join('')}</dl>
<h3>Replies that didn’t pass</h3>
${flagged.length ? flagged.map(reviewPart).join('\n') : empty('Every reviewed reply passed. A reply that was unverified or needs attention would show here with its evidence.')}`;
}

// One learner per ID: a learner's records (sessions, activities) are measured together.
function learnersOf(records) {
  const byId = new Map();
  records.forEach((record, index) => {
    const id = typeof record?.user === 'string' && record.user ? record.user : null;
    const key = id ?? index;
    const learner = byId.get(key) || { id, label: id ?? `Record ${index + 1} (it carries no learner ID)`, events: [], turns: [] };
    const objects = (list) => (Array.isArray(list) ? list.filter((item) => item && typeof item === 'object') : []);
    learner.events.push(...objects(record?.events));
    learner.turns.push(...objects(record?.turns));
    byId.set(key, learner);
  });
  return [...byId.values()];
}

const UNITS = { minutes: ' min', seconds: ' s', words: ' words' };
const shown = (metric, value) => (value == null ? '<span class="muted">No data</span>' : metric.unit === 'share' ? `${Math.round(value * 100)}%` : `${esc(value)}${UNITS[metric.unit] || ''}`);

function learnerPart(learner, index) {
  const { metrics, skills } = measureLearner(learner);
  return `<article class="learner"><h3 id="learner-${index}">${esc(learner.label)}</h3>
<table aria-labelledby="learner-${index}"><thead><tr><th scope="col">Measure</th><th scope="col" class="num">Value</th></tr></thead><tbody>
${METRICS.map((metric) => `<tr><th scope="row"><a href="#metric-${metric.id}">${esc(metric.label)}</a></th><td class="num">${shown(metric, metrics[metric.id])}</td></tr>`).join('\n')}
</tbody></table>
${skills.length ? `<div class="scroll"><table><caption>By skill</caption><thead><tr><th scope="col">Skill</th><th scope="col" class="num">Correct</th><th scope="col">Mastered</th></tr></thead><tbody>
${skills.map((skill) => `<tr><th scope="row">${esc(skill.skill)}</th><td class="num">${skill.correct} of ${skill.attempts}</td><td>${skill.mastered ? 'Yes' : skill.wheel_spinning ? 'Not yet, wheel-spinning' : 'Not yet'}</td></tr>`).join('\n')}
</tbody></table></div>` : ''}</article>`;
}

function measuresPart(learners) {
  if (!learners.length) return empty('No learner records were given. A learner’s record (learning events and turns, <code>schemas/learning-events.schema.json</code>) would show their measures here.');
  return `<p class="note">Descriptive counts and timings from each learner’s record: what the learner did, not what they learned. None of these is a learning gain or a grade. “No data” means the record has nothing that measure reads. Learners are shown by the ID their record carries.</p>
${learners.map(learnerPart).join('\n')}
<h3>What each measure means</h3>
<p class="note">As VIABLE’s research export defines them (measures version ${esc(METRICS_VERSION)}).</p>
<dl class="glossary">${METRICS.map((metric) => `<dt id="metric-${metric.id}">${esc(metric.label)}</dt><dd>${esc(metric.definition)}${metric.caveat ? `<p class="caveat"><span class="label">Caveat:</span> ${esc(metric.caveat)}</p>` : ''}</dd>`).join('\n')}</dl>`;
}

// Misconceptions a record names: a turn's `misconceptions` (IDs, or { id, description }) and an event's data.misconception.
function heardOf(learners, settings) {
  const chosen = new Map((settings?.misconceptions || []).map((item) => [item.id, item.description]));
  const heard = new Map();
  for (const learner of learners) {
    const named = [...learner.turns.flatMap((turn) => [].concat(turn?.misconceptions ?? [])), ...learner.events.map((event) => event?.data?.misconception)];
    for (const item of named) {
      const id = String((typeof item === 'object' ? item?.id : item) ?? '').trim().toLowerCase();
      const description = chosen.get(id) || (typeof item?.description === 'string' ? item.description : '');
      if (!id && !description) continue;
      const entry = heard.get(id || description) || { id, description, chosen: chosen.has(id), times: 0, learners: new Set() };
      entry.times += 1;
      entry.learners.add(learner.label);
      heard.set(id || description, entry);
    }
  }
  return [...heard.values()].sort((a, b) => b.times - a.times);
}

function misconceptionsPart(learners, settings) {
  const heard = heardOf(learners, settings);
  if (!heard.length) return empty(`No turn or event ${learners.length ? 'in these records ' : ''}names a misconception. A turn’s <code>misconceptions</code> list, or an event’s <code>misconception</code>, holding the IDs of misconceptions chosen in How the AI helps, would show here what was heard and from whom.`);
  return `<p class="note">What the records name; the harness doesn’t detect misconceptions itself.</p>
<div class="scroll"><table><thead><tr><th scope="col">Misconception</th><th scope="col" class="num">Times</th><th scope="col">Learners</th></tr></thead><tbody>
${heard.map((item) => `<tr><th scope="row">${item.description ? esc(item.description) : `<code>${esc(item.id)}</code>`}${item.chosen ? '' : ' <span class="muted">(not one chosen in How the AI helps)</span>'}</th><td class="num">${item.times}</td><td>${[...item.learners].map(esc).join(', ')}</td></tr>`).join('\n')}
</tbody></table></div>`;
}

function suggestionsPart(suggestions) {
  if (!suggestions.length) return empty('No suggested changes. A suggestion would show here with what to change, why and the evidence for it; the teacher decides.');
  return suggestions.map((item) => `<article class="card"${item?.id != null ? ` id="suggestion-${String(item.id).replace(/[^A-Za-z0-9_-]/g, '-')}"` : ''}>
<h3>${esc(item?.change)}</h3>${item?.why ? `<p>${esc(item.why)}</p>` : ''}
<h4>Evidence</h4>${Array.isArray(item?.evidence) && item.evidence.length ? `<ul>${item.evidence.map((entry) => `<li>${typeof entry === 'string' ? esc(entry) : `<code>${esc(JSON.stringify(entry))}</code>`}</li>`).join('')}</ul>` : '<p class="muted">None given.</p>'}
<p class="note">A suggestion only: the teacher decides.</p></article>`).join('\n');
}

const STYLE = `:root{--bg:#fff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--soft:#f6f8fa;--link:#0550ae;--passed:#116329;--unverified:#7a4a00;--attention:#a40e26;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9da7b3;--line:#3d444d;--soft:#161b22;--link:#79c0ff;--passed:#56d364;--unverified:#e3b341;--attention:#ff8e86}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:break-word}
header,main{max-width:50rem;margin:0 auto;padding:0 16px}
header{padding-top:2rem}
main{padding-bottom:3rem}
h1{font-size:1.75rem;line-height:1.2;margin:0 0 .5rem}
h2{font-size:1.4rem;margin:2.5rem 0 .75rem;padding-top:1.25rem;border-top:1px solid var(--line)}
h3{font-size:1.15rem;margin:1.75rem 0 .5rem}
h4{font-size:1rem;margin:0 0 .25rem}
a{color:var(--link)}
code{font:.9em ui-monospace,SFMono-Regular,Menlo,monospace}
nav ul{display:flex;flex-wrap:wrap;gap:.25rem 1rem;padding:0;margin:1rem 0 0;list-style:none}
.muted,.note{color:var(--muted)}
.small{font-size:.85rem}
.label{font-weight:600}
.empty{padding:.75rem 1rem;border:1px dashed var(--line);border-radius:6px;color:var(--muted)}
blockquote{margin:.25rem 0 .5rem;padding:.5rem .75rem;background:var(--soft);border-left:3px solid var(--line);white-space:pre-wrap}
table{width:100%;border-collapse:collapse;margin:.5rem 0 1rem}
caption{text-align:left;font-weight:600;padding:.25rem 0}
th,td{text-align:left;vertical-align:top;padding:.4rem .5rem;border-bottom:1px solid var(--line)}
tbody th{font-weight:normal}
.num{text-align:right;font-variant-numeric:tabular-nums}
td.num{white-space:nowrap}
.scroll{overflow-x:auto}
dl.settings dt,dl.evidence dt,dl.glossary dt{font-weight:600;margin-top:.75rem}
dl.settings dd,dl.evidence dd,dl.glossary dd{margin:0}
dd p,dd ul{margin:.25rem 0}
.caveat{color:var(--muted)}
.counts{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin:1rem 0}
.counts div{border:1px solid var(--line);border-left-width:4px;border-radius:6px;padding:.5rem .75rem}
.counts dt{font-size:.9rem}
.counts dd{margin:0;font-size:1.75rem;font-weight:600;font-variant-numeric:tabular-nums}
.card{border:1px solid var(--line);border-left-width:4px;border-radius:8px;padding:1rem;margin:1rem 0}
.card>:first-child{margin-top:0}
.counts .passed,.card.passed{border-left-color:var(--passed)}.counts .unverified,.card.unverified{border-left-color:var(--unverified)}.counts .attention,.card.attention{border-left-color:var(--attention)}
.unverified .outcome{color:var(--unverified)}.attention .outcome{color:var(--attention)}
@media print{:root{--bg:#fff;--fg:#000;--muted:#333;--line:#888;--soft:#fff;--link:#000}nav{display:none}a{text-decoration:none}h2,h3,h4{break-after:avoid}.card,tr,.counts{break-inside:avoid}}`;

/**
 * The teacher's view as an HTML string. teaching: an activity's teaching settings; records: learner
 * records (learning events and turns); runs: run traces (runAgent's result, `run --json`);
 * suggestions: [{ id, change, why, evidence: [...] }], shown for the teacher to decide on.
 */
export function teacherView({ teaching = null, records = [], runs = [], title = null, suggestions = [] } = {}) {
  const settings = teachingSettings(teaching);
  const learners = learnersOf(records);
  const heading = title ? String(title) : 'What the AI did with your learners';
  const sections = [
    ['teaching', 'How the AI helps', teachingPart(settings)],
    ['vetting', 'What VETTING did', vettingPart(runs)],
    ['measures', 'Each learner’s measures', measuresPart(learners)],
    ['misconceptions', 'Misconceptions heard', misconceptionsPart(learners, settings)],
    ['suggestions', 'Suggested changes', `<!-- Suggested changes: empty unless teacherView is given suggestions. -->\n${suggestionsPart(Array.isArray(suggestions) ? suggestions : [])}`]
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${heading} | Teacher view` : heading)}</title>
<style>
${STYLE}
</style>
</head>
<body>
<header>
<h1>${esc(heading)}</h1>
<p class="muted">${title ? 'What the AI did with your learners, and why. ' : ''}From ${count(records.length, 'learner record')} (${count(learners.length, 'learner')}) and ${count(runs.length, 'run')}. This page loads nothing from the internet.</p>
<nav aria-label="On this page"><ul>${sections.map(([id, name]) => `<li><a href="#${id}">${name}</a></li>`).join('')}</ul></nav>
</header>
<main>
${sections.map(([id, name, body]) => `<section id="${id}" aria-labelledby="${id}-title">\n<h2 id="${id}-title">${name}</h2>\n${body}\n</section>`).join('\n')}
</main>
</body>
</html>
`;
}
