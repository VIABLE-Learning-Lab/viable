/**
 * What the AI did, written once: a VETTING round, a test case and a suggestion, for the teacher's
 * page, the MCP views and the "what the AI did" panel. Each function is pure and returns a tree,
 * ['tag', attrs, ...children]: no DOM, no markup. A server turns a tree into HTML (treeHtml), a browser
 * into elements (treeDom), and text learners and models wrote stays text in both. PARTS_CSS is their
 * look, on the theme's tokens (ui/theme.js). No node: imports.
 *
 * A page's script gets the same functions by embedding PARTS_SCRIPT, so they use only each other, the
 * constants below and the language.
 */

// Everything a tree may hold: nothing else is built, and no attribute links or runs anything.
export const TAGS = ['div', 'header', 'section', 'article', 'footer', 'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code', 'strong', 'span', 'del', 'details', 'summary'];
export const ATTRIBUTES = ['class', 'open', 'role', 'aria-hidden'];
// The VETTING step's own words for its exits (src/agents/steps/vetting.js).
export const OUTCOMES = {
  passed: ['Passed', 'the reviewer approved the reply'],
  unverified: ['Unverified', 'attempts ran out or a review couldn’t run'],
  attention: ['Needs attention', 'the reply model flagged a safety concern and wrote a caring reply, which isn’t reviewed']
};
export const VERDICTS = { pass: 'Passed', fail: 'Did not pass', error: 'The review couldn’t run', safety: 'Safety concern, not reviewed' };
export const TEST_VERDICTS = { pass: 'Passed', fail: 'Failed', error: 'Error' };
// How much the AI does for a learner, from the least to the most: each level does what the one before does, and one thing more.
// The words people read. What the AI is told is HELP_LEVELS (utils/teaching.js); the ids are the API's.
export const HELP_LADDER = [
  { id: 'check_only', name: 'Only checks', adds: 'Says what is right and which part to look at again. Nothing more.', for: 'Their own writing, a quiz, showing what they know.', sounds: 'Your second step is right. Look again at your first.' },
  { id: 'ask_first', name: 'Asks questions', adds: 'Also asks questions that help them find the way, one at a time. No hints.', for: 'Discussion and reasoning, where the thinking has to stay theirs.', sounds: 'What makes you say that?' },
  { id: 'hint', name: 'Gives hints', adds: 'Also gives hints, one step at a time. Never the answer.', for: 'Practice on what they have been taught.', sounds: 'What do the pieces need in common?' },
  { id: 'step_up', name: 'Shows an example', adds: 'Also, once they have really tried and are still stuck, works through an example with other numbers, then sends them back to their own.', for: 'Most activities.', sounds: 'Here’s one with other numbers. Now try yours.' },
  { id: 'explain', name: 'Explains', adds: 'Also explains the idea directly, then has them try one.', for: 'Something new to them.', sounds: 'Fractions need pieces of one size. Here’s how…' }
];
export const HELP_NAMES = Object.fromEntries(HELP_LADDER.map((level) => [level.id, level.name]));
// The mark each one gets (.v-mark in ui/theme.js).
export const MARKS = { passed: 'pass', unverified: 'unverified', attention: 'attention', pass: 'pass', fail: 'fail', error: 'unverified', safety: 'attention' };

export function h(tag, attrs, ...children) {
  return [tag, attrs, ...children];
}

