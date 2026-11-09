// What a learner meets in an activity: a page the teacher wrote, the AI's first message, and what it was told to do in this step, which learners never get to read.
import '../../harness/test/no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { teachingContext } from '../../harness/src/utils/teaching.js';
import { withSteps } from '../src/console/flow.js';
import { stepReply } from '../src/learner/logic.js';
import { openingSettings, publicWorkspace, seesParts, workspaceContext, workspaceRunContext, workspaceSettings } from '../src/learner/workspace.js';

const WORKSPACE = workspaceSettings({
  ai: 'right',
  panels: [{ id: 'the-case', type: 'page', title: 'The case', text: '# Bees\n\nWho is right?' }, { id: 'verdict', type: 'writing', title: 'Your verdict', prompt: 'Make your case.' }],
  steps: [
    { id: 'one', title: 'The case', panels: ['the-case'], ai: 'off', says: 'Never shown', brief: 'Never used' },
    { id: 'two', title: 'Question it', panels: ['the-case'], ai: 'on', says: 'So what’s your call?', brief: 'Play a skeptic. Never say who is right.' },
    { id: 'three', title: 'Your verdict', panels: ['verdict'], ai: 'on', move: 'ready' }
  ]
});

test('a page is what the teacher wrote, kept with its paragraphs and bounded, and the AI sees it unless told not to', () => {
  const [page] = WORKSPACE.panels;
  assert.equal(page.text, '# Bees\n\nWho is right?');
  assert.deepEqual(seesParts(page), ['this page']);
  const run = workspaceRunContext(WORKSPACE, { panel: 'the-case' });
  assert.match(run.view, /It says:\n# Bees/);
  const hidden = workspaceSettings({ panels: [{ type: 'page', title: 'x', text: 'secret', ai_sees: 'nothing' }] });
  assert.deepEqual(seesParts(hidden.panels[0]), []);
  assert.equal(workspaceRunContext(hidden, { panel: hidden.panels[0].id }).view, null);
  assert.equal(workspaceSettings({ panels: [{ type: 'page', text: 'x'.repeat(20000) }] }).panels[0].text.length, 12000);
});

test('the AI is beside a step where it was given something to do there, not by default', () => {
  const activity = { key: 'a', title: 'A', agent_ref: 'tutor' };
  withSteps({ question_sets: [], course: { activities: [activity] } }, activity, [
    { title: 'Read', shows: 'page', text: 'x' },
    { title: 'Talk', shows: 'page', text: 'y', ai_says: 'What do you think?' },
    { title: 'Asked for', shows: 'page', text: 'z', ai: true },
    { title: 'Kept out', shows: 'page', text: 'w', ai: false, ai_says: 'Never' }
  ], { makeItems: () => [], readings: new Map() });
  assert.deepEqual(activity.workspace.steps.map((step) => step.ai), ['off', 'on', 'on', 'off']);
  assert.equal(activity.workspace.steps[3].says, undefined);
});

test('a step with no AI keeps no first message and nothing for the AI to do', () => {
  assert.deepEqual(Object.keys(WORKSPACE.steps[0]).sort(), ['ai', 'chat', 'id', 'panels', 'title']);
  assert.equal(WORKSPACE.steps[1].says, 'So what’s your call?');
});

test('what the AI is told to do in a step never reaches the page, and what it says first does', () => {
  const shown = publicWorkspace(WORKSPACE, new Map(), { through: 1 });
  assert.equal(shown.steps[1].says, 'So what’s your call?');
  assert.doesNotMatch(JSON.stringify(shown), /skeptic|Never used/);
  const reply = stepReply(WORKSPACE, new Map(), { index: 1, at: '2026-11-07T00:00:00Z' });
  assert.equal(reply.steps[1].says, 'So what’s your call?');
  assert.doesNotMatch(JSON.stringify(reply), /skeptic/);
});

test('the AI is told where the learner is, what to do there and what it already said, as the teacher’s instructions', () => {
  const made = workspaceContext(WORKSPACE, { panel: 'the-case' }, new Map(), {}, {}, { goal: 'Weigh a claim', role: 'A friendly skeptic' }, null, { index: 1, step: WORKSPACE.steps[1] });
  assert.match(made.step_view, /step 2 of 3, “Question it”/);
  assert.match(made.step_view, /Play a skeptic/);
  assert.match(made.step_view, /You began this step by saying: “So what’s your call\?”/);
  assert.match(made.step_view, /next step is “Your verdict”/);
  assert.match(made.teaching_view, /Who you are here: A friendly skeptic/);
  assert.equal(made.workspace_reach, 'reply');
  // Kept to variables, it isn't sent as instructions.
  assert.equal(workspaceContext(WORKSPACE, { panel: 'the-case' }, new Map(), {}, { place: 'variables' }, null, null, { index: 1, step: WORKSPACE.steps[1] }).step_view, undefined);
});

test('a conversation with no steps can still speak first, and knows it did', () => {
  assert.equal(openingSettings({}), null);
  assert.equal(openingSettings(null), null);
  assert.deepEqual(openingSettings({ says: '  Hello  ', starters: ['A', '', 'B', 'C', 'D', 'E'] }), { says: 'Hello', starters: ['A', 'B', 'C', 'D'] });
  const made = workspaceContext(null, null, new Map(), {}, {}, null, null, null, { says: 'What do you think happened?' });
  assert.match(made.step_view, /You began this conversation by saying: “What do you think happened\?”/);
});

test('a role and a design are kept with how the AI helps, and only the role goes to the AI', () => {
  const told = teachingContext({ role: 'A beginner who holds a misconception', design: { id: 'teach-the-ai', label: 'Teach the AI' } });
  assert.match(told.text, /Who you are here: A beginner/);
  assert.doesNotMatch(JSON.stringify(told), /teach-the-ai/);
});

test('a learner holding the right answer on a question is told so, by a yes or no from the server, and only where the panel would tell them', async () => {
  const { reachedForReply, reachedForReviewer } = await import('../../harness/src/checks/vettingPrompts.js');
  const { reachedAmong } = await import('../../harness/src/checks/answerReached.js');
  const items = [{ id: 'q1', type: 'single', prompt: 'Which is equal to 2/3?', choices: [{ id: 'a', text: '3/4' }, { id: 'b', text: '4/6' }], answer: { choice: 'b' } }];
  const sets = new Map([['qs', { items }]]);
  const panel = (feedback) => ({ ai: 'right', panels: [{ id: 'p', type: 'questions', title: 'Check', set_id: 'qs', feedback, tries: 3, hints: true, ai_sees: 'question', context: { question: true, answer: true, attempts: true, hints: true } }] });
  const asked = (feedback, response) => workspaceRunContext(panel(feedback), { panel: 'p', item: 'q1', response }, sets).context;
  assert.equal(asked('each', 'b').answer_reached, true);
  assert.equal(asked('each', 'b').answer_holds, true);
  assert.equal(asked('each', 'a').answer_reached, undefined, 'a wrong one isn’t');
  assert.equal(asked('each', null).answer_reached, undefined, 'nothing chosen isn’t');
  assert.equal(asked('none', 'b').answer_reached, undefined, 'a test keeps it from the AI too');
  // What this learner said names no key, and they have it: both models hear so.
  const said = ['Yes, I chose to divide everything by 2, so it became 2/3. I think I’m right!'];
  const key = [{ question: { text: 'Which is equal to 2/3?' }, answerKey: { correctAnswer: 'Correct answer: 4/6' } }];
  assert.ok(reachedAmong(key, said).none, 'their words alone can’t tell');
  const held = reachedAmong(key, said, { checked: true, holds: true });
  assert.deepEqual(held, { now: true, items: [1] });
  assert.match(reachedForReply(held, 1), /Tell them plainly that they are right/);
  assert.match(reachedForReviewer(held, 1), /Criterion 1 doesn’t apply to that answer|Criterion 1 doesn't apply to that answer/);
});

test('a learner with extra time from their teacher is never moved on by a timer: a step that opens on its own waits for them', () => {
  const timed = workspaceSettings({
    ai: 'right',
    panels: [{ id: 'the-case', type: 'page', title: 'The case', text: 'Read it.' }, { id: 'verdict', type: 'writing', title: 'Your verdict', prompt: 'Make your case.' }],
    steps: [{ id: 'one', title: 'Think alone', panels: ['the-case'], ai: 'off' }, { id: 'two', title: 'Your verdict', panels: ['verdict'], ai: 'on', move: 'auto', minutes: 5 }]
  });
  const now = { index: 0, at: '2026-11-09T10:00:00.000Z' };
  const everyone = stepReply(timed, new Map(), now);
  assert.equal(everyone.next.move, 'auto');
  const extended = stepReply(timed, new Map(), now, { extended: true });
  assert.equal(extended.next.move, 'ready', 'they go on when they say so');
  assert.equal(extended.next.opens_at, everyone.next.opens_at, 'the minutes are still the earliest');
  assert.equal(extended.steps[1].move, 'ready');
});
