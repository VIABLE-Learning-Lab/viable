/**
 * MCP Apps views (the io.modelcontextprotocol/ui extension, SEP-1865, version 2026-01-26): in a host
 * that renders them, check_reply, run_agent_tests and suggest_changes show their result as a small
 * page in a sandboxed frame, beside the text every host gets. Each page is self-contained HTML, its
 * style and script inline, loading nothing. It speaks the view's side of the postMessage JSON-RPC:
 * ui/initialize for the host's theme and colours, the tool's arguments and result as notifications,
 * and its height as it changes. The render functions are pure: they turn a result into a DOM-free
 * tree that the page builds with createElement and text nodes, so text that learners and models
 * wrote is never parsed as markup.
 */
import { OUTCOMES, VERDICTS } from './view.js';

export const VIEW_EXTENSION = 'io.modelcontextprotocol/ui';
export const VIEW_MIME = 'text/html;profile=mcp-app';
const APPS_PROTOCOL = '2026-01-26';

// Everything a tree may hold: the page builds nothing else, and no attribute links or runs anything.
export const TAGS = ['div', 'header', 'section', 'article', 'footer', 'h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code', 'strong', 'span', 'details', 'summary'];
export const ATTRIBUTES = ['class', 'open', 'role'];
// Why a check ended unverified, in the VETTING step's terms (src/agents/engine.js).
const STOPS = { MAX_ATTEMPTS_REACHED: 'it failed every review', VERIFICATION_ERROR: 'a review couldn’t run', GENERATION_ERROR: 'a rewrite couldn’t be written' };
const TEST_VERDICTS = { pass: 'Passed', fail: 'Failed', error: 'Error' };

// The functions below run in the page too (viewHtml embeds their source): they use only each other,
// the constants above and the language, never this module's imports.
function h(tag, attrs, ...children) {
  return [tag, attrs, ...children];
}

