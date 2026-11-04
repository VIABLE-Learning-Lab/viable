// Differentiating for groups: learners are sorted by what their records show, on this side, and the model only
// ever hears a group's numbers. The teacher confirms the groups; a note is about a group, never a person.
import { HELP_LEVELS, teachingContext } from '../utils/teaching.js';
import { measured, namesALearner } from './evidence.js';

const SYSTEM = `You help a teacher decide how an AI tutor should support different groups in a class. You are told each group's numbers, never who is in it. For each group, suggest how far the AI may go (one of ${Object.keys(HELP_LEVELS).join(', ')}) and a short note for the AI about the group (at most 500 characters), and say why. The teacher decides.

Answer with JSON only: {"groups": [{"id": "the group's id", "help": "...", "note": "...", "why": "the numbers it rests on"}]}`;

const groupOf = (learner) => {
  const { skills, metrics } = learner.measures;
  if (skills.some((skill) => skill.wheel_spinning) || learner.turns.some((turn) => turn?.flag === 'struggling')) return 'needs_support';
  if (skills.length && skills.every((skill) => skill.mastered)) return 'ready_for_more';
  if ((metrics.attempts ?? 0) === 0 && !learner.turns.length) return 'not_started';
  return 'on_track';
};
const LABELS = { needs_support: 'Needs more support', on_track: 'On track', ready_for_more: 'Ready for more', not_started: 'Not started' };

export default {
  id: 'differentiate',
  label: 'Differentiate for groups',
  summary: 'Sorts learners into groups by what their records show, for the teacher to confirm, and suggests each group\'s help level and note. Learners stay on this side: a model hears only numbers.',
  build({ teaching = null, records = [] }) {
    const learners = measured(records);
    const groups = Object.keys(LABELS).map((id) => {
      const inside = learners.filter((learner) => groupOf(learner) === id);
      return { id, label: LABELS[id], learners: inside.map((learner) => learner.user), size: inside.length, skills_mastered: inside.reduce((sum, item) => sum + item.measures.skills.filter((skill) => skill.mastered).length, 0), wheel_spinning: inside.reduce((sum, item) => sum + item.measures.skills.filter((skill) => skill.wheel_spinning).length, 0) };
    }).filter((group) => group.size);
    const taught = teachingContext(teaching);
    return {
      expects: 'json',
      groups,
      learners: learners.map((learner) => learner.user),
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: [`What the teacher set:\n${taught?.text ?? '(nothing yet)'}`, `The groups:\n${JSON.stringify(groups.map(({ learners: _who, ...group }) => group), null, 2)}`].join('\n\n') }
      ]
    };
  },
  check(output, turn) {
    if (!output || !Array.isArray(output.groups)) return ['The answer isn\'t the JSON asked for.'];
    const problems = [];
    const known = new Set((turn.groups ?? []).map((group) => group.id));
    for (const group of output.groups) {
      if (!known.has(group?.id)) problems.push(`There is no group "${group?.id}".`);
      if (!Object.hasOwn(HELP_LEVELS, group?.help)) problems.push(`"${group?.help}" isn't a help level.`);
      if (String(group?.note ?? '').length > 500) problems.push('A note is over 500 characters.');
    }
    if (namesALearner(JSON.stringify(output), turn.learners ?? [])) problems.push('It names a learner.');
    return problems;
  }
};

/** Teaching settings with the groups the teacher confirmed as sections: sections maps a group's id to its section's. */
export function withGroups(teaching, confirmed, sections) {
  const next = { ...teaching, sections: { ...teaching?.sections } };
  for (const group of confirmed) {
    const section = sections[group.id];
    if (section) next.sections[section] = { help: group.help ?? null, note: group.note ?? null };
  }
  return next;
}
