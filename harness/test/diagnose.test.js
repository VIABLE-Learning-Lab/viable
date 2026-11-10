import assert from 'node:assert/strict';
import test from 'node:test';
import { PROCEDURE_COUNT, applyProcedure, diagnose, readArithmetic } from '../src/diagnose.js';
import { turnBrief } from '../src/brief.js';

const named = (question, said) => diagnose({ question, said })?.id ?? null;

test('a problem that is one piece of arithmetic is read, and nothing else is', () => {
  for (const [question, n, d] of [['What is 2/3 + 1/4?', 11, 12], ['Work out 4 - (-6).', 10, 1], ['2 1/2 × 1 1/3', 10, 3], ['0.8 ÷ 0.02', 40, 1], ['Find 6 x 7.', 42, 1], ['−8 + 3', -5, 1]]) {
    assert.deepEqual(readArithmetic(question)?.correct, { n, d }, question);
  }
  for (const question of ['What is 25% of 80?', 'Solve: 2(x + 3) = 18', 'What is −8 + 15 − 4?', 'Why does the Moon show phases?', '', '5 ÷ 0']) assert.equal(readArithmetic(question), null, question);
});

test('a wrong answer a known procedure gives is named by what the learner did', () => {
  for (const [question, said, id] of [
    ['1/2 + 1/3', 'i got 2/5', 'tops-and-bottoms'], ['3/4 ÷ 2/5', '8/15', 'turned-the-first-over'], ['2/3 × 3/4', 'is it 8/9', 'cross-multiplied'],
    ['1 1/2 + 2 1/3', '3 2/5', 'wholes-then-tops-and-bottoms'], ['5.2 + 1.34', '1.86', 'lined-up-on-the-right'], ['0.72 × 10', 'i got 0.720', 'zeros-added-for-times-ten'],
    ['-6 - 5', '11', 'two-minuses-make-a-plus'], ['(-6) × (-5)', 'so -30', 'two-negatives-stay-negative'], ['72 - 38', '72 - 38 = 40', 'zero-where-top-is-smaller'],
    ['36 × 4', '204 i think', 'carry-added-before-multiplying'], ['612 ÷ 6', '12', 'zero-left-out-of-quotient'], ['3 - 1/4', '2 1/4', 'one-off-the-whole-fraction-kept']
  ]) assert.equal(named(question, said), id, `${question} → ${said}`);
  // What they wrote last is what they offer; a number of the problem's own in their working isn't.
  assert.equal(named('1/3 + 1/6', '2/6 because 1+1 is 2'), 'common-bottom-tops-unchanged');
  // An answer that is one of the problem's own numbers still counts when it stands alone or ends their working; a decimal cut short is the longer one.
  assert.equal(named('1/9 × 7/9', '7/9'), 'multiplied-tops-kept-bottom');
  assert.equal(named('3 - 8', '8-3=5'), 'smaller-from-larger');
  assert.equal(named('9 ÷ 64', '7.11'), 'divided-the-other-way');
  assert.equal(named('43 × 6', '248'), 'carry-not-added-when-multiplying');
  assert.equal(named('4.5 + 8.3', '128'), 'points-left-out-of-a-sum');
  // A fraction is matched as the procedure leaves it: 6/12 here is three quarters minus a sixth gone wrong some other way.
  assert.equal(named('3/4 - 1/6', '6/12'), null);
});