function str(value) {
  if (value == null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function quote(value, empty) {
  return str(value).trim() ? h('blockquote', null, str(value)) : h('p', { class: 'muted' }, empty);
}

function heading(tool, title, attrs, ...rest) {
  return h('header', attrs, h('p', { class: 'eyebrow' }, tool), h('h1', null, title), ...rest);
}

/** A tool result's data: its structuredContent, or the JSON after the summary in its text. */
export function resultData(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  const text = (Array.isArray(result?.content) ? result.content : []).find((item) => item?.type === 'text')?.text || '';
  const at = text.indexOf('\n\n');
  try {
    return at < 0 ? null : JSON.parse(text.slice(at + 2));
  } catch {
    return null;
  }
}

/** check_reply: the outcome, whether the reply is checked, each round with the reviewer's reason, the rewrite. */
export function checkReplyView(data, args) {
  const outcome = Object.hasOwn(OUTCOMES, String(data.outcome)) ? data.outcome : 'unverified';
  const [label, why] = OUTCOMES[outcome];
  const passed = data.outcome === 'passed';
  const stop = outcome === 'unverified' && Object.hasOwn(STOPS, String(data.stop_reason)) ? STOPS[data.stop_reason] : why;
  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  // As check_reply reviews: against the question and its answer key when one is given, else the guideline.
  const against = (str(args.answer_key).trim() ? [['The question (its answer key isn’t shown here)', args.question]] : [['The guideline', args.guideline]]).filter(([, text]) => str(text).trim());
  return h('div', null,
    heading('check_reply', label, { class: `outcome ${outcome}` },
      h('p', null, passed
        ? `Checked: ${why}.${data.revised ? ' It was rewritten: use the rewritten reply, not the original.' : ''}`
        : `Not checked: ${stop}. Don’t show it to the learner as checked.`)),
    str(args.message).trim() ? h('section', null, h('h2', null, 'The learner’s message'), quote(args.message)) : null,
    against.length ? h('section', null, h('h2', null, 'Checked against'), h('dl', null, ...against.flatMap(([name, text]) => [h('dt', null, name), h('dd', null, str(text))]))) : null,
    h('section', null,
      h('h2', null, rounds.length === 1 ? 'The review' : `${rounds.length} review rounds`),
      h('ol', { class: 'rounds' }, ...rounds.map((round, i) => {
        const verdict = Object.hasOwn(VERDICTS, String(round?.verdict)) ? round.verdict : 'error';
        return h('li', { class: `round ${verdict}` },
          h('h3', null, `Round ${str(round?.attempt ?? i + 1)}, ${round?.source === 'draft' ? 'the reply as given' : 'a rewrite'}: `, h('span', { class: 'verdict' }, VERDICTS[verdict])),
          quote(round?.reply, round?.reply == null ? 'No reply: it couldn’t be written.' : 'An empty reply.'),
          str(round?.feedback).trim() ? h('p', null, h('strong', null, verdict === 'error' ? 'What went wrong: ' : 'The reviewer’s reason: '), str(round.feedback)) : null);
      }))),
    data.revised ? h('section', null, h('h2', null, passed ? 'The checked reply, rewritten' : 'The last rewrite, not checked'), quote(data.reply, 'No reply.')) : null,
    h('footer', null, [data.reviewer ? `Reviewer: ${str(data.reviewer)}` : '', data.model_calls != null ? `Model calls: ${str(data.model_calls)}` : ''].filter(Boolean).join('. ')));
}

/** run_agent_tests: the counts, then each case with its verdict, the judge's reason, the case and the reply. */
export function agentTestsView(data, args) {
  const results = Array.isArray(data.results) ? data.results : [];
  const cases = Array.isArray(args.cases) ? args.cases : Array.isArray(args.cases?.cases) ? args.cases.cases : [];
  return h('div', null,
    heading('run_agent_tests', 'Agent tests', null,
      h('p', null, data.judge_component ? `Judge component: ${str(data.judge_component)}` : `Judge model: ${str(data.judge_model)}`)),
    h('dl', { class: 'counts' }, ...[['pass', 'Passed', data.passed], ['fail', 'Failed', data.failed], ['error', 'Errors', data.errors]]
      .map(([key, name, count]) => h('div', { class: key }, h('dt', null, name), h('dd', null, str(count ?? 0))))),
    h('p', { class: 'note' }, 'Each verdict is one model’s judgment of one reply, not a measure of learning. An error is a case that couldn’t be run or judged, not a fail.'),
    results.length ? h('ul', { class: 'cases' }, ...results.map((result, i) => {
      const verdict = Object.hasOwn(TEST_VERDICTS, String(result?.verdict)) ? result.verdict : 'error';
      // Results come back in the cases' order.
      const item = cases[i]?.name === result?.name ? cases[i] : null;
      const message = item?.message ?? (Array.isArray(item?.messages) ? item.messages.at(-1)?.content : null);
      const part = (name, value) => (str(value).trim() ? [h('dt', null, name), h('dd', null, str(value))] : []);
      return h('li', null, h('details', { class: `case ${verdict}`, open: verdict !== 'pass' },
        h('summary', null, h('span', { class: 'badge' }, TEST_VERDICTS[verdict]), ' ', str(result?.name)),
        h('dl', null,
          ...part(verdict === 'error' ? 'What went wrong' : 'The judge’s reason', result?.reason),
          ...(str(message).trim() ? [h('dt', null, 'The learner’s message'), h('dd', null, quote(message))] : []),
          ...part('What a good reply does', item?.rubric),
          ...part('What it must not do', item?.must_not),
          h('dt', null, 'The agent’s reply'),
          h('dd', null, quote(result?.reply, result?.reply == null ? 'No reply: the run failed.' : 'The agent gave no reply.')))));
    })) : h('p', { class: 'muted' }, 'No cases ran.'));
}

/** suggest_changes: each suggestion with why, its evidence and what it proposes; or the settings once one is accepted. */
export function suggestionsView(data) {
  if (!Array.isArray(data.suggestions)) {
    return h('div', null,
      heading('suggest_changes', 'The settings with the change accepted', null,
        h('p', null, 'The activity’s teaching settings with the accepted change. This server keeps nothing: save them where the activity is kept.')),
      h('pre', null, h('code', null, JSON.stringify(data.teaching ?? null, null, 2))));
  }
  const list = data.suggestions;
  return h('div', null,
    heading('suggest_changes', list.length ? `${list.length} suggested change${list.length === 1 ? '' : 's'}` : 'No suggested changes', null,
      h('p', { class: 'note' }, 'Rules over the runs and records given, with no model. Each says what the records show, never what learners learned. The teacher decides.')),
    ...list.map((item) => h('article', { class: 'card' },
      h('h2', null, str(item?.change)),
      str(item?.why).trim() ? h('p', null, str(item.why)) : null,
      h('h3', null, 'Evidence'),
      Array.isArray(item?.evidence) && item.evidence.length ? h('ul', null, ...item.evidence.map((entry) => h('li', null, str(entry)))) : h('p', { class: 'muted' }, 'None given.'),
      h('p', null, item?.patch ? 'Proposes: ' : 'Proposes no setting: it asks the teacher to look at the evidence.', item?.patch ? h('code', null, JSON.stringify(item.patch)) : null),
      h('p', { class: 'muted' }, 'To accept it, its id: ', h('code', null, str(item?.id))))));
}

/** What a view shows for a tool result: the render function's tree, or what went wrong. */
export function resultView(render, result, args) {
  if (result?.isError) {
    const text = (Array.isArray(result.content) ? result.content : []).find((item) => item?.type === 'text')?.text;
    return h('div', { role: 'alert', class: 'problem' }, h('h1', null, 'The tool returned an error'), h('p', null, str(text)));
  }
  const data = resultData(result);
  return data && typeof data === 'object' ? render(data, args && typeof args === 'object' ? args : {}) : h('p', { role: 'alert', class: 'problem' }, 'This result couldn’t be read.');
}

// The page's side of the protocol (browser only).
function main(render, appInfo) {
  const html = document.documentElement;
  const root = document.getElementById('view');
  let args = {};
  const post = (message) => window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
  const build = (node) => {
    if (!Array.isArray(node)) return document.createTextNode(String(node));
    const [tag, attrs, ...children] = node;
    if (!TAGS.includes(tag)) throw new Error(`A view has no ${tag} element.`);
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) {
      if (ATTRIBUTES.includes(name) && value != null && value !== false) element.setAttribute(name, value === true ? '' : String(value));
    }
    for (const child of children) if (child != null && child !== false) element.append(build(child));
    return element;
  };
  const show = (tree) => root.replaceChildren(build(tree));
  // The host's theme and its CSS variables, when it sends them; else the page follows the system's.
  const apply = (context) => {
    if (context?.theme === 'light' || context?.theme === 'dark') html.style.colorScheme = context.theme;
    for (const [name, value] of Object.entries(context?.styles?.variables || {})) {
      if (name.startsWith('--') && typeof value === 'string') html.style.setProperty(name, value);
    }
  };
  let pending = false;
  let last = '';
  const report = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const height = html.style.height;
      html.style.height = 'max-content';
      const size = { width: Math.ceil(window.innerWidth), height: Math.ceil(html.getBoundingClientRect().height) };
      html.style.height = height;
      if (`${size.width}x${size.height}` === last) return;
      last = `${size.width}x${size.height}`;
      post({ method: 'ui/notifications/size-changed', params: size });
    });
  };
  window.addEventListener('message', ({ source, data: message }) => {
    if (source !== window.parent || message?.jsonrpc !== '2.0') return;
    if (message.method === undefined) {
      // The only request the page sends is ui/initialize.
      if (message.id !== 1) return;
      apply(message.result?.hostContext);
      post({ method: 'ui/notifications/initialized', params: {} });
      new ResizeObserver(report).observe(document.body);
      return;
    }
    const { id, method, params } = message;
    if (method === 'ui/notifications/tool-input') args = params?.arguments || {};
    else if (method === 'ui/notifications/tool-result') show(resultView(render, params, args));
    else if (method === 'ui/notifications/tool-cancelled') show(h('p', { role: 'alert', class: 'problem' }, `The call was cancelled.${params?.reason ? ` ${str(params.reason)}` : ''}`));
    else if (method === 'ui/notifications/host-context-changed') apply(params);
    if (id !== undefined) post(method === 'ui/resource-teardown' || method === 'ping' ? { id, result: {} } : { id, error: { code: -32601, message: `Method not found: ${method}` } });
  });
  post({ id: 1, method: 'ui/initialize', params: { protocolVersion: APPS_PROTOCOL, appInfo, appCapabilities: { availableDisplayModes: ['inline'] } } });
}