export function str(value) {
  if (value == null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function quote(value, empty) {
  return str(value).trim() ? h('blockquote', null, str(value)) : h('p', { class: 'muted' }, empty);
}

/** A teacher's mark, with its word beside it; with none, the mark alone (give it a name elsewhere). */
export function mark(kind, text) {
  return h('span', { class: `v-mark ${kind}` }, ...(text ? [text] : []));
}

/** One round of a review: the draft, struck if it failed; the reviewer's reason in the margin. */
export function vettingRound(round, i = 0) {
  const verdict = Object.hasOwn(VERDICTS, String(round?.verdict)) ? round.verdict : 'error';
  const name = round?.source === 'draft' ? 'the reply as given' : i === 0 ? 'the draft' : 'a rewrite';
  const reply = round?.reply;
  // A review says its verdict first ("FAILED: ..."); the mark already does.
  const reason = str(round?.feedback).replace(/^\s*(?:FAIL(?:ED)?|PASS(?:ED)?)\s*[:.-]\s*/i, '');
  return h('li', { class: `round ${verdict}` },
    h('p', { class: 'round-name' }, `Round ${str(round?.attempt ?? i + 1)}, ${name}`, mark(MARKS[verdict], VERDICTS[verdict])),
    h('div', { class: 'round-body' },
      h('div', { class: 'draft' }, verdict === 'fail' && str(reply).trim()
        ? h('del', null, str(reply))
        : quote(reply, reply === undefined ? 'Not kept in this record.' : reply === null ? 'No reply: it couldn’t be written.' : 'An empty reply.')),
      reason.trim() ? h('p', { class: 'pencil' }, h('span', { class: 'pencil-who' }, verdict === 'error' ? 'What went wrong: ' : 'The reviewer’s reason: '), reason) : null));
}

/** A review's rounds in order. watch: true plays them one after another, where motion is welcome. */
export function vettingRounds(rounds, { watch = false } = {}) {
  return h('ol', { class: watch ? 'rounds watch' : 'rounds' }, ...(Array.isArray(rounds) ? rounds : []).map((round, i) => vettingRound(round, i)));
}

/** One agent test: its verdict and name, opening on the judge's reason, the case and the reply. A pass starts closed. */
export function testCase(result, item) {
  const verdict = Object.hasOwn(TEST_VERDICTS, String(result?.verdict)) ? result.verdict : 'error';
  const message = item?.message ?? (Array.isArray(item?.messages) ? item.messages.at(-1)?.content : null);
  const part = (name, value) => (str(value).trim() ? [h('dt', null, name), h('dd', null, str(value))] : []);
  return h('li', null, h('details', { class: `case ${verdict}`, open: verdict !== 'pass' },
    h('summary', null, mark(MARKS[verdict], TEST_VERDICTS[verdict]), ' ', h('span', { class: 'case-name' }, str(result?.name))),
    h('dl', null,
      ...part(verdict === 'error' ? 'What went wrong' : 'The judge’s reason', result?.reason),
      ...(str(message).trim() ? [h('dt', null, 'The learner’s message'), h('dd', null, quote(message))] : []),
      ...part('What a good reply does', item?.rubric),
      ...part('What it must not do', item?.must_not),
      ...part('Where it comes from', item?.source?.name ? [item.source.name, ...(item.source.license || [])].join(', ') : ''),
      h('dt', null, 'The agent’s reply'),
      h('dd', null, quote(result?.reply, result?.reply == null ? 'No reply: the run failed.' : 'The agent gave no reply.')))));
}

/** How much the AI does, as a scale from the least to the most. `from` marks where a suggested change starts. Hidden from screen readers: the sentence beside it says the same. */
export function helpScale(level, from = null) {
  return h('ol', { class: 'scale', 'aria-hidden': 'true' }, ...Object.entries(HELP_NAMES).map(([key, name]) => h('li', { class: key === level ? 'on' : key === from ? 'from' : null }, name)));
}

/** What accepting a suggestion would change, in plain words: its patch read, not shown. */
export function nextStep(item, settings) {
  const patch = item?.patch;
  const named = (level) => Object.hasOwn(HELP_NAMES, String(level));
  if (named(patch?.help)) {
    return [h('p', null, 'If you agree, how much the AI does becomes ', h('strong', null, HELP_NAMES[patch.help]), '.'), helpScale(patch.help, settings?.help)];
  }
  const section = Object.entries(patch?.sections || {}).find(([id, own]) => named(own?.help) && own.help !== settings?.sections?.[id]?.help);
  if (section) {
    const [id, own] = section;
    return [h('p', null, 'If you agree, how much the AI does becomes ', h('strong', null, HELP_NAMES[own.help]), ' for section ', h('code', null, id), '.'), helpScale(own.help, settings?.sections?.[id]?.help ?? settings?.help)];
  }
  if (Array.isArray(patch?.misconceptions)) return [h('p', null, 'If you agree, add it to the misconceptions the AI listens for, in How the AI helps.')];
  if (patch) return [h('p', null, 'It proposes: ', h('code', null, JSON.stringify(patch)))];
  return [h('p', null, 'This one changes no setting. Read the evidence, then decide.')];
}

/** A suggested change: what, why, its evidence, what to do next. level: its heading's level. settings: the current teaching settings, for the scale. after: more to add at its end. */
export function suggestion(item, { level = 3, settings = null, after = null } = {}) {
  const evidence = Array.isArray(item?.evidence) ? item.evidence : [];
  return h('article', { class: 'suggestion' },
    h('div', { class: 'change' },
      h(`h${level}`, null, str(item?.change)),
      str(item?.why).trim() ? h('p', null, str(item.why)) : null),
    h('div', { class: 'grounds' },
      h(`h${level + 1}`, null, 'Evidence'),
      evidence.length ? h('ul', null, ...evidence.map((entry) => h('li', null, typeof entry === 'string' ? entry : h('code', null, str(entry))))) : h('p', { class: 'muted' }, 'None given.'),
      h(`h${level + 1}`, null, 'What to do next'),
      ...nextStep(item, settings),
      h('p', { class: 'note' }, 'A suggestion only: the teacher decides.'),
      after));
}

/** A tree as elements, in a browser. */
export function treeDom(node) {
  if (!Array.isArray(node)) return document.createTextNode(String(node));
  const [tag, attrs, ...children] = node;
  if (!TAGS.includes(tag)) throw new Error(`A view has no ${tag} element.`);
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (ATTRIBUTES.includes(name) && value != null && value !== false) element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) if (child != null && child !== false) element.append(treeDom(child));
  return element;
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escaped = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** A tree as HTML, on a server: the same elements and attributes treeDom builds, every text escaped. */
export function treeHtml(node) {
  if (node == null || node === false) return '';
  if (!Array.isArray(node)) return escaped(node);
  const [tag, attrs, ...children] = node;
  if (!TAGS.includes(tag)) throw new Error(`A view has no ${tag} element.`);
  const attributes = Object.entries(attrs || {}).filter(([name, value]) => ATTRIBUTES.includes(name) && value != null && value !== false)
    .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escaped(value)}"`)).join('');
  return `<${tag}${attributes}>${children.map(treeHtml).join('')}</${tag}>`;
}

/**
 * Functions and the constants they read, as source for a page's script. Bundled for a server, this code
 * may read a constant or call a function under a new name (TAGS2) and carry the bundler's __name helper:
 * the source declares what the code reads, by what it's called.
 */
export function asSource(constants, functions) {
  const code = functions.map(String);
  const source = code.join('\n');
  const declared = Object.entries(constants).flatMap(([name, value]) => [...new Set(source.match(new RegExp(`\\b${name}\\d*\\b`, 'g')) || [])].map((used) => `var ${used} = ${JSON.stringify(value)};`));
  return [...(source.includes('__name(') ? ['var __name = (target) => target;'] : []), ...declared, ...code].join('\n');
}

/** The functions and constants as source, for a page's own script: `<script>${PARTS_SCRIPT} ...</script>`. */
export const PARTS_SCRIPT = asSource({ TAGS, ATTRIBUTES, OUTCOMES, VERDICTS, TEST_VERDICTS, HELP_NAMES, MARKS }, [h, str, quote, mark, vettingRound, vettingRounds, testCase, helpScale, nextStep, suggestion, treeDom]).replace(/<\//g, '<\\/');

export const PARTS_CSS = `.muted,.note{color:var(--muted)}
.note{font-size:.9375rem;line-height:1.5}
.rounds{margin:0;padding:0;list-style:none}
.round+.round{margin-top:14px;padding-top:14px;border-top:1px solid var(--public-rule)}
.round-name{display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;margin:0 0 5px;color:var(--muted);font-size:.8125rem;font-weight:600;line-height:1.5}
.round-name .v-mark{font-size:.8125rem}
.round-body{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:clamp(12px,2.5vw,28px);align-items:start}
.round-body>:only-child{grid-column:1/-1}
.draft{position:relative}
.draft blockquote{margin:0;color:var(--public-ink);white-space:pre-wrap}
.draft p{margin:0}
del{color:var(--muted);text-decoration:line-through 1.5px var(--pencil-red);white-space:pre-wrap}
.pencil{margin:0;padding-left:12px;border-left:1.5px solid var(--pencil-red);color:var(--pencil-red);font-size:.9375rem;font-weight:500;line-height:1.42}
.pencil-who{display:block;font-size:.75rem;font-weight:600}
.error .pencil{border-left-color:var(--query-ochre);color:var(--query-ochre)}
.cases{margin:0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.cases>li{border-bottom:1px solid var(--public-rule)}
.case summary{display:flex;align-items:center;gap:10px;padding:11px 0;color:var(--public-ink);list-style:none;cursor:pointer}
.case summary::-webkit-details-marker{display:none}
.case summary .v-mark{flex:none;font-size:.875rem}
.case-name{min-width:0;font-weight:500}
.case summary::after{content:"+";flex:none;margin-left:auto;color:var(--muted);font-size:1.25rem;font-weight:300;line-height:1}
.case[open] summary::after{content:"−"}
.case dl{margin:0;padding:0 0 14px}
.case dt{margin-top:10px;color:var(--muted);font-size:.8125rem;font-weight:600}
.case dt:first-child{margin-top:0}
.case dd{margin:2px 0 0;color:var(--public-text)}
.case blockquote{margin:0;color:var(--public-ink);white-space:pre-wrap}
.scale{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);margin:0 0 10px;padding:0;list-style:none;color:var(--muted);font-size:.8125rem;line-height:1.3}
.scale li{position:relative;padding-top:14px;border-top:1px solid var(--public-rule-strong)}
.scale li::before{content:"";position:absolute;top:-5px;left:0;width:9px;height:9px;border-radius:50%;background:var(--public-rule-strong);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.scale .on{color:var(--ink-blue);font-weight:700}
.scale .on::before{background:var(--ink-blue);box-shadow:0 0 0 4px var(--ink-blue-line)}
.scale .from{color:var(--public-ink)}
.scale .from::before{border:1.5px solid var(--public-ink);background:var(--surface)}
.suggestion{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(20px,4vw,48px);padding:clamp(20px,3vw,36px);border-radius:var(--radius-lg);background:var(--surface);box-shadow:var(--public-shadow)}
.change>:first-child{font-size:clamp(1.375rem,2.3vw,1.75rem);font-weight:300;line-height:1.2;letter-spacing:-.025em}
.change p{margin:12px 0 0}
.grounds>:is(h2,h3,h4,h5){color:var(--public-ink);font-size:.875rem;font-weight:600;letter-spacing:0}
.grounds>*+:is(h2,h3,h4,h5){margin-top:18px}
.grounds ul{margin:4px 0 0;padding-left:1.1rem;font-size:.9375rem;line-height:1.5}
.grounds ul li+li{margin-top:4px}
.grounds p{margin:6px 0 0}
.grounds code{overflow-wrap:anywhere}
.grounds .scale{margin-top:16px}
.grounds .note{margin-top:14px;font-size:.8125rem}
@media (max-width:620px){.round-body,.suggestion{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:no-preference){
.watch .round{--at:0s}
.watch .round:nth-child(2){--at:1.7s}.watch .round:nth-child(3){--at:3.4s}.watch .round:nth-child(4){--at:5.1s}.watch .round:nth-child(n+5){--at:6.8s}
.watch .round:not(:first-child){animation:part-in .45s var(--ease-out) var(--at) both}
.watch .draft::after{content:"";position:absolute;right:0;left:0;height:1.5px;background:var(--ink-blue);animation:part-read .85s ease-in-out var(--at) both}
.watch del{text-decoration:none;background:linear-gradient(var(--pencil-red),var(--pencil-red)) no-repeat 0 56%/100% 1.5px;-webkit-box-decoration-break:clone;box-decoration-break:clone;animation:part-strike .5s ease-in-out calc(var(--at) + .8s) both}
.watch .round-name .v-mark{animation:part-land .4s var(--ease-out) calc(var(--at) + .9s) both}
.watch .pencil{animation:part-in .45s var(--ease-out) calc(var(--at) + 1.15s) both}
@keyframes part-in{from{opacity:0;transform:translateY(4px)}}
@keyframes part-read{0%{top:0;opacity:0}12%{opacity:1}88%{opacity:1}100%{top:100%;opacity:0}}
@keyframes part-strike{from{background-size:0 1.5px}}
@keyframes part-land{from{opacity:0;transform:scale(1.3)}}}`;
