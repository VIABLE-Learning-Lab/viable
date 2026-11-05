const FULL = { is: { mode: 'full' } };
const GUIDELINE = { not: FULL };
const GPT = 'GPT-5 and GPT-6 models';

export default {
  type: 'vetting',
  version: 1,
  label: 'VETTING',
  category: 'safety',
  summary: 'Have an independent reviewer check each reply against your rules, and revise it until one passes.',
  use: 'Two model calls per attempt (a reply and an independent review, up to max_attempts, 1–10, default 3); one when an earlier step’s answer (draft) passes as written. For replies that must follow rules before they reach learners: tutoring that guides without giving answers away (mode full, with an answer key), and course, program or library assistants that may state only what their syllabus, catalog or guides say (a guideline with a reference). Same logic as the /v1/vetting endpoints. Exits: passed, unverified, attention.',
  guide: [
    'Each attempt: the reply model writes, then the reviewer model checks the reply in a separate call. A failed review goes back as feedback for the next attempt. The reviewer’s rules live in this step, apart from the reply model’s instructions, so a learner can’t talk the reviewer out of them.',
    'A guideline checks your rules (like /v1/chat/vetting); a reference gives the reviewer material to check facts against, such as the passages an answer came from. An answer key checks a question’s answer isn’t given away (like /v1/vetting/full): a reply that confirms an answer as the learner’s own passes, and one that supplies it fails. Where code finds the learner has written the answer (a number, or a few words), both models are told they are right: the reply says so and may discuss it, and a reply that leaves them unsure fails. The reviewer reads the reply, never the learner’s words. Only the reviewer sees the reference and the answer key.',
    'To check a reply another step wrote (an agent that answered from your knowledge, say), put it in Answer to review, such as {{research.content}}, and give the reviewer the sources as reference. A reply that passes is used exactly as written; the reply model revises it only after a failed review.',
    'A learner waits for every round, a reply and a review, with nothing on the page until one passes. That is a choice to make: fewer Attempts or a faster Reviewer model means a shorter wait and more replies ending unverified; more means the other way. The defaults are a place to start, and Try it and Run history show how long a reply took.',
    'Exits: passed (the reviewer approved), unverified (attempts ran out or a review couldn’t run), needs attention (the reply model flagged a safety concern and wrote a caring reply, which isn’t reviewed). Read the reply as {{stepId.content}}. A review is a model judgment, not a guarantee.'
  ],
  keywords: 'vetting verify verification review reviewer tutor safety pedagogy answer key retry check policy guideline course syllabus library guard output',
  calls_model: 'always',
  docs: '/docs/build/vetting',
  research: {
    title: 'VETTING',
    summary: 'Verification and Evaluation Tool for Targeting Invalid Narrative Generation, from a middle school classroom study. The reviewer’s rules live apart from the reply model’s instructions, so a learner can’t talk the reviewer out of them.',
    url: 'https://doi.org/10.1016/j.caeai.2026.100646'
  },
  flow: { kind: 'branches', keys: ['passed', 'unverified', 'attention'], labels: { passed: 'passed', unverified: 'unverified', attention: 'needs attention' } },
  sentence: [
    { text: 'Writes a reply and has a reviewer check it', when: { unset: 'draft' } },
    { text: 'Has a reviewer check {draft}', when: { set: 'draft' } },
    { text: ' against {guideline}', when: { all: [GUIDELINE, { set: 'guideline' }] } },
    { text: ' against the default guideline', when: { all: [GUIDELINE, { unset: 'guideline' }] } },
    { text: ' and {reference}', when: { all: [GUIDELINE, { set: 'reference' }] } },
    { text: ' so it doesn’t give away the answer to {question}', when: FULL },
    { text: '. Tries up to {max_attempts} times', when: { set: 'max_attempts' } },
    { text: '. Replies needn’t end with a question', when: { is: { require_closing_question: false } } },
    { text: '. {@exits}' }
  ],
  settings: [
    { key: 'mode', label: 'Checks against', widget: 'select', level: 'setup', options: ['simple', 'full'], option_labels: { simple: 'A guideline', full: 'A question and its answer key' }, default: 'simple', tip: 'A guideline for rules every reply follows, or a question’s answer key so a tutor never gives the answer away. Default: a guideline.' },
    { key: 'guideline', label: 'Guideline', widget: 'prompt', level: 'setup', refs: true, when: GUIDELINE, unused_note: 'Used only when it checks against a guideline.', placeholder: 'Ensure the response is helpful, harmless, and does not contain unsafe or inappropriate content. Avoid giving direct answers to questions that seem like tests or homework. Instead, guide the user.', empty: 'the VETTING default guideline', tip: 'The rules every reply must follow, such as “state only what the syllabus says”. Default: the VETTING guideline shown.', ai: 'Write rules the reviewer can check one by one.' },
    { key: 'question', label: 'Question', widget: 'textarea', level: 'setup', refs: true, when: FULL, unused_note: 'Used only with an answer key.', placeholder: '{{context.question}}', tip: 'The task the learner is working on. The reply model sees it.' },
    { key: 'answer_key', label: 'Answer key', widget: 'textarea', level: 'setup', refs: true, when: FULL, unused_note: 'Used only with an answer key.', placeholder: '{{context.answer_key}}', tip: 'Only the reviewer sees it, to catch replies that give the answer away.' },
    { key: 'model', label: 'Reply model', widget: 'model', level: 'setup', placeholder: 'viable-3', tip: 'Writes each reply (the tutor, in tutoring).' },
    { key: 'draft', label: 'Answer to review', widget: 'textarea', level: 'setup', refs: true, value: true, empty: 'the reply model writes it', empty_choice: ['The reply model writes it', 'An earlier step’s answer'], tip: 'An earlier step’s answer is reviewed as written and kept if it passes. If it’s empty, the reply model writes one. Default: the reply model writes it.' },
    { key: 'reference', label: 'Reference for the reviewer', widget: 'textarea', level: 'option', refs: true, when: GUIDELINE, unused_note: 'Used only when it checks against a guideline.', placeholder: '{{knowledge.context}}', tip: 'Material to check facts against, such as the passages an earlier step answered from, or the syllabus. Only the reviewer sees it.' },
    { key: 'key_concepts', label: 'Key concepts', widget: 'text', level: 'option', refs: true, when: FULL, unused_note: 'Used only with an answer key.', placeholder: 'isolating x, inverse operations', tip: 'Ideas the reply must not reveal outright, separated by commas.' },
    { key: 'explanation', label: 'Worked solution', widget: 'textarea', level: 'option', refs: true, when: FULL, unused_note: 'Used only with an answer key.', tip: 'How the answer is reached, for the reviewer only.' },
    { key: 'chat_prompt', label: 'Reply instructions', widget: 'prompt', level: 'option', refs: true, tip: 'Replaces the reply model’s default prompt (with a guideline, the guideline itself). Safety rules and the date are always added.' },
    { key: 'verification_model', label: 'Reviewer model', widget: 'model', level: 'option', placeholder: 'gpt-6-luna', default: 'gpt-6-luna', tip: 'Reviews each reply in a separate call. It can be the reply model or another; a faster one shortens the wait. Default: gpt-6-luna.' },
    { key: 'verification_prompt', label: 'Reviewer instructions', widget: 'prompt', level: 'option', refs: true, when: FULL, unused_note: 'Used only with an answer key.', tip: 'Replaces the reviewer’s default criteria for answer-key reviews.' },
    { key: 'require_closing_question', label: 'End every reply with a question', widget: 'boolean', level: 'option', default: true, tip: 'Off lets the reply instructions decide when a question helps. Safety rules stay on either way. Default: on.' },
    { key: 'input', recorded_as: 'message', label: 'Message', widget: 'textarea', level: 'option', refs: true, value: true, empty: 'the learner’s message', empty_choice: ['The learner’s message', 'Custom input'], tip: 'What the reply model answers. To review an earlier step’s answer, keep the learner’s message and use Answer to review. Default: the learner’s message.' },
    { key: 'includeHistory', label: 'Earlier turns', widget: 'boolean', level: 'option', default: true, tip: 'Sends earlier messages of the conversation to the reply model, when there are any. Default: on.' },
    { key: 'max_attempts', label: 'Attempts', widget: 'number', level: 'recovery', min: 1, max: 10, integer: true, default: 3, placeholder: 'Default: 3', tip: 'Replies written and reviewed before it takes unverified, 1 to 10, a learner waiting for each. An answer to review counts as the first. Default: 3.' },
    { key: 'temperature', label: 'Reply temperature', widget: 'number', level: 'advanced', min: 0, max: 2, placeholder: 'Default: 0.7', default: 0.7, tip: 'Lower gives steadier replies, higher more varied ones, 0 to 2. Default: 0.7.' },
    { key: 'top_p', label: 'Reply top P', widget: 'number', level: 'advanced', min: 0, max: 1, tip: 'Picks only from the likeliest words that together make up this share, 0 to 1. Default: the model’s.' },
    { key: 'max_tokens', label: 'Longest reply (tokens)', widget: 'number', level: 'advanced', min: 1, integer: true, tip: `Stops each reply after this many tokens. Default: 1,024, or 4,096 for ${GPT}.` },
    { key: 'max_completion_tokens', label: 'Longest reply with reasoning (tokens)', widget: 'number', level: 'advanced', min: 1, integer: true, tip: 'Wins over Longest reply, for models that count their reasoning in it. Default: Longest reply.' },
    { key: 'reasoning_effort', label: 'Reply reasoning effort', widget: 'select', level: 'advanced', loader: 'reasoning_efforts', options: ['minimal', 'low', 'medium', 'high'], tip: `How long the reply model thinks; the choices depend on the model. Default: low for ${GPT}, else the model’s.` },
    { key: 'verification_temperature', label: 'Reviewer temperature', widget: 'number', level: 'advanced', min: 0, max: 2, placeholder: 'Default: 0.1', default: 0.1, tip: 'Lower keeps verdicts consistent, 0 to 2. Default: 0.1.' },
    { key: 'verification_top_p', label: 'Reviewer top P', widget: 'number', level: 'advanced', min: 0, max: 1, tip: 'Picks only from the likeliest words that together make up this share, 0 to 1. Default: the model’s.' },
    { key: 'verification_max_tokens', label: 'Longest review (tokens)', widget: 'number', level: 'advanced', min: 1, integer: true, tip: `Stops each review after this many tokens. Default: 1,024, or 4,096 for ${GPT}.` },
    { key: 'verification_max_completion_tokens', label: 'Longest review with reasoning (tokens)', widget: 'number', level: 'advanced', min: 1, integer: true, tip: 'Wins over Longest review, for models that count their reasoning in it. Default: Longest review.' },
    { key: 'verification_reasoning_effort', label: 'Reviewer reasoning effort', widget: 'select', level: 'advanced', loader: 'reasoning_efforts', options: ['minimal', 'low', 'medium', 'high'], tip: `How long the reviewer thinks; the choices depend on the model. Default: low for ${GPT}, else the model’s.` }
  ],
  parts: [{ id: '@outcomes', level: 'setup' }],
  outputs: [
    { path: 'content', label: 'Reviewed reply', type: 'string', tip: 'The last reply, whatever the outcome.' },
    { path: 'passed', label: 'Passed review', type: 'boolean' },
    { path: 'outcome', label: 'Outcome', type: 'string', tip: 'passed, unverified or attention.' },
    { path: 'requires_attention', label: 'Needs attention', type: 'boolean' },
    { path: 'verification', label: 'Last review', type: 'string', tip: 'PASS, or the reviewer’s reason.' },
    { path: 'attempts', label: 'Attempts used', type: 'number' },
    { path: 'stop_reason', label: 'Why it stopped', type: 'string', tip: 'Such as VERIFICATION_PASSED or MAX_ATTEMPTS_REACHED.' },
    { path: 'revised', label: 'Changed the answer it reviewed', type: 'boolean', when: { set: 'draft' } },
    { path: 'attempt_details', label: 'Every round', type: 'list', tip: 'Each reply, verdict and reviewer’s reason.' }
  ],
  presets: [
    { id: 'guideline', label: 'Check replies against a guideline', tip: 'Rules every reply follows, such as a course assistant that says only what the syllabus says.', config: { mode: 'simple', guideline: '' } },
    { id: 'answer_key', label: 'Don’t give a question’s answer away', tip: 'A tutor checked against a private answer key. Try it with reference data such as {"question": …, "answer_key": …}.', config: { mode: 'full', question: '{{context.question}}', answer_key: '{{context.answer_key}}' } },
    { id: 'check_answer', label: 'Check an earlier step’s answer', tip: 'Such as an Agent’s answer from your knowledge, checked against the passages it read.', config: { mode: 'simple', draft: '', reference: '' } }
  ],
  defaults: { mode: 'simple', max_attempts: 3 }
};
