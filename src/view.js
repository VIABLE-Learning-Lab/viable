/**
 * The teacher's page: one self-contained HTML page that shows what the AI did with a class and why,
 * from learner records (schemas/learning-events.schema.json) and run traces (`run --json`). What the
 * class did at a glance, How the AI helps as the teacher set it, what VETTING did with each reply as
 * marked-up drafts, each learner's measures as small marks with their definitions a click away,
 * misconceptions heard, and suggested changes as its conclusion. The page loads nothing from the
 * internet (its fonts are inlined), runs no script, and every piece of text from the data is escaped:
 * learners and models wrote it.
 */
import { HELP_LEVELS, teachingSettings } from './utils/teaching.js';
import { METRICS, METRICS_VERSION } from './utils/researchMetrics.js';
import { attemptsOf, measureLearner } from './measures.js';
import { misconceptionById } from './utils/misconceptions.js';
import { markSvg, themeCss } from './ui/theme.js';
import { HELP_NAMES, MARKS, OUTCOMES, PARTS_CSS, helpScale, suggestion, treeHtml, vettingRounds } from './ui/parts.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const empty = (text) => `<p class="v-empty">${text}</p>`;
const quote = (text) => (text ? `<blockquote>${esc(text)}</blockquote>` : '<p class="muted">(none in the trace)</p>');
const mark = (kind, text = '') => `<span class="v-mark ${kind}">${text}</span>`;

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
  return lines.length ? `<p class="source">${lines.map(esc).join(' ')}</p>` : '';
}

function standardPart(standard) {
  const skill = standard.kind === 'skill';
  const where = skill
    ? (standard.level ? `level ${standard.level.number}${standard.level.name ? `, ${standard.level.name}` : ''}` : '')
    : [standard.jurisdiction, standard.grades.length ? `grade ${standard.grades.join(', ')}` : ''].filter(Boolean).join(', ');
  const list = (intro, items) => (items.length ? `<p>${intro}</p><ul>${items.map((item) => `<li>${item.code ? `${esc(item.code)}: ` : ''}${esc(item.description)}</li>`).join('')}</ul>` : '');
  const more = [
    list(skill ? 'At this level, the learner:' : 'It breaks into:', standard.learning_components.map(({ description }) => ({ description }))),
    list(skill ? 'The level before, to go back to when the learner needs it:' : 'Standards before it, to go back to when the learner needs them:', standard.prior)
  ].join('');
  return `<dt>${skill ? 'Durable skill' : 'Standard'}</dt><dd>
<p>${standard.code ? `<strong>${esc(standard.code)}</strong> ` : ''}${esc(standard.description)}${where ? ` <span class="muted">(${esc(where)})</span>` : ''}</p>
${more ? `<details><summary>${skill ? 'This level, and the one before' : 'What it breaks into, and the standards before it'}</summary>${more}</details>` : ''}</dd>`;
}

