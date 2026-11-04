export default {
  type: 'input',
  version: 1,
  label: 'Input',
  category: 'start',
  summary: 'Start the run with this turn’s message and the conversation so far.',
  use: 'The entry step; one is enough, and it does not wait for another message: every Input reached exposes the same request. LLM steps read the current message without one. No model call, except that history: summarize folds the oldest messages of a long server-kept conversation into a summary (one small model call each time it happens).',
  guide: [
    'Every run starts at the step marked entry and follows its connections. Graphs with several Input steps still work: each one reached shows the same request, not a new turn.',
    'Long conversations: steps get the latest messages, and the oldest are left out only when a model’s context window is full. With Summarize, nothing changes while the conversation fits.',
    'Near what the step models can take (about half of the smallest context window, at most 100k tokens), Summarize folds the oldest messages into a summary and keeps the latest word for word. Each fold is one small model call. Apps that send their own history decide what to send.'
  ],
  keywords: 'start message trigger request entry conversation history summarize',
  docs: '/docs/build/steps#input',
  cannot_run_alone: 'an Input step only passes the learner’s message on. Run the step after it',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Starts the run with the learner’s message and the conversation so far' },
    { text: '. Summarizes the oldest messages when the conversation gets long', when: { is: { history: 'summarize' } } }
  ],
  settings: [
    { key: 'guidance', label: 'Instructions in Try it', widget: 'textarea', level: 'option', placeholder: 'Ask a question about this week’s reading.', tip: 'Shown in Try it to say what to type. Only Try it shows it.' },
    { key: 'example', label: 'Example message', widget: 'textarea', level: 'option', placeholder: 'What does photosynthesis make?', tip: 'A message Try it can insert without sending, so testers start quickly.' },
    { key: 'history', label: 'Long conversations', widget: 'select', level: 'option', options: ['recent', 'summarize'], option_labels: { recent: 'Send the latest messages', summarize: 'Summarize when the conversation gets long' }, default: 'recent', tip: 'Summarize folds the oldest messages into a summary near the models’ limit, one small model call each time. Default: send the latest messages.' }
  ],
  parts: [],
  outputs: [
    { path: 'message', label: 'Message', type: 'string', tip: 'The learner’s message as text. {{input}} reads the same anywhere.' },
    { path: 'history', label: 'Earlier messages', type: 'list' },
    { path: 'history_summary.summary', label: 'Summary of older messages', type: 'string', when: { is: { history: 'summarize' } }, tip: 'Empty until the conversation is long enough to fold.' }
  ],
  presets: [],
  defaults: {}
};
