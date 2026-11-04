export default {
  type: 'output',
  version: 1,
  label: 'Reply',
  category: 'start',
  summary: 'End a path with the reply the reader sees, plus pictures, audio or result data for your app.',
  use: 'Ends a path. text is what the reader sees (templates such as {{answer.json.reply}}). attachments adds Image or Speech URLs under it. data is the run’s result for the app or system that called the agent (a label, a score, a handoff and its reasons, a content gap): returned beside the reply, listed in run history, never shown to the reader. Passages the text cites as [n] become numbered citations; sources sets how Chat Completions lists them in the text (markdown or text), since many chat clients show only the text. No model call.',
  guide: [
    'Insert the reply from an earlier step, such as your LLM’s reply text, or write a fixed message. Fields are filled in when the workflow runs.',
    'An Image step’s address is shown under the reply; a Speech step’s is played under it.',
    'Result data is JSON your app reads as output.data (data with Chat Completions); run history lists it and readers never see it. Many chat clients show only the text, where [1] leads nowhere: choose a source list for those. Requests can override it with sources.'
  ],
  keywords: 'output answer end response reply message result data citations sources',
  docs: '/docs/build/steps#reply',
  flow: { kind: 'terminal' },
  sentence: [
    { text: 'Replies with {text}', when: { set: 'text' } },
    { text: 'Ends the path with an empty reply', when: { unset: 'text' } },
    { text: ', with {attachments} attached', when: { set: 'attachments' } },
    { text: '. Returns result data to your app', when: { set: 'data' } },
    { text: '. Chat Completions replies list sources as: {sources}', when: { is: { sources: ['markdown', 'text'] } } }
  ],
  settings: [
    { key: 'text', label: 'Reply text', widget: 'textarea', level: 'setup', refs: true, value: true, placeholder: 'Write the reply, or insert a field such as your LLM’s reply', tip: 'What the reader sees. Fields from earlier steps are filled in when the workflow runs.' },
    { key: 'attachments', label: 'Picture or audio', widget: 'text', level: 'option', refs: true, value: true, placeholder: 'An Image or Speech step’s address', tip: 'An Image step’s address is shown under the reply, a Speech step’s is played under it. A list, such as an Image step’s addresses, attaches each one.' },
    { key: 'data', label: 'Result data for your app', widget: 'json', level: 'option', refs: true, placeholder: '{ "needs_human": "{{answer.json.needs_human}}" }', tip: 'JSON returned beside the reply and never shown to the reader, such as a label or a score. Apps read it as output.data; run history lists it.' },
    { key: 'sources', label: 'Sources in Chat Completions replies', widget: 'select', level: 'advanced', options: ['none', 'markdown', 'text'], option_labels: { none: 'Not in the text (apps read citations)', markdown: 'Markdown list with links', text: 'Plain text list' }, default: 'none', tip: 'For chat clients that show only the text, where [1] leads nowhere. A request’s own sources setting wins. Default: not in the text.' }
  ],
  parts: [],
  outputs: [],
  presets: [],
  defaults: {}
};