function teachingPart(settings) {
  if (!settings) return empty('No teaching settings were given. A course package, or a teaching settings file given with <code>--teaching</code>, would show here the goal, standard, help level and sections the AI is given.');
  const help = (level) => (level ? `<strong>${HELP_NAMES[level]}.</strong> The AI is told: “${esc(HELP_LEVELS[level])}”` : '<span class="muted">Not set: the agent’s own instructions decide.</span>');
  const rows = [
    settings.goal ? `<dt>Goal</dt><dd class="goal">${esc(settings.goal)}</dd>` : '',
    `<dt>How far the AI may go</dt><dd>${settings.help ? treeHtml(helpScale(settings.help)) : ''}${help(settings.help)}</dd>`,
    settings.standard ? standardPart(settings.standard) : '',
    settings.misconceptions ? `<dt>Misconceptions to listen for</dt><dd><ul>${settings.misconceptions.map((item) => `<li>${esc(item.description)} <span class="muted">(gets in the way of: ${esc(item.construct.description)})</span></li>`).join('')}</ul></dd>` : '',
    settings.watch_for ? `<dt>What you want to hear about</dt><dd>${esc(settings.watch_for)}<p class="note">For you only: this is never sent to the AI.</p></dd>` : ''
  ];
  const sections = Object.entries(settings.sections || {});
  return `<p class="note">As the teacher set it. The AI is given the goal, the standard or skill, the misconceptions and the help level as part of the instructions of every step that writes a reply, and where the agent has a VETTING step, its reviewer checks replies against them too. They are instructions to the AI, not guarantees.</p>
<dl class="settings">${rows.join('')}</dl>
${sourceNote([settings.standard?.source, ...(settings.misconceptions || []).map((item) => item.source)].filter(Boolean))}
${sections.length ? `<h3>Sections with their own settings</h3>
<p class="note">A section’s own help level replaces the activity’s, and its note is added, for that section’s learners only; no other section’s AI is given them.</p>
<div class="scroll"><table class="v-table">
<thead><tr><th scope="col">Section</th><th scope="col">How far the AI may go</th><th scope="col">Note to the AI</th></tr></thead>
<tbody>${sections.map(([id, own]) => `<tr><th scope="row"><code>${esc(id)}</code></th><td>${own.help ? help(own.help) : `<span class="muted">The activity’s${settings.help ? ` (${HELP_NAMES[settings.help]})` : ''}</span>`}</td><td>${own.note ? esc(own.note) : '<span class="muted">None</span>'}</td></tr>`).join('')}</tbody>
</table></div>` : ''}`;
}

function reviewsOf(runs) {
  return runs.flatMap((run, index) => (Array.isArray(run?.steps) ? run.steps : [])
    .filter((step) => step?.nodeType === 'vetting' && Object.hasOwn(OUTCOMES, String(step.output?.outcome)))
    .map((step) => ({ run: index + 1, label: run.label, agent: run.agent, step, rounds: Array.isArray(step.output.attempt_details) ? step.output.attempt_details : [], message: typeof step.input?.message === 'string' ? step.input.message : run.steps.find((item) => item?.nodeType === 'input')?.output?.message, reply: run.output?.text })));
}

// A review worth reading: it didn't pass, or it passed only after the reviewer sent a draft back.
const sentBack = ({ step, rounds }) => step.output.outcome !== 'passed' || rounds.some((round) => round?.verdict !== 'pass');
const NEEDS_READING = { attention: 0, unverified: 1, passed: 2 };
// Open on the page; the rest are a click away, so a class's worth of replies stays a page.
const REVIEWS_OPEN = 5;

function reviewPart({ run, label, agent, step, rounds, message, reply }) {
  const { outcome, content } = step.output;
  const [word, why] = OUTCOMES[outcome];
  const rewritten = outcome === 'passed';
  const final = reply || content || rounds.at(-1)?.reply;
  const name = typeof label === 'string' && label.trim() ? esc(label) : `Run ${run}${agent ? `, ${esc(agent)}` : ''}`;
  return `<article class="card ${outcome}">
<header><h4>${name}</h4>${mark(MARKS[outcome], rewritten ? 'Passed, after a rewrite' : word)}</header>
${rewritten ? '' : `<p class="note">${word}: ${why}.</p>`}
<p class="said">The learner’s message</p><div class="asked">${quote(message)}</div>
${treeHtml(vettingRounds(rounds))}
${final && final === rounds.at(-1)?.reply ? '<p class="note ran">The run replied with this.</p>' : `<p class="said">Final reply (what the run replied)</p><div class="final">${quote(final)}</div>`}
</article>`;
}

// One group of marks for each reply, one mark for each round: what VETTING did, at a glance.
const TALLY = 60;
function tallyPart(reviews) {
  if (!reviews.length) return '';
  const roundsOf = ({ step, rounds }) => (rounds.length ? rounds.map((round) => MARKS[round?.verdict] || 'unverified') : [MARKS[step.output.outcome]]);
  const tally = Object.fromEntries(Object.keys(OUTCOMES).map((key) => [key, reviews.filter((item) => item.step.output.outcome === key).length]));
  const said = Object.entries(OUTCOMES).filter(([key]) => tally[key]).map(([key, [word]]) => `${tally[key]} ${word.toLowerCase()}`).join(', ');
  const over = reviews.length - TALLY;
  return `<figure class="tally v-card">
<div class="marks" role="img" aria-label="${esc(`${count(reviews.length, 'reply', 'replies')} reviewed: ${said}.`)}">${reviews.slice(0, TALLY).map((item) => `<span class="reply">${roundsOf(item).map((kind) => mark(kind)).join('')}</span>`).join('')}</div>
<figcaption class="note">${over > 0 ? `The first ${TALLY} of ${reviews.length} replies. ` : ''}Each group is one reply the reviewer read, and each mark one round: a cross sent the draft back, a tick let it through.</figcaption>
</figure>`;
}

