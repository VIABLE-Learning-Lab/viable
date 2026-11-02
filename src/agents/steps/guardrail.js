const MODEL_CHECKS = { has: { checks: ['jailbreak', 'moderation', 'off_topic', 'custom'] } };

export default {
  type: 'guardrail',
  version: 1,
  label: 'Guardrail',
  category: 'safety',
  summary: 'Check text for personal data, jailbreaks, harmful content, off-topic requests or your own policy.',
  use: 'pii is pattern matching with no model (emails, phone, payment card and US SSN numbers); jailbreak, moderation, off_topic and custom share one model call. Exits pass and fail. For public or student-facing input, or to screen a reply before it is sent. A model judgment, not a guarantee; for rules a reply must follow, VETTING revises instead of only failing.',
  guide: [
    'Personal data needs no model: emails, phone numbers, payment card and US Social Security numbers. {{stepId.redacted_text}} masks them.',
    'Allowed topic is read only by the Off topic check, and Custom policy only by the Custom policy check. To judge follow-up questions in context, turn on earlier turns.',
    'The other checks share one model call. Connect pass and fail to reply safely or carry on; {{stepId.flagged}} gives each finding and its reason.',
    'A guardrail is a model judgment, not a guarantee. Put one before your main model to screen input, or after it to screen output.'
  ],
  keywords: 'safety moderation pii personal data jailbreak prompt injection policy filter check off topic',
  calls_model: 'some',
  docs: '/docs/build/steps#guardrail',
  flow: { kind: 'branches', keys: ['pass', 'fail'] },
  sentence: [
    { text: 'Checks the message for {@checks}', when: { unset: 'text' } },
    { text: 'Checks {text} for {@checks}', when: { set: 'text' } },
    { text: ', reading earlier turns', when: { all: [MODEL_CHECKS, { is: { includeHistory: true } }] } }
  ],
  settings: [
    { key: 'checks', label: 'Checks', widget: 'checks', level: 'setup', options: ['pii', 'jailbreak', 'moderation', 'off_topic', 'custom'], option_labels: { pii: 'Personal data', jailbreak: 'Jailbreak / prompt injection', moderation: 'Harmful content', off_topic: 'Off topic', custom: 'Custom policy' }, tip: 'Any finding goes to fail. Personal data needs no model; the others share one model call.' },
    { key: 'text', label: 'Text to check', widget: 'textarea', level: 'setup', refs: true, value: true, empty: 'the current message', empty_choice: ['The current message', 'Custom text'], tip: 'The learner’s message to screen input, or a step’s reply, such as {{tutor.content}}, to screen output. Default: the current message.' },
    { key: 'model', label: 'Model', widget: 'model', level: 'setup', when: MODEL_CHECKS, unused_note: 'Used only by checks other than Personal data.', placeholder: 'viable-3', tip: 'The chat model that judges the text for every check except Personal data.' },
    { key: 'topic', label: 'Allowed topic', widget: 'text', level: 'setup', when: { has: { checks: 'off_topic' } }, unused_note: 'Used only by the Off topic check.', placeholder: 'Introductory biology coursework', tip: 'What the text should be about. Anything unrelated fails the Off topic check.' },
    { key: 'policy', label: 'Custom policy', widget: 'prompt', level: 'setup', when: { has: { checks: 'custom' } }, unused_note: 'Used only by the Custom policy check.', placeholder: 'Do not complete graded assignments for students.', tip: 'Your own rule, such as “don’t complete graded assignments”. Text that breaks it fails.' },
    { key: 'includeHistory', label: 'Earlier turns', widget: 'boolean', level: 'option', when: MODEL_CHECKS, unused_note: 'Used only by checks other than Personal data.', default: false, tip: 'The last 8 messages, so a follow-up such as “is his work still relevant?” is judged in context. Only the latest text is judged. Default: off.' }
  ],
  parts: [],
  outputs: [
    { path: 'passed', label: 'Passed', type: 'boolean' },
    { path: 'flagged', label: 'Findings', type: 'list', tip: 'Each check that failed, with its reason.' },
    { path: 'redacted_text', label: 'Text with personal data masked', type: 'string', when: { has: { checks: 'pii' } } },
    { path: 'text', label: 'Text checked', type: 'string' }
  ],
  presets: [
    { id: 'screen', label: 'Screen the learner’s message', tip: 'Personal data, jailbreaks and harmful content, before your main model answers.', config: { checks: ['pii', 'jailbreak', 'moderation'] } },
    { id: 'topic', label: 'Keep to a topic', tip: 'Fails messages unrelated to the course, so a later step can steer back.', config: { checks: ['off_topic'], topic: '' } },
    { id: 'pii', label: 'Mask personal data', tip: 'No model call. Later steps read the text with emails and numbers masked.', config: { checks: ['pii'] } }
  ],
  defaults: { checks: ['pii'] }
};
