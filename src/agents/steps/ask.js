export default {
  type: 'ask',
  version: 1,
  label: 'Ask user',
  category: 'start',
  summary: 'Reply with a question and wait. The next message in this conversation carries on from here.',
  use: 'Collects a detail from the user (an email, a course) and resumes here on their next message as {{id.answer}}. Needs a server conversation; with client history or none, the question is just the reply. Outputs of earlier steps don’t carry over to the next turn: keep what you need in a State step with conversation scope. No model call.',
  guide: [
    'The turn ends with the question as the reply (awaiting_input is true). When the user answers in the same conversation, the workflow carries on from this step, and {{stepId.answer}} holds their answer.',
    'Outputs from earlier steps don’t carry over to the next turn. Keep what you need with a State step that keeps values for this conversation.',
    'Requests that send their own history, or none, have no conversation to come back to, so the question is simply the reply.'
  ],
  keywords: 'human in the loop approval question wait pause resume form',
  docs: '/docs/build/steps#ask-user',
  cannot_run_alone: 'an Ask step ends the turn with a question. Run the agent to see it work',
  flow: { kind: 'next', labels: { next: 'on answer' } },
  sentence: [
    { text: 'Asks {text} and waits for the answer', when: { set: 'text' } },
    { text: 'Asks a question and waits for the answer', when: { unset: 'text' } }
  ],
  settings: [
    { key: 'text', label: 'Question', widget: 'textarea', level: 'setup', refs: true, placeholder: 'Which unit are you studying?', tip: 'Shown to the user as this turn’s reply. Their next message in the conversation is the answer.' }
  ],
  parts: [],
  outputs: [
    { path: 'answer', label: 'The user’s answer', type: 'string' },
    { path: 'question', label: 'The question asked', type: 'string' }
  ],
  presets: [],
  defaults: {}
};