function vettingPart(runs, reviews) {
  if (!runs.length) return empty('No runs were given. A run’s trace (the output of <code>viable-harness run --json</code>) would show here every reply VETTING reviewed, and the evidence for each one that didn’t pass.');
  const untaught = runs.filter((run) => !run.teaching).length;
  const noTeaching = untaught ? `<p class="note">${untaught === runs.length ? 'None of these runs was' : `${count(untaught, 'run')} of ${runs.length} ${untaught === 1 ? 'was' : 'were'}`} given teaching settings.</p>` : '';
  if (!reviews.length) return `${empty(`None of these ${count(runs.length, 'run')} has a VETTING step, so no reply was reviewed by a second model. An agent with a VETTING step would show its reviews here.`)}${noTeaching}`;
  const tally = Object.fromEntries(Object.keys(OUTCOMES).map((key) => [key, reviews.filter((item) => item.step.output.outcome === key).length]));
  const shown = reviews.filter(sentBack).sort((a, b) => NEEDS_READING[a.step.output.outcome] - NEEDS_READING[b.step.output.outcome]);
  const more = shown.slice(REVIEWS_OPEN);
  return `<p class="note">VETTING has a second model review a reply before the learner sees it; a reply that fails is rewritten with the reviewer’s reason. ${count(reviews.length, 'reply', 'replies')} reviewed in ${count(runs.length, 'run')}.</p>${noTeaching}
<dl class="counts">${Object.entries(OUTCOMES).map(([key, [word]]) => `<div class="${key}"><dt class="v-mark ${MARKS[key]}">${word}</dt><dd>${tally[key]}</dd></div>`).join('')}</dl>
<h3>Replies the reviewer sent back</h3>
${shown.length ? shown.slice(0, REVIEWS_OPEN).map(reviewPart).join('\n') : empty('Every reviewed reply passed on its first draft. A reply that was rewritten, unverified or needs attention would show here with its evidence.')}
${more.length ? `<details class="more"><summary>${count(more.length, 'more reply', 'more replies')}</summary>${more.map(reviewPart).join('\n')}</details>` : ''}`;
}

// One learner per ID: a learner's records (sessions, activities) are measured together.
function learnersOf(records) {
  const byId = new Map();
  records.forEach((record, index) => {
    const id = typeof record?.user === 'string' && record.user ? record.user : null;
    const key = id ?? index;
    const learner = byId.get(key) || { id, label: id ?? `Record ${index + 1} (it carries no learner ID)`, group: typeof record?.learner_group === 'string' ? record.learner_group : null, events: [], turns: [] };
    const objects = (list) => (Array.isArray(list) ? list.filter((item) => item && typeof item === 'object') : []);
    learner.events.push(...objects(record?.events));
    learner.turns.push(...objects(record?.turns));
    byId.set(key, learner);
  });
  return [...byId.values()];
}

const UNITS = { minutes: ' min', seconds: ' s', words: ' words' };
const shown = (metric, value) => (value == null ? '<span class="muted">No data</span>' : metric.unit === 'share' ? `${Math.round(value * 100)}%` : `${esc(value)}${UNITS[metric.unit] || ''}`);
// What a learner's card shows before anyone asks for more, where the record has it.
const AT_A_GLANCE = ['turns', 'active_minutes', 'median_think_s', 'words_per_message', 'pasted_share', 'starter_share', 'revision_ratio'];
const METRIC = Object.fromEntries(METRICS.map((metric) => [metric.id, metric]));
const defined = (metric) => `<a href="#metric-${metric.id}" title="${esc(metric.definition)}">${esc(metric.label)}</a>`;
// The most recent attempts: enough to see a pattern, on a card that stays a card.
const STRIP = 40;

