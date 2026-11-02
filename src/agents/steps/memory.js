const RECALL = { is: { mode: ['recall', null] } };
const EXTRACT = { is: { mode: 'extract' } };
const SAVE = { is: { mode: 'save' } };

export default {
  type: 'memory',
  version: 1,
  label: 'Memory',
  category: 'knowledge',
  summary: 'Recall or keep lasting facts about the user across conversations.',
  use: 'mode recall (the default) and save need no model; extract makes one model call that adds at most 5 facts and removes ones now wrong. Needs a user identifier or a server conversation, otherwise the step is skipped. For facts that should last across conversations; for this conversation only, use State.',
  guide: [
    'Recall returns relevant memories as {{stepId.text}}. Learn asks a model to pick lasting facts from the exchange and update the user’s memory. Save keeps one fact you write.',
    'Memory belongs to this agent and the user: send user with each run (for example your app’s student ID). Without it, a server conversation is used; otherwise memory steps are skipped.',
    'Review and delete stored memories in Test → Memory.'
  ],
  keywords: 'remember recall long-term personalization user profile facts',
  calls_model: 'some',
  docs: '/docs/build/steps#memory',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Recalls what it knows about the user', when: RECALL },
    { text: ' that fits {query}', when: { all: [RECALL, { set: 'query' }] } },
    { text: ', up to {limit} facts', when: { all: [RECALL, { set: 'limit' }] } },
    { text: 'Learns lasting facts about the user from {source}', when: { all: [EXTRACT, { set: 'source' }] } },
    { text: 'Learns lasting facts about the user from their message', when: { all: [EXTRACT, { unset: 'source' }] } },
    { text: ' with {model}', when: { all: [EXTRACT, { set: 'model' }] } },
    { text: 'Saves {content} about the user', when: { all: [SAVE, { set: 'content' }] } },
    { text: 'Saves a fact about the user', when: { all: [SAVE, { unset: 'content' }] } }
  ],
  settings: [
    { key: 'mode', label: 'Action', widget: 'select', level: 'setup', options: ['recall', 'extract', 'save'], option_labels: { recall: 'Recall relevant memories', extract: 'Learn facts with a model', save: 'Save a specific fact' }, default: 'recall', tip: 'Recall and Save need no model. Learn makes one model call to add facts and drop ones now wrong. Default: recall.' },
    { key: 'query', label: 'Recall memories about', widget: 'textarea', level: 'setup', refs: true, when: RECALL, unused_note: 'Used only when Action is Recall.', placeholder: 'Default: the current message', empty: 'the current message', tip: 'What to look for in this user’s memories, such as the question asked. Default: the current message.' },
    { key: 'limit', label: 'Memories to return', widget: 'number', level: 'option', when: RECALL, unused_note: 'Used only when Action is Recall.', min: 1, max: 50, integer: true, default: 8, placeholder: 'Default: 8', tip: 'The most relevant memories returned, 1 to 50. Default: 8.' },
    { key: 'model', label: 'Model', widget: 'model', level: 'setup', when: EXTRACT, unused_note: 'Used only when Action is Learn.', placeholder: 'viable-3', tip: 'The chat model that picks facts worth keeping.' },
    { key: 'source', label: 'Exchange to learn from', widget: 'textarea', level: 'setup', refs: true, when: EXTRACT, unused_note: 'Used only when Action is Learn.', placeholder: 'User: {{input}}\nAssistant: {{tutor.content}}', tip: 'The messages to learn from. Add the reply, such as {{tutor.content}}, to keep what was agreed. Default: the user’s message only.' },
    { key: 'instructions', label: 'What to remember', widget: 'prompt', level: 'option', refs: true, when: EXTRACT, unused_note: 'Used only when Action is Learn.', placeholder: 'Track the student’s goals, struggles and preferred explanations.', tip: 'Extra guidance on what is worth keeping. The model is always told to leave out secrets and small talk.' },
    { key: 'content', label: 'Fact to save', widget: 'textarea', level: 'setup', refs: true, when: SAVE, unused_note: 'Used only when Action is Save.', placeholder: 'Prefers worked examples', tip: 'One fact about the user, written out or from an earlier step’s field.' }
  ],
  parts: [],
  outputs: [
    { path: 'text', label: 'Remembered facts', type: 'string', when: RECALL, tip: 'One per line, ready for an LLM’s instructions.' },
    { path: 'items', label: 'Every memory found', type: 'list', when: RECALL },
    { path: 'count', label: 'How many', type: 'number', tip: 'Memories found when recalling; facts kept when saving or learning.' },
    { path: 'saved', label: 'Facts saved', type: 'list', when: SAVE },
    { path: 'added', label: 'Facts learned', type: 'list', when: EXTRACT },
    { path: 'removed', label: 'Facts dropped', type: 'list', when: EXTRACT },
    { path: 'skipped', label: 'Skipped', type: 'boolean', tip: 'True when there was no user identifier or server conversation.' }
  ],
  presets: [
    { id: 'recall', label: 'Recall what it knows about the user', tip: 'Insert the facts into an LLM’s instructions to personalize its answer.', config: { mode: 'recall' } },
    { id: 'save', label: 'Save one fact', tip: 'Keep something you write or a field from an earlier step, such as a goal.', config: { mode: 'save', content: '' } },
    { id: 'learn', label: 'Learn from the conversation', tip: 'A model picks lasting facts from the latest exchange. Put it after the step that writes the reply.', config: { mode: 'extract', source: 'User: {{input}}\nAssistant: ' } }
  ],
  defaults: { mode: 'recall' }
};