test('it names nothing when it doesn’t know', () => {
  // The right answer, in any form, anywhere in what they wrote; a quotient with its remainder.
  for (const [question, said] of [['2/3 + 1/6', '5/6'], ['2/3 + 1/6', 'is it 10/12'], ['1/2 + 1/3', 'first i got 2/5 but then 5/6'], ['23 ÷ 5', '4 r 3'], ['0.5 + 0.25', '.75']]) assert.equal(named(question, said), null, `${question} → ${said}`);
  // A slip, an answer no procedure gives, no number at all, a problem it can't read.
  for (const [question, said] of [['3/5 + 1/5', '5/5'], ['63 × 7', '431'], ['1/2 + 1/3', 'idk'], ['What is 25% of 80?', '3.2'], ['1/2 + 1/3', '']]) assert.equal(named(question, said), null, `${question} → ${said}`);
  // The problem said back, a right answer rounded, and what only looks like one piece of arithmetic.
  for (const [question, said] of [['1/2 + 1/3', '1/2 and 1/3'], ['1 ÷ 3', '0.33'], ['2 ÷ 3', 'about 0.67'], ['Evaluate |3x - 4| when x = -3', '-12'], ['There are 68 groups with (79 - 63) people each. How many in all?', '16'], ['Simplify: √(3+1)', '4']]) assert.equal(named(question, said), null, `${question} → ${said}`);
});

test('one wrong answer that two procedures give names both', () => {
  const found = diagnose({ question: '1/2 ÷ 3', said: '6' });
  assert.equal(found.id, 'turned-the-first-over');
  assert.deepEqual(found.also.map((item) => item.id), ['divided-the-other-way']);
  assert.ok(found.also.every((item) => item.does));
});

test('a named procedure says what the same learner would answer to another problem', () => {
  const found = diagnose({ question: '1/2 + 1/3', said: '2/5' });
  assert.deepEqual(applyProcedure(found.id, 'What is 2/7 + 3/4?'), [{ n: 5, d: 11 }]);
  assert.deepEqual(applyProcedure('smaller-digit-from-larger', '52 - 28'), [{ n: 36, d: 1 }]);
  // Nothing where the procedure has nothing to say: another kind of problem, one it can't read, a name it doesn't know.
  for (const [id, question] of [[found.id, '12 - 5'], [found.id, 'What is 25% of 80?'], ['no-such-procedure', '1/2 + 1/3']]) assert.deepEqual(applyProcedure(id, question), []);
});

test('a brief says what the answer shows in the procedure’s words, never the learner’s or the key’s', async () => {
  const teaching = { goal: 'Add fractions with unlike denominators.', help: 'hint' };
  const brief = await turnBrief(teaching, { message: 'zzqx i got 2/5', question: 'What is 1/2 + 1/3?', answer: '5/6' });
  assert.equal(brief.diagnosis.id, 'tops-and-bottoms');
  assert.match(brief.text, /What their answer shows: it is what you get if you add the tops and add the bottoms\. Don’t tell them so/);
  assert.ok(!brief.text.includes('zzqx') && !brief.text.includes('5/6') && !brief.text.includes('2/5'));
  const both = await turnBrief(teaching, { message: '6', question: '1/2 ÷ 3', answer: '1/6' });
  assert.match(both.text, /if you turn the first fraction over instead of the second, or if you divide the larger number by the smaller/);
  // Nothing without a problem, for a right answer, or for a message that isn't an answer.
  for (const input of [{ message: 'i got 2/5' }, { message: 'i got 5/6', question: 'What is 1/2 + 1/3?', answer: '5/6' }, { message: 'just tell me', question: 'What is 1/2 + 1/3?', answer: '5/6' }]) assert.equal((await turnBrief(teaching, input)).diagnosis, undefined);
});

test('the procedures are counted, each named once', async () => {
  const source = await import('node:fs').then(({ readFileSync }) => readFileSync(new URL('../src/diagnose.js', import.meta.url), 'utf8'));
  const ids = [...source.matchAll(/\{ id: '([^']+)', does: '([^']+)'/g)];
  assert.equal(ids.length, PROCEDURE_COUNT);
  assert.equal(new Set(ids.map((found) => found[1])).size, ids.length);
  for (const [, id, does] of ids) assert.ok(/^[a-z]/.test(does) && !/[.!?]$/.test(does), `${id}: "${does}" finishes "it is what you get if you …"`);
});