function skillPart(skill, attempts) {
  const marks = attempts.filter((item) => item.skill === skill.skill).map((item) => item.correct);
  const state = skill.mastered ? mark('pass', 'Mastered') : skill.wheel_spinning ? '<a class="spin" href="#metric-wheel_spinning">Not yet, wheel-spinning</a>' : '<span class="muted">Not yet</span>';
  return `<li><p class="v-label">${esc(skill.skill)}</p>
<p class="strip" aria-hidden="true">${marks.slice(-STRIP).map((ok) => mark(ok ? 'pass' : 'fail')).join('')}</p>
<p class="skill-line"><span>${skill.correct} of ${skill.attempts} correct</span> ${state}</p></li>`;
}

function learnerPart({ learner, metrics, skills }, index, top) {
  const attempts = attemptsOf(learner.events, learner.turns).sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  const glance = AT_A_GLANCE.filter((id) => metrics[id] != null).slice(0, 4).map((id) => {
    const metric = METRIC[id];
    const whole = metric.unit === 'share' ? 1 : top[id] || 1;
    return `<div><dt>${defined(metric)}</dt><dd>${shown(metric, metrics[id])}<span class="bar" aria-hidden="true"><i style="width:${Math.round((100 * metrics[id]) / whole)}%"></i></span></dd></div>`;
  }).join('');
  return `<article class="learner v-card"><header><h3 id="learner-${index}">${esc(learner.label)}</h3>${learner.group ? `<span class="v-pill">${esc(learner.group)}</span>` : ''}</header>
${skills.length ? `<ul class="skills">${skills.map((skill) => skillPart(skill, attempts)).join('')}</ul>` : ''}
${glance ? `<dl class="glance">${glance}</dl>` : ''}
<details><summary>All ${METRICS.length} measures</summary>
<table class="v-table" aria-labelledby="learner-${index}"><thead><tr><th scope="col">Measure</th><th scope="col" class="num">Value</th></tr></thead><tbody>
${METRICS.map((metric) => `<tr><th scope="row">${defined(metric)}</th><td class="num">${shown(metric, metrics[metric.id])}</td></tr>`).join('\n')}
</tbody></table></details></article>`;
}

function measuresPart(learners) {
  if (!learners.length) return empty('No learner records were given. A learner’s record (learning events and turns, <code>schemas/learning-events.schema.json</code>) would show their measures here.');
  const measured = learners.map((learner) => ({ learner, ...measureLearner(learner) }));
  // A bar is the learner's value against the highest in the class (a share, against 100%).
  const top = Object.fromEntries(AT_A_GLANCE.map((id) => [id, Math.max(0, ...measured.map(({ metrics }) => metrics[id] ?? 0))]));
  const stuck = ({ metrics }) => (metrics.wheel_spinning ? 0 : 1);
  return `<p class="note">Descriptive counts and timings from each learner’s record: what the learner did, not what they learned. None of these is a learning gain or a grade. A bar sets a learner’s value against the highest in the class. “No data” means the record has nothing that measure reads. Learners are shown by the ID their record carries, those wheel-spinning first.</p>
<div class="learners">${[...measured].sort((a, b) => stuck(a) - stuck(b)).map((item, index) => learnerPart(item, index, top)).join('\n')}</div>
<details class="definitions"><summary>What each measure means</summary>
<p class="note">As VIABLE’s research export defines them (measures version ${esc(METRICS_VERSION)}).</p>
<dl class="glossary">${METRICS.map((metric) => `<div><dt id="metric-${metric.id}">${esc(metric.label)}</dt><dd>${esc(metric.definition)}${metric.caveat ? `<p class="caveat"><span class="label">Caveat:</span> ${esc(metric.caveat)}</p>` : ''}</dd></div>`).join('\n')}</dl></details>`;
}

