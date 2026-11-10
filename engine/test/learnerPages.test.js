// The shared pages: what a page holds is public, so it holds no secret, offers only what its host
// provides, and hostile text stays text. Answer keys and a teacher's notes never reach it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderChatPage, embedScript } from '../src/learner/chatPage.js';
import { renderHome } from '../src/learner/home.js';
import { chatPageSettings } from '../src/learner/settings.js';
import { chatPageHeaders, unavailablePage } from '../src/learner/shell.js';
import { publicItem, normalizeItems, gradeResponse } from '../src/learner/questions.js';
import { keptEvents, publicWorkspace, workspaceContext, workspaceRunContext, workspaceSettings } from '../src/learner/workspace.js';
import { chatReply, questionReplies, releaseState, stepReply } from '../src/learner/logic.js';

const EXAMPLE = new URL('../../examples/fractions-practice.json', import.meta.url);
const NO_HOSTNAME = /viablelab\.org|viablelearning\.org|developers\.viable/i;
const settings = (over = {}) => chatPageSettings({ title: 'Desk', greeting: 'Hello', starters: ['Hi'], ...over }, 'Desk');
const config = (html) => JSON.parse(/const CONFIG = (\{.*?\});\n/s.exec(html)[1]);
const course = { code: 'c', title: 'Course', description: 'About it', audience: 'teens', data_level: 'minimal' };
const SET = new Map([['s', { id: 's', title: 'Set', items: normalizeItems([
  { id: 'q1', type: 'single', prompt: 'Which?', choices: ['Yes', 'No'], answer: { choice: 'a' }, hints: ['A secret hint'], explanation: 'A secret explanation' },
  { id: 'q2', type: 'fill', prompt: 'Fill', answer: { accept: ['the-secret-key'] } },
  { id: 'q3', type: 'short', prompt: 'Why?', answer: { model: 'A secret model answer' }, show_model: true },
  { id: 'q4', type: 'order', prompt: 'Order', choices: ['First', 'Second', 'Third'], answer: {} }
]) }]]);
const panels = (extra = {}) => ({ ...workspaceSettings({ ai: 'right', panels: [{ id: 'q', type: 'questions', title: 'Questions', set_id: `qs_${'0'.repeat(24)}` }], ...extra }) });
const workspaceOn = (ws) => ({ ...ws, panels: ws.panels.map((panel) => (panel.type === 'questions' ? { ...panel, set_id: 's' } : panel)) });

test('a reply shows pictures and audio from https; from its own /media/ only for a host that says it keeps them there', () => {
  const output = { text: 'Hi', attachments: [{ type: 'image', url: 'https://cdn.example/a.png' }, { type: 'image', url: '/media/a.png' }, { type: 'image', url: 'http://elsewhere.example/a.png' }, { type: 'audio', url: '/media/a.mp3' }, { type: 'audio', url: 'data:audio/mpeg;base64,AAAA' }] };
  const plain = chatReply({ output, conversationId: 'c', runId: 'r' }).reply;
  assert.deepEqual([plain.images, plain.audio], [[{ url: 'https://cdn.example/a.png' }], []]);
  const own = chatReply({ output, conversationId: 'c', runId: 'r', ownMedia: 'http://127.0.0.1:8080' }).reply;
  assert.deepEqual(own.images, [{ url: 'https://cdn.example/a.png' }, { url: 'http://127.0.0.1:8080/media/a.png' }]);
  assert.deepEqual(own.audio, [{ url: 'http://127.0.0.1:8080/media/a.mp3' }]);
});

test('with an empty host a page names no host and offers no feature', () => {
  const html = renderChatPage({ slug: 'desk', mode: 'page', settings: settings(), host: {} }, 'n');
  const seen = config(html);
  assert.equal(seen.voice, false);
  assert.equal(seen.handsFree, false);
  assert.equal(seen.speaks, false);
  assert.deepEqual(seen.attach, { images: false, files: false });
  assert.equal(seen.ratings, false);
  assert.equal(seen.signals, false);
  assert.equal(seen.asks, false);
  assert.ok(!NO_HOSTNAME.test(html), 'no hostname of the platform');
  assert.ok(!/Powered by/.test(html), 'no line for a host that gave none');
  assert.ok(!/<script src=/.test(html), 'no browser file it wasn’t given');
  assert.ok(!/VIABLE_SLOTS = /.test(html), 'no host’s code');
  assert.ok(!/\b(?:consent|research study|study-bar|ViableStudy)\b/i.test(html), 'no study');
  const home = renderHome({ course, how: { identify: 'code' }, ask: { title: 'Enter your code', text: 'x', label: 'Code' }, host: {} }, 'n');
  assert.ok(!NO_HOSTNAME.test(home));
  assert.ok(!/\b(?:consent|ViableStudy|About the study)\b/i.test(home));
  assert.ok(!/Start fresh/.test(home));
  assert.ok(!NO_HOSTNAME.test(embedScript('https://school.example')));
  assert.ok(!NO_HOSTNAME.test(unavailablePage({ title: 't', message: 'm' })));
});

