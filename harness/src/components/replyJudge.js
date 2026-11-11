export default {
  id: 'viable/reply-judge',
  version: '1.0.0',
  slot: 'judge',
  label: 'Agent test judge',
  summary: 'Rates an agent’s reply to a test case pass or fail, with a reason, against what the case says a good reply does and must not do.',
  runs: { kind: 'core', entry: 'runAgentTests' },
  receives: ['case', 'reply', 'conversation'],
  sends_to: [],
  uses_models: true,
  license: { code: 'MIT' },
  authors: ['VIABLE Lab'],
  cite: 'VIABLE Lab (2026). Agent test judge, VIABLE Harness.',
  evidence: {
    original: 'A rubric judge written for VIABLE’s agent tests; no published validation.',
    integration: 'Measured with calibrateJudge (viable-harness calibrate): a person labels each case pass or fail without the judge’s verdict in view, and the judge’s verdicts are compared with theirs (agreement, Cohen’s kappa, every disagreement), from 10 labelled cases. Not measured yet; until it is, read its verdicts as a first pass.',
    unknown: 'Agreement with teachers’ ratings, by subject and judge model.'
  },
  risk: 'medium',
  risk_notes: 'A judge that agrees poorly with people makes a change look better or worse than it is.',
  maintainer: { name: 'VIABLE Lab' },
  harness: '>=0.2.0 <1.0.0',
  fixtures: 'test/agentTests.test.js'
};
