/**
 * The Carnegie Skills Progressions (collaboration, communication, critical thinking), for learners a
 * K-12 standard doesn't fit: a seminar, a workshop, a training. Searched here, and kept in an activity's
 * teaching settings as it was chosen, at a level.
 */
import { SKILLS } from './skillsData.js';

const indicators = () => SKILLS.skills.flatMap((skill) => skill.subskills.flatMap((subskill) => subskill.indicators.map((indicator) => ({ skill, subskill, indicator }))));

/** The skills' indicators, all of them or those matching every word (in any of their levels too). */
export function findSkills(q = '') {
  const words = String(q).slice(0, 200).trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = indicators().filter((entry) => {
    const haystack = [entry.skill.name, entry.subskill.description, entry.indicator.code, entry.indicator.description, ...entry.indicator.items.flatMap((item) => item.levels.map((level) => level[1]))].join(' ').toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  return { object: 'list', levels: SKILLS.levels, framework: { name: SKILLS.framework.name, author: SKILLS.framework.author }, data: found.map(({ skill, indicator }) => ({ code: indicator.code, skill: skill.name, description: indicator.description })) };
}

/**
 * One indicator as an activity keeps it, at the level the learners work toward: what a learner at that
 * level does (as its components) and the level below (to go back to), with the attribution. Null if no such code.
 */
export function skillAtLevel(code, wanted) {
  const entry = indicators().find(({ indicator }) => indicator.code === String(code || '').toUpperCase());
  if (!entry) return null;
  const level = Math.min(Math.max(Number.parseInt(wanted, 10) || 2, 1), SKILLS.levels.length);
  const { skill, indicator } = entry;
  return {
    object: 'standard',
    kind: 'skill',
    uuid: indicator.id,
    code: indicator.code,
    description: `${skill.name}: ${indicator.description}`,
    jurisdiction: '',
    subject: 'Durable Skills',
    grades: [],
    level: { number: level, name: SKILLS.levels[level - 1] },
    learning_components: indicator.items.map((item) => ({ id: item.levels[level - 1][0], description: item.levels[level - 1][1] })),
    prior: level > 1 ? indicator.items.map((item) => ({ uuid: item.levels[level - 2][0], code: `${item.code}.${level - 1}`, description: item.levels[level - 2][1] })) : [],
    source: { name: SKILLS.framework.name, license: SKILLS.framework.license, attribution: [SKILLS.framework.attribution], modified: SKILLS.framework.modified, retrieved_at: null }
  };
}
