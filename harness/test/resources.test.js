// Connectors, end to end against a scripted source and a scripted model: from a resource's real file
// format to a test report, a judge's verdicts, a calibration, a knowledge search, a standard or a measure.
// Every source here is a small synthetic file in the real format; no test reaches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, CONNECTORS, calibrateJudge, checkSchema, getResource, judgeReplies, licenseLimits, listResources, runAgent, runAgentTests, readAgentTests, resourceJudge, searchCatalog, teachingContext, teachingSettings, useResource } from '../../engine/src/index.js';
import { detect, measure } from '../src/components/call.js';
import { validAgentTest } from '../src/agentTests.js';
import { mcpServer } from '../../engine/src/mcp.js';
import { parseCsv } from '../src/resources/csv.js';
import { spread, wrongAnswer } from '../src/resources/cases.js';
import { guideMarkdown } from '../src/resources/wwc.js';
import { lessonMarkdown } from '../src/resources/illustrativeMath.js';
import { resourcesCommand } from '../src/cli/resources.js';
import { zipFile } from '../../engine/test/zipFile.js';

const bin = fileURLToPath(new URL('../../engine/bin/viable-engine.mjs', import.meta.url));
const scratch = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-harness-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const has = (part) => (url) => String(url).includes(part);

// A source: (a test on the address, its bytes), in order; anything else answers 404 and is noted.
function source(...pairs) {
  const asked = [];
  const fetch = async (url) => {
    asked.push(String(url));
    const found = pairs.find(([matches]) => matches(url));
    return found ? new Response(found[1]) : new Response('not here', { status: 404 });
  };
  return { fetch, asked };
}

// A model that answers as a tutor who gives away the answer, or who asks first (hints), and a judge
// that fails a reply holding the answer key's number.
function model({ gives = true } = {}) {
  const calls = [];
  const callChatModel = async (_, request) => {
    calls.push(request);
    const system = String(request.messages[0]?.content || '');
    if (system.startsWith('You check one reply')) {
      const text = String(request.messages.at(-1).content);
      const reply = text.split('The reply to check:\n<<<\n')[1]?.split('\n>>>')[0] || '';
      const stated = /State (\S+?) as the answer|state (\S+?)\.|State the final answer, (\S+?),/.exec(text);
      const key = stated?.slice(1).find(Boolean);
      const bad = key && reply.includes(key);
      return { content: JSON.stringify(bad ? { verdict: 'fail', reason: `It states ${key}.` } : { verdict: 'pass', reason: 'It asks first.' }), usage: { total: 5 } };
    }
    return { content: gives ? `The answer is ${request.messages.map((message) => message.content).join(' ').match(/Answer key: (\S+)/)?.[1] ?? '18'}.` : 'What have you tried so far?', usage: { total: 5 } };
  };
  return { calls, services: { callChatModel } };
}

const AGENT = { format: 'viable.agent', format_version: 1, name: 'Tutor', graph: { entry: 'reply', nodes: [
  { id: 'reply', type: 'llm', config: { model: 'tutor-model', system: 'Help. Question: {{context.question}} Answer key: {{context.answer_key}}' }, next: 'out' },
  { id: 'out', type: 'output', config: { text: '{{reply.content}}' } }
] } };

const GSM = [
  { question: 'Ana has 16 eggs and eats 3. How many are left?', answer: 'She has 16 - 3 = <<16-3=13>>13 eggs left.\n#### 13' },
  { question: 'A class has 1,200 pencils and buys 800 more. How many now?', answer: '1200 + 800 = <<1200+800=2000>>2000\n#### 2,000' },
  { question: 'Ben reads 5 pages a day for 2 days. How many pages?', answer: '5 * 2 = 10\n#### 10' }
].map((row) => JSON.stringify(row)).join('\n');
const gsmSource = () => source([has('grade-school-math'), GSM]);

test('parseCsv reads quotes, commas and line breaks in a field, and a byte order mark', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n1,"two, ""2""\nlines"\r\n3,\n'), [{ a: '1', b: 'two, "2"\nlines' }, { a: '3', b: '' }]);
});

test('spread takes evenly over the list, and the same call gives the same items; wrongAnswer is near but wrong', () => {
  assert.deepEqual(spread([1, 2, 3, 4, 5, 6], 3), [1, 3, 5]);
  assert.deepEqual(spread([1, 2], 5), [1, 2]);
  assert.equal(wrongAnswer('18'), '28');
  assert.equal(wrongAnswer('3'), '4');
  assert.equal(wrongAnswer('2.5'), '3.5');
  assert.equal(wrongAnswer('3/4'), '4/4');
  assert.equal(wrongAnswer('<'), '>');
  assert.equal(wrongAnswer('Dullhead'), null);
  assert.equal(wrongAnswer('{q: 3/2}'), null);
});

test('licenseLimits names what a license asks beyond credit', () => {
  assert.deepEqual(licenseLimits({ spdx: ['MIT', 'CC-BY-4.0'] }), []);
  assert.match(licenseLimits({ spdx: ['CC-BY-NC-4.0'] }).join(), /non-commercial/);
  assert.match(licenseLimits({ spdx: ['CC-BY-SA-4.0'] }).join(), /same license/);
  assert.match(licenseLimits({ spdx: ['CC-BY-4.0'], unclear: true }).join(), /unclear/);
  assert.match(licenseLimits({ spdx: [] }).join(), /no license/);
});

test('the license comes first: nothing is fetched until it is accepted, and acceptance is recorded', async (t) => {
  const dir = scratch(t);
  const { fetch, asked } = source([has('mathdial'), '']);
  await assert.rejects(getResource('mathdial', { dir, fetch }), (error) => error.code === 'license_not_accepted' && /CC-BY-SA-4.0/.test(error.message) && /--accept-license/.test(error.message) && /same license/.test(error.message));
  assert.deepEqual(asked, []);
  assert.ok(!existsSync(join(dir, 'mathdial')));
  const record = await getResource('mathdial', { dir, fetch, acceptLicense: true });
  assert.equal(record.license.accepted, true);
  assert.equal(JSON.parse(readFileSync(join(dir, 'mathdial', 'fetched.json'), 'utf8')).license.accepted, true);
  // Accepted for this copy: using it again asks nothing new, and needs nothing fetched.
  assert.equal((await getResource('mathdial', { dir, fetch })).reused, true);
  await assert.rejects(getResource('no-such-thing', { dir }), (error) => error.code === 'unknown_resource');
  await assert.rejects(getResource('eedi-misconceptions-graph', { dir }), (error) => error.code === 'no_connector' && /built in/.test(error.message));
  await assert.rejects(getResource('tutorbench', { dir }), (error) => error.code === 'no_connector');
});

