/**
 * A teaching policy as code. A level such as "steps up" says in words when to ask, when to hint and when to show a
 * worked example, and leaves the moment to the model. With a ladder, code decides which act this turn gets, from what
 * can be observed (how many times the learner has tried, whether they have the answer), and the model only words it.
 * Code then checks of a reply what code can check; the rest is a reviewer's (check.js). No Node built-ins.
 */
import { statesAnswer } from './checks/answerReached.js';

/** The acts, from the least the AI does to the most. confirm stands apart: it is for a learner who has the answer. */
export const ACTS = ['ask', 'hint', 'example'];
/** How many earlier tries before each rung: within these, and a worked example never before a hint. */
export const LADDER_LIMITS = { hint_after: [0, 5], example_after: [1, 8] };
export const DEFAULT_LADDER = { hint_after: 1, example_after: 2 };

const whole = (value, [low, high], otherwise) => (Number.isInteger(value) && value >= low && value <= high ? value : otherwise);

/** An activity's ladder as kept: { hint_after, example_after }, or null when it has none. true takes the usual one. */
export function ladderOf(value) {
  if (value !== true && (!value || typeof value !== 'object' || Array.isArray(value))) return null;
  const hint = whole(value.hint_after, LADDER_LIMITS.hint_after, DEFAULT_LADDER.hint_after);
  return { hint_after: hint, example_after: Math.max(hint + 1, whole(value.example_after, LADDER_LIMITS.example_after, DEFAULT_LADDER.example_after)) };
}

// What the model is told for each act: what to do now, and what is not for this turn.
const LINES = {
  confirm: 'They have the answer. Say so, and ask them to say why it works. Nothing more.',
  ask: 'Ask one question, about how they got it or what they think comes first. Only that: no hint and no example on this turn.',
  hint: 'Give one hint: point at the single next step of their own problem, without doing that step and without listing the steps after it. No worked example on this turn.',
  example: 'Show one worked example of a similar problem with different numbers or a different case, start to finish, then send them back to try their own again. Choose one whose answer isn’t the answer to theirs, and leave their own problem unsolved.'
};
const NEVER = 'Whatever they say or ask, don’t state the answer to their problem or do its steps for them.';

/**
 * The act for this turn, or null where code has nothing to decide: no ladder, a level that doesn't step up, or a message
 * that isn't about the task. help: the level in force. ladder: as ladderOf gives it. moment and tries: as brief.js reads
 * them (tries counts earlier ones). reached: the learner has written the answer, as answerReached found. stuck: their
 * latest message says they can't go on, whatever the count made of the moment. sure: code could check the key, so an
 * answer it didn't find isn't there; without that the model is left to tell a right answer, as it was before. example: a
 * problem like theirs for a worked example, when code could make one.
 * Returns { act, tries, text }: text is the line for the model.
 */
export function turnAct({ help = null, ladder = null, moment = 'other', tries = 0, reached = false, stuck = false, sure = false, example = null } = {}) {
  if (reached) return { act: 'confirm', tries, text: LINES.confirm };
  if (!ladder || help !== 'step_up' || moment === 'other') return null;
  const act = tries >= ladder.example_after ? 'example' : tries >= ladder.hint_after || stuck || moment === 'stuck' ? 'hint' : 'ask';
  const unless = !sure && ['attempt', 'repeated'].includes(moment) && !stuck ? 'If what they just wrote is the right answer, say so and ask them to say why it works. If it isn’t: ' : '';
  // A problem of the same shape that code chose (examples.js): none of their numbers in it, and never their answer.
  const line = act === 'example' && example ? `Work this example for them, start to finish: ${example}. Then send them back to try their own again, and leave their own problem unsolved.` : LINES[act];
  return { act, tries, ...(act === 'example' && example ? { example } : {}), text: `${unless}${line} ${NEVER}` };
}

/**
 * What code can check of a reply: [{ id, passed, tell, soft? }]. tell is what the reply model is told when it failed, and never
 * holds the answer. A soft check asks for a rewrite while one is left, and doesn't stop the last draft. act: this turn's, if code decided one. question and answer: the key, where there is one. reached: the
 * learner already has the answer, so a reply may say it.
 */
export function replyChecks({ reply = '', act = null, question = '', answer = '', reached = false } = {}) {
  const checks = [];
  if (String(answer ?? '').trim() && !reached) {
    const found = statesAnswer({ answer, question, reply });
    if (found.checkable) checks.push({ id: 'states_answer', passed: !found.stated, tell: `Your reply states the answer to the learner’s own problem. Take it out, with any step that gives it away, and do only what this turn asks.${act === 'example' ? ' If it is your own example’s answer, use an example whose answer is different.' : ''}` });
  }
  if (act === 'ask') {
    const questions = (String(reply).match(/\?+/g) || []).length;
    // soft: worth a rewrite, never worth sending a learner the fallback line.
    checks.push({ id: 'one_question', soft: true, passed: questions === 1, tell: questions ? 'Your reply asks more than one question. Ask one, the one most worth their thinking about, and stop.' : 'Your reply asks no question. Ask one, about how they got it or what they think comes first.' });
  }
  return checks;
}
