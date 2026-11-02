const LIST = { present: 'items' };
const SINGLE = { absent: 'items' };
const SINGLE_CHANGE = { all: [SINGLE, { not: { is: { operation: ['generate', null] } } }] };

export default {
  type: 'image',
  version: 1,
  label: 'Image',
  category: 'ai',
  summary: 'Draw or change pictures: one prompt, or a list of them (several scenes, or one scene several times).',
  use: 'One image call per description; n pictures from one description is still one call. A list (items, usually an LLM list output) draws every picture three at a time, and nothing in it stops the run: safety refusals are marked blocked (or tried once with a fallback prompt), a busy service is retried once. Pictures are remembered by number for later turns (conversation.pictures), so an item with source 2 changes picture 2. summary is a ready-made status sentence for the reply.',
  guide: [
    'One scene several times: one prompt with Pictures per prompt above 1 (one call). Several scenes: a list whose items each have a prompt (one call each). A list output from an LLM step, such as pictures with prompt, label and source, is the usual source.',
    'To change an earlier picture, give its number as Picture to change (or let a list item name it). The conversation remembers every picture it showed, so later turns can say “make picture 2 night-time” without State or URLs.',
    'The result lists each picture with its status (ready, blocked or failed), plus addresses for the reply, counts such as ready_count, and summary: a sentence such as “Picture 1 is ready.” Unfinished pictures can be drawn later from conversation.unfinished in the same numbers. Image calls are metered.'
  ],
  keywords: 'generate edit picture photo illustration drawing reference mask several pictures list batch scenes',
  calls_model: 'always',
  docs: '/docs/build/steps#image',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Draws the pictures in {items}', when: { set: 'items' } },
    { text: 'Draws a picture from a list', when: { all: [LIST, { unset: 'items' }] } },
    { text: 'Draws a picture from {prompt}', when: { all: [SINGLE, { is: { operation: ['generate', null] } }] } },
    { text: 'Draws a picture once you write a prompt', when: { all: [SINGLE, { is: { operation: ['generate', null] } }, { unset: 'prompt' }] } },
    { text: 'Changes picture {source}: {prompt}', when: SINGLE_CHANGE },
    { text: ', {n} per prompt', when: { set: 'n' } },
    { text: ', up to {max_items} a turn', when: { all: [LIST, { set: 'max_items' }] } },
    { text: '. Changes a picture when an item names one', when: { all: [LIST, { is: { operation: ['auto', null] } }] } },
    { text: '. If the safety check refuses a picture, tries once more', when: { set: 'fallback_prompt' } },
    { text: '. Forgets the pictures after this turn', when: { is: { remember: false } } }
  ],
  settings: [
    { key: 'model', label: 'Model', widget: 'model', level: 'setup', placeholder: 'flux.2-klein', tip: 'The image model. To change an existing picture, choose one that supports editing.' },
    { key: 'items', label: 'List', widget: 'text', level: 'setup', when: LIST, refs: true, value: true, placeholder: 'Choose a list, such as your LLM step → pictures', tip: 'Each item is one picture: text, or fields such as prompt, label, source and n. Usually an LLM step’s list. At most 6 items and 8 pictures.' },
    { key: 'prompt', label: 'Prompt', widget: 'textarea', level: 'setup', refs: true, value: true, placeholder: 'Describe the picture, or insert your LLM step’s image prompt', tip: 'Describe the scene. To change a picture, name only the change. With a list, leave empty for each item’s prompt, or add to it: “{{item.prompt}}, in watercolour”.' },
    { key: 'operation', label: 'Create or change', widget: 'select', level: 'option', refs: true, value: true, options: ['auto', 'generate', 'edit'], option_labels: { auto: 'Change a picture when one is named, else create', generate: 'Always create a new picture', edit: 'Always change a picture' }, default: 'generate', defaults: [{ when: LIST, value: 'auto' }], tip: 'Whether to draw a new picture or change one. A field from an LLM can decide each turn. Default: create, or with a list, change when an item names a picture.' },
    { key: 'source', label: 'Picture to change', widget: 'text', level: 'option', refs: true, value: true, when: { any: [LIST, { not: { is: { operation: ['generate', null] } } }] }, unused_note: 'Used only when changing a picture.', placeholder: 'A picture number, such as 2, or a field', tip: 'The number the learner sees, or an image address. A number that names no picture is never drawn fresh. With a list, each item’s source is used.' },
    { key: 'image', label: 'Picture address', widget: 'text', level: 'option', refs: true, value: true, when: { all: [SINGLE_CHANGE, { absent: 'source' }] }, unused_note: 'Used only to change a picture given by address.', placeholder: 'An HTTPS image address or a field', tip: 'The picture to change when it has no number in this conversation: an HTTPS address or a PNG, JPEG or WebP data URL.' },
    { key: 'label', label: 'Caption', widget: 'text', level: 'option', refs: true, value: true, placeholder: 'Such as “Beginning”', tip: 'A short name kept with the picture and shown to models told about this conversation’s pictures. With a list, each item’s label is used.' },
    { key: 'description', label: 'What it shows', widget: 'text', level: 'option', refs: true, value: true, placeholder: 'Such as {{item.scene}}', tip: 'The whole scene, kept for later turns so a model can discuss or change it. Default: the item’s description or scene, else the prompt.' },
    { key: 'n', label: 'Pictures per prompt', widget: 'number', level: 'option', min: 1, max: 4, integer: true, placeholder: 'Default: 1', default: 1, tip: 'Several versions of one scene from one call, 1 to 4. With a list, an item’s own n wins. Default: 1.' },
    { key: 'max_items', label: 'Most pictures a turn', widget: 'number', level: 'option', when: LIST, unused_note: 'Used only with a list of pictures.', min: 1, max: 6, integer: true, placeholder: 'Default: 4', default: 4, tip: 'Items drawn from the list, 1 to 6. The rest are left out. Default: 4.' },
    { key: 'remember', label: 'Remember for later turns', widget: 'boolean', level: 'option', default: true, tip: 'Keeps the pictures by number so the learner can say “change picture 2” later. Pictures the reply doesn’t attach aren’t kept. Default: on.' },
    { key: 'size', label: 'Size', widget: 'text', level: 'advanced', placeholder: '1024x1024', tip: 'Width by height, such as 1024x1024, or a tier such as 1K for Gemini. Default: the model’s.' },
    { key: 'quality', label: 'Quality', widget: 'text', level: 'advanced', placeholder: 'auto', tip: 'GPT Image: auto, low, medium or high (2.5 adds xhigh and max). Higher takes longer and costs more. Gemini ignores it.' },
    { key: 'aspect_ratio', label: 'Aspect ratio', widget: 'text', level: 'advanced', placeholder: '16:9', tip: 'Gemini only, such as 16:9. Default: the model’s.' },
    { key: 'images', label: 'Several pictures to change (JSON)', widget: 'json', level: 'advanced', refs: true, when: SINGLE_CHANGE, unused_note: 'Used only to change one picture without a list.', placeholder: '[{ "image_url": "{{vars.last_image}}" }]', tip: 'Replaces Picture address when set. Each item has one image_url; how many a model takes varies.' },
    { key: 'mask', label: 'Area to change', widget: 'text', level: 'advanced', refs: true, when: SINGLE_CHANGE, unused_note: 'Used only to change one picture without a list.', tip: 'GPT Image only: a PNG the size of the picture; transparent areas mark where to change. It guides the model and doesn’t guarantee the rest stays.' },
    { key: 'fallback_prompt', label: 'If the safety check refuses a picture', widget: 'textarea', level: 'recovery', refs: true, value: true, placeholder: '{{prompt}} Show it as a storybook illustration, not a photograph.', tip: 'Tried once after a refusal; {{prompt}} is the first prompt. Checks refuse realistic photos of children far more than drawings. Default: no second try.' },
    { key: 'max_attempts', label: 'Attempts when busy', widget: 'number', level: 'recovery', min: 1, max: 2, integer: true, default: 1, defaults: [{ when: LIST, value: 2 }], placeholder: 'Default: 1, or 2 with a list', tip: '2 tries once more when the image service says it’s busy. Timeouts and refusals aren’t retried. Default: 1, or 2 with a list.' },
    { key: 'on_error', label: 'If the picture can’t be made', widget: 'select', level: 'recovery', when: SINGLE, unused_note: 'A list of pictures always keeps going.', options: ['stop', 'continue'], option_labels: { stop: 'Stop the run', continue: 'Keep going without it' }, default: 'stop', tip: 'Keep going returns status failed and no address; the run trace keeps the reason. Default: stop the run.' }
  ],
  parts: [{ id: '@pictures', level: 'setup', after: 'model' }],
  outputs: [
    { path: 'summary', label: 'Status sentence', type: 'string', when: LIST, tip: 'Such as “Picture 1 is ready. Picture 2 couldn’t be drawn. Try describing it differently.”' },
    { path: 'urls', label: 'Picture addresses', type: 'list', tip: 'For a Reply’s attachments.' },
    { path: 'url', label: 'First picture’s address', type: 'string' },
    { path: 'pictures', label: 'Every picture', type: 'list', item: 'picture', when: LIST, tip: 'Each with its number, address, caption, status and reason.' },
    { path: 'ready_numbers', label: 'Pictures ready', type: 'list', when: LIST, tip: 'Numbers as the learner sees them, such as [1, 2].' },
    { path: 'blocked_numbers', label: 'Pictures the safety check refused', type: 'list', when: LIST },
    { path: 'failed_numbers', label: 'Pictures that failed', type: 'list', when: LIST },
    { path: 'fallback_numbers', label: 'Pictures drawn on the second try', type: 'list', when: LIST, tip: 'Drawn with the refused-picture prompt.' },
    { path: 'ready_count', label: 'How many are ready', type: 'number', when: LIST },
    { path: 'requested_count', label: 'How many were asked for', type: 'number', when: LIST },
    { path: 'blocked_count', label: 'How many were refused', type: 'number', when: LIST },
    { path: 'failed_count', label: 'How many failed', type: 'number', when: LIST },
    { path: 'partial', label: 'Some but not all drawn', type: 'boolean', when: LIST },
    { path: 'unfinished', label: 'Pictures to draw again', type: 'list', item: 'unfinished', when: LIST },
    { path: 'status', label: 'Status', type: 'string', tip: 'completed, partial, failed or skipped.' },
    { path: 'operation', label: 'Created or changed', type: 'string', when: SINGLE },
    { path: 'attempts', label: 'Attempts used', type: 'number', when: SINGLE }
  ],
  presets: [
    { id: 'planned', label: 'Draw what an LLM planned', tip: 'One picture per item of a list, such as an LLM step’s pictures. Refused pictures get one try as an illustration.', config: { items: '', max_items: 3, fallback_prompt: '{{prompt}} Show it as a storybook illustration, not a photograph.' } },
    { id: 'one', label: 'Draw one picture from a prompt', tip: 'A prompt you write or insert from an earlier step.', config: { prompt: '' } },
    { id: 'change', label: 'Change a picture the learner saw', tip: 'By the number the learner sees, such as “make picture 2 night-time”.', config: { operation: 'edit', source: '', prompt: '' } }
  ],
  defaults: {}
};
