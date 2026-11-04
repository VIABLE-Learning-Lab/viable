export default {
  id: 'viable/vetting',
  version: '1.0.0',
  slot: 'step',
  label: 'VETTING reply check',
  summary: 'A second model reviews each reply against the teacher’s guideline or a question’s answer key, and the activity’s teaching settings, before the learner sees it; a failed reply is rewritten or flagged.',
  runs: { kind: 'core', entry: 'checkReply', step_type: 'vetting' },
  receives: ['reply', 'learner_message', 'conversation', 'guideline', 'answer_key', 'reference', 'teaching_settings'],
  sends_to: [],
  uses_models: true,
  license: { code: 'MIT' },
  authors: ['Hongming Li', 'Shan Zhang', 'Anthony F. Botelho'],
  cite: 'Li, H., Zhang, S., & Botelho, A. F. (2026). VETTING: A dual-LLM framework for in-loop safety verification via policy isolation in educational AI. Computers and Education: Artificial Intelligence, 11, 100646. https://doi.org/10.1016/j.caeai.2026.100646',
  evidence: {
    original: 'In a middle-school writing activity, the reviewer’s decisions agreed with a human audit (precision .943, recall .913, F1 .928) and learners’ estimated exposure to inappropriate content fell by 91.2%, at 19.6% more tokens (Li, Zhang & Botelho, 2026).',
    integration: 'Not yet compared with and without in this harness.',
    unknown: 'Its effect on learning; how well open-weight models do as the reviewer; how it does in subjects and grades beyond the published study.'
  },
  risk: 'medium',
  risk_notes: 'A reply it passes still reaches a learner: a weak reviewer model passes replies it should fail. An unverified reply is a flag, never a checked one.',
  maintainer: { name: 'VIABLE Lab' },
  harness: '>=0.2.0 <1.0.0',
  fixtures: 'test/check.test.js'
};
