export default {
  type: 'state',
  version: 1,
  label: 'State',
  category: 'knowledge',
  summary: 'Set variables for this run, or keep them for later turns of the conversation.',
  use: 'Variables for this run or the whole conversation (up to 20 per step), such as answers from an ask step or a counter. Read anywhere as {{vars.name}}. Conversation scope keeps them on the server conversation, at most 16 KiB in all. No model call. Pictures need no State: Image steps remember them.',
  guide: [
    'Values are templates: {{input}}, or an expression such as {{default(vars.attempts, 0) + 1}}. A value that is only a template keeps its type.',
    'Read them anywhere as {{vars.name}}. Kept for this conversation, they are there on later turns of the same server conversation (up to 16 KiB).'
  ],
  keywords: 'set variable assign counter conversation variable remember',
  docs: '/docs/build/steps#state',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Sets {@assignments}' },
    { text: ' for this conversation', when: { is: { scope: 'conversation' } } },
    { text: ' for this run', when: { is: { scope: ['run', null] } } }
  ],
  settings: [
    { key: 'assignments', label: 'Variables', widget: 'assignments', level: 'setup', refs: true, tip: 'Up to 20, each a name and a value, such as topic = {{input}}. Names use letters, numbers and _.' },
    { key: 'scope', label: 'Keep values', widget: 'select', level: 'setup', options: ['run', 'conversation'], option_labels: { run: 'For this run only', conversation: 'For this conversation' }, default: 'run', tip: 'For this conversation keeps them for later turns, up to 16 KiB in all. Default: this run only.' }
  ],
  parts: [],
  outputs: [],
  presets: [
    { id: 'keep', label: 'Keep a value for later turns', tip: 'Such as the topic the learner chose, read later as {{vars.topic}}.', config: { scope: 'conversation', assignments: [{ name: 'topic', value: '{{input}}' }] } },
    { id: 'count', label: 'Count attempts', tip: 'Adds 1 each turn this step runs, for a Branch to read as {{vars.attempts}}.', config: { scope: 'conversation', assignments: [{ name: 'attempts', value: '{{default(vars.attempts, 0) + 1}}' }] } }
  ],
  defaults: { scope: 'conversation', assignments: [{ name: 'topic', value: '{{input}}' }] }
};
