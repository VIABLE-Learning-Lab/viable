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
const UNLESS = 'If what they just wrote is the right answer, say so and ask them to say why it works. If it isn’t: ';

// What a reviewer is told about an act it would otherwise take for too much help. It never sees the conversation, so it
// can't know the learner has tried twice: without this it fails a worked example for showing the method in full.
const REVIEW = {
  example: 'For this turn the teacher’s policy calls for a worked example: a different problem of the same kind, worked from start to finish, and the student then sent back to their own. A response that does this is doing what was asked, however fully it shows the method on the other problem. Fail it only if it states the answer to the student’s own problem, or carries out a step of the student’s own problem with that problem’s numbers.'
};
/** What a reviewer is told about this turn's act, or null when the act needs no saying. */
export const reviewLine = (act) => REVIEW[act] ?? null;

/**
 * The rung below an act, for a turn whose own act couldn't be given within the checks: a learner due a worked example
 * gets a hint, and one due a hint gets a question, where they would otherwise get the fallback line. act: as turnAct
 * returns it. Returns { act, tries, text }, or null from the lowest rung and from confirm.
 */
export function actBelow(act) {
  const at = ACTS.indexOf(act?.act);
  if (at < 1) return null;
  return { act: ACTS[at - 1], tries: act.tries, text: `${String(act.text ?? '').startsWith(UNLESS) ? UNLESS : ''}${LINES[ACTS[at - 1]]} ${NEVER}` };
}

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
  const unless = !sure && ['attempt', 'repeated'].includes(moment) && !stuck ? UNLESS : '';
  // A problem of the same shape that code chose (examples.js): none of their numbers in it, and never their answer.
  const line = act === 'example' && example ? `Work this example for them, start to finish: ${example}. Then send them back to try their own again, and leave their own problem unsolved.` : LINES[act];
  return { act, tries, ...(act === 'example' && example ? { example } : {}), text: `${unless}${line} ${NEVER}` };
}

/** What opens the line of a turn's instructions that holds the act code decided: what follows it, to the line's end, is the act's text. */
export const ACT_LINE = 'For this turn, decided from what they have done so far (it isn’t yours to change): ';

/**
 * A turn's instructions rewritten for the rung below its act, for a turn whose own act can't be given within the checks:
 * { act, note }, or null where there is none (no act in the instructions, or the lowest rung). act: { act, tries }.
 */
export function instructionsBelow(instructions, act) {
  const text = String(instructions ?? '');
  const at = act ? text.indexOf(ACT_LINE) : -1;
  if (at < 0) return null;
  const end = (text.indexOf('\n', at) + 1 || text.length + 1) - 1;
  const lower = actBelow({ ...act, text: text.slice(at + ACT_LINE.length, end) });
  return lower ? { act: lower.act, note: `${text.slice(0, at + ACT_LINE.length)}${lower.text}${text.slice(end)}` } : null;
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