// The host's variables (SEP-1865's standard names) first, else colours of the page's own in light and dark.
const STYLE = `:root{color-scheme:light dark;
--bg:var(--color-background-primary,light-dark(#fff,#0d1117));--soft:var(--color-background-secondary,light-dark(#f6f8fa,#161b22));
--fg:var(--color-text-primary,light-dark(#1f2328,#e6edf3));--muted:var(--color-text-secondary,light-dark(#59636e,#9da7b3));
--line:var(--color-border-primary,light-dark(#d1d9e0,#3d444d));--radius:var(--border-radius-md,8px);
--good:var(--color-text-success,light-dark(#116329,#56d364));--warn:var(--color-text-warning,light-dark(#7a4a00,#e3b341));--bad:var(--color-text-danger,light-dark(#a40e26,#ff8e86))}
*{box-sizing:border-box}
html,body{background:var(--bg)}
body{margin:0;padding:12px 16px 16px;color:var(--fg);font-family:var(--font-sans,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);font-size:var(--font-text-md-size,15px);line-height:var(--font-text-md-line-height,1.5);overflow-wrap:anywhere}
h1{font-size:var(--font-heading-md-size,1.25rem);line-height:1.25;margin:0 0 .25rem}
h2{font-size:var(--font-heading-sm-size,1rem);margin:1.25rem 0 .5rem}
h3{font-size:1rem;margin:0 0 .35rem}
p{margin:.25rem 0}
code,pre,.eyebrow{font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
code{font-size:.9em}
pre{white-space:pre-wrap;background:var(--soft);padding:.5rem .75rem;border-radius:var(--radius);margin:.5rem 0}
blockquote{margin:.35rem 0;padding:.5rem .75rem;background:var(--soft);border-left:3px solid var(--line);border-radius:0 var(--radius) var(--radius) 0;white-space:pre-wrap}
.eyebrow{font-size:.8rem;margin:0}
.eyebrow,.muted,.note,footer,.counts dt{color:var(--muted)}
.passed,.pass{--status:var(--good)}.unverified,.error{--status:var(--warn)}.attention,.fail,.safety{--status:var(--bad)}
header{border-left:4px solid var(--status,var(--line));padding-left:.75rem}
header.outcome h1,.verdict,.badge{color:var(--status)}
.badge{font-weight:600}
ol.rounds,ul.cases{list-style:none;padding:0;margin:0}
ul{padding-left:1.25rem}
.round,.case,.card,.counts div,.problem{border:1px solid var(--line);border-left:4px solid var(--status,var(--line));border-radius:var(--radius);padding:.6rem .75rem;margin:.5rem 0}
.problem{--status:var(--bad)}
.card>:first-child,.problem>:first-child{margin-top:0}
.card h3{margin-top:.75rem}
summary{cursor:pointer;font-weight:600}
summary .badge{margin-right:.25rem}
.case dl{margin:.5rem 0 0}
dt{font-weight:600;margin-top:.5rem}
dd{margin:0}
.counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin:.75rem 0}
.counts div{margin:0}
.counts dt{font-weight:normal;font-size:.85rem;margin:0}
.counts dd{font-size:1.5rem;font-weight:600;font-variant-numeric:tabular-nums}
footer{margin-top:1rem;font-size:.85rem}`;

