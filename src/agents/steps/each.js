export default {
  type: 'each',
  version: 1,
  label: 'For each',
  category: 'logic',
  summary: 'Run the same steps once for every item of a list, then carry on with what each pass kept.',
  use: 'Goes through a list (usually an LLM list output) one item at a time, up to max_items (default 10, at most 25): the steps from “for each item” back to this step run for every item and read it as {{item}} and {{item_number}}. Each pass spends its steps’ model calls and counts toward the run’s limits. Steps inside can’t reply or ask. For pictures, an Image step with a list is simpler.',
  guide: [
    'Connect “for each item” to the first step to repeat, and the last of those steps back to this one. Connect “when done” to the step after.',
    'Steps inside read the current item as {{item}} (its fields as {{item.text}}) and its position as {{item_number}}. Give it a name, such as question, to read {{question}} instead.',
    'After the loop, {{stepId.values}} lists what each pass kept (the last step’s result unless you choose), and {{stepId.results}} keeps every step’s output per item.'
  ],
  keywords: 'for each every item list map iterate batch questions pictures',
  docs: '/docs/build/steps#for-each',
  cannot_run_alone: 'a For each step runs the steps inside it once per item. Run one of those steps',
  flow: { kind: 'branches', keys: ['each', 'done'], labels: { each: 'for each item', done: 'when done' } },
  sentence: [
    { text: 'Runs the steps once for each item of {items}', when: { set: 'items' } },
    { text: 'Runs the steps once for each item of a list', when: { unset: 'items' } },
    { text: ', up to {max_items}', when: { set: 'max_items' } },
    { text: '. Calls each one {as}', when: { set: 'as' } },
    { text: '. Keeps {collect} from each', when: { set: 'collect' } }
  ],
  settings: [
    { key: 'items', label: 'List', widget: 'text', level: 'setup', refs: true, value: true, placeholder: 'Choose a list, such as your LLM step → questions', tip: 'A list from an earlier step, usually an LLM list output, or split(...) of some text.' },
    { key: 'as', label: 'Name for one item', widget: 'text', level: 'option', placeholder: 'item', default: 'item', tip: 'Steps inside read the item and its position by this name: question gives {{question}} and {{question_number}}. Default: item.' },
    { key: 'max_items', label: 'At most', widget: 'number', level: 'option', min: 1, max: 25, integer: true, default: 10, placeholder: 'Default: 10', tip: 'Items gone through, 1 to 25. The rest are left out and the run trace says how many. Default: 10.' },
    { key: 'collect', label: 'Keep from each item', widget: 'text', level: 'option', refs: true, value: true, placeholder: 'Default: the last step’s result', empty: 'the last step’s result', tip: 'Worked out after each pass and listed in order as values, such as {{check.json.score}}. Default: the last step’s result.' }
  ],
  parts: [],
  outputs: [
    { path: 'values', label: 'What each item kept', type: 'list' },
    { path: 'count', label: 'How many items', type: 'number' },
    { path: 'results', label: 'Every step’s result per item', type: 'list', tip: 'Each with the item, its number and the outputs of the steps that ran.' },
    { path: 'items', label: 'Items it went through', type: 'list', tip: 'The list, up to At most.' }
  ],
  presets: [],
  defaults: { items: '' }
};