test('what a host provides shows, and its links and slots stay in their places', () => {
  const html = renderChatPage({ slug: 'desk', mode: 'page', settings: settings(), host: { voice: true, speech: true, attachments: { images: true, files: false }, ratings: true, signals: true, assets: { render: 'render-1.js', code: 'c', math: 'm', diagram: 'd' }, links: { poweredBy: { label: '<b>Us</b>', href: 'https://us.example/?a=1&b=2' } }, slots: { beforeConversation: { css: '.mine{color:red}', html: '<div id="mine"></div>', script: 'window.VIABLE_SLOTS = {};' } } } }, 'n');
  const seen = config(html);
  assert.equal(seen.voice, true);
  assert.equal(seen.speaks, true);
  assert.deepEqual(seen.attach, { images: true, files: false });
  assert.equal(seen.ratings, true);
  assert.match(html, /src="\/v1\/agents\/chat-assets\/render-1\.js"/);
  assert.match(html, /Powered by <a href="https:\/\/us\.example\/\?a=1&amp;b=2"[^>]*>&lt;b&gt;Us&lt;\/b&gt;<\/a>/);
  assert.match(html, /\.mine\{color:red\}/);
  assert.match(html, /<div id="mine"><\/div>\s*<main id="log"/);
  assert.match(html, /<script nonce="n">\s*window\.VIABLE_SLOTS = \{\};<\/script>/);
  for (const script of html.split(/<script nonce="[^"]+">/).slice(1).map((part) => part.split('</script>')[0])) assert.doesNotThrow(() => new Function(script));
});

test('hostile text from a package, a model or a learner stays text in the page', () => {
  const hostile = '</script><script>alert(1)</script>"><img src=x onerror=alert(2)> ';
  const look = { title: hostile, tagline: hostile, greeting: hostile, starters: [hostile], notice: hostile, placeholder: hostile, avatar_url: `https://a.example/"><script>alert(3)</script>` };
  const hostileCourse = { title: hostile, url: '/course/x', activity: hostile, identify: 'code', alsoSeen: hostile, done: 'button' };
  const ws = { ...panels({ title: hostile }), title: hostile };
  ws.panels = [{ id: 'w', type: 'writing', title: hostile, prompt: hostile, rubric: [{ criterion: hostile, description: hostile }], context: { task: true, rubric: true, plan: false, draft: 'none' } }];
  for (const html of [
    renderChatPage({ slug: 'x', mode: 'page', settings: settings(look), host: { links: { poweredBy: { label: hostile, href: hostile } } } }, 'n'),
    renderChatPage({ slug: 'x', mode: 'page', settings: settings(look), workspace: ws, course: hostileCourse, host: {} }, 'n'),
    renderChatPage({ slug: 'x', mode: 'widget', settings: settings(look), course: hostileCourse, host: {} }, 'n'),
    renderHome({ course: { ...course, title: hostile, description: hostile, alsoSeen: hostile, info: { people: [{ name: hostile, role: 'other', role_label: hostile, email: `${hostile}@x` }], office_hours: hostile, help: hostile, links: [{ label: hostile, url: hostile }] } }, how: { identify: 'code' }, ask: { title: hostile, text: hostile, label: hostile }, badge: hostile, host: {} }, 'n'),
    unavailablePage({ title: hostile, message: hostile, back: { href: hostile, label: hostile } })
  ]) {
    assert.ok(!/<script>alert/.test(html), 'no script breaks out');
    assert.ok(!/<img src=x/.test(html), 'no element breaks out');
    assert.ok(!html.includes('"><script'), 'no attribute breaks out');
    for (const json of html.matchAll(/<script type="application\/json" id="ws-config">(.*?)<\/script>/gs)) assert.doesNotThrow(() => JSON.parse(json[1]));
  }
});

test('a page’s headers hold it to its own scripts, and to the sites that may frame it', () => {
  const headers = chatPageHeaders('abc', { sites: 'https://a.example', frames: ['https://sim.example'], reads: false });
  const policy = headers['Content-Security-Policy'];
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'nonce-abc';/);
  assert.ok(!policy.includes("'unsafe-inline'") && !policy.includes("'unsafe-eval'"));
  assert.match(policy, /connect-src 'self'/);
  assert.match(policy, /frame-ancestors https:\/\/a\.example/);
  assert.match(policy, /frame-src 'self' https:\/\/sim\.example/);
  assert.match(policy, /base-uri 'none'/);
  assert.equal(headers['Cache-Control'], 'no-store');
});

