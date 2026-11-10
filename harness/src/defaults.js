/**
 * What an activity's AI works from when its teacher chose none of a kind: the common misconceptions of the math idea its
 * goal names most closely (Eedi's Misconceptions Graph), and research guidance that suits how much the AI does. A turn's
 * brief then takes what fits the moment from these, as it does from a teacher's own, so an activity made by hand gets the
 * same as one Ask made. Never a skill: that is the teacher's to choose. The same goal and level always give the same set,
 * each item marked by: 'default' so a record says it wasn't the teacher's. teaching.defaults says whether: false never, true
 * always, and left out as the host says (on: on in the Harness and the VIABLE Engine; a host whose settings belong to
 * studies leaves it off unless an activity asks, so a condition's settings never change under it).
 */
import { guidanceFrom } from './components/contract.js';
import { GUIDANCE } from './components/guidance.js';
import { findMisconceptions, misconceptionById } from './utils/misconceptions.js';
import { searchTerms } from './utils/terms.js';

// For each level of help, four pieces that suit it and between them cover the moments a brief reads: an answer given, the
// answer asked for, stuck, and trying again. By framework and item, in the library's own words.
export const GUIDANCE_FOR = {
  check_only: [['viable/feedback', 1], ['viable/feedback', 4], ['viable/feedback', 5], ['viable/feedback', 9]],
  ask_first: [['viable/tutoring-talk', 2], ['viable/tutoring-talk', 3], ['viable/self-explanation', 1], ['viable/productive-struggle', 1]],
  hint: [['viable/scaffolding', 2], ['viable/scaffolding', 3], ['viable/productive-struggle', 1], ['viable/feedback', 1]],
  step_up: [['viable/scaffolding', 2], ['viable/worked-examples', 1], ['viable/worked-examples', 5], ['viable/feedback', 1]],
  explain: [['viable/worked-examples', 2], ['viable/worked-examples', 3], ['viable/self-explanation', 5], ['viable/feedback', 1]]
};
const MOST_MISCONCEPTIONS = 3;
const KEPT = 200;
const known = new Map();

/**
 * Common misconceptions for a goal: from the ideas in the graph the goal names (two words or more in common), each ranked by
 * the goal's words in its own description first, then in its idea's. One that shares none of the goal's words, such as
 * "Believes + means subtract" under an adding idea, isn't taken. Remembered by goal, since a turn asks again.
 */
export function defaultMisconceptions(goal) {
  const words = String(goal ?? '').trim();
  if (!words) return [];
  if (known.has(words)) return known.get(words);
  let found;
  try { found = findMisconceptions(words); } catch { found = { data: [] }; }
  const asked = new Set(searchTerms(words));
  const shared = (text) => searchTerms(text).filter((word) => asked.has(word)).length;
  const seen = new Set();
  const picked = found.data.filter((construct) => construct.matched.length >= 2)
    .flatMap((construct) => construct.misconceptions.map((item) => ({ item, own: shared(item.description), score: shared(item.description) * 2 + shared(construct.description) })))
    .filter((entry) => entry.own >= 1)
    .sort((a, b) => b.score - a.score)
    .filter((entry) => !seen.has(entry.item.description) && seen.add(entry.item.description))
    .slice(0, MOST_MISCONCEPTIONS).map((entry) => misconceptionById(entry.item.id)).filter(Boolean).map((item) => ({ ...item, by: 'default' }));
  if (known.size >= KEPT) known.delete(known.keys().next().value);
  known.set(words, picked);
  return picked;
}

/** Research guidance for how much the AI does, as an activity keeps it. */
export function defaultGuidance(help) {
  return (GUIDANCE_FOR[help] || []).flatMap(([id, item]) => {
    const framework = GUIDANCE.find((entry) => entry.id === id);
    return framework && item <= framework.runs.items.length ? guidanceFrom(framework, { chosen: [item] }).map((piece) => ({ ...piece, by: 'default' })) : [];
  });
}

/**
 * Teaching settings as the AI works from them: what the teacher chose, and where they chose none of a kind, what is chosen
 * for them. A standard in another subject than mathematics gets no misconceptions, since the graph is mathematics only.
 */
export function withDefaults(teaching, { on = true } = {}) {
  if (!teaching || typeof teaching !== 'object' || teaching.defaults === false || (!on && teaching.defaults !== true)) return teaching;
  const math = !teaching.standard?.subject || /math/i.test(String(teaching.standard.subject));
  const misconceptions = teaching.misconceptions?.length || !math ? [] : defaultMisconceptions(teaching.goal);
  const guidance = teaching.guidance?.length ? [] : defaultGuidance(teaching.help);
  if (!misconceptions.length && !guidance.length) return teaching;
  return { ...teaching, ...(misconceptions.length ? { misconceptions } : {}), ...(guidance.length ? { guidance } : {}) };
}
