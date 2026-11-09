import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY_LIMITS, memoryNote, memoryRefusal, memoryTerms, pickMemories, searchConversations } from '../src/memory.js';

const items = [
  { id: 'm1', text: 'Prefers short replies', always: true, updated_at: '2026-11-01T00:00:00Z' },
  { id: 'm2', text: 'Taught equivalent fractions to grade 5 with a writing prompt about pizza', updated_at: '2026-10-01T00:00:00Z' },
  { id: 'm3', text: 'Runs a study of feedback in three sections this spring', updated_at: '2026-11-02T00:00:00Z' },
  { id: 'm4', text: '学校用的是共享的 iPad', updated_at: '2026-11-03T00:00:00Z' }
];

test('a message gets what is kept always in mind, and the few memories its words meet, not all of them', () => {
  const picked = pickMemories(items, 'Make a fractions activity for my grade 6 class');
  assert.deepEqual(picked.always.map((item) => item.id), ['m1']);
  assert.deepEqual(picked.fits.map((item) => item.id), ['m2'], 'the study and the iPads wait to be looked up');
  assert.deepEqual(pickMemories(items, '这个班用 iPad 吗').fits.map((item) => item.id), ['m4'], 'words in Chinese meet too');
  assert.deepEqual(pickMemories(items, '').fits, []);
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, text: `Always ${i}`, always: true, updated_at: `2026-10-${String(i + 1).padStart(2, '0')}` }));
  assert.equal(pickMemories(many, 'x').always.length, MEMORY_LIMITS.always, 'at most a handful always');
  assert.equal(pickMemories(many, 'x').always[0].id, 'a19', 'the latest first');
});

test('the note says memory is context the person can change, and that what they say now comes first', () => {
  const note = memoryNote(pickMemories(items, 'grade 5 fractions'));
  assert.match(note, /what they say now comes first/);
  assert.match(note, /never narrow what they can ask for/);
  assert.match(note, /- \[m1\] Prefers short replies \(kept 2026-11-01\)/);
  assert.match(note, /Fits this message:\n- \[m2\]/);
  assert.equal(memoryNote({ always: [], fits: [] }), '', 'nothing kept, nothing said');
});

test('a memory never names a learner, holds no address, and is one sentence', () => {
  const names = ['Maya Chen', 'Maya', 'Chen'];
  assert.match(memoryRefusal('Maya struggles with fractions', { names }), /names a learner/);
  assert.match(memoryRefusal('Check in with chen next week', { names }), /names a learner/);
  assert.equal(memoryRefusal('Prefers mayonnaise-free examples', { names }), null, 'a word that only starts like a name is fine');
  assert.match(memoryRefusal('Email me at teacher@example.org'), /email/);
  assert.match(memoryRefusal('Call 352 555 0199 after school'), /phone/);
  assert.match(memoryRefusal('x'.repeat(MEMORY_LIMITS.text + 1)), /one sentence/);
  assert.match(memoryRefusal('   '), /Say what/);
  assert.equal(memoryRefusal('Uses Google Classroom with grade 5 and grade 6'), null);
});

test('earlier conversations are found by their words, the best first, with a piece around what matched', () => {
  const threads = [
    { id: 't1', title: 'Fractions, period 2', updated_at: '2026-10-01', text: 'For grade 5 I used a writing prompt: explain why 2/3 = 4/6 with a pizza.' },
    { id: 't2', title: 'Persuasive writing', updated_at: '2026-11-01', text: 'Grade 6 argument essay about school uniforms.' },
    { id: 't3', title: 'Lab safety', updated_at: '2026-11-05', text: 'Goggles and gloves.' }
  ];
  const found = searchConversations(threads, 'grade 5 writing prompt');
  assert.deepEqual(found.map((item) => item.id), ['t1', 't2']);
  assert.match(found[0].snippet, /writing prompt/);
  assert.deepEqual(searchConversations(threads, 'goggles').map((item) => item.id), ['t3']);
  assert.deepEqual(searchConversations(threads, 'volcano'), []);
  assert.deepEqual(searchConversations(threads, ''), []);
  assert.ok(memoryTerms('grade 5 in 2026').includes('5') && memoryTerms('grade 5 in 2026').includes('2026'), 'numbers count: grade 5 isn’t grade 6');
});