test('publicWorkspace is the gate: no key, explanation, hint or model answer reaches a page, and no later step at all', () => {
  const ws = workspaceOn(panels());
  const shown = publicWorkspace(ws, SET);
  const text = JSON.stringify(shown);
  for (const secret of ['A secret hint', 'A secret explanation', 'the-secret-key', 'A secret model answer']) assert.ok(!text.includes(secret), secret);
  for (const item of shown.panels[0].items) for (const hidden of ['answer', 'explanation', 'rubric', 'show_model']) assert.ok(!(hidden in item) || hidden === 'show_model', hidden);
  assert.equal(shown.panels[0].items[0].hints, 1, 'how many, not what they say');
  const order = shown.panels[0].items.find((item) => item.type === 'order');
  assert.equal(order.choices.length, 3);
  assert.ok(!('answer' in publicItem(SET.get('s').items[1])));

  // A later step: its name only, and its questions come when the learner gets there.
  const stepped = workspaceOn(workspaceSettings({ ai: 'right', panels: [{ id: 'w', type: 'writing', title: 'Write', prompt: 'Go' }, { id: 'q', type: 'questions', title: 'Questions', set_id: `qs_${'0'.repeat(24)}` }], steps: [{ id: 'a', panels: ['w'] }, { id: 'b', panels: ['q'], move: 'ready' }] }));
  const first = publicWorkspace(stepped, SET);
  assert.deepEqual(first.panels[1], { id: 'q', type: 'questions', title: 'Questions', locked: true });
  assert.ok(!JSON.stringify(first).includes('Which?'));
  const reached = stepReply(stepped, SET, { index: 1, at: '2026-11-03T15:00:00.000Z' });
  assert.ok(reached.panels.some((panel) => panel.items?.length === 4));
  assert.ok(!JSON.stringify(reached).includes('the-secret-key'));
});

test('a real course’s answers and a teacher’s note aren’t in its pages', () => {
  const doc = JSON.parse(readFileSync(EXAMPLE, 'utf8'));
  const activity = doc.course.activities[0];
  const items = normalizeItems(doc.question_sets[0].items);
  const ws = workspaceOn(workspaceSettings({ ...activity.workspace, panels: activity.workspace.panels.map((panel) => ({ ...panel, set_id: `qs_${'0'.repeat(24)}` })) }));
  const html = renderChatPage({ slug: 'x', mode: 'page', settings: settings(), workspace: ws, course: { title: 'C', url: '/course/c', activity: activity.title, identify: 'code' }, sets: new Map([['s', { id: 's', items }]]), host: {} }, 'n');
  const shown = JSON.parse(/id="ws-config">(.*?)<\/script>/s.exec(html)[1]);
  const pageItems = shown.panels[0].items;
  assert.equal(pageItems.length, items.length);
  for (const item of pageItems) assert.ok(!('answer' in item) && !('explanation' in item));
  for (const item of items) {
    if (item.explanation) assert.ok(!html.includes(item.explanation));
    for (const hint of item.hints || []) assert.ok(!html.includes(hint));
  }
  assert.ok(!html.includes(activity.teaching.watch_for), 'watch_for is the teacher’s alone');
  // What the AI is told: How the AI helps, and never the note for the teacher.
  const told = workspaceContext(ws, { panel: ws.panels[0].id, item: items[0].id }, new Map([['s', { id: 's', title: 'S', items }]]), {}, {}, activity.teaching);
  assert.ok(told.teaching_view.includes(activity.teaching.goal));
  assert.ok(!JSON.stringify(told).includes(activity.teaching.watch_for));
  const keyed = workspaceOn(panels());
  const run = workspaceRunContext(keyed, { panel: 'q', item: 'q2' }, SET);
  assert.ok(!run.view.includes('the-secret-key'), 'what a reply step reads never holds the key');
  assert.ok(run.context.answer_key.includes('the-secret-key'), 'a review may check against it');
  const context = workspaceContext(keyed, { panel: 'q', item: 'q2' }, SET);
  // Once the host has marked it right, a VETTING step can know, and it never enters what the AI is shown.
  const marked = workspaceContext(keyed, { panel: 'q', item: 'q2' }, SET, { lastCorrect: true });
  assert.equal(marked.answer_reached, true);
  assert.equal(marked.workspace.answer_reached, undefined);
  assert.equal(workspaceContext(keyed, { panel: 'q', item: 'q2' }, SET, { lastCorrect: false }).answer_reached, undefined);
  // The page saying so is nothing: a learner could lift the check from their browser.
  const claimed = workspaceContext(keyed, { panel: 'q', item: 'q2', tries: 1, last_correct: true }, SET);
  assert.equal(claimed.answer_reached, undefined);
  assert.equal(claimed.workspace.question.last_correct, null);
  assert.doesNotMatch(claimed.workspace_view, /the last answer was right/);
  // A test's panel keeps it from them until the end, so the AI doesn't have it either.
  const quiet = { ...keyed, panels: keyed.panels.map((panel) => ({ ...panel, feedback: 'end' })) };
  assert.equal(workspaceContext(quiet, { panel: 'q', item: 'q2' }, SET, { lastCorrect: true }).answer_reached, undefined);
  assert.ok(!context.workspace_view.includes('the-secret-key') && !JSON.stringify(context.workspace).includes('the-secret-key'));
});

