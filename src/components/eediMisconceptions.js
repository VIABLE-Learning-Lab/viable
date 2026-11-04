import { MISCONCEPTIONS_SOURCE } from '../utils/misconceptionsSource.js';

export default {
  id: 'eedi/misconceptions-graph',
  version: '1.0.0',
  slot: 'context',
  label: 'Eedi Misconceptions Graph',
  summary: 'Mathematics misconceptions (8,117) and the constructs they hinder (2,258), found by the words of a goal or a standard; a teacher chooses which ones the AI listens for.',
  runs: { kind: 'core', entry: 'findMisconceptions' },
  receives: ['teacher_text'],
  sends_to: [],
  uses_models: false,
  license: { code: 'MIT', data: 'CC-BY-4.0' },
  authors: [MISCONCEPTIONS_SOURCE.author],
  cite: `${MISCONCEPTIONS_SOURCE.name}, ${MISCONCEPTIONS_SOURCE.author}, via the Learning Commons Knowledge Graph (${MISCONCEPTIONS_SOURCE.modified}).`,
  attribution: MISCONCEPTIONS_SOURCE.attribution,
  evidence: {
    original: 'Eedi’s misconceptions are drawn from its diagnostic questions in mathematics; see Eedi’s and Learning Commons’ documentation for how they were made and checked.',
    integration: 'Matched to a teacher’s words by shared terms, because the open release doesn’t link constructs to standards; not yet compared with and without in this harness.',
    unknown: 'Whether listening for chosen misconceptions changes the AI’s replies or what learners learn.'
  },
  risk: 'low',
  maintainer: { name: 'VIABLE Lab' },
  harness: '>=0.2.0 <1.0.0'
};
