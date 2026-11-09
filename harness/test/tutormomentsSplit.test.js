import test from 'node:test';
import assert from 'node:assert/strict';
import tutormoments, { heldOutConversations, momentCases } from '../src/resources/tutormoments.js';

// TutorMoments' record format with invented words: several conversations, each cut at a few turns, as the real file is.
const moment = (conversation, at, dimension) => JSON.stringify({
  id: `balanced_520:${conversation}_student_session__hum_${at}_${at + 2}`,
  dimension,
  rubric: { gold: dimension, hint: '' },
  provenance: { conv_id: `${conversation}_student_session` },
  context: [{ role: 'tutor', text: 'What is 3/4 of 8?' }, { role: 'student', text: `Turn ${at}: is it 6?` }]
});
const FILE = Array.from({ length: 120 }, (_, n) => Array.from({ length: 1 + (n % 4) }, (_, k) => moment(`c${n}`, k * 10, (n + k) % 2 ? 'rigor' : 'scaffolding'))).flat().join('\n');

test('whole conversations go to one split, and the held-out set stays under its count of each label', () => {
  const cases = momentCases(FILE);
  const held = cases.filter((item) => item.split === 'held-out');
  const developed = cases.filter((item) => item.split === 'development');
  assert.equal(held.length + developed.length, cases.length);
  const conversations = (list) => new Set(list.map((item) => item.conversation));
  assert.deepEqual([...conversations(held)].filter((id) => conversations(developed).has(id)), [], 'no conversation in both');
  const few = momentCases(FILE).filter((item) => item.split === 'held-out');
  assert.deepEqual(few.map((item) => item.name), held.map((item) => item.name), 'the same file splits the same way');
  const small = heldOutConversations(cases, { each: 5 });
  const counted = cases.filter((item) => small.has(item.conversation));
  assert.ok(counted.filter((item) => item.kind === 'scaffolding').length <= 5 && counted.filter((item) => item.kind === 'rigor').length <= 5);
  assert.notDeepEqual([...heldOutConversations(cases, { seed: 'another', each: 5 })], [...small], 'another seed draws other conversations');
});

test('a suite takes one split when asked, and refuses another word', () => {
  const read = () => FILE;
  const developed = tutormoments.use({ read }, { limit: 25, split: 'development' }).cases;
  const all = momentCases(FILE);
  const names = new Set(all.filter((item) => item.split === 'development').map((item) => item.name));
  assert.ok(developed.length > 0 && developed.every((item) => names.has(item.name)));
  assert.ok(developed.every((item) => !('split' in item) && !('conversation' in item)), 'the split and the conversation stay out of the case');
  assert.equal(tutormoments.use({ read }, { limit: 4 }).cases.length, 4, 'with no split, every moment can be drawn');
  assert.throws(() => tutormoments.use({ read }, { limit: 4, split: 'test' }), /--split takes development or held-out/);
});