test('a questions panel tells a page only what its feedback allows', () => {
  const set = SET.get('s');
  const q = set.items[2];
  const graded = gradeResponse(set.items[1], 'wrong');
  const each = questionReplies({ feedback: 'each', tries: 3, hints: true }, set);
  const none = questionReplies({ feedback: 'none', tries: 1, hints: false }, set);
  const ending = questionReplies({ feedback: 'end', tries: 1, hints: true }, set);
  assert.equal(each.answer(set.items[1], graded, 1).correct, false);
  assert.ok(!('correct' in none.answer(set.items[1], graded, 1)), 'a test says nothing');
  assert.ok(!('explanation' in none.answer(set.items[0], gradeResponse(set.items[0], 'b'), 1)));
  assert.ok(!JSON.stringify(none.answer(q, gradeResponse(q, 'mine'), 1)).includes('A secret model answer'), 'a model answer isn’t given in a test');
  assert.ok(JSON.stringify(each.answer(q, gradeResponse(q, 'mine'), 1)).includes('A secret model answer'), 'once written, in feedback');
  assert.ok(!JSON.stringify(each.answer(q, gradeResponse(q, ' '), 1)).includes('A secret model answer'), 'not before they have written their own');
  assert.throws(() => none.results({}), { code: 'no_results' });
  assert.throws(() => ending.results({ q1: { tries: 1, correct: true, score: 1, response: 'a' } }), { code: 'questions_unanswered' });
  assert.throws(() => none.hint(set.items[0], 0), { code: 'no_hint' });
  assert.throws(() => each.tries(set.items[0], 3), { code: 'tries_used' });
});

test('a page can’t write what only a server records, and a hidden or dated activity stays closed', () => {
  const ws = workspaceOn(panels());
  const faked = keptEvents(ws, [{ panel: 'q', type: 'answer', item: 'q1', data: { correct: true, score: 1 } }, { panel: 'q', type: 'hint', item: 'q1', data: {} }, { panel: 'q', type: 'view', data: { visible_ms: 10 } }, { panel: 'nope', type: 'view', data: {} }]);
  assert.deepEqual(faked.map((event) => event.type), ['panel.view']);
  const now = Date.parse('2026-11-03T15:00:00Z');
  assert.equal(releaseState({ release: 'hidden', role: 'instruction' }, { now }).state, 'hidden');
  assert.equal(releaseState({ release: 'scheduled', opens_at: '2026-11-04T00:00:00Z', role: 'instruction' }, { now }).state, 'upcoming');
  assert.equal(releaseState({ release: 'open', closes_at: '2026-11-01T00:00:00Z', role: 'instruction' }, { now }).state, 'closed');
  assert.equal(releaseState({ release: 'open', role: 'instruction' }, { now }).state, 'open');
});

test('a reply no review passed says so to the page, so its work list doesn’t say the answer was checked', async () => {
  const { chatReply, uncheckedIn } = await import('../src/learner/logic.js');
  assert.equal(uncheckedIn([{ nodeType: 'vetting', output: { outcome: 'unverified' } }, { nodeType: 'output', output: { text: 'x' } }]), true);
  assert.equal(uncheckedIn([{ nodeType: 'vetting', output: { outcome: 'passed' } }]), false);
  assert.equal(uncheckedIn([{ nodeType: 'llm', output: { content: 'x' } }]), false);
  assert.equal(chatReply({ output: { text: 'x' }, conversationId: 'c', runId: 'r', unchecked: true }).reply.unchecked, true);
  assert.equal(chatReply({ output: { text: 'x' }, conversationId: 'c', runId: 'r' }).reply.unchecked, undefined);
});