// Misconceptions a record names: a turn's `misconceptions` (IDs, or { id, description }) and an event's data.misconception.
function heardOf(learners, settings) {
  const chosen = new Map((settings?.misconceptions || []).map((item) => [item.id, item.description]));
  const heard = new Map();
  for (const learner of learners) {
    const named = [...learner.turns.flatMap((turn) => [].concat(turn?.misconceptions ?? [])), ...learner.events.map((event) => event?.data?.misconception)];
    for (const item of named) {
      const id = String((typeof item === 'object' ? item?.id : item) ?? '').trim().toLowerCase();
      const description = chosen.get(id) || (typeof item?.description === 'string' ? item.description : '') || misconceptionById(id)?.description || '';
      if (!id && !description) continue;
      const entry = heard.get(id || description) || { id, description, chosen: chosen.has(id), times: 0, learners: new Set() };
      entry.times += 1;
      entry.learners.add(learner.label);
      heard.set(id || description, entry);
    }
  }
  return [...heard.values()].sort((a, b) => b.learners.size - a.learners.size || b.times - a.times);
}

function misconceptionsPart(learners, heard) {
  if (!heard.length) return empty(`No turn or event ${learners.length ? 'in these records ' : ''}names a misconception. A turn’s <code>misconceptions</code> list, or an event’s <code>misconception</code>, holding the IDs of misconceptions chosen in How the AI helps, would show here what was heard and from whom.`);
  return `<p class="note">What the records name, most learners first; the harness doesn’t detect misconceptions itself.</p>
<ol class="heard">${heard.map((item) => `<li>
<h3>${item.description ? esc(item.description) : `<code>${esc(item.id)}</code>`}${item.chosen ? '' : ' <span class="muted">(not one chosen in How the AI helps)</span>'}</h3>
<p class="who"><span class="dots" aria-hidden="true">${learners.map((_, i) => `<i${i < item.learners.size ? ' class="on"' : ''}></i>`).join('')}</span> ${item.learners.size} of ${count(learners.length, 'learner')}, ${count(item.times, 'time')}</p>
<ul class="names">${[...item.learners].map((name) => `<li class="v-pill">${esc(name)}</li>`).join('')}</ul>
</li>`).join('\n')}</ol>`;
}

function suggestionsPart(suggestions, settings) {
  if (!suggestions.length) return empty('No suggested changes. A suggestion would show here with what to change, why and the evidence for it; the teacher decides.');
  return suggestions.map((item) => `<div class="change-card"${item?.id != null ? ` id="suggestion-${String(item.id).replace(/[^A-Za-z0-9_-]/g, '-')}"` : ''}>${treeHtml(suggestion(item, { settings }))}</div>`).join('\n');
}

// The opening sentences, in the order a teacher would ask: who, what the reviewer did, what was heard, what next.
function glance({ learners, reviews, heard, suggestions }) {
  const parts = [];
  if (learners.length) parts.push(`The AI worked with ${count(learners.length, 'learner')}.`);
  if (reviews.length) {
    const back = reviews.filter(sentBack).length;
    const outcomes = (key) => reviews.filter((item) => item.step.output.outcome === key).length;
    const [never, care] = [outcomes('unverified'), outcomes('attention')];
    parts.push(`A second model reviewed ${reviews.length === 1 ? 'one of its replies' : `${reviews.length} of its replies`}${back ? `, and ${back === reviews.length ? 'sent all of them' : `sent ${back}`} back` : ', and let them all through'}.`);
    if (never) parts.push(`${never === 1 ? 'One' : never} never passed.`);
    if (care) parts.push(`${care === 1 ? 'One' : care} raised a safety concern.`);
  }
  if (heard.length) {
    const [top] = heard;
    parts.push(`The records name ${count(heard.length, 'misconception')}${top.learners.size > 1 ? `, the most common from ${top.learners.size} learners` : ''}.`);
  }
  if (suggestions.length) parts.push(`<a href="#suggestions">${suggestions.length === 1 ? 'One change is' : `${suggestions.length} changes are`} waiting for your decision</a>, at the end of this page.`);
  return parts.join(' ');
}

