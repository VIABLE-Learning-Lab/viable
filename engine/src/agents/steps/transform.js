export default {
  type: 'transform',
  version: 1,
  label: 'Values',
  category: 'tools',
  summary: 'Work out named values from earlier steps, each able to use the ones above it.',
  use: 'Named values worked out in order, each reading the ones above it as {{stepId.name}}: a long expression written once and read by name. A value that is only a template keeps its type. No model call; it doesn’t change workflow variables or run JavaScript.',
  guide: [
    'Each value is a template or an expression, worked out top to bottom. A later value can use an earlier one as {{stepId.name}}, so a long calculation reads in steps.',
    'A value that is only a template keeps its type: lists, numbers and true/false stay what they are.',
    'Later steps read stepId.name. This doesn’t change workflow variables or run JavaScript.'
  ],
  keywords: 'transform map shape json template data named values calculate expression',
  docs: '/docs/build/steps#values',
  flow: { kind: 'next' },
  sentence: [{ text: 'Works out {@values}' }],
  settings: [
    { key: 'output', label: 'Values', widget: 'fields', level: 'setup', refs: true, placeholder: '{ "message": "{{input}}" }', tip: 'Each a name and a template or expression, such as count = {{len(plan.json.pictures)}}. Later values can use earlier ones.' }
  ],
  parts: [],
  outputs: [],
  presets: [],
  defaults: { output: { message: '{{input}}' } }
};