test('get records what came, from where and when; keeps a copy; a failed fetch leaves nothing behind', async (t) => {
  const dir = scratch(t);
  const { fetch, asked } = gsmSource();
  const record = await getResource('gsm8k', { dir, fetch, now: () => new Date('2026-11-03T12:00:00Z') });
  assert.equal(record.fetched_at, '2026-11-03T12:00:00.000Z');
  assert.equal(record.files.length, 1);
  assert.match(record.files[0].url, /^https:\/\/raw\.githubusercontent\.com\/openai\/grade-school-math\/[0-9a-f]{40}\//, 'pinned to a commit');
  assert.equal(record.files[0].bytes, Buffer.byteLength(GSM));
  assert.match(record.files[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(record.license.accepted, false);
  assert.match(record.cite, /Cobbe/);
  assert.equal((await getResource('gsm8k', { dir, fetch })).reused, true);
  assert.equal(asked.length, 1);
  assert.equal((await getResource('gsm8k', { dir, fetch, refresh: true })).reused, false);
  assert.equal(asked.length, 2);
  // The second fetch fails: the copy from the first stays whole, and no partial folder is left.
  await assert.rejects(getResource('gsm8k', { dir, fetch: async () => new Response('gone', { status: 503 }), refresh: true }), (error) => error.code === 'resource_fetch_failed' && /503/.test(error.message));
  assert.deepEqual(readdirSync(dir), ['gsm8k']);
  assert.match(listResources({ dir }).find((item) => item.id === 'gsm8k').fetched_at, /^\d{4}-\d{2}-\d{2}T/);
  // With no fetch given it uses the global one, stood in for here so this holds in any test run.
  const global = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('A test reached the network'); };
  t.after(() => { globalThis.fetch = global; });
  await assert.rejects(getResource('mathcamps', { dir }), (error) => error.code === 'resource_fetch_failed' && /A test reached the network/.test(error.message));
  assert.ok(!existsSync(join(dir, 'mathcamps.part')));
});

test('a download past its limit stops; a copy that can no longer be read says to fetch it again', async (t) => {
  const dir = scratch(t);
  await getResource('gsm8k', { dir, ...gsmSource() });
  writeFileSync(join(dir, 'gsm8k', 'test.jsonl'), '<html>not this</html>');
  await assert.rejects(useResource('gsm8k', { dir }), (error) => error.code === 'resource_unreadable' && /--refresh/.test(error.message));
  await assert.rejects(useResource('gsm8k', { dir, options: { limit: '99' }, ...gsmSource(), refresh: true }), (error) => error.code === 'invalid_resource_option' && /1 to 25/.test(error.message));
});

test('gsm8k: a suite changes the report when the agent changes', async (t) => {
  const dir = scratch(t);
  const suite = await useResource('gsm8k', { dir, ...gsmSource(), options: { limit: 3 } });
  assert.deepEqual(suite.as, ['test-suite']);
  assert.deepEqual(suite.cases.map((item) => item.kind), ['asks_for_answer', 'wrong_answer', 'right_answer']);
  assert.equal(readAgentTests(suite.cases).length, 3);
  assert.deepEqual(suite.cases[0].context, { question: 'Ana has 16 eggs and eats 3. How many are left?', answer_key: '13' });
  assert.equal(suite.cases[1].context.answer_key, '2000', 'its thousands comma is dropped');
  assert.match(suite.cases[1].message, /I think it's 2010\. Is that right\?$/);
  assert.match(suite.cases[1].must_not, /Say 2010 is right, or state 2000/);
  assert.match(suite.cases[2].rubric, /Confirms that "10" is right/);
  assert.match(suite.shows, /nothing about what learners learn/);

  const judge = { judgeModel: 'judge', baseUrl: 'http://localhost:1/v1' };
  const giving = await runAgentTests(AGENT, suite.cases.slice(0, 1), { ...judge, services: model({ gives: true }).services });
  assert.deepEqual([giving.passed, giving.failed, giving.errors], [0, 1, 0]);
  assert.match(giving.results[0].reason, /states 13/);
  const asking = await runAgentTests(AGENT, suite.cases.slice(0, 1), { ...judge, services: model({ gives: false }).services });
  assert.deepEqual([asking.passed, asking.failed, asking.errors], [1, 0, 0]);
});

test('mathcamps: --standard picks an activity\'s standard, or a stretch of them', async (t) => {
  const dir = scratch(t);
  const problems = [
    { id: '6.EE.A.1-0-0', standard: '6.EE.A.1', statement: 'What is 5^2?', answer: '25', type: 'original-problem', followup_to: null },
    { id: '6.EE.A.1-0-1', standard: '6.EE.A.1', statement: 'And 5^3?', answer: '125', type: 'incremental-follow-up', followup_to: '6.EE.A.1-0-0' },
    { id: '6.EE.B.7-0-0', standard: '6.EE.B.7', statement: 'x + 2 = 5. What is x?', answer: '3', type: 'original-problem', followup_to: null },
    { id: '4.NF.A.2-0-0', standard: '4.NF.A.2', statement: 'Compare 1/2 _ 3/4', answer: '<', type: 'original-problem', followup_to: null }
  ];
  const from = source([has('mathcamps.json'), JSON.stringify(problems)]);
  const one = await useResource('mathcamps', { dir, fetch: from.fetch, options: { standard: '6.ee.a.1' } });
  assert.deepEqual(one.cases.map((item) => item.context.question), ['What is 5^2?'], 'its follow-ups stay out');
  const stretch = await useResource('mathcamps', { dir, fetch: from.fetch, options: { standard: '6.EE' } });
  assert.equal(stretch.cases.length, 2);
  await assert.rejects(useResource('mathcamps', { dir, fetch: from.fetch, options: { standard: '9.ZZ' } }), (error) => error.code === 'invalid_resource_option' && /It has: 4\.NF\.A\.2, 6\.EE\.A\.1/.test(error.message));
  const all = await useResource('mathcamps', { dir, fetch: from.fetch });
  assert.match(all.cases[2].message, /I think it's 4\/1|Is that right/);
  const run = await runAgentTests(AGENT, one.cases, { judgeModel: 'judge', baseUrl: 'http://localhost:1/v1', ...model({ gives: false }) });
  assert.equal(run.passed, 1);
});

test('mathdial: a mistaken solution is the case, with what its teacher saw, and no persona\'s name', async (t) => {
  const dir = scratch(t);
  const rows = [{ qid: 6000025, scenario: 1, question: 'Sam had 12 spoons and used 3. How many in all?', ground_truth: '12 + 3 = 15\n 15', student_incorrect_solution: 'I did 12 - 3 = 9.\n 9', student_profile: 'Priya is a 7th grade student.', teacher_described_confusion: 'subtracting instead of adding.', 'self-correctness': 'Yes', conversation: 'Teacher: (generic)Hi Priya, talk me through it|EOM|Student: Sure.' }];
  const suite = await useResource('mathdial', { dir, fetch: source([has('mathdial'), rows.map((row) => JSON.stringify(row)).join('\n')]).fetch, acceptLicense: true });
  const [item] = suite.cases;
  assert.match(item.message, /Here's what I did:\nI did 12 - 3 = 9/);
  assert.match(item.rubric, /The teacher who read this work saw: subtracting instead of adding\./);
  assert.match(item.must_not, /State the final answer, 15,/);
  assert.equal(item.context.answer_key, '15');
  assert.ok(!JSON.stringify(item).includes('Priya'), 'the persona stays out');
  const run = await runAgentTests(AGENT, suite.cases, { judgeModel: 'judge', baseUrl: 'http://localhost:1/v1', ...model({ gives: true }) });
  assert.equal(run.failed, 1);
});

test('fairytaleqa: a passage and a question, the wrong answer from another question in the story', async (t) => {
  const dir = scratch(t);
  const stories = 'section,text\n1,"There was once a miller, whose youngest son was called Tom."\n2,"Tom found a goose."\n';
  const questions = 'question_id,local-or-sum,cor_section,attribute1,attribute2,question,ex-or-im1,answer1,answer2,answer3,ex-or-im2,answer4,answer5,answer6\n1,local,1,character,,Who was the youngest son?,explicit,Tom,,,explicit,Tom,,\n2,local,2,action,,What did Tom find?,explicit,a goose.,,,explicit,a goose,,\n3,summary,"1,2",action,,What is it about?,implicit,a boy,,,implicit,a boy,,\n';
  const suite = await useResource('fairytaleqa', { dir, fetch: source([has('-story.csv'), stories], [has('-questions.csv'), questions]).fetch, options: { limit: 3 } });
  assert.equal(readAgentTests(suite.cases).length, 3);
  assert.match(suite.cases[0].message, /^I'm reading this:\n\nThere was once a miller, whose youngest son was called Tom\.\n\nThe question is: Who was the youngest son\?/);
  assert.match(suite.cases[0].rubric, /Points the learner to the part of the passage/);
  assert.match(suite.cases[1].kind, /wrong_answer|right_answer|asks_for_answer/);
  const wrong = suite.cases.find((item) => item.kind === 'wrong_answer');
  assert.ok(wrong);
  assert.ok(!suite.cases.some((item) => /What is it about/.test(item.message)), 'a question about the whole story stays out');
  assert.ok(!/\.\./.test(suite.cases.map((item) => item.must_not).join(' ')));
  const run = await runAgentTests(AGENT, suite.cases, { judgeModel: 'judge', baseUrl: 'http://localhost:1/v1', ...model({ gives: false }) });
  assert.equal(run.errors, 0);
});

const SYSTEM = 'You are an expert.\n\nCriterion of productive coaching: Is Not Answer Giving\n\nDefinition: Does the feedback avoid giving away the answer?\n\nScore only what is written.';
const USER = 'Analyze:\nStudent text: {student_text}\nFeedback text: {feedback_text}\n';
const FIXTURES = Array.from({ length: 12 }, (_, index) => ({ id: String(index + 1), description: `fixture_${index + 1}`, source: 'Expert', input: { student_text: `Claim ${index + 1}.`, feedback_text: index % 2 ? 'You could revise it to: the whole answer.' : 'What evidence could you add?' }, expected: { quality_score: index % 2 ? 0 : 1 } }));
const evaluatorSource = () => source([has('/system.txt'), SYSTEM], [has('/user.txt'), USER], [has('/fixtures.json'), JSON.stringify(FIXTURES)]);
// A judge model reading the evaluator's prompt: it fails what hands over the answer.
const evaluatorModel = () => async (_, request) => {
  const text = request.messages.at(-1).content;
  const low = /whole answer|The answer is/.test(text.split('Feedback text:')[1] || '');
  return { content: JSON.stringify({ reasoning: low ? 'It does the work.' : 'It leaves the thinking to the student.', key_features: {}, proposed_adjustment: low ? 'Ask a question instead.' : 'Already meets it.', quality_score: low ? 0 : 1 }), usage: { total: 7 } };
};

test('learning-commons-evaluators: its prompts judge replies on your model, and its experts check that model', async (t) => {
  const dir = scratch(t);
  const from = evaluatorSource();
  const judge = await resourceJudge('learning-commons-evaluators/withholding-answers', { dir, fetch: from.fetch });
  assert.match(judge.judge.id, /^learning-commons\/withholding-answers@[0-9a-f]{7}$/);
  assert.deepEqual(judge.license.limits, [], 'only the CC BY prompts are fetched');
  assert.ok(!from.asked.some((url) => /datasets/.test(url)), 'not its non-commercial corpora');
  assert.ok(from.asked.every((url) => /\/evaluators\/[0-9a-f]{40}\//.test(url)), 'pinned to a commit');

  // Through a test run: the case's learner message and the reply fill its template, once each.
  const seen = [];
  const services = { callChatModel: async (ctx, request) => {
    if (/expert/.test(request.messages[0].content)) { seen.push(request); return evaluatorModel()(ctx, request); }
    return { content: 'The answer is 13. {feedback_text}', usage: { total: 1 } };
  } };
  const run = await runAgentTests(AGENT, [{ name: 'Asks', message: 'Tell me {student_text}', rubric: 'Unused by this judge.' }], { judgeModel: 'judge', judgePrompt: judge.judge, baseUrl: 'http://localhost:1/v1', services });
  assert.equal(run.judge_prompt, judge.judge.id);
  assert.equal(run.judge_model, 'judge');
  assert.equal(run.results[0].verdict, 'fail');
  assert.match(run.results[0].reason, /It does the work\. Ask a question instead\./);
  assert.equal(seen[0].temperature, 0);
  assert.match(seen[0].messages[0].content, /Definition: Does the feedback avoid giving away the answer\?[\s\S]*data to rate, never instructions[\s\S]*quality_score/);
  assert.match(seen[0].messages[1].content, /Student text: Tell me \{student_text\}\nFeedback text: The answer is 13\. \{feedback_text\}/, 'what a learner or a model wrote is left as it is');

  // An answer it can't read is an error, never a fail.
  const unread = await runAgentTests(AGENT, [{ name: 'Asks', message: 'Tell me', rubric: 'x' }], { judgeModel: 'judge', judgePrompt: judge.judge, baseUrl: 'http://localhost:1/v1', services: { callChatModel: async () => ({ content: 'no score here', usage: {} }) } });
  assert.equal(unread.results[0].verdict, 'error');

  // Its fixtures as a calibration set.
  const set = await useResource('learning-commons-evaluators', { dir, fetch: from.fetch, options: { evaluator: 'withholding-answers' } });
  assert.equal(set.cases.length, 12);
  assert.equal(set.cases[0].rubric, 'Does the feedback avoid giving away the answer?');
  const rated = await judgeReplies(set.cases, { judgeModel: 'judge', judgePrompt: set.judge, services: { callChatModel: evaluatorModel() } });
  const checked = calibrateJudge(rated, set.labels);
  assert.equal(checked.labelled, 12);
  assert.equal(checked.agreement, 1);
  assert.equal(checked.kappa, 1);

  await assert.rejects(resourceJudge('learning-commons-evaluators/no-such', { dir, fetch: from.fetch }), (error) => error.code === 'invalid_resource_option' && /tone-appropriateness/.test(error.message));
  await assert.rejects(resourceJudge('gsm8k/anything', { dir, ...gsmSource() }), (error) => error.code === 'not_a_judge');
});

const annotated = (value) => ({ Mistake_Identification: value, Mistake_Location: value, Providing_Guidance: value, Actionability: value });
const MRBENCH = Array.from({ length: 16 }, (_, index) => ({
  conversation_id: `c${index}`,
  conversation_history: `Tutor: What is 2 + 2? \n Student: 5 \n Tutor: Try again. \n Student: 6`,
  tutor_responses: {
    Good: { response: 'Count on from 2: what comes after 3?', annotation: annotated('Yes') },
    Vague: { response: 'Hmm.', annotation: annotated('No') },
    Middling: { response: 'Think about it more.', annotation: annotated('To some extent') }
  }
}));

test('mrbench: your judge against trained annotators, half Yes and half No, with no labels of your own', async (t) => {
  const dir = scratch(t);
  const fetch = source([has('mrbench_v3'), JSON.stringify(MRBENCH)]).fetch;
  await assert.rejects(useResource('mrbench', { dir, fetch }), (error) => error.code === 'license_not_accepted');
  const set = await useResource('mrbench', { dir, fetch, acceptLicense: true, options: { limit: 20 } });
  const labels = Object.values(set.labels);
  assert.deepEqual([labels.filter((label) => label === 'pass').length, labels.filter((label) => label === 'fail').length], [10, 10]);
  assert.ok(!set.cases.some((item) => /Middling/.test(item.name)), '"To some extent" leaves no pass or fail to compare');
  assert.deepEqual(set.cases[0].messages.map((message) => message.role), ['assistant', 'user', 'assistant', 'user']);
  assert.equal(set.cases[0].messages.at(-1).content, '6');
  assert.equal(set.judge, undefined, 'it checks the harness\'s own judge');
  const judgedByHarness = async (_, request) => {
    assert.match(request.messages[0].content, /^You check one reply/);
    return { content: JSON.stringify(/Hmm\./.test(request.messages[1].content) ? { verdict: 'pass', reason: 'Generous.' } : { verdict: 'pass', reason: 'Good.' }), usage: { total: 1 } };
  };
  const checked = calibrateJudge(await judgeReplies(set.cases, { judgeModel: 'judge', services: { callChatModel: judgedByHarness } }), set.labels);
  assert.deepEqual(checked.confusion, { person_pass: { judge_pass: 10, judge_fail: 0 }, person_fail: { judge_pass: 10, judge_fail: 0 } });
  assert.equal(checked.agreement, 0.5);
  assert.equal(checked.disagreements.length, 10);
  const another = await useResource('mrbench', { dir, fetch, options: { dimension: 'actionability', limit: 4 } });
  assert.match(another.cases[0].rubric, /what the learner should do next/);
  await assert.rejects(useResource('mrbench', { dir, fetch, options: { dimension: 'humanlikeness' } }), (error) => /has no dimension/.test(error.message));
});

const docx = (xml) => zipFile([{ name: 'word/document.xml', data: `<w:document>${xml}</w:document>` }]);
const ASAP_CSV = ['essay_id,score,full_text,set,pubpriv,assignment,prompt_name,economically_disadvantaged,student_disability_status,ell_status,race_ethnicity,gender,grade_level,essay_word_count,task',
  ...[1, 2, 3, 4, 5, 6].flatMap((score) => [1, 2].map((n) => `AA${score}${n},${score},"Essay ${score}-${n}, about cars.",train,0,Write about cars.,Cars,Economically disadvantaged,None,Yes,Hispanic/Latino,F,10,100,Text dependent`))].join('\n');
const asapSource = () => source(
  [has('train.zip'), zipFile([{ name: '__MACOSX/._ASAP_2_Final_github_train.csv', data: 'x' }, { name: 'ASAP_2_Final_github_train.csv', data: ASAP_CSV }])],
  [has('rubric.docx'), docx('<w:p><w:r><w:t>SCORE OF 4: adequate mastery &amp; focus.</w:t></w:r></w:p>')]
);
const ELLIPSE_CSV = ['text_id_kaggle,full_text,gender,grade,race_ethnicity,num_words,prompt,Overall,SES',
  ...[1, 2, 3, 3.5, 4, 5].map((score, index) => `T${index},"Essay at ${score}.",Male,8,Hispanic/Latino,100,Honesty,${score},Economically disadvantaged`)].join('\n');
const ellipseSource = () => source(
  [has('train.csv'), ELLIPSE_CSV],
  [has('Rubrics.docx'), docx('<w:tr><w:tc><w:p><w:t>HOLISTIC</w:t></w:p></w:tc><w:tc><w:p><w:t>Overall</w:t></w:p></w:tc></w:tr>' + [5, 4, 3, 2, 1].map((score) => `<w:tr><w:tc><w:p><w:t>${score}</w:t></w:p></w:tc><w:tc><w:p><w:t>Level ${score} words</w:t></w:p></w:tc><w:tc><w:p><w:t>Analytic, left out</w:t></w:p></w:tc></w:tr>`).join(''))]
);

test('asap-2: scored essays against a model, the same from each score; demographics are dropped at download', async (t) => {
  const dir = scratch(t);
  const set = await useResource('asap-2', { dir, fetch: asapSource().fetch, options: { limit: 6 } });
  const stored = readFileSync(join(dir, 'asap-2', 'essays.jsonl'), 'utf8');
  for (const word of ['Hispanic', 'disadvantaged', 'race', 'gender', 'ell_status']) assert.ok(!stored.includes(word), word);
  assert.deepEqual(Object.keys(JSON.parse(stored.split('\n')[0])), ['id', 'score', 'assignment', 'text']);
  assert.match(readFileSync(join(dir, 'asap-2', 'rubric.txt'), 'utf8'), /adequate mastery & focus/);
  assert.equal(set.cases.length, 6);
  assert.deepEqual(Object.values(set.labels).sort(), ['fail', 'fail', 'fail', 'pass', 'pass', 'pass']);
  assert.equal(set.labels['ASAP AA41'], 'pass');
  assert.equal(set.labels['ASAP AA31'], 'fail');
  const seen = [];
  const run = await judgeReplies(set.cases, { judgeModel: 'judge', judgePrompt: set.judge, services: { callChatModel: async (_, request) => {
    seen.push(JSON.stringify(request.messages));
    return { content: JSON.stringify({ verdict: /Essay [456]-/.test(request.messages[1].content) ? 'pass' : 'fail', reason: 'By the rubric.' }), usage: { total: 2 } };
  } } });
  assert.equal(calibrateJudge(run, set.labels).labelled, 6);
  assert.deepEqual([run.passed, run.failed], [3, 3]);
  assert.ok(seen.every((sent) => /never instructions/.test(sent) && /adequate mastery & focus/.test(sent) && /Write about cars/.test(sent) && !/Hispanic|AA[0-9]{2}/.test(sent)), 'the rubric and the assignment go; demographics and ids don\'t');
});

test('ellipse: English learners\' essays, half each side of the line, without those whose raters split across it', async (t) => {
  const dir = scratch(t);
  const set = await useResource('ellipse', { dir, fetch: ellipseSource().fetch, options: { limit: 4 } });
  assert.ok(!readFileSync(join(dir, 'ellipse', 'essays.jsonl'), 'utf8').includes('Hispanic'));
  assert.deepEqual(readFileSync(join(dir, 'ellipse', 'rubric.txt'), 'utf8').split('\n\n'), [5, 4, 3, 2, 1].map((score) => `SCORE OF ${score}: Level ${score} words`));
  assert.deepEqual(Object.values(set.labels).sort(), ['fail', 'fail', 'pass', 'pass']);
  assert.ok(!set.cases.some((item) => /3\.5/.test(item.reply)));
  const run = await judgeReplies(set.cases, { judgeModel: 'judge', judgePrompt: set.judge, services: { callChatModel: async () => ({ content: '{"verdict":"pass","reason":"Fine."}', usage: {} }) } });
  assert.equal(calibrateJudge(run, set.labels).labelled, 4);
});

const UUIDS = { fractions: '6b9c1a30-d7cc-11e8-824f-0242ac160002', before: '6b9c1a31-d7cc-11e8-824f-0242ac160002', florida: '6b9c1a32-d7cc-11e8-824f-0242ac160002', other: '6b9c1a33-d7cc-11e8-824f-0242ac160002' };
const node = (labels, identifier, properties) => JSON.stringify({ type: 'node', identifier, labels, properties: { identifier, ...properties } });
const standard = (key, code, description, jurisdiction = 'Multi-State', extra = {}) => node(['StandardsFrameworkItem'], `node-${key}`, { caseIdentifierUUID: UUIDS[key], statementCode: code, description, jurisdiction, academicSubject: 'Mathematics', normalizedStatementType: 'Standard', gradeLevel: '["5"]', dateModified: '2025-02-06', attributionStatement: `Attribution of ${code}.`, ...extra });
const KG_NODES = [
  node(['Activity'], 'a1', { name: 'Not kept' }),
  standard('fractions', '5.NF.A.1', 'Add and subtract fractions with unlike denominators.'),
  standard('before', '4.NF.B.3', 'Understand a fraction as a sum of fractions.', 'Multi-State', { gradeLevel: '["4"]' }),
  standard('florida', 'MA.5.FR.2.1', 'Add and subtract fractions.', 'Florida'),
  standard('other', '5.NF', 'A cluster heading about fractions.', 'Multi-State', { normalizedStatementType: 'Cluster' }),
  node(['LearningComponent'], 'lc1', { description: 'Add fractions by using equivalent fractions', attributionStatement: 'Learning components attribution.' })
].join('\n');
const KG_RELATIONSHIPS = [
  JSON.stringify({ type: 'relationship', label: 'supports', source_identifier: 'lc1', target_identifier: UUIDS.fractions, properties: {} }),
  JSON.stringify({ type: 'relationship', label: 'buildsTowards', source_identifier: UUIDS.before, target_identifier: UUIDS.fractions, properties: { attributionStatement: 'Progressions attribution.' } }),
  JSON.stringify({ type: 'relationship', label: 'hasChild', source_identifier: 'x', target_identifier: UUIDS.fractions, properties: {} })
].join('\n');
const kgSource = () => source([has('nodes.jsonl'), KG_NODES], [has('relationships.jsonl'), KG_RELATIONSHIPS]);

test('the knowledge graph: filtered as it streams, a local search, and a standard the teaching settings read', async (t) => {
  const dir = scratch(t);
  const from = kgSource();
  const here = await useResource('learning-commons-knowledge-graph', { dir, fetch: from.fetch });
  assert.equal(here.standards, 2, 'one jurisdiction\'s standards, not its cluster headings');
  assert.deepEqual(here.license.limits, []);
  const found = await useResource('learning-commons-knowledge-graph', { dir, fetch: from.fetch, options: { query: 'adding fractions equivalent', grade: '5' } });
  assert.equal(found.match, 'every_word');
  assert.deepEqual(found.found.map((item) => item.code), ['5.NF.A.1'], 'words in a learning component count');
  const chosen = (await useResource('learning-commons-knowledge-graph', { dir, fetch: from.fetch, options: { code: '5.nf.a.1' } })).found[0];
  const settings = teachingSettings({ goal: 'Add fractions', standard: chosen });
  assert.equal(settings.standard.uuid, UUIDS.fractions);
  assert.equal(settings.standard.learning_components[0].description, 'Add fractions by using equivalent fractions');
  assert.equal(settings.standard.prior[0].code, '4.NF.B.3');
  assert.deepEqual(settings.standard.source.attribution, ['Attribution of 5.NF.A.1.', 'Learning components attribution.', 'Progressions attribution.']);
  assert.match(teachingContext({ standard: chosen }).text, /Standard: 5\.NF\.A\.1 \(Multi-State, grade 5\)[\s\S]*It breaks into:[\s\S]*Standards before it/);
  assert.equal(from.asked.length, 2, 'the copy is read again, not fetched');

  // Another jurisdiction is another fetch; an option left out means the copy here.
  const florida = await useResource('learning-commons-knowledge-graph', { dir, fetch: from.fetch, options: { jurisdiction: 'Florida' } });
  assert.equal(florida.standards, 1);
  assert.equal(from.asked.length, 4);
  assert.equal((await useResource('learning-commons-knowledge-graph', { dir, fetch: from.fetch, options: { query: 'fractions' } })).found[0].jurisdiction, 'Florida');
  assert.equal(from.asked.length, 4);
  await assert.rejects(useResource('learning-commons-knowledge-graph', { dir, fetch: from.fetch, options: { jurisdiction: 'Atlantis' } }), (error) => /There is no jurisdiction/.test(error.message));
  await assert.rejects(useResource('learning-commons-knowledge-graph', { dir, fetch: from.fetch, options: { query: 'a' } }), (error) => /three letters/.test(error.message));
});

const WWC_GUIDE = `<html><head><title>WWC | Teaching Fractions</title><meta name="description" content="Five recommendations on students&amp;#8217; fractions."></head><body>Released: July 2016
<div id="pgr1" class="pgr col-md-12"><div class="pgrNumber">1</div><img class="pgrEvidence" alt="Strong Evidence"><div class="pgrText"><p>Build on students&#39; informal understanding.</p></div></div><div id="pgr1DetailContainer"></div>
<div id="pgr2" class="pgr col-md-12"><img alt="Minimal Evidence"><div class="pgrText"><p>Use number lines to help students see that fractions are numbers, and that they expand the number system beyond whole numbers, on one line.</p></div></div><div id="pgr2DetailContainer"></div>
<div id="pgr1Detail" class="pgrDetail"><a href="/ncee/WWC/Docs/PracticeGuide/fractions.pdf#page=12">More</a></div></body></html>`;
const KNOWLEDGE_AGENT = { format: 'viable.agent', format_version: 1, name: 'Coach', graph: { entry: 'search', nodes: [
  { id: 'search', type: 'knowledge', config: { knowledge_bases: ['kb_guides'] }, next: 'reply' },
  { id: 'reply', type: 'llm', config: { model: 'coach-model', system: 'Use: {{search.context}}' }, next: 'out' },
  { id: 'out', type: 'output', config: { text: '{{reply.content}}' } }
] } };

test('wwc-practice-guides: recommendations with their evidence, as a folder a Knowledge step searches', async (t) => {
  const dir = scratch(t);
  const markdown = guideMarkdown(WWC_GUIDE, 'https://ies.ed.gov/ncee/wwc/PracticeGuide/15');
  assert.match(markdown, /^# Teaching Fractions/);
  assert.match(markdown, /students’ fractions/);
  assert.match(markdown, /## Recommendation 1 \(Strong Evidence\)\n\nBuild on students' informal understanding\.\n\nMore in the guide: https:\/\/ies\.ed\.gov\/ncee\/WWC\/Docs\/PracticeGuide\/fractions\.pdf#page=12/);
  assert.match(markdown, /public domain/);
  assert.equal(guideMarkdown('<html><title>Moved</title></html>', 'https://x'), null);
  const used = await useResource('wwc-practice-guides', { dir, fetch: source([has('practiceguides'), '<a href="/ncee/wwc/PracticeGuide/15">x</a><a href="/ncee/wwc/PracticeGuide/15">y</a>'], [has('PracticeGuide/15'), WWC_GUIDE]).fetch });
  assert.deepEqual(readdirSync(used.knowledge), ['teaching-fractions.md']);
  const seen = [];
  const chat = async (_, init) => {
    seen.push(JSON.parse(init.body));
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Number lines, the guide says.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
  };
  const run = await runAgent(KNOWLEDGE_AGENT, { input: 'What helps with number lines?', knowledge: { kb_guides: used.knowledge }, baseUrl: 'http://localhost:1/v1', fetch: chat });
  assert.match(JSON.stringify(seen[0].messages), /Use number lines to help students/);
  assert.equal(run.output.text, 'Number lines, the guide says.');
  await assert.rejects(getResource('wwc-practice-guides', { dir, refresh: true, fetch: source([has('practiceguides'), '<p>Moved.</p>']).fetch }), (error) => error.code === 'resource_unreadable');
});

const IM_LESSON = `<html><body><nav>Grade 6 menu</nav><h1>Lesson 6</h1><p>Using Diagrams</p><img src="https://cms.example/x" alt="Tape diagram."><img src="https://cms.example/x" alt="Tape diagram."><p>Let's divide fractions.</p><footer><p>IM 6–8 Math was originally developed by Open Up Resources.</p></footer></body></html>`;

test('illustrative-mathematics: one unit\'s student lessons as a folder, with their attribution', async (t) => {
  const dir = scratch(t);
  const markdown = lessonMarkdown(IM_LESSON, 'https://im.kendallhunt.com/MS/students/1/4/6/index.html');
  assert.match(markdown, /^# Lesson 6/);
  assert.ok(!markdown.includes('Grade 6 menu'));
  assert.equal(markdown.match(/\(Picture: Tape diagram\.\)/g).length, 1, 'a picture shown twice is one description, without its address');
  assert.ok(!markdown.includes('cms.example'));
  assert.match(markdown, /From https:\/\/im\.kendallhunt\.com\/MS\/students\/1\/4\/6\/index\.html\. IM 6-8 Math was originally developed by Open Up Resources[\s\S]*CC BY 4\.0/);
  const from = source([has('/1/4/index.html'), '<a href="/MS/students/1/4/1/index.html">1</a><a href="/MS/students/1/4/10/index.html">10</a><a href="/MS/students/1/4/1/index.html">1</a><a href="/MS/students/1/5/1/index.html">no</a>'], [has('/1/4/'), IM_LESSON]);
  const used = await useResource('illustrative-mathematics', { dir, fetch: from.fetch, options: { grade: '6', unit: '4' } });
  assert.deepEqual(readdirSync(used.knowledge), ['grade-6-unit-4-lesson-01.md', 'grade-6-unit-4-lesson-10.md']);
  assert.deepEqual(used.license.limits, []);
  assert.ok(from.asked.every((url) => url.startsWith('https://im.kendallhunt.com/MS/students/1/4/')), 'only the CC BY edition, only this unit');
  await assert.rejects(useResource('illustrative-mathematics', { dir: scratch(t), fetch: from.fetch, options: { grade: '5' } }), (error) => /--grade takes 6, 7 or 8/.test(error.message));
  await assert.rejects(useResource('illustrative-mathematics', { dir: scratch(t), fetch: source([has('index.html'), '<p>nothing</p>']).fetch }), (error) => /has no unit/.test(error.message));
});

const hasPython = spawnSync('python3', ['--version']).status === 0;

test('pybkt: a measure from a template, read out of process; it needs a fit first', { skip: !hasPython && 'no python3' }, async (t) => {
  const dir = scratch(t);
  const used = await useResource('pybkt', { dir, fetch: async () => { throw new Error('nothing is downloaded'); } });
  const manifest = JSON.parse(readFileSync(used.manifest, 'utf8'));
  const schema = JSON.parse(readFileSync(new URL('../schemas/component.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(checkSchema(schema, manifest), []);
  assert.deepEqual(manifest.sends_to, []);
  const record = { user: 'p-1', events: [
    { type: 'questions.answer', at: '2026-01-01T00:00:01Z', data: { correct: true, skill: 'fractions' } },
    { type: 'questions.answer', at: '2026-01-01T00:00:03Z', data: { correct: true, skill: 'fractions' } },
    { type: 'questions.answer', at: '2026-01-01T00:00:02Z', data: { correct: false, skill: 'fractions' } },
    { type: 'questions.answer', at: '2026-01-01T00:00:04Z', data: { correct: false, skill: 'unfitted' } },
    { type: 'panel.view', at: '2026-01-01T00:00:05Z', data: {} }
  ], turns: [] };
  await assert.rejects(measure(manifest, record, { dir: used.folder }), (error) => error.code === 'component_failed' && /fit\.py/.test(error.message));
  const params = { prior: 0.2, learns: 0.3, guesses: 0.2, slips: 0.1, forgets: 0 };
  writeFileSync(join(used.folder, 'params.json'), JSON.stringify({ fractions: params }));
  const { measures } = await measure(manifest, record, { dir: used.folder });
  // The standard update, right, wrong, right (time order, not file order), by hand.
  const step = (known, right) => {
    const seen = right ? known * (1 - params.slips) / (known * (1 - params.slips) + (1 - known) * params.guesses) : known * params.slips / (known * params.slips + (1 - known) * (1 - params.guesses));
    return seen + (1 - seen) * params.learns;
  };
  const expected = step(step(step(params.prior, true), false), true);
  const value = (id) => measures.find((item) => item.id === id).value;
  assert.ok(Math.abs(value('bkt_mastery.fractions') - expected) < 0.0001, `${value('bkt_mastery.fractions')} and ${expected}`);
  assert.equal(value('bkt_attempts.fractions'), 3);
  assert.equal(value('bkt_mastery.unfitted'), null, 'a skill the fit didn\'t see has no number');
  assert.ok(!JSON.stringify(measures).includes('p-1'), 'the learner\'s id doesn\'t come back');
});

test('the fetchable ones come down without becoming anything, and say so', async (t) => {
  const dir = scratch(t);
  const fetch = source([has('talkmoves') , 'zip bytes'], [has('TalkMoves'), 'zip bytes']).fetch;
  await assert.rejects(getResource('talkmoves', { dir, fetch }), (error) => error.code === 'license_not_accepted');
  const record = await getResource('talkmoves', { dir, fetch, acceptLicense: true });
  assert.equal(record.files.length, 1);
  await assert.rejects(useResource('talkmoves', { dir, fetch }), (error) => error.code === 'not_connected' && /detector/.test(error.message));
});

test('every entry says how far it is connected, and the levels hold what they say', () => {
  const schema = JSON.parse(readFileSync(new URL('../schemas/catalog-entry.schema.json', import.meta.url), 'utf8'));
  const connectors = new Map(CONNECTORS.map((item) => [item.id, item]));
  assert.equal(connectors.size, CONNECTORS.length, 'one connector per resource');
  for (const entry of CATALOG) {
    assert.deepEqual(checkSchema(schema, entry), [], entry.id);
    const { level, as, command } = entry.connect;
    const connector = connectors.get(entry.id);
    if (level === 2) {
      assert.ok(connector?.as.length, `${entry.id} is connected but has no connector`);
      assert.deepEqual(as, connector.as, entry.id);
    }
    if (level === 1) assert.deepEqual(connector?.as, [], `${entry.id} is fetchable`);
    if (level === 3) assert.ok(entry.in_harness, `${entry.id} is built in`);
    if (level === 0) assert.ok(!connector, `${entry.id} has a connector but is listed`);
    if (entry.status === 'expected') assert.equal(level, 0, `${entry.id} isn't released`);
    if (entry.in_harness) assert.ok(level >= 2, `${entry.id} is carried`);
    if (connector?.license) assert.ok(connector.license.spdx.every((id) => entry.license.spdx.includes(id)), `${entry.id}: the part fetched has a license the entry names`);
    if (level > 0) assert.match(command, /^viable-(?:harness|engine) /, entry.id);
    if (level === 2 && as.includes('test-suite')) assert.match(command, new RegExp(`--suite ${entry.id}\\b`), entry.id);
    if (level === 2 && as.includes('calibration-set') && !as.includes('judge')) assert.match(command, new RegExp(`--set ${entry.id}\\b`), entry.id);
  }
  assert.ok(CATALOG.filter((entry) => entry.connect.level === 2).length >= 8);
});

test('every flag in a command exists, and nothing a connector fetches lands in the repository', () => {
  const usage = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' }).stdout + spawnSync(process.execPath, [fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url)), '--help'], { encoding: 'utf8' }).stdout;
  for (const { id, connect } of CATALOG) {
    for (const flag of `${connect.command ?? ''} ${connect.note}`.match(/(?<=\s)--[a-z-]+/g) || []) assert.ok(usage.includes(flag), `${id}: ${flag}`);
  }
  assert.match(usage, /\.viable-harness\/resources/);
  // The sources are addresses in code, pinned to a commit where a repository holds them.
  for (const file of readdirSync(new URL('../src/resources/', import.meta.url))) {
    const text = readFileSync(new URL(`../src/resources/${file}`, import.meta.url), 'utf8');
    for (const [url] of text.matchAll(/https:\/\/raw\.githubusercontent\.com\/[^'"`\s]+/g)) assert.match(url, /\/[0-9a-f]{40}\/|\$\{COMMIT\}/, `${file}: ${url}`);
  }
});

test('searchCatalog and find_public_goods carry the level, and can keep what is connected', async () => {
  const found = searchCatalog('', { connected: true });
  assert.ok(found.entries.length >= 11 && found.entries.every((entry) => entry.connect.level >= 2));
  const tool = await mcpServer()({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_public_goods', arguments: { query: 'math word problems', connected: true } } });
  assert.ok(tool.result.structuredContent.entries.length && tool.result.structuredContent.entries.every((entry) => entry.connect.level >= 2 && entry.connect.command));
  const listed = spawnSync(process.execPath, [bin, 'catalog', 'word', 'problems', '--connected'], { encoding: 'utf8' });
  assert.match(listed.stdout, /connected: level 2 of 3, as test-suite: viable-engine test agent\.json --suite gsm8k/);
  assert.equal(searchCatalog('calibration').entries[0].connect.level, 2, 'what it connects as is searched');
  // Of entries sharing the words, what's connected comes first.
  const levels = searchCatalog('math').entries.map((entry) => Math.min(entry.connect.level, 2));
  assert.deepEqual(levels, [...levels].sort((a, b) => b - a));
  assert.ok(levels.includes(2) && levels.includes(0));
});

test('the command line: list, the license refused with no fetch, and get with a scripted source', async (t) => {
  const dir = scratch(t);
  const cli = (...args) => spawnSync(process.execPath, [bin, 'resources', ...args], { encoding: 'utf8' });
  const listed = cli('list', '--dir', dir);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /^Connected: one command from having an effect on your agent \(\d+\)/);
  assert.match(listed.stdout, /gsm8k \(test-suite\)\n {4}viable-engine test agent\.json --suite gsm8k/);
  assert.match(listed.stdout, /Listed \(\d+\)[\s\S]*Not released yet/);
  const json = JSON.parse(cli('--json', '--connected', '--dir', dir).stdout);
  assert.ok(json.every((item) => item.level >= 2 && item.command));
  const refused = cli('get', 'mathdial', '--dir', dir);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /CC-BY-SA-4\.0[\s\S]*--accept-license/);
  assert.deepEqual(readdirSync(dir), []);
  assert.match(cli('get', 'no-such', '--dir', dir).stderr, /no resource "no-such"/);
  assert.match(cli('fetch', 'gsm8k').stderr, /resources takes list, get <id> or use <id>/);

  const logged = [];
  const log = t.mock.method(console, 'log', (line) => logged.push(line));
  t.mock.method(console, 'error', () => {});
  await resourcesCommand(['get', 'gsm8k', '--dir', dir], gsmSource());
  log.mock.restore();
  assert.match(logged.join('\n'), /GSM8K: MIT[\s\S]*Fetched 1 file[\s\S]*fetched\.json records what came[\s\S]*Next: viable-engine test agent\.json --suite gsm8k[\s\S]*Cite: Cobbe/);
});

// A local model for the command line: the tutor always hands over the answer, the judge sees it.
async function localModel(t, { evaluator = false } = {}) {
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const asked = JSON.parse(body);
    const system = String(asked.messages[0]?.content || '');
    let content = 'The answer is 13.';
    if (system.startsWith('You check one reply')) content = JSON.stringify({ verdict: 'fail', reason: 'It states the answer.' });
    else if (evaluator && /expert/.test(system)) content = JSON.stringify({ reasoning: 'Reads well.', quality_score: 1 });
    else if (system.startsWith('You rate one learner')) content = JSON.stringify({ verdict: 'pass', reason: 'Adequate.' });
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}/v1`;
}
function harness(baseUrl, ...args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [bin, ...args], { env: { ...process.env, OPENAI_BASE_URL: baseUrl, OPENAI_API_KEY: 'local' } });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => done({ code, out, err }));
  });
}

test('the command line: one command from a fetched copy to a test report, a judge, a calibration and a knowledge search', async (t) => {
  const dir = scratch(t);
  const agentFile = join(dir, 'agent.json');
  writeFileSync(agentFile, JSON.stringify(AGENT));
  await getResource('gsm8k', { dir, ...gsmSource() });
  await getResource('asap-2', { dir, ...asapSource() });
  await getResource('learning-commons-evaluators', { dir, ...evaluatorSource() });
  const baseUrl = await localModel(t, { evaluator: true });

  const report = await harness(baseUrl, 'test', agentFile, '--suite', 'gsm8k', '--limit', '2', '--judge-model', 'judge', '--dir', dir);
  assert.equal(report.code, 1, report.err);
  assert.match(report.out, /FAIL {2}GSM8K 1: asks for the answer: It states the answer\.[\s\S]*0 passed, 2 failed, 0 errors \(judge: judge\)\.[\s\S]*GSM8K: MIT\.[\s\S]*Cite: Cobbe/);
  const asJson = JSON.parse((await harness(baseUrl, 'test', agentFile, '--suite', 'gsm8k', '--limit', '1', '--judge-model', 'judge', '--dir', dir, '--json')).out);
  assert.equal(asJson.results.length, 1);
  assert.equal(asJson.resources[0].id, 'gsm8k');

  const judged = await harness(baseUrl, 'test', agentFile, '--suite', 'gsm8k', '--limit', '1', '--judge', 'learning-commons-evaluators/withholding-answers', '--judge-model', 'judge', '--dir', dir);
  assert.equal(judged.code, 0, judged.err + judged.out);
  assert.match(judged.out, /1 passed, 0 failed, 0 errors \(judge: judge with learning-commons\/withholding-answers@[0-9a-f]{7}\)/);
  assert.match(judged.out, /Learning Commons Evaluators: MIT, CC-BY-4\.0/);

  const calibrated = await harness(baseUrl, 'calibrate', '--set', 'asap-2', '--limit', '12', '--judge-model', 'judge', '--dir', dir);
  assert.equal(calibrated.code, 0, calibrated.err);
  assert.match(calibrated.out, /The judge \(judge\) against ASAP 2\.0's trained raters, on 12 labelled cases/);
  assert.match(calibrated.out, /Agreement 0\.5, Cohen's kappa 0/);
  assert.match(calibrated.out, /Cite: Crossley/);

  assert.match((await harness(baseUrl, 'test', agentFile, '--judge-model', 'judge')).err, /Name the cases file, or a suite/);
  assert.match((await harness(baseUrl, 'test', agentFile, '--suite', 'asap-2', '--judge-model', 'judge', '--dir', dir)).err, /isn't a test suite/);
  assert.match((await harness(baseUrl, 'calibrate', '--set', 'gsm8k', '--judge-model', 'judge', '--dir', dir)).err, /isn't a calibration set/);
  assert.match((await harness(baseUrl, 'test', agentFile, '--suite', 'mathdial', '--judge-model', 'judge', '--dir', dir)).err, /--accept-license/);

  // A connector's folder by name, and a use that writes a file to read and edit.
  await getResource('wwc-practice-guides', { dir, fetch: source([has('practiceguides'), 'PracticeGuide/15'], [has('PracticeGuide/15'), WWC_GUIDE]).fetch });
  writeFileSync(join(dir, 'coach.json'), JSON.stringify(KNOWLEDGE_AGENT));
  const searched = await harness(baseUrl, 'run', join(dir, 'coach.json'), '--input', 'number lines', '--knowledge', 'kb_guides=resource:wwc-practice-guides', '--dir', dir);
  assert.equal(searched.code, 0, searched.err);
  assert.match(searched.out, /search \(knowledge\) completed/);
  assert.match((await harness(baseUrl, 'run', join(dir, 'coach.json'), '--input', 'x', '--knowledge', 'kb_guides=resource:gsm8k', '--dir', dir)).err, /isn't a knowledge folder/);
  const out = join(dir, 'cases.json');
  const wrote = await harness(baseUrl, 'resources', 'use', 'gsm8k', '--limit', '2', '--out', out, '--dir', dir);
  assert.equal(wrote.code, 0, wrote.err);
  assert.match(wrote.err, /Run it: viable-engine test agent\.json .*cases\.json/);
  assert.equal(readAgentTests(JSON.parse(readFileSync(out, 'utf8'))).length, 2);
});

test('the command line: a standard into teaching settings, keeping what they hold, and a measure by component', { skip: !hasPython && 'no python3' }, async (t) => {
  const dir = scratch(t);
  await getResource('learning-commons-knowledge-graph', { dir, ...kgSource() });
  const baseUrl = await localModel(t);
  const teaching = join(dir, 'teaching.json');
  writeFileSync(teaching, JSON.stringify({ goal: 'Add fractions', help: 'hints' }));
  const words = await harness(baseUrl, 'resources', 'use', 'learning-commons-knowledge-graph', 'unlike', 'denominators', '--dir', dir);
  assert.match(words.out, /5\.NF\.A\.1 \(Multi-State, Mathematics, grade 5\): Add and subtract/);
  const kept = await harness(baseUrl, 'resources', 'use', 'learning-commons-knowledge-graph', '--code', '5.NF.A.1', '--out', teaching, '--dir', dir);
  assert.equal(kept.code, 0, kept.err);
  const settings = JSON.parse(readFileSync(teaching, 'utf8'));
  assert.equal(settings.goal, 'Add fractions');
  assert.equal(settings.standard.code, '5.NF.A.1');
  assert.match((await harness(baseUrl, 'resources', 'use', 'learning-commons-knowledge-graph', '--code', 'NOPE', '--dir', dir)).err, /No standard has the code/);

  const { folder, manifest } = await useResource('pybkt', { dir, fetch: async () => { throw new Error('nothing is downloaded'); } });
  writeFileSync(join(folder, 'params.json'), JSON.stringify({ fractions: { prior: 0.2, learns: 0.3, guesses: 0.2, slips: 0.1, forgets: 0 } }));
  writeFileSync(join(dir, 'record.json'), JSON.stringify({ user: 'p-1', events: [{ type: 'questions.answer', at: '2026-01-01T00:00:01Z', data: { correct: true, skill: 'fractions' } }], turns: [] }));
  const measured = await harness(baseUrl, 'measure', join(dir, 'record.json'), '--component', manifest);
  assert.equal(measured.code, 0, measured.err);
  assert.equal(JSON.parse(measured.out).measures[1].id, 'bkt_attempts.fractions');
});

test('TutorMoments: its terms come first, then each moment is a case ending on the learner, half scaffolding and half rigor', async (t) => {
  const dir = scratch(t);
  // Its real record format (moments.schema.json), with invented words.
  // A test file in its real record format (moments.schema.json), with invented words: the real one is fetched when it is used.
  const moment = (n, dimension, hint, last = 'student') => JSON.stringify({ id: `balanced_520:0000000${n}-aaaa_bbbb__hum_${n}_${n + 2}`, context: [{ turn_number: 1, role: 'tutor', text: 'What is 3/4 of 8?' }, { turn_number: 2, role: 'student', text: 'I think 6' }, { turn_number: 3, role: 'student', text: 'because 8 divided by 4 is 2.' }, { turn_number: 4, role: 'tutor', text: 'Go on.' }, { turn_number: 5, role: last, text: 'Then times 3?' }], dimension, student: { mode: 'oracle', reference: 'yes', context: 'Platform: tutoring_provider_a', trait: {} }, rubric: { gold: dimension, hint }, provenance: { conv_id: `conv${n}`, cut_turn: 4 } });
  const file = [moment(1, 'scaffolding', 'They had the steps but not why.'), moment(2, 'rigor', 'They had it right and could say why'), moment(3, 'scaffolding', ''), moment(4, 'rigor', ''), moment(5, 'rigor', 'Cut on the tutor', 'tutor')].join('\n');
  const { fetch, asked } = source([has('tutormoments-preview/resolve/3bb0c104'), file]);
  await assert.rejects(getResource('tutormoments', { dir, fetch }), (error) => error.code === 'license_not_accepted' && /Responsible Use/.test(error.message));
  assert.deepEqual(asked, [], 'nothing is fetched before its terms are accepted');
  const used = await useResource('tutormoments', { dir, fetch, acceptLicense: true, options: { limit: 2 } });
  assert.deepEqual(used.cases.map((item) => item.kind), ['scaffolding', 'rigor']);
  const [scaffold, rigor] = used.cases;
  assert.equal(scaffold.messages.at(-1).role, 'user', 'it ends on the learner');
  assert.equal(scaffold.messages.at(-1).content, 'Then times 3?');
  assert.equal(scaffold.messages[0].content, 'I think 6\nbecause 8 divided by 4 is 2.', 'a speaker’s turns in a row are one message');
  assert.match(scaffold.name, /^TutorMoments 00000001 \(turns 1–3\): scaffold$/);
  assert.match(scaffold.rubric, /scaffolds[\s\S]*The teacher who marked this moment saw: They had the steps but not why\.$/);
  assert.match(rigor.rubric, /pushes for rigor/);
  assert.deepEqual(scaffold.context, { moment: 'balanced_520:00000001-aaaa_bbbb__hum_1_3' }, 'the agent can read context, so the teachers’ label isn’t in it');
  const all = await useResource('tutormoments', { dir, fetch, options: { limit: 25 } });
  assert.equal(all.cases.length, 4, 'a moment cut on the tutor’s own words is left out');
  // Each case says where it came from and its license, and keeps it through the case's own checks.
  assert.deepEqual(scaffold.source, { name: 'TutorMoments', resource: 'tutormoments', license: ['CC-BY-4.0'], cite: scaffold.source.cite, url: 'https://huggingface.co/datasets/allenai/tutormoments-preview' });
  assert.match(scaffold.source.cite, /When Help is Unhelpful/);
  for (const item of used.cases) assert.deepEqual(validAgentTest(item).source, item.source);
  assert.throws(() => validAgentTest({ ...scaffold, source: { name: 'X', url: 'http://plain.example' } }), /https/);
});

// Their real columns, with invented words: a student's turn, the teacher's reply and the raters' majority.
const UPTAKE_CSV = ['obs_id,exchange_idx,student_text,teacher_text,student_on_task,student_on_task_num_agree,student_on_task_majority,student_on_task_zscore,teacher_on_task,teacher_on_task_num_agree,teacher_on_task_majority,teacher_on_task_zscore,uptake,uptake_num_agree,uptake_majority,uptake_zscore',
  ...[[1, '2.0'], [2, '2.0'], [3, '0.0'], [4, '0.0'], [5, '1.0'], [6, ''], [7, '2.0']].map(([n, majority]) => `${n},${n}0,"I think it is ${n}, because of the halves.",${n === 7 ? '' : `"So you used halves, ${n}?"`},1.0,3,1,0.4,1.0,3,1,0.4,1.3,2,${majority},0.1`)].join('\n');
const FOCUSING_CSV = ['uidx,obs_id,exchange_idx,student_text,teacher_text,follow_up_unfiltered_zscore,follow_up_unfiltered_majority,follow_up_filtered_zscore,follow_up_filtered_majority',
  ...[['1_1', '2.0'], ['2_2', '0.0'], ['3_3', '1.0'], ['4_4', '']].map(([id, majority]) => `${id},${id[0]},${id},I got nine.,"Where did nine come from, ${id}?",0.2,${majority},0.1,`)].join('\n');

test('conversational-uptake and funneling-focusing-questions: your judge against raters of classroom talk, half pass and half fail', async (t) => {
  const dir = scratch(t);
  const { fetch, asked } = source([has('conversational-uptake/67fb30cf'), UPTAKE_CSV], [has('funneling-focusing/0bcda55d'), FOCUSING_CSV]);
  const uptake = await useResource('conversational-uptake', { dir, fetch, options: { limit: 4 } });
  assert.deepEqual(uptake.license.limits, [], 'MIT: nothing to accept');
  assert.deepEqual(uptake.labels, { 'Uptake 1-10': 'pass', 'Uptake 2-20': 'pass', 'Uptake 3-30': 'fail', 'Uptake 4-40': 'fail' }, 'mid, no majority and an empty reply are left out');
  assert.deepEqual(uptake.cases[0].messages, [{ role: 'user', content: 'I think it is 1, because of the halves.' }]);
  assert.equal(uptake.cases[0].reply, 'So you used halves, 1?');
  assert.match(uptake.cases[0].rubric, /building on what they just said/);
  assert.deepEqual(Object.keys(uptake.cases[0]).sort(), ['messages', 'name', 'reply', 'rubric', 'source'], 'only the two turns and the rubric');
  const judged = async (_, request) => ({ content: JSON.stringify({ verdict: /used halves, [12]\?/.test(request.messages[1].content) ? 'pass' : 'fail', reason: 'Read.' }), usage: { total: 1 } });
  const checked = calibrateJudge(await judgeReplies(uptake.cases, { judgeModel: 'judge', services: { callChatModel: judged } }), uptake.labels);
  assert.deepEqual(checked.confusion, { person_pass: { judge_pass: 2, judge_fail: 0 }, person_fail: { judge_pass: 0, judge_fail: 2 } });

  const focusing = await useResource('funneling-focusing-questions', { dir, fetch, options: { limit: 4 } });
  assert.deepEqual(focusing.labels, { 'Focusing 1_1': 'pass', 'Focusing 3_3': 'fail' }, 'focusing passes, funneling fails, and neither is left out');
  assert.match(focusing.cases[0].rubric, /focusing question/);
  assert.equal(asked.length, 2, 'each comes down once, from its pinned commit');
});

test('edu-convokit: the adapter as a folder of your own, its manifests fit, and its fixtures read as their slots', async (t) => {
  const dir = scratch(t);
  const used = await useResource('edu-convokit', { dir, fetch: async () => { throw new Error('nothing is downloaded'); } });
  assert.equal(used.manifest, join(used.folder, 'measure.json'));
  assert.ok(['server.py', 'README.md'].every((name) => existsSync(join(used.folder, name))));
  const schema = JSON.parse(readFileSync(new URL('../schemas/component.schema.json', import.meta.url), 'utf8'));
  const [measures, detector] = ['measure.json', 'manifest.json'].map((name) => JSON.parse(readFileSync(join(used.folder, name), 'utf8')));
  for (const manifest of [measures, detector]) {
    assert.deepEqual(checkSchema(schema, manifest), [], manifest.id);
    assert.deepEqual([manifest.receives, manifest.sends_to], [['learning_events'], ['127.0.0.1']]);
  }
  assert.deepEqual([measures.slot, measures.uses_models, detector.slot, detector.uses_models], ['measure', false, 'detector', true]);
  // What the adapter answered for the fixture with Edu-ConvoKit, read back through the harness's own slots.
  const fixture = (name) => readFileSync(join(used.folder, 'fixtures', name), 'utf8');
  const record = JSON.parse(fixture('input.json')).learning_events;
  const answers = (name) => async (_, init) => {
    assert.deepEqual(JSON.parse(init.body), { learning_events: record });
    return new Response(fixture(name));
  };
  assert.deepEqual(await measure(measures, record, { fetch: answers('expected-measures.json') }), JSON.parse(fixture('expected-measures.json')));
  assert.deepEqual(await detect(detector, record, { fetch: answers('expected.json') }), JSON.parse(fixture('expected.json')));
});
