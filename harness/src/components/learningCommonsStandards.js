export default {
  id: 'learning-commons/knowledge-graph-standards',
  version: '1.0.0',
  slot: 'context',
  label: 'K-12 standards (Learning Commons)',
  summary: 'An activity’s academic standard with its learning components and the standards before it, kept as the teacher chose it, with its attribution; it joins the AI’s instructions every turn.',
  runs: { kind: 'core', entry: 'teachingContext' },
  receives: ['teaching_settings'],
  sends_to: [],
  uses_models: false,
  license: { code: 'MIT', data: 'CC-BY-4.0' },
  authors: ['Learning Commons'],
  cite: 'Learning Commons Knowledge Graph, https://learningcommons.org. Each standard carries its own attribution statements.',
  attribution: 'Knowledge Graph is provided by Learning Commons under the CC BY-4.0 license. Each standard’s own statements are in its source.attribution.',
  evidence: {
    original: 'Standards and their learning components as their publishers wrote them; see Learning Commons’ documentation.',
    integration: 'Choosing a standard needs Learning Commons’ API (VIABLE’s hosted platform has it); the harness carries the standard as chosen. Not yet compared with and without in this harness.',
    unknown: 'Whether the standard in the AI’s instructions changes its replies or what learners learn.'
  },
  risk: 'low',
  maintainer: { name: 'VIABLE Lab' },
  harness: '>=0.2.0 <1.0.0'
};
