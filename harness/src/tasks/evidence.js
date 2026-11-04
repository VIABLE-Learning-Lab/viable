// What learners' records say as counts and skill names, safe to give a model: no learner's code, name or words.
import { measureLearner } from '../measures.js';
import { misconceptionById } from '../utils/misconceptions.js';

const heardIn = (record) => [
  ...(record.turns || []).flatMap((turn) => [].concat(turn?.misconceptions ?? turn?.chosen?.misconceptions ?? [])),
  ...(record.events || []).flatMap((event) => [].concat(event?.data?.misconceptions ?? []))
].map((item) => (typeof item === 'string' ? misconceptionById(item)?.description ?? null : item?.description ?? null)).filter(Boolean);

/** Each learner's measures, kept with the record's own ID for the teacher's side. */
export const measured = (records = []) => {
  const byLearner = new Map();
  for (const record of [].concat(records)) {
    const key = record?.user ?? record?.learner ?? 'unnamed';
    const held = byLearner.get(key) ?? { user: key, events: [], turns: [], group: record?.learner_group ?? null };
    held.events.push(...(record?.events || []));
    held.turns.push(...(record?.turns || []));
    byLearner.set(key, held);
  }
  return [...byLearner.values()].map((learner) => ({ ...learner, measures: measureLearner(learner), heard: heardIn(learner) }));
};

/** The whole class in numbers: nothing here belongs to one learner, and a count below minimum says only "a few". */
export function classEvidence(records = [], { minimum = 3 } = {}) {
  const learners = measured(records);
  const skills = new Map();
  const heard = new Map();
  const moments = new Map();
  let turns = 0;
  let unverified = 0;
  let struggling = 0;
  for (const learner of learners) {
    turns += learner.turns.length;
    for (const turn of learner.turns) {
      if (turn?.vetting && turn.vetting !== 'passed') unverified += 1;
      if (turn?.flag === 'struggling') struggling += 1;
      if (turn?.moment) moments.set(turn.moment, (moments.get(turn.moment) ?? 0) + 1);
    }
    for (const skill of learner.measures.skills) {
      const held = skills.get(skill.skill) ?? { skill: skill.skill, learners: 0, mastered: 0, wheel_spinning: 0 };
      held.learners += 1;
      if (skill.mastered) held.mastered += 1;
      if (skill.wheel_spinning) held.wheel_spinning += 1;
      skills.set(skill.skill, held);
    }
    for (const description of new Set(learner.heard)) heard.set(description, (heard.get(description) ?? 0) + 1);
  }
  const few = (n) => (n > 0 && n < minimum ? 'a few' : n);
  return {
    learners: learners.length,
    turns,
    replies_not_passed: unverified,
    turns_flagged_struggling: struggling,
    moments: Object.fromEntries(moments),
    skills: [...skills.values()].map((item) => ({ skill: item.skill, learners: few(item.learners), mastered: few(item.mastered), wheel_spinning: few(item.wheel_spinning) })),
    misconceptions_heard: [...heard].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([description, count]) => ({ description, learners: few(count) }))
  };
}

/** Whether a text holds any of these learner IDs. */
export const namesALearner = (text, ids) => ids.some((id) => id && id !== 'unnamed' && String(text).includes(id));
