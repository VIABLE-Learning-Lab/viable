import { MODEL_PARAMS } from './modelParams.js';

export default {
  type: 'llm',
  version: 1,
  label: 'LLM',
  category: 'ai',
  summary: 'Write a reply, or return named fields, with one call to a chat model.',
  use: 'One model call (one more if named fields come back as invalid JSON). Best for writing an answer from material it is given, rewriting a follow-up into a standalone query, or a judgment returned as named fields (outputs) that a Branch reads. A list output returns several items with fields of their own, for an Image step’s list or a For each step. Cannot search or call tools: use an Agent step for that.',
  guide: [
    'Instructions say what this model does: the main task, not just a decision. Insert passages from a Knowledge step, such as {{search.context}}, to answer from your sources.',
    'Answer format: plain text is read as {{stepId.content}}. Named fields are read one by one, such as {{stepId.json.needs_help}}, so a Branch can decide on them. A list holds several items, each with fields of its own, instead of numbered copies like prompt_1, prompt_2.',
    'A URL in the message is just text. To show the model pictures from earlier steps, add them under Image inputs and choose a chat model that supports image input.'
  ],
  keywords: 'model prompt chat generate text structured json named fields list write rewrite judge classify',
  calls_model: 'always',
  docs: '/docs/build/steps#llm',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Writes a reply', when: { unset: 'outputs' } },
    { text: 'Returns {@outputs}', when: { set: 'outputs' } },
    { text: ' with {model}', when: { set: 'model' } },
    { text: ' from {user}', when: { set: 'user' } },
    { text: ', reading the reference data', when: { is: { includeContext: true } } },
    { text: ', without earlier turns', when: { is: { includeHistory: false } } },
    { text: '. Knows this conversation’s pictures by number', when: { is: { pictures: true } } }
  ],
  settings: [
    { key: 'model', label: 'Model', widget: 'model', level: 'setup', placeholder: 'viable-3', tip: 'The chat model that writes the answer. Each run of this step is one call on it.' },
    { key: 'system', label: 'Instructions', widget: 'prompt', level: 'setup', refs: true, placeholder: 'You are a warm, patient writing tutor…', tip: 'The model’s role and task: the main job, not just a decision. Insert fields such as {{search.context}} to give it material.', ai: 'Write the role, the task and the rules the answer must follow. Name the fields it reads.' },
    { key: 'user', recorded_as: 'message', label: 'Message', widget: 'textarea', level: 'setup', refs: true, value: true, empty: 'the learner’s message', empty_choice: ['The learner’s message', 'Custom input'], tip: 'A custom input replaces the learner’s message for this step only, such as a rewritten question. Default: the learner’s message.' },
    { key: 'includeHistory', label: 'Earlier turns', widget: 'boolean', level: 'option', default: true, tip: 'Sends earlier messages of the conversation, when there are any. Turn off for a task that needs only this turn. Default: on.' },
    { key: 'includeContext', label: 'Reference data', widget: 'boolean', level: 'option', default: false, tip: 'Adds the context JSON your app sends with this request, such as the current document or task. Later turns don’t keep it. Default: off.' },
    { key: 'pictures', label: 'This conversation’s pictures', widget: 'boolean', level: 'option', default: false, tip: 'Tells the model which pictures the learner has seen, by the number they see, so it can pick one to change. Image steps keep them. Default: off.' },
    { key: 'images', label: 'Image inputs', widget: 'json', level: 'advanced', refs: true, placeholder: '[{ "image_url": "{{imageStep.url}}" }]', tip: 'Pictures from earlier steps for the model to look at: public HTTPS addresses or image data URLs. Needs a chat model that takes images.' },
    ...MODEL_PARAMS
  ],
  parts: [{ id: '@outputs', level: 'option', after: 'user' }],
  outputs: [
    { path: 'content', label: 'Reply text', type: 'string', when: { unset: 'outputs' } }
  ],
  presets: [
    { id: 'reply', label: 'Reply to the learner', tip: 'Plain text, inserted into a Reply step as this step’s reply text.', config: {} },
    { id: 'fields', label: 'Return named fields', tip: 'A judgment or plan as fields a Branch, an Image step or a For each step can read.', config: { outputs: [{ name: 'reply', type: 'string', description: 'What to say to the learner' }] } }
  ],
  defaults: {}
};