export const VIEWS = [
  { uri: 'ui://viable-harness/check-reply', name: 'check-reply', title: 'VETTING check', tool: 'check_reply', render: checkReplyView,
    description: 'check_reply’s result: the outcome and whether the reply is checked, each review round’s verdict and the reviewer’s reason, and the rewritten reply.' },
  { uri: 'ui://viable-harness/agent-tests', name: 'agent-tests', title: 'Agent tests', tool: 'run_agent_tests', render: agentTestsView,
    description: 'run_agent_tests’ result: how many cases passed, failed and couldn’t be judged, and each case with the judge’s reason and the agent’s reply.' },
  { uri: 'ui://viable-harness/suggestions', name: 'suggestions', title: 'Suggested changes', tool: 'suggest_changes', render: suggestionsView,
    description: 'suggest_changes’ result: each suggested change with why, its evidence and the setting it proposes, or the settings once one is accepted.' }
];

/** One view's page: self-contained HTML that loads nothing. appInfo is { name, version } for ui/initialize. */
export function viewHtml(view, appInfo) {
  const constants = { APPS_PROTOCOL, TAGS, ATTRIBUTES, OUTCOMES, VERDICTS, STOPS, TEST_VERDICTS };
  const script = [
    ...Object.entries(constants).map(([name, value]) => `const ${name} = ${JSON.stringify(value)};`),
    ...[h, str, quote, heading, resultData, resultView, view.render, main].map(String),
    `main(${view.render.name}, ${JSON.stringify(appInfo)});`
  ].join('\n').replace(/<\//g, '<\\/');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${view.title}</title>
<style>
${STYLE}
</style>
</head>
<body>
<main id="view"><p class="muted">Waiting for the result…</p></main>
<script>
${script}
</script>
</body>
</html>
`;
}
