import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_DESIGNS, DESIGN_RULES, designById, findDesigns, reviewActivity } from '../src/designs.js';

test('every design says what it is for, what its steps do and what isn’t known, and names its sources', () => {
  assert.ok(ACTIVITY_DESIGNS.length >= 8);
  assert.ok(DESIGN_RULES.length >= 5);
  const ids = new Set();
  for (const design of ACTIVITY_DESIGNS) {
    assert.ok(!ids.has(design.id), design.id);
    ids.add(design.id);
    for (const field of ['label', 'for', 'words', 'minutes', 'shows', 'unknown']) assert.ok(design[field], `${design.id}: ${field}`);
    assert.ok(design.sources.length && design.sources.every((source) => /\(\d{4}\)/.test(source)), `${design.id}: a source names its year`);
    assert.ok(design.steps.length >= 3 && design.steps.length <= 6, `${design.id}: the steps fit an activity`);
    for (const step of design.steps) {
      assert.ok(['page', 'questions', 'writing', 'reading', 'embed'].includes(step.panel), `${design.id}: ${step.title}`);
      assert.ok(step.write, `${design.id}: ${step.title} says what to write`);
      assert.equal(step.ai === 'on', Boolean(step.ai_does), `${design.id}: ${step.title} says what the AI does exactly where it is there`);
    }
    // The first try is the learner's, unless the design starts by studying something with the AI's questions.
    assert.ok(design.steps.some((step) => step.ai === 'off') || design.id === 'x', `${design.id}: somewhere the thinking is theirs alone`);
  }
});

test('the words of what is being taught find the design that fits', () => {
  assert.equal(findDesigns({ words: 'evaluating a claim about AI with evidence' })[0].id, 'claim-evidence-reasoning');
  assert.equal(findDesigns({ words: 'review vocabulary from last week' })[0].id, 'retrieval-practice');
  assert.equal(findDesigns({ words: 'speaking practice ordering at a cafe' })[0].id, 'role-play-debrief');
  assert.equal(findDesigns({ words: 'an essay draft with feedback' })[0].id, 'draft-feedback-revise');
  assert.equal(findDesigns({ words: 'adding fractions, a new method' })[0].id, 'worked-example-fading');
  assert.equal(findDesigns({ words: 'zzz' }).length, 3, 'with nothing to go on, some to choose from');
  assert.equal(designById('teach-the-ai').label, 'Teach the AI');
  assert.equal(designById('nope'), null);
});

test('a bare conversation is told it leaves learners with an empty box', () => {
  const notes = reviewActivity({ ai: true });
  assert.deepEqual(notes.filter((note) => note.level === 'fix').map((note) => note.id), ['empty_box', 'no_goal']);
  assert.ok(notes.some((note) => note.id === 'conversation_alone'));
  assert.ok(notes.some((note) => note.id === 'no_limit'));
  assert.ok(!reviewActivity({ ai: true, says: 'What do you make of this?', goal: 'x', help: 'hint' }).some((note) => note.level === 'fix'));
});

test('what steps are missing is said, step by step', () => {
  const panels = [{ type: 'page', text: '' }, { type: 'writing', prompt: '' }, { type: 'questions', questions: 0 }, { type: 'reading', file: false }];
  const fix = reviewActivity({ goal: 'x', help: 'hint', ai: true, steps: [{ title: 'One', ai: 'off', panels }] }).filter((note) => note.level === 'fix').map((note) => note.id);
  assert.deepEqual(fix, ['empty_page', 'no_task', 'no_questions', 'no_reading']);
});

test('a well-made activity has nothing to say, and help before thinking is pointed out', () => {
  const good = { goal: 'Weigh a claim', help: 'hint', ai: true, steps: [
    { title: 'The case', ai: 'off', panels: [{ type: 'page', text: 'A case' }] },
    { title: 'Your call', ai: 'off', panels: [{ type: 'questions', questions: 2 }] },
    { title: 'Question it', ai: 'on', says: 'What is your call?', panels: [{ type: 'page', text: 'Defend it' }] }
  ] };
  assert.deepEqual(reviewActivity(good), []);
  const early = { ...good, steps: [{ ...good.steps[1], ai: 'on' }, good.steps[2]] };
  assert.ok(reviewActivity(early).some((note) => note.id === 'help_first'));
  const silent = { ...good, steps: [good.steps[0], good.steps[1], { ...good.steps[2], says: null }] };
  assert.ok(reviewActivity(silent).some((note) => note.id === 'ai_silent'));
});

test('a long page is pointed out only for children', () => {
  const steps = [{ title: 'Read', ai: 'off', panels: [{ type: 'page', text: 'word '.repeat(400) }] }, { title: 'Answer', ai: 'off', panels: [{ type: 'questions', questions: 1 }] }];
  assert.ok(reviewActivity({ goal: 'x', audience: 'children', steps }).some((note) => note.id === 'long_page'));
  assert.ok(!reviewActivity({ goal: 'x', audience: 'teens', steps }).some((note) => note.id === 'long_page'));
});

test('docs/designs.md is current, as npm run designs:build writes it', async () => {
  const { designsPage, designsPath } = await import('../scripts/build-designs-page.mjs');
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(designsPath, 'utf8'), designsPage(), 'Run npm run designs:build.');
});
