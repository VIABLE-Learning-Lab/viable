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
import { themeCss } from './ui/theme.js';
import { ATTRIBUTES, MARKS, OUTCOMES, PARTS_CSS, PARTS_SCRIPT, asSource, TAGS, h, mark, quote, str, suggestion, testCase, treeDom, vettingRounds } from './ui/parts.js';

export { ATTRIBUTES, TAGS };
export const VIEW_EXTENSION = 'io.modelcontextprotocol/ui';
export const VIEW_MIME = 'text/html;profile=mcp-app';
const APPS_PROTOCOL = '2026-01-26';

// Why a check ended unverified, in the VETTING step's terms (src/agents/engine.js).
const STOPS = { MAX_ATTEMPTS_REACHED: 'it failed every review', VERIFICATION_ERROR: 'a review couldn’t run', GENERATION_ERROR: 'a rewrite couldn’t be written' };

// The functions below run in the page too (viewHtml embeds their source): they use only each other,
// the parts (ui/parts.js), the constants above and the language, never this module's other imports.
function heading(label, title, attrs, ...rest) {
  return h('header', attrs, h('p', { class: 'eyebrow' }, label), h('h1', null, title), ...rest);
}

function casesOf(args) {
  return Array.isArray(args.cases) ? args.cases : Array.isArray(args.cases?.cases) ? args.cases.cases : [];
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

/** check_reply while it runs: the reply, with the reviewer reading it. */
export function checkReplyPending(args) {
  return h('div', null,
    heading('VETTING check', 'Reviewing the reply', { class: 'outcome waiting' }, h('p', null, 'The reviewer is reading it.')),
    str(args.message).trim() ? h('section', { class: 'asked' }, h('h2', null, 'The learner’s message'), quote(args.message)) : null,
    h('section', null, h('h2', null, 'The reply'), h('div', { class: 'draft v-reading' }, quote(args.reply, 'Waiting for the reply.'))));
}

/** check_reply: whether the reply is checked, each round as a marked-up draft that plays in order, the rewrite. */
export function checkReplyView(data, args) {
  const outcome = Object.hasOwn(OUTCOMES, String(data.outcome)) ? data.outcome : 'unverified';
  const [label, why] = OUTCOMES[outcome];
  const passed = data.outcome === 'passed';
  const stop = outcome === 'unverified' && Object.hasOwn(STOPS, String(data.stop_reason)) ? STOPS[data.stop_reason] : why;
  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  // As check_reply reviews: against the question and its answer key when one is given, else the guideline.
  const against = (str(args.answer_key).trim() ? [['The question (its answer key isn’t shown here)', args.question]] : [['The guideline', args.guideline]]).filter(([, text]) => str(text).trim());
  return h('div', null,
    heading('VETTING check', mark(MARKS[outcome], label), { class: `outcome ${outcome}` },
      h('p', null, passed
        ? `Checked: ${why}.${data.revised ? ' It was rewritten: use the rewritten reply, not the original.' : ''}`
        : `Not checked: ${stop}. Don’t show it to the learner as checked.`)),
    str(args.message).trim() ? h('section', { class: 'asked' }, h('h2', null, 'The learner’s message'), quote(args.message)) : null,
    against.length ? h('section', null, h('h2', null, 'Checked against'), h('dl', null, ...against.flatMap(([name, text]) => [h('dt', null, name), h('dd', null, str(text))]))) : null,
    h('section', null,
      h('h2', null, rounds.length === 1 ? 'The review' : `${rounds.length} review rounds`),
      vettingRounds(rounds, { watch: true })),
    data.revised ? h('section', { class: 'after' }, h('h2', null, passed ? 'The checked reply, rewritten' : 'The last rewrite, not checked'), quote(data.reply, 'No reply.')) : null,
    h('footer', { class: 'after' }, [data.reviewer ? `Reviewer: ${str(data.reviewer)}` : '', data.model_calls != null ? `Model calls: ${str(data.model_calls)}` : ''].filter(Boolean).join('. ')));
}

/** run_agent_tests while it runs: the cases, waiting for their marks. */
export function agentTestsPending(args) {
  const cases = casesOf(args);
  return h('div', null,
    heading('Agent tests', cases.length ? `Running ${cases.length} case${cases.length === 1 ? '' : 's'}` : 'Running the cases', { class: 'outcome waiting' }, h('p', null, 'Each case asks the agent, and a judge reads its reply.')),
    cases.length ? h('ul', { class: 'cases waiting v-reading' }, ...cases.map((item) => h('li', { class: 'case-waiting' }, str(item?.name)))) : null);
}

/** run_agent_tests: the counts, then each case, with its verdict, the judge's reason, the case and the reply. */
export function agentTestsView(data, args) {
  const results = Array.isArray(data.results) ? data.results : [];
  const cases = casesOf(args);
  return h('div', null,
    heading('Agent tests', `${str(data.passed ?? 0)} of ${results.length} passed`, { class: `outcome ${data.failed || data.errors || !results.length ? 'mixed' : 'passed'}` },
      h('p', null, data.judge_component ? `Judge component: ${str(data.judge_component)}` : `Judge model: ${str(data.judge_model)}`)),
    h('dl', { class: 'counts' }, ...[['pass', 'Passed', data.passed], ['fail', 'Failed', data.failed], ['unverified', 'Errors', data.errors]]
      .map(([key, name, count]) => h('div', null, h('dt', { class: `v-mark ${key}` }, name), h('dd', null, str(count ?? 0))))),
    h('p', { class: 'note' }, 'Each verdict is one model’s judgment of one reply, not a measure of learning. An error is a case that couldn’t be run or judged, not a fail.'),
    // Results come back in the cases' order.
    results.length ? h('ul', { class: 'cases landing' }, ...results.map((result, i) => testCase(result, cases[i]?.name === result?.name ? cases[i] : null))) : h('p', { class: 'muted' }, 'No cases ran.'));
}

/** suggest_changes while it runs. */
export function suggestionsPending() {
  return h('div', null, heading('Suggested changes', 'Reading the evidence', { class: 'outcome waiting v-reading' }, h('p', null, 'Rules over the runs and records given, with no model.')));
}

/** suggest_changes: each suggestion, as on the teacher's page; or the settings once one is accepted. */
export function suggestionsView(data, args = {}) {
  if (!Array.isArray(data.suggestions)) {
    return h('div', null,
      heading('Suggested changes', 'The settings with the change accepted', { class: 'outcome passed' },
        h('p', null, 'The activity’s teaching settings with the accepted change. This server keeps nothing: save them where the activity is kept.')),
      h('pre', { class: 'v-code' }, h('code', null, JSON.stringify(data.teaching ?? null, null, 2))));
  }
  const list = data.suggestions;
  return h('div', null,
    heading('Suggested changes', list.length ? `${list.length} change${list.length === 1 ? '' : 's'} to decide on` : 'No suggested changes', { class: 'outcome waiting' },
      h('p', null, 'Rules over the runs and records given, with no model. Each says what the records show, never what learners learned. The teacher decides.')),
    ...list.map((item) => suggestion(item, { level: 2, settings: args.teaching, after: h('p', { class: 'note' }, 'To accept it, ask the assistant to accept ', h('code', null, str(item?.id)), '.') })));
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
function main(render, waiting, appInfo) {
  const html = document.documentElement;
  const root = document.getElementById('view');
  let args = {};
  let answered = false;
  const post = (message) => window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
  const show = (tree) => root.replaceChildren(treeDom(tree));
  // The host's theme and its CSS variables, when it sends them; else the page follows the system's.
  const apply = (context) => {
    if (context?.theme === 'light' || context?.theme === 'dark') {
      html.style.colorScheme = context.theme;
      html.setAttribute('data-theme', context.theme);
    }
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
    if (method === 'ui/notifications/tool-input') {
      args = params?.arguments || {};
      if (!answered) show(waiting(args));
    } else if (method === 'ui/notifications/tool-result') {
      answered = true;
      show(resultView(render, params, args));
    }
    else if (method === 'ui/notifications/tool-cancelled') show(h('p', { role: 'alert', class: 'problem' }, `The call was cancelled.${params?.reason ? ` ${str(params.reason)}` : ''}`));
    else if (method === 'ui/notifications/host-context-changed') apply(params);
    if (id !== undefined) post(method === 'ui/resource-teardown' || method === 'ping' ? { id, result: {} } : { id, error: { code: -32601, message: `Method not found: ${method}` } });
  });
  post({ id: 1, method: 'ui/initialize', params: { protocolVersion: APPS_PROTOCOL, appInfo, appCapabilities: { availableDisplayModes: ['inline'] } } });
}

// The host's variables (SEP-1865's standard names) win, token by token. No fonts inlined: the protocol's
// default frame policy doesn't allow them, so a view has the host's font, else the system's.
const HOST_VARIABLES = {
  surface: '--color-background-primary', 'public-page': '--color-background-primary',
  'field-mist': '--color-background-secondary', 'field-sage': '--color-background-secondary', 'field-stone': '--color-background-secondary', 'field-lilac': '--color-background-secondary',
  'public-ink': '--color-text-primary', 'public-text': '--color-text-primary', muted: '--color-text-secondary',
  'public-rule': '--color-border-primary', 'public-rule-strong': '--color-border-primary',
  'ink-blue': '--color-text-info', 'pass-green': '--color-text-success', 'pencil-red': '--color-text-danger', 'query-ochre': '--color-text-warning',
  'pass-soft': '--color-background-success', 'pencil-soft': '--color-background-danger', 'query-soft': '--color-background-warning',
  radius: '--border-radius-md', 'font-public': '--font-sans', 'font-public-mono': '--font-mono'
};
const STYLE = `body{padding:0 18px 18px;font-size:var(--font-text-md-size,15px);line-height:var(--font-text-md-line-height,1.5);overflow-wrap:anywhere}
.eyebrow{margin:0 0 6px;color:var(--muted);font-size:.8125rem;font-weight:600}
h1{font-size:var(--font-heading-md-size,clamp(1.5rem,6vw,2rem));font-weight:300;line-height:1.12;letter-spacing:-.03em}
.outcome{margin:0 -18px 16px;padding:16px 18px;background:var(--field-mist)}
.outcome.passed{background:var(--pass-soft)}.outcome.unverified,.outcome.mixed{background:var(--query-soft)}.outcome.attention{background:var(--pencil-soft)}
.outcome h1 .v-mark{font:inherit;letter-spacing:inherit}
.outcome h1 .v-mark::before{width:.9em;height:.9em}
.outcome>p:last-child{margin:8px 0 0;color:var(--public-ink)}
section{margin-top:18px}
section h2{margin:0 0 6px;color:var(--muted);font-size:.8125rem;font-weight:600;line-height:1.5;letter-spacing:0}
blockquote{margin:0;white-space:pre-wrap}
section dl{margin:0}
section dt{color:var(--public-ink);font-weight:600}
section dd{margin:0}
.asked blockquote{color:var(--public-ink);font-size:1.125rem;font-weight:300;line-height:1.4;letter-spacing:-.01em}
.after blockquote{padding:10px 12px;border-radius:var(--radius-sm);background:var(--field-mist);color:var(--public-ink)}
footer{margin-top:16px;padding-top:10px;border-top:1px solid var(--public-rule);color:var(--muted);font-size:.8125rem}
.counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:0 0 12px;border-bottom:1px solid var(--public-rule)}
.counts div{padding:0 10px 10px 0}
.counts div+div{padding-left:12px;border-left:1px solid var(--public-rule)}
.counts dt{display:flex;font-size:.8125rem}
.counts dd{margin:2px 0 0;color:var(--public-ink);font-size:1.625rem;font-weight:300;line-height:1.1;font-variant-numeric:tabular-nums}
.cases{margin-top:12px}
.case-waiting{padding:10px 0;color:var(--muted)}
.suggestion{margin-top:12px;padding:16px 18px;grid-template-columns:minmax(0,1fr);gap:14px;border:1px solid var(--public-rule);box-shadow:none}
.change>:first-child{font-size:1.25rem}
.v-code{white-space:pre-wrap;overflow-wrap:anywhere}
.problem{margin:16px 0 0;padding:12px 14px;border-radius:var(--radius-sm);background:var(--pencil-soft);color:var(--pencil-red)}
.problem h1{font-size:1.125rem;font-weight:500;letter-spacing:0;color:inherit}
.problem p{margin:6px 0 0}
#view>p:first-child{margin:16px 0 0}
@media (prefers-reduced-motion:no-preference){
main:has(.watch){--end:1.4s}
main:has(.round:nth-child(2)){--end:3.1s}
main:has(.round:nth-child(3)){--end:4.8s}
main:has(.round:nth-child(4)){--end:6.5s}
main:has(.round:nth-child(5)){--end:8.2s}
main:has(.watch) .outcome{animation:view-band .5s ease var(--end) both}
main:has(.watch) .outcome h1{position:relative}
main:has(.watch) .outcome h1::after{content:"Reviewing the reply"/"";position:absolute;top:0;left:0;color:var(--public-ink);animation:view-out .2s linear var(--end) both}
main:has(.watch) .outcome h1 .v-mark{animation:part-land .5s var(--ease-out) var(--end) both}
main:has(.watch) .outcome>p:last-child,main:has(.watch) .after{animation:part-in .45s var(--ease-out) calc(var(--end) + .1s) both}
@keyframes view-band{from{background:var(--field-mist)}}
@keyframes view-out{to{opacity:0}}
.landing>li{animation:part-in .4s var(--ease-out) both}
${[...Array(10)].map((_, i) => `.landing>li:nth-child(${i + 2}){animation-delay:${(i + 1) * 90}ms}`).join('')}.landing>li:nth-child(n+12){animation-delay:990ms}}`;

export const VIEWS = [
  { uri: 'ui://viable-harness/check-reply', name: 'check-reply', title: 'VETTING check', tool: 'check_reply', render: checkReplyView, pending: checkReplyPending,
    description: 'check_reply’s result: the outcome and whether the reply is checked, each review round’s verdict and the reviewer’s reason, and the rewritten reply.' },
  { uri: 'ui://viable-harness/agent-tests', name: 'agent-tests', title: 'Agent tests', tool: 'run_agent_tests', render: agentTestsView, pending: agentTestsPending,
    description: 'run_agent_tests’ result: how many cases passed, failed and couldn’t be judged, and each case with the judge’s reason and the agent’s reply.' },
  { uri: 'ui://viable-harness/suggestions', name: 'suggestions', title: 'Suggested changes', tool: 'suggest_changes', render: suggestionsView, pending: suggestionsPending,
    description: 'suggest_changes’ result: each suggested change with why, its evidence and the setting it proposes, or the settings once one is accepted.' }
];

/** One view's page: self-contained HTML that loads nothing. appInfo is { name, version } for ui/initialize. */
export function viewHtml(view, appInfo) {
  const called = (fn) => String(fn).match(/^function\s+([\w$]+)/)[1];
  const script = [
    PARTS_SCRIPT,
    asSource({ APPS_PROTOCOL, STOPS, ATTRIBUTES, MARKS, OUTCOMES, TAGS }, [heading, casesOf, resultData, resultView, view.pending, view.render, main]),
    `${called(main)}(${called(view.render)}, ${called(view.pending)}, ${JSON.stringify(appInfo)});`
  ].join('\n').replace(/<\//g, '<\\/');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${view.title}</title>
<style>
${themeCss({ fonts: 'none', host: HOST_VARIABLES })}
${PARTS_CSS}
${STYLE}
</style>
</head>
<body>
<main id="view" aria-live="polite"><p class="muted">Waiting for the result…</p></main>
<script>
${script}
</script>
</body>
</html>
`;
}
