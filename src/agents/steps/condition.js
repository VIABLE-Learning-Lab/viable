export default {
  type: 'condition',
  version: 1,
  label: 'Branch',
  category: 'logic',
  summary: 'Choose a path by a field from an earlier step, such as an LLM’s named field.',
  use: 'Free and deterministic: branch on a field from an earlier step (an llm\'s structured output, a knowledge count, a guardrail or http result). One condition (expr) goes to true or false; cases are checked in order, the first that holds decides, else default. A case may have a label, shown on its connection.',
  guide: [
    'One condition has two paths: Yes when it holds, No when it doesn’t. Several cases are checked from the top; the first that holds decides, and Otherwise takes the rest.',
    'Build a case from rules on earlier steps’ fields, such as “tutor → pictures has an item without a prompt”. Name it so the canvas shows what it means.',
    'Rules that can’t be shown as rules are kept as an expression. Nothing is rewritten until you edit it.'
  ],
  keywords: 'if else condition decide case switch yes no',
  docs: '/docs/build/steps#branch',
  flow: { kind: 'branches', keys: ['true', 'false'], labels: { true: 'Yes', false: 'No' } },
  sentence: [{ text: '{@cases}' }],
  settings: [],
  parts: [{ id: '@cases', level: 'setup' }],
  outputs: [],
  presets: [
    { id: 'two', label: 'Two paths: yes or no', tip: 'One condition. Yes when it holds, No when it doesn’t.', config: { expr: '' } },
    { id: 'cases', label: 'Several cases, checked in order', tip: 'The first case that holds decides; Otherwise takes the rest.', config: { cases: [{ when: '' }] } }
  ],
  defaults: {}
};
