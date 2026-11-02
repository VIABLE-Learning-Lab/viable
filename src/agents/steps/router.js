import { MODEL_PARAMS } from './modelParams.js';

export default {
  type: 'router',
  version: 1,
  label: 'Router',
  category: 'logic',
  summary: 'Let a model sort each request into one of your named routes. Anything unclear takes fallback.',
  use: 'One model call (one more if it returns invalid JSON) to pick a named path, at most 12 routes plus fallback. Use when requests differ in kind and need different handling; when an earlier field already decides, a Branch does it for free.',
  guide: [
    'Describe each route the way you would brief a colleague. Route names (lowercase letters, numbers, - or _) become the exits you connect on the canvas.',
    'The decision is {{stepId.route}}, with {{stepId.reason}} and {{stepId.confidence}}. Fallback runs when no route fits.'
  ],
  keywords: 'classify intent classifier dispatch switch triage route',
  calls_model: 'always',
  docs: '/docs/build/steps#router',
  flow: { kind: 'routes' },
  sentence: [
    { text: 'Sorts the message into {@routes}', when: { unset: 'input' } },
    { text: 'Sorts {input} into {@routes}', when: { set: 'input' } },
    { text: ', reading earlier turns', when: { is: { includeHistory: true } } }
  ],
  settings: [
    { key: 'model', label: 'Model', widget: 'model', level: 'setup', placeholder: 'viable-3', tip: 'The chat model that picks the route. A small, fast model is usually enough.' },
    { key: 'routes', label: 'Routes', widget: 'routes', level: 'setup', tip: 'Up to 12, each a lowercase name and when to take it. Requests that fit none go to fallback.' },
    { key: 'instructions', label: 'Extra guidance', widget: 'prompt', level: 'option', refs: true, placeholder: 'Questions about deadlines go to admin, even when they mention a subject.', tip: 'Rules for unclear cases, such as “deadline questions go to admin”. The routes are always listed for the model. Default: none.' },
    { key: 'input', label: 'Text to sort', widget: 'textarea', level: 'option', refs: true, value: true, empty: 'the current message', empty_choice: ['The current message', 'Custom text'], tip: 'What the model sorts, such as an earlier step’s rewrite of the question. Default: the current message.' },
    { key: 'includeHistory', label: 'Earlier turns', widget: 'boolean', level: 'option', default: false, tip: 'Lets the router see the last 8 messages, so a follow-up is sorted in context. Default: off.' },
    ...MODEL_PARAMS
  ],
  parts: [],
  outputs: [
    { path: 'route', label: 'Chosen route', type: 'string', tip: 'A route name, or fallback.' },
    { path: 'reason', label: 'Reason', type: 'string' },
    { path: 'confidence', label: 'Confidence', type: 'number', tip: 'From 0 to 1, as the model states it.' }
  ],
  presets: [
    { id: 'kind', label: 'Questions or tasks', tip: 'Questions take one path and requests to do something another.', config: { routes: [{ name: 'question', description: 'The user asks a question' }, { name: 'task', description: 'The user wants something done' }] } },
    { id: 'course', label: 'Coursework or admin', tip: 'Subject questions apart from deadlines, grades and enrolment.', config: { routes: [{ name: 'coursework', description: 'A question about the subject or an assignment’s content' }, { name: 'admin', description: 'Deadlines, grades, enrolment or other course logistics' }] } }
  ],
  defaults: { routes: [{ name: 'question', description: 'The user asks a question' }, { name: 'task', description: 'The user wants something done' }] }
};