const STYLE = `.wrap{width:min(100% - 48px,1120px);margin-inline:auto}
@media (max-width:640px){.wrap{width:calc(100% - 32px)}}
.label{font-weight:600}
.scroll{overflow-x:auto}
.num{text-align:right;font-variant-numeric:tabular-nums}
td.num{white-space:nowrap}
summary{color:var(--ink-blue);font-size:.9375rem;font-weight:600;list-style:none;cursor:pointer}
summary::-webkit-details-marker{display:none}
summary::before{content:"+";display:inline-block;width:1em;font-weight:400}
details[open]>summary::before{content:"−"}
summary:hover{color:var(--ink-blue-deep)}
blockquote{margin:0;white-space:pre-wrap}
.hero{padding:clamp(20px,3vw,32px) 0 0;background:var(--field-mist)}
.brand{display:flex;align-items:center;gap:10px;margin:0 0 clamp(40px,7vw,88px);color:var(--public-ink);font-size:.9375rem;font-weight:600}
.hero-body{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:clamp(32px,6vw,80px);align-items:end}
.hero-body.single{grid-template-columns:minmax(0,1fr)}
.summary{max-width:36em;margin:clamp(18px,2.4vw,28px) 0 0;color:var(--public-ink);font-size:clamp(1.1875rem,1.8vw,1.4375rem);font-weight:300;line-height:1.42;letter-spacing:-.012em}
.summary a{color:inherit}
.hero .lead{margin:14px 0 0;color:var(--public-text)}
.tally{margin:0;padding:22px 24px}
.marks{display:flex;flex-wrap:wrap;gap:14px 22px}
.reply{display:inline-flex;gap:3px}
.reply .v-mark{gap:0;font-size:1.5rem}
.tally figcaption{margin-top:16px;padding-top:12px;border-top:1px solid var(--public-rule);font-size:.8125rem}
@media (prefers-reduced-motion:no-preference){.reply{animation:land .5s var(--ease-out) both;animation-delay:calc(var(--n,0)*70ms + 200ms)}
${[...Array(12)].map((_, i) => `.reply:nth-child(${i + 1}){--n:${i}}`).join('')}.reply:nth-child(n+13){--n:12}
@keyframes land{from{opacity:0;transform:translateY(5px) scale(1.25)}}}
.toc{margin:clamp(32px,5vw,56px) 0 0;padding:0;border-top:1px solid var(--public-rule-strong)}
.toc ul{display:flex;flex-wrap:wrap;gap:0 clamp(16px,3vw,32px);margin:0;padding:0;list-style:none}
.toc a{display:inline-flex;align-items:center;min-height:48px;color:var(--public-ink);font-size:.9375rem;text-decoration:none}
.toc a:hover{color:var(--ink-blue)}
.band{padding:clamp(48px,7vw,88px) 0}
.band.stone{background:var(--field-stone)}.band.lilac{background:var(--field-lilac)}.band.sage{background:var(--field-sage)}
.split{display:grid;grid-template-columns:minmax(0,16.5rem) minmax(0,1fr);gap:clamp(20px,4vw,56px)}
.split>h2{position:sticky;top:24px;align-self:start;font-size:clamp(1.75rem,2.6vw,2.25rem)}
.body>*+*{margin-top:18px}
.body>h3{margin-top:clamp(32px,4vw,44px)}
.settings{display:grid;grid-template-columns:minmax(0,12rem) minmax(0,1fr);margin:24px 0 0;border-top:1px solid var(--public-rule)}
.settings dt{padding:14px 16px 14px 0;border-bottom:1px solid var(--public-rule);color:var(--public-ink);font-size:.9375rem;font-weight:600;line-height:1.4}
.settings dd{min-width:0;margin:0;padding:14px 0;border-bottom:1px solid var(--public-rule)}
.settings dd>*+*{margin-top:10px}
.settings p,.settings ul{margin:0}
.settings .goal{color:var(--public-ink);font-size:1.125rem;line-height:1.45}
.settings ul{padding-left:1.1rem}
.settings details ul{margin-top:6px}.settings details p{margin-top:10px}
.source{margin-top:14px!important;color:var(--muted);font-size:.75rem;line-height:1.45}
.counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:24px 0 0;border-top:1px solid var(--public-rule-strong);border-bottom:1px solid var(--public-rule-strong)}
.counts div{padding:12px 16px 14px 0}
.counts div+div{padding-left:16px;border-left:1px solid var(--public-rule-strong)}
.counts dt{display:flex;font-size:.875rem}
.counts dd{margin:4px 0 0;color:var(--public-ink);font-size:clamp(2rem,4vw,2.75rem);font-weight:300;line-height:1.1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.card{margin-top:16px;padding:clamp(18px,2.4vw,26px);border-radius:var(--radius);background:var(--surface);box-shadow:var(--public-shadow)}
.card>header{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px}
.card>.note{margin:4px 0 0}
.said{margin:16px 0 3px;color:var(--muted);font-size:.8125rem;font-weight:600;line-height:1.5}
.asked blockquote{color:var(--public-ink);font-size:1.1875rem;font-weight:300;line-height:1.4;letter-spacing:-.01em}
.card .rounds{margin-top:16px;padding-top:14px;border-top:1px solid var(--public-rule)}
.final{padding:12px 14px;border-radius:var(--radius-sm);background:var(--field-mist)}
.final blockquote{color:var(--public-ink)}
.ran{margin:10px 0 0;font-size:.8125rem}
.more{margin-top:18px}
.learners{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:16px;align-items:start;margin-top:24px}
.learner{padding:18px 20px 16px}
.learner>header{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}
.learner h3{font-size:1.0625rem;font-weight:500;letter-spacing:-.01em;overflow-wrap:anywhere}
.skills{margin:14px 0 0;padding:0;list-style:none}
.skills>li+li{margin-top:12px}
.skills p{margin:0}
.strip{display:flex;flex-wrap:wrap;gap:1px 2px;margin:6px 0 4px!important;font-size:.8125rem;line-height:1}
.strip .v-mark{gap:0;font-size:.8125rem}
.skill-line{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 10px;color:var(--public-text);font-size:.875rem;font-variant-numeric:tabular-nums}
.skill-line .v-mark{font-size:.875rem}
.spin{color:var(--pencil-red);font-weight:600;text-decoration-color:currentColor}
.glance{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;margin:14px 0 0;padding-top:14px;border-top:1px solid var(--public-rule)}
.glance dt{font-size:.8125rem;line-height:1.3}
.glance dt a{color:var(--muted);text-decoration:underline dotted 1px var(--public-rule-strong);text-underline-offset:.22em}
.glance dd{margin:0;color:var(--public-ink);font-size:1.125rem;font-variant-numeric:tabular-nums}
.bar{display:block;height:2px;margin-top:3px;background:var(--public-rule)}
.bar i{display:block;height:100%;min-width:2px;background:var(--ink-blue);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.learner details{margin-top:12px}
.learner summary{font-size:.875rem}
.learner table{margin-top:8px;font-size:.875rem}
.learner th,.learner td{padding:5px 0}
.learner tbody th{font-weight:400}
.learner tbody th a{color:var(--public-ink);text-decoration:underline dotted 1px var(--public-rule-strong);text-underline-offset:.22em}
.definitions{margin-top:24px!important}
.glossary{columns:2 20rem;column-gap:40px;margin:14px 0 0}
.glossary div{break-inside:avoid;padding:0 0 14px}
.glossary dt{color:var(--public-ink);font-weight:600;scroll-margin-top:16px}
.glossary dt:target{color:var(--ink-blue)}
.glossary dd{margin:0;font-size:.9375rem;line-height:1.5}
.caveat{margin:4px 0 0;color:var(--muted)}
.heard{margin:24px 0 0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.heard>li{padding:18px 0;border-bottom:1px solid var(--public-rule)}
.heard h3 .muted{font-size:.9375rem;letter-spacing:0}
.who{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:8px 0 0;color:var(--public-text);font-size:.9375rem;font-variant-numeric:tabular-nums}
.dots{display:inline-flex;flex-wrap:wrap;gap:3px;max-width:100%}
.dots i{width:9px;height:9px;border:1px solid var(--public-rule-strong);border-radius:50%}
.dots .on{border-color:var(--ink-blue);background:var(--ink-blue);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.names{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0;padding:0;list-style:none}
.closing>h2{font-size:clamp(2.1rem,4.2vw,3.25rem)}
.closing{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(24px,3.5vw,40px)}
.closing>h2{position:static}
.change-card+.change-card{margin-top:16px}
.foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:28px 0 36px;color:var(--muted);font-size:.875rem}
.foot p{margin:0}
@media (max-width:860px){.hero-body,.split{grid-template-columns:minmax(0,1fr)}.split>h2{position:static}.settings{grid-template-columns:minmax(0,1fr)}.settings dt{padding-bottom:0;border-bottom:0}.settings dd{padding-top:2px}}
@media (max-width:480px){.counts dd{font-size:1.75rem}.counts div{padding-right:8px}.counts div+div{padding-left:10px}.counts dt{font-size:.8125rem}}
@media print{.toc,summary{display:none}.hero,.band{padding:18px 0;background:none}.brand{margin-bottom:18px}.split{display:block}.split>h2{position:static;margin-bottom:10px}.card,.learner,.tally,.suggestion{border:1px solid var(--public-rule-strong);box-shadow:none}.learners,.suggestion{display:block}.learner{margin-top:10px}a{color:inherit;text-decoration:none}details::details-content{display:block;content-visibility:visible}h2,h3,h4,dt{break-after:avoid}.card,.learner,.tally,.heard>li,.round,.suggestion,tr{break-inside:avoid}.final{background:none;border:1px solid var(--public-rule)}}`;

