export default {
  type: 'note',
  version: 1,
  label: 'Note',
  category: 'annotate',
  summary: 'A sticky note for collaborators. Notes never run.',
  use: 'A canvas annotation for people; never runs and has no connections.',
  guide: ['Say why this part of the workflow exists, or what to check before changing it. Notes never run and learners never see them.'],
  keywords: 'comment sticky documentation annotation',
  docs: '/docs/build/steps#note',
  cannot_run_alone: 'a note is never run',
  flow: { kind: 'none' },
  sentence: [{ text: 'A note for collaborators. It never runs' }],
  settings: [
    { key: 'text', label: 'Note', widget: 'textarea', level: 'setup', placeholder: 'Explain why this part of the workflow exists…', tip: 'Shown on the canvas for everyone who edits this agent.' }
  ],
  parts: [],
  outputs: [],
  presets: [],
  defaults: { text: '' }
};
