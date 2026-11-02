export default {
  type: 'subagent',
  version: 1,
  label: 'Sub-agent',
  category: 'ai',
  summary: 'Run another published agent of this project and use its reply.',
  use: 'Runs the published version of another agent of this project inside this run’s limits and billing, and spends its model calls. For reusing a specialist built elsewhere. Sub-agents nest at most two levels deep and can’t call themselves. The sub-agent gets the message without this conversation’s history.',
  guide: [
    'The sub-agent runs its published version inside this run’s limits and billing; its reply is {{stepId.text}}.',
    'Sub-agents can be nested two levels deep and can’t call themselves.'
  ],
  keywords: 'delegate nested workflow call agent compose specialist reuse',
  calls_model: 'always',
  docs: '/docs/build/steps#sub-agent',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Hands the message to {@agent}', when: { unset: 'input' } },
    { text: 'Hands {input} to {@agent}', when: { set: 'input' } },
    { text: ' and uses its reply' }
  ],
  settings: [
    { key: 'slug', label: 'Agent', widget: 'agents', level: 'setup', tip: 'A published agent of this project. Its published version runs, not its draft.' },
    { key: 'input', label: 'Message to send', widget: 'textarea', level: 'option', refs: true, value: true, empty: 'the learner’s message', empty_choice: ['The learner’s message', 'Custom input'], tip: 'What the sub-agent receives as its message, without this conversation’s history. Default: the learner’s message.' }
  ],
  parts: [],
  outputs: [
    { path: 'text', label: 'Reply', type: 'string' },
    { path: 'attachments', label: 'Attachments', type: 'list', tip: 'Pictures or audio its reply attached.' }
  ],
  presets: [],
  defaults: {}
};