/** What the page is served with on any server: it holds learners' words, so no script, nothing from elsewhere, never kept. */
export const TEACHER_PAGE_HEADERS = Object.freeze({ 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });

/**
 * The teacher's view as an HTML string. teaching: an activity's teaching settings; records: learner
 * records (learning events and turns); runs: run traces (runAgent's result, `run --json`);
 * suggestions: [{ id, change, why, evidence: [...], patch }], shown for the teacher to decide on.
 */
export function teacherView({ teaching = null, records = [], runs = [], title = null, suggestions = [] } = {}) {
  const settings = teachingSettings(teaching);
  const learners = learnersOf(records);
  const reviews = reviewsOf(runs);
  const heard = heardOf(learners, settings);
  const changes = Array.isArray(suggestions) ? suggestions : [];
  const heading = title ? String(title) : 'What the AI did with your learners';
  const sections = [
    ['teaching', 'How the AI helps', '', teachingPart(settings)],
    ['vetting', 'What VETTING did', 'stone', vettingPart(runs, reviews)],
    ['measures', 'Each learner’s measures', 'lilac', measuresPart(learners)],
    ['misconceptions', 'Misconceptions heard', '', misconceptionsPart(learners, heard)],
    ['suggestions', 'Suggested changes', 'sage', `<!-- Suggested changes: empty unless teacherView is given suggestions. -->\n${suggestionsPart(changes, settings)}`]
  ];
  const opening = glance({ learners, reviews, heard, suggestions: changes });
  const tally = tallyPart(reviews);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${heading} | Teacher view` : heading)}</title>
<style>
${themeCss()}
${PARTS_CSS}
${STYLE}
</style>
</head>
<body>
<header class="hero">
<div class="wrap">
<p class="brand">${markSvg({ size: 30 })}The teacher’s page</p>
<div class="hero-body${tally ? '' : ' single'}">
<div>
<h1>${esc(heading)}</h1>
${title ? '<p class="v-lead lead">What the AI did with your learners, and why.</p>' : ''}
${opening ? `<p class="summary">${opening}</p>` : ''}
</div>
${tally}
</div>
<nav class="toc" aria-label="On this page"><ul>${sections.map(([id, name]) => `<li><a href="#${id}">${name}</a></li>`).join('')}</ul></nav>
</div>
</header>
<main>
${sections.map(([id, name, field, body]) => `<section id="${id}" class="band${field ? ` ${field}` : ''}" aria-labelledby="${id}-title"><div class="wrap split${id === 'suggestions' ? ' closing' : ''}">\n<h2 id="${id}-title">${name}</h2>\n<div class="body">${body}</div>\n</div></section>`).join('\n')}
</main>
<footer class="foot wrap">${markSvg({ size: 22 })}<p>From ${count(records.length, 'learner record')} (${count(learners.length, 'learner')}) and ${count(runs.length, 'run')}. This page loads nothing from the internet.</p></footer>
</body>
</html>
`;
}
