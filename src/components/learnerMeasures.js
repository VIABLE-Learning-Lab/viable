export default {
  id: 'viable/learner-measures',
  version: '1.0.0',
  slot: 'measure',
  label: 'Learner measures',
  summary: 'The research export’s learner measures from learning events and turns: messages, sessions, think time, revision, pasting, accuracy, mastery, wheel-spinning, writing; each with its definition, caveats and sources.',
  runs: { kind: 'core', entry: 'measureLearner' },
  receives: ['learning_events'],
  sends_to: [],
  uses_models: false,
  license: { code: 'MIT' },
  authors: ['VIABLE Lab'],
  cite: 'VIABLE harness, src/utils/researchMetrics.js; each measure cites its own sources (CITATIONS).',
  evidence: {
    original: 'Each measure follows the published work its entry in METRICS cites (for example, mastery after a streak of correct answers; wheel-spinning after many attempts without mastery).',
    integration: 'The same code computes VIABLE’s research export and dashboard.',
    unknown: 'How each measure relates to learning in a given course: they are descriptive, never learning gains.'
  },
  risk: 'low',
  maintainer: { name: 'VIABLE Lab' },
  harness: '>=0.2.0 <1.0.0',
  fixtures: 'test/measures.test.js'
};
