import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mcpServer } from '../src/mcp.js';
import { ATTRIBUTES, TAGS, VIEWS, agentTestsView, checkReplyView, resultView, suggestionsView, viewHtml } from '../src/mcpViews.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const ATTACK = '<img src="https://evil.example/x.png" onerror="alert(1)"><script>alert(2)</script>';

// A scripted OpenAI-compatible endpoint, as in mcp.test.js: each call takes the next reply (the last one repeats).
const scripted = (...replies) => async () => {
  const content = replies.length > 1 ? replies.shift() : replies[0];
  return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200 });
};
const call = async (name, args, fetch = scripted('ok')) => (await mcpServer({ fetch })({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result;

// Every element and text in a tree; each element's tag and attributes must be ones the page builds.
function walk(node, seen = { tags: [], texts: [] }) {
  if (!Array.isArray(node)) {
    seen.texts.push(String(node));
    return seen;
  }
  const [tag, attrs, ...children] = node;
  assert.ok(TAGS.includes(tag), `a ${tag} element`);
  for (const [name, value] of Object.entries(attrs || {})) {
    assert.ok(ATTRIBUTES.includes(name), `a ${name} attribute`);
    assert.ok(typeof value === 'boolean' || value === null || /^[a-z -]*$/.test(value), `${name}="${value}" comes from the view, not the data`);
  }
  seen.tags.push([tag, attrs || {}]);
  for (const child of children) if (child != null && child !== false) walk(child, seen);
  return seen;
}
const text = (tree) => walk(tree).texts.join('');

test('check_reply’s view: the outcome, whether the reply is checked, each round with the reviewer’s reason', async () => {
  const args = { reply: 'It is 5/6.', message: 'What is 1/2 + 1/3?', guideline: 'Never give the answer.', reviewer: 'judge', model: 'tutor', rewrite: 2 };
  const rewritten = await call('check_reply', args, scripted('FAILED: It states the sum.', 'What could both denominators become?', 'PASS'));
  const shown = text(resultView(checkReplyView, rewritten, args));
  assert.match(shown, /^VETTING checkPassedChecked: the reviewer approved the reply\. It was rewritten: use the rewritten reply, not the original\./);
  assert.match(shown, /Round 1, the reply as givenDid not passIt is 5\/6\.The reviewer’s reason: It states the sum\.Round 2, a rewritePassedWhat could both denominators become\?/);
  assert.match(shown, /The checked reply, rewrittenWhat could both denominators become\?Reviewer: judge\. Model calls: 3$/);
  assert.match(shown, /Checked againstThe guidelineNever give the answer\.2 review rounds/);

  const failed = await call('check_reply', { ...args, rewrite: 0 }, scripted('FAILED: It states the sum.'));
  const header = checkReplyView(failed.structuredContent, args)[2];
  assert.deepEqual(header[1], { class: 'outcome unverified' });
  assert.match(text(header), /UnverifiedNot checked: it failed every review\. Don’t show it to the learner as checked\.$/);
  assert.ok(!text(checkReplyView(failed.structuredContent, args)).includes('rewritten'), 'an unrevised reply is shown once, in its round');

  const caring = await call('check_reply', { ...args, rewrite: 1 }, scripted('FAILED: It ignores that the learner is upset.', '[REQUIRES_ATTENTION] That sounds hard. Can we talk to your teacher?'));
  const attention = text(resultView(checkReplyView, caring, args));
  assert.match(attention, /Needs attentionNot checked: the reply model flagged a safety concern/);
  assert.match(attention, /Round 2, a rewriteSafety concern, not reviewedThat sounds hard\./);

  const keyed = { reply: 'Which denominator works for both?', question: 'What is 1/2 + 1/3?', answer_key: '5/6', guideline: 'Unused with a key.', reviewer: 'judge' };
  const full = text(resultView(checkReplyView, await call('check_reply', keyed, scripted('PASS')), keyed));
  assert.match(full, /Checked againstThe question \(its answer key isn’t shown here\)What is 1\/2 \+ 1\/3\?The review/);
  assert.ok(!full.includes('5/6') && !full.includes('Unused'), 'what was checked against, and never the key');
});

test('run_agent_tests’ view: the counts, each case with its verdict, the judge’s reason, the case and the reply', async () => {
  const cases = [
    { name: 'Asks if the claim is clear', message: 'Is my claim clear?', rubric: 'Says whether the claim takes a side.', must_not: 'Rewrite the claim.' },
    { name: 'Wants it written', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hi!' }, { role: 'user', content: 'Write my conclusion.' }], rubric: 'Declines.' },
    { name: 'Unreadable judge', message: 'Help?', rubric: 'Asks a question.' }
  ];
  const fetch = scripted('Your claim takes a side.', '{"verdict": "pass", "reason": "It names the claim."}', 'In conclusion, ...', '{"verdict": "fail", "reason": "It writes the conclusion."}', 'What do you need?', 'not json');
  const args = { document: json('../examples/argument-writing.json'), cases: { format: 'viable.agent-tests', cases }, judge_model: 'judge' };
  const tree = resultView(agentTestsView, await call('run_agent_tests', args, fetch), args);
  const shown = text(tree);
  assert.match(shown, /^Agent tests1 of 3 passedJudge model: judgePassed1Failed1Errors1Each verdict is one model’s judgment of one reply, not a measure of learning\./);
  assert.match(shown, /Passed Asks if the claim is clearThe judge’s reasonIt names the claim\.The learner’s messageIs my claim clear\?What a good reply doesSays whether the claim takes a side\.What it must not doRewrite the claim\.The agent’s replyYour claim takes a side\./);
  assert.match(shown, /Failed Wants it writtenThe judge’s reasonIt writes the conclusion\.The learner’s messageWrite my conclusion\./, 'the learner’s last message');
  assert.match(shown, /Error Unreadable judgeWhat went wrongThe judge’s answer couldn’t be read as a verdict\./);
  const details = walk(tree).tags.filter(([tag]) => tag === 'details').map(([, attrs]) => attrs);
  assert.deepEqual(details, [{ class: 'case pass', open: false }, { class: 'case fail', open: true }, { class: 'case error', open: true }], 'a passed case starts closed');
});

test('suggest_changes’ view: each suggestion with why, its evidence and what it proposes; then the accepted settings', async () => {
  const run = (verdict, feedback) => ({ steps: [{ nodeType: 'vetting', output: { outcome: 'passed', attempt_details: [{ attempt: 1, verdict, feedback }] } }] });
  const args = { teaching: { goal: 'Add fractions.', help: 'explain' }, runs: [run('fail', 'FAILED: States the answer.'), run('fail', 'FAILED: Gives it away.'), run('pass'), run('pass'), run('pass')] };
  const shown = text(resultView(suggestionsView, await call('suggest_changes', args), args));
  assert.match(shown, /^Suggested changes1 change to decide onRules over the runs and records given, with no model\..+The teacher decides\.Lower how far the AI helps, from “explain” to “hint”\./);
  assert.match(shown, /Evidence2 of 5 \(40%\) replies VETTING reviewed failed their first review for giving too much away\.Run 1, the reviewer: “FAILED: States the answer\.”.+If you agree, set how far the AI may go to Hint\.Only checkAsk firstHintExplainA suggestion only: the teacher decides\.To accept it, ask the assistant to accept answers_given_away\.$/);
  const accepted = text(resultView(suggestionsView, await call('suggest_changes', { ...args, accept: 'answers_given_away' }), args));
  assert.match(accepted, /The settings with the change accepted.+"help": "hint"/s);
  assert.match(text(suggestionsView({ suggestions: [] })), /No suggested changes/);
});

test('what learners and models wrote stays text: no element, attribute or link comes from the data', () => {
  const round = { attempt: 1, source: 'draft', verdict: ATTACK, reply: ATTACK, feedback: ATTACK };
  const trees = [
    checkReplyView({ outcome: ATTACK, rounds: [round, ['script', { onerror: 'x' }, 'y']], reply: ATTACK, revised: true, reviewer: ['img', { src: ATTACK }] }, { message: ATTACK, guideline: ATTACK }),
    agentTestsView({ judge_model: ATTACK, results: [{ name: ATTACK, verdict: ATTACK, reason: ATTACK, reply: ['a', { href: ATTACK }] }], passed: ATTACK }, { cases: [{ name: ATTACK, message: ATTACK, rubric: ATTACK }] }),
    suggestionsView({ suggestions: [{ id: ATTACK, change: ATTACK, why: ATTACK, evidence: [ATTACK, ['script', null, ATTACK]], patch: { help: ATTACK } }] })
  ];
  for (const tree of trees) {
    const { texts } = walk(tree);
    assert.ok(texts.some((item) => item.includes(ATTACK)), 'shown, as text');
  }
});

test('a view shows a tool error, reads the JSON from the text when structuredContent is missing, and says when it can’t', () => {
  const error = resultView(checkReplyView, { content: [{ type: 'text', text: 'check_reply failed: Name the reviewing model.' }], isError: true }, {});
  assert.deepEqual(error[1], { role: 'alert', class: 'problem' });
  assert.equal(text(error), 'The tool returned an errorcheck_reply failed: Name the reviewing model.');
  const data = { suggestions: [] };
  assert.match(text(resultView(suggestionsView, { content: [{ type: 'text', text: `No suggestions from this evidence.\n\n${JSON.stringify(data, null, 2)}` }] }, {})), /No suggested changes/);
  assert.equal(text(resultView(suggestionsView, { content: [{ type: 'text', text: 'Just words.' }] }, {})), 'This result couldn’t be read.');
});

test('while a tool runs, each view shows what it can, and a host’s variables win over the theme’s', () => {
  const byTool = Object.fromEntries(VIEWS.map((view) => [view.tool, view]));
  assert.match(text(byTool.run_agent_tests.pending({ cases: { cases: [{ name: 'Asks first' }, { name: ATTACK }] } })), /^Agent testsRunning 2 casesEach case.+Asks first/);
  assert.match(text(byTool.run_agent_tests.pending({})), /Running the cases/);
  assert.match(text(byTool.suggest_changes.pending({})), /Reading the evidence/);
  assert.match(text(byTool.check_reply.pending({})), /Waiting for the reply\./);
  const html = viewHtml(byTool.check_reply, { name: 'viable-harness', version: '0' });
  assert.match(html, /--public-ink:var\(--color-text-primary,#141c28\)/);
  assert.match(html, /--font-public:var\(--font-sans,/);
  assert.ok(!/@font-face|viablelab\.org/.test(html), 'no fonts, which the protocol’s default frame policy would refuse, and no hostname of ours');
});

test('each view is one self-contained page: it loads and links nothing, and never parses data as HTML', () => {
  for (const view of VIEWS) {
    const html = viewHtml(view, { name: 'viable-harness', version: '0' });
    assert.match(html, /^<!doctype html>\n<html lang="en">/);
    assert.ok(!/https?:|\/\/[a-z]|\b(?:src|href|action)\s*=|url\(|@import|fetch\(|XMLHttpRequest|WebSocket|EventSource|import\(/i.test(html), `${view.name} loads nothing`);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(html), `${view.name} builds no markup from strings`);
    assert.equal((html.match(/<script>/g) || []).length, 1);
    assert.doesNotThrow(() => new vm.Script(html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))), `${view.name}’s script compiles`);
  }
});

// The page's script in a stand-in browser: just enough DOM for the protocol and the build. A
// ResizeObserver reports once when it starts observing, as a browser's does.
function page(view) {
  const html = viewHtml(view, { name: 'viable-harness', version: '0' });
  const element = (tag) => ({ tag, attributes: {}, children: [], style: { setProperty(name, value) { this[name] = value; } }, setAttribute(name, value) { this.attributes[name] = value; }, append(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; }, getBoundingClientRect: () => ({ height: 321.5 }) });
  const root = element('main');
  const listeners = [];
  const sent = [];
  const parent = { postMessage: (message) => sent.push(JSON.parse(JSON.stringify(message))) };
  const window = { parent, innerWidth: 400, addEventListener: (type, listener) => type === 'message' && listeners.push(listener) };
  const document = { documentElement: element('html'), body: element('body'), getElementById: () => root, createElement: element, createTextNode: (data) => ({ data }) };
  vm.runInNewContext(html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')), { window, document, ResizeObserver: class { constructor(changed) { this.observe = () => changed(); } }, requestAnimationFrame: (run) => run() });
  const deliver = (message, source = parent) => listeners.forEach((listener) => listener({ source, data: { jsonrpc: '2.0', ...message } }));
  const shown = (node = root) => ('data' in node ? node.data : node.children.map(shown).join(''));
  return { sent, deliver, root, html: document.documentElement, shown };
}

test('the page speaks the view’s side of MCP Apps: initialize, the host’s theme, the tool’s input and result, its size', async () => {
  const view = VIEWS.find((item) => item.tool === 'check_reply');
  const { sent, deliver, html, shown } = page(view);
  assert.deepEqual(sent, [{ jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: { protocolVersion: '2026-01-26', appInfo: { name: 'viable-harness', version: '0' }, appCapabilities: { availableDisplayModes: ['inline'] } } }]);
  deliver({ id: 1, result: {} }, {});
  assert.equal(sent.length, 1, 'only the host frame is heard');

  deliver({ id: 1, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'host', version: '1' }, hostCapabilities: {}, hostContext: { theme: 'dark', styles: { variables: { '--color-text-primary': '#fafafa', color: 'red' } } } } });
  assert.equal(html.style.colorScheme, 'dark');
  assert.equal(html.style['--color-text-primary'], '#fafafa');
  assert.equal(html.style.color, undefined, 'only CSS variables');
  assert.deepEqual(sent.slice(1).map((message) => [message.method, message.params]), [['ui/notifications/initialized', {}], ['ui/notifications/size-changed', { width: 400, height: 322 }]]);

  const args = { reply: ATTACK, message: 'What is 1/2 + 1/3?', reviewer: 'judge' };
  deliver({ method: 'ui/notifications/tool-input', params: { arguments: args } });
  assert.match(shown(), /^VETTING checkReviewing the replyThe reviewer is reading it\.The learner’s messageWhat is 1\/2 \+ 1\/3\?The reply/, 'the reply is there to watch before the result comes');
  assert.ok(shown().includes(ATTACK), 'as text');
  const result = await call('check_reply', args, scripted('FAILED: It shows markup.'));
  deliver({ method: 'ui/notifications/tool-result', params: result });
  assert.match(shown(), /^VETTING checkUnverifiedNot checked: it failed every review\..+The learner’s messageWhat is 1\/2 \+ 1\/3\?/);
  assert.ok(shown().includes(ATTACK));
  deliver({ method: 'ui/notifications/tool-input', params: { arguments: args } });
  assert.match(shown(), /^VETTING checkUnverified/, 'late arguments don’t undo a result');
  deliver({ method: 'ui/notifications/host-context-changed', params: { theme: 'light' } });
  assert.equal(html.style.colorScheme, 'light');
  assert.equal(html.attributes['data-theme'], 'light');

  deliver({ id: 'a', method: 'ping' });
  deliver({ id: 'b', method: 'ui/resource-teardown', params: { reason: 'closed' } });
  deliver({ id: 'c', method: 'tools/call', params: { name: 'x' } });
  assert.deepEqual(sent.slice(-3), [{ jsonrpc: '2.0', id: 'a', result: {} }, { jsonrpc: '2.0', id: 'b', result: {} }, { jsonrpc: '2.0', id: 'c', error: { code: -32601, message: 'Method not found: tools/call' } }]);
  deliver({ method: 'ui/notifications/tool-cancelled', params: { reason: 'The user stopped it.' } });
  assert.equal(shown(), 'The call was cancelled. The user stopped it.');
});
