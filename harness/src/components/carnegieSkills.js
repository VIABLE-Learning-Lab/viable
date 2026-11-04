import { SKILLS } from '../utils/skillsData.js';

export default {
  id: 'carnegie/skills-progressions',
  version: '1.0.0',
  slot: 'context',
  label: 'Carnegie Skills Progressions',
  summary: 'Durable skills (collaboration, communication, critical thinking) with their subskills, indicators and four levels; an activity can aim at one instead of a standard.',
  runs: { kind: 'core', entry: 'SKILLS' },
  receives: ['teacher_text'],
  sends_to: [],
  uses_models: false,
  license: { code: 'MIT', data: 'CC-BY-4.0' },
  authors: [SKILLS.framework.author],
  cite: `${SKILLS.framework.name}, ${SKILLS.framework.author}, via the Learning Commons Knowledge Graph (${SKILLS.framework.modified}).`,
  attribution: SKILLS.framework.attribution,
  evidence: {
    original: 'A framework of skills and levels from the Carnegie Foundation for the Advancement of Teaching; see its documentation for how it was developed.',
    integration: 'Carried as chosen in an activity’s teaching settings; not yet compared with and without in this harness.',
    unknown: 'Whether naming a skill and level in the AI’s instructions changes its replies or learners’ growth in the skill.'
  },
  risk: 'low',
  maintainer: { name: 'VIABLE Lab' },
  harness: '>=0.2.0 <1.0.0'
};
