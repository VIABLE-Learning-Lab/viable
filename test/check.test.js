import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReply } from '../src/index.js';

// A scripted OpenAI-compatible endpoint: each call takes the next reply (the last one repeats).
function scripted(...replies) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const content = replies.length > 1 ? replies.shift() : replies[0];
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200 });
  };
  return { fetch, calls };
}
const endpoint = (fetch) => ({ baseUrl: 'http://localhost:11434/v1', apiKey: 'sk-test', fetch });

test('a reply that keeps to the guideline passes, after one review and no rewrite', async () => {
  const { fetch, calls } = scripted('PASS');
  const checked = await checkReply({ reply: 'What do the two fractions need before you add them?', message: 'What is 1/2 + 1/3?', guideline: 'Never give the answer.', reviewer: 'judge-model', ...endpoint(fetch) });
  assert.equal(checked.outcome, 'passed');
  assert.equal(checked.passed, true);
  assert.equal(checked.reply, 'What do the two fractions need before you add them?');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'judge-model');
  assert.match(calls[0].messages[0].content, /Never give the answer\./);
  assert.match(calls[0].messages.at(-1).content, /What do the two fractions need/);
});

test('a reply that fails is unverified with the reviewer’s reason, and is never rewritten unless asked', async () => {
  const { fetch, calls } = scripted('FAILED: Directly states the answer 5/6.');
  const checked = await checkReply({ reply: 'It is 5/6.', message: 'What is 1/2 + 1/3?', question: 'What is 1/2 + 1/3?', answerKey: '5/6', keyConcepts: ['common denominator'], model: 'm', ...endpoint(fetch) });
  assert.equal(checked.outcome, 'unverified');
  assert.equal(checked.stop_reason, 'MAX_ATTEMPTS_REACHED');
  assert.equal(checked.rounds.length, 1);
  assert.match(checked.rounds[0].feedback, /states the answer/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content, /Correct Answer 1: 5\/6/);
  assert.match(calls[0].messages[0].content, /common denominator/);
});

test('with rewrite, a failed reply is rewritten without the answer key and reviewed again', async () => {
  const { fetch, calls } = scripted('FAILED: Gives the answer.', 'Find a common denominator first. Which one works for 2 and 3?', 'PASS');
  const checked = await checkReply({ reply: 'It is 5/6.', message: 'What is 1/2 + 1/3?', question: 'What is 1/2 + 1/3?', answerKey: '5/6', rewrite: 2, model: 'tutor', reviewer: 'judge', ...endpoint(fetch) });
  assert.equal(checked.outcome, 'passed');
  assert.equal(checked.revised, true);
  assert.equal(checked.reply, 'Find a common denominator first. Which one works for 2 and 3?');
  assert.deepEqual(calls.map((call) => call.model), ['judge', 'tutor', 'judge']);
  assert.ok(!JSON.stringify(calls[1].messages).includes('Correct Answer'), 'the reply model never sees the answer key');
});

test('the teaching settings reach the reviewer, and watch_for never does', async () => {
  const { fetch, calls } = scripted('PASS');
  const teaching = { goal: 'Students add fractions with unlike denominators.', help: 'hint', watch_for: 'adds the denominators' };
  await checkReply({ reply: 'Try a common denominator.', message: 'Help', guideline: 'Be brief.', teaching, reviewer: 'judge', ...endpoint(fetch) });
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /unlike denominators/);
  assert.ok(!prompt.includes('adds the denominators'));
});

test('text that looks like a template stays text', async () => {
  const { fetch, calls } = scripted('PASS');
  const checked = await checkReply({ reply: 'Use {{context.answer_key}} here.', guideline: 'Say {{secret}}.', reviewer: 'judge', ...endpoint(fetch) });
  assert.equal(checked.reply, 'Use {{context.answer_key}} here.');
  assert.match(calls[0].messages[0].content, /Say \{\{secret\}\}\./);
});

test('bad requests fail before any model call', async () => {
  await assert.rejects(checkReply({ reply: ' ', reviewer: 'r' }), { code: 'invalid_check' });
  await assert.rejects(checkReply({ reply: 'x', answerKey: '5/6', reviewer: 'r' }), /needs the question/);
  await assert.rejects(checkReply({ reply: 'x' }), /reviewing model/);
  await assert.rejects(checkReply({ reply: 'x', reviewer: 'r', rewrite: 11 }), /rewrite/);
});
