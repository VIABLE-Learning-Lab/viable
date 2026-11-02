# Step manifests

Each step type an agent graph can use has one manifest in `src/agents/steps/<type>.js`. It is
plain data (a default export with no functions), so it serializes to JSON unchanged. One manifest
drives the step settings panel and canvas card in the Developer Portal, the step library, the AI
builder's notes, `GET /v1/developer/agents/graph-schema` (and so `viable developer agents schema`),
the harness kit and the step docs. Runtime validation stays in `src/agents/graph.js`;
`tests/stepManifests.test.js` keeps the two in agreement.

`npm run steps:build` writes the portal's copy (`../viablelab-developers/app/data/stepManifests.generated.json`)
and the kit's (`kit/schemas/steps.json`). Never edit either copy by hand.

## A manifest

```js
export default {
  type: 'image',              // the graph node type
  version: 1,                 // raise when a setting changes meaning
  label: 'Image',             // shown on cards, the library and panels
  category: 'ai',             // start | ai | safety | logic | knowledge | tools | annotate
  summary: 'Draw or change pictures: one prompt, or a list of them.',   // one line in the step library
  use: '…',                   // for the AI builder: what it is best for, its limits, model calls
  guide: ['…'],               // how-to bullets behind the panel's ? button
  keywords: 'picture photo …',// extra words the step library search matches
  calls_model: 'always',      // always | some | omitted (never)
  docs: '/docs/build/steps#image',
  research: { title, summary, url },   // only for research-based steps (VETTING)
  cannot_run_alone: '…',      // why Run step refuses this type (Input, Loop, For each, Parallel, Ask, Note)
  flow: { kind: 'next' },     // next | terminal | none | branches (keys, labels) | routes | paths | cases
  sentence: [ … ],            // the plain-language line at the top of the panel and on the card
  settings: [ … ],            // in panel order
  parts: [ … ],               // built-in editors placed among the settings
  outputs: [ … ],             // what later steps can read
  presets: [ … ],             // first choices when the step is added
  defaults: { … }             // config of a new step (before any preset)
}
```

## Settings

```js
{
  key: 'max_items',            // dot path inside node.config, such as "params.temperature"
  label: 'Most pictures a turn',
  widget: 'number',            // see below
  level: 'option',             // setup | option | recovery | advanced
  tip: 'Items after this many are left out. 1 to 6. Default: 4.',
  placeholder: 'Default: 4',
  default: 4,                  // what an unset value means
  defaults: [{ when: { set: 'items' }, value: 'auto' }],   // a default that depends on other settings
  when: { set: 'items' },      // shown only when this holds
  unused_note: 'Used only with a list of pictures.',       // shown when it is saved but `when` fails
  min: 1, max: 6, integer: true,
  options: ['stop', 'continue'], option_labels: { stop: 'Stop the run', continue: 'Keep going' },
  refs: true,                  // may insert fields from earlier steps
  value: true,                 // a template that holds one value (edited as text, a field, by condition or an expression)
  empty: 'the reply model writes it',                      // what an empty value means
  empty_choice: ['The learner’s message', 'Custom input'], // a first choice between empty and a value
  loader: 'voices',            // options come from elsewhere: voices or reasoning_efforts (both from the step's model)
  ai: 'Write rules the reviewer can check one by one.',    // extra note for the AI builder
  recorded_as: 'message'       // the key a run's trace records this setting's worked-out value under, when it differs
}
```

**Levels.** `setup` is what every author of this step decides; it is always shown. `option` and
`recovery` are shown when set (or when their value differs from the default) and otherwise listed
under **Add option** in their section; `recovery` is the **When something goes wrong** section
(retries, fallbacks, what happens on an error). `advanced` behaves like `option` but sorts last in
Add option. Every setting a manifest lists must be reachable from the panel: a setting is never
hidden only because it is unset.

**Widgets.** `text`, `textarea`, `prompt` (long instructions, edited in the full-width editor),
`json`, `expr` (a condition expression), `number`, `boolean`, `select`, `model`,
`knowledge_bases`, `agents`, `list` (strings), `routes`, `assignments`, `checks`, `fields`
(named values), `voice`.

**Tips** say what the setting does, give an example where it helps, and end with the default:
"Items after this many are left out. 1 to 6. Default: 4." At most 160 characters. Labels use the
author's words, never config keys (`Pictures per prompt`, not `n`). Every sentence must be true of
the code.

## Conditions

`when` (and `defaults[].when`, `sentence[].when`, `outputs[].when`) is data, so the runtime, the
portal, the CLI and the docs evaluate it the same way:

| Form | Holds when |
| --- | --- |
| `{ set: 'items' }` | the value is not null, undefined, `''` or `[]` |
| `{ unset: 'items' }` | it is |
| `{ present: 'items' }` | the value is not null or undefined (`''` counts: an Image step with `items: ''` is in list mode) |
| `{ absent: 'items' }` | it is null or undefined |
| `{ is: { mode: 'full' } }` | the value equals it; a list matches any; `null` in the list matches unset |
| `{ has: { checks: ['off_topic', 'custom'] } }` | the value is a list holding any of these |
| `{ not: … }`, `{ all: [ … ] }`, `{ any: [ … ] }` | combinations |

`matchesWhen(when, config)` in `src/agents/steps/index.js` is the reference implementation.

## Parts

Built-in editors with behaviour no generic widget has, placed by level like a setting:
`{ id: '@pictures', level: 'setup' }`. Known parts: `@pictures` (an Image step's one prompt or
list), `@outputs` (an LLM's answer format), `@cases` (a Branch's cases), `@loop` (a Loop's count
or condition), `@outcomes` (VETTING's outcomes), `@routes`, `@paths`. A part may name the setting
it sits after: `{ id: '@pictures', level: 'setup', after: 'model' }`. Parts that are a section of their own in the panel (`@outputs` as Answer format, `@cases`, `@outcomes`) show as that section; their level only says how essential they are.

## The sentence

A list of segments joined in order. Each has `text` with `{placeholders}` and an optional `when`.
A segment whose placeholders are all empty is left out.

```js
sentence: [
  { text: 'Draws the pictures in {items}', when: { set: 'items' } },
  { text: 'Draws {prompt}', when: { unset: 'items' } },
  { text: ', up to {max_items} a turn', when: { set: 'max_items' } },
  { text: '. If the safety check refuses one, tries once more', when: { set: 'fallback_prompt' } }
]
```

`{key}` is a setting, formatted by its widget: a reference shows as its step and field ("tutor →
pictures"), long text as its first clause, a select as its option label, a list as "a, b and c".
`{@name}` is a computed phrase the portal provides: `@outputs`, `@routes`, `@paths`, `@cases`,
`@tools`, `@checks`, `@assignments`, `@values`, `@exits`, `@agent`.

## Outputs

```js
outputs: [
  { path: 'status', label: 'Status', type: 'string', tip: 'completed, partial, failed or skipped', when: { set: 'items' } },
  { path: 'pictures', label: 'Every picture', type: 'list', item: 'picture' }
]
```

`path` is read as `{{<step id>.<path>}}`. `type` is `string`, `number`, `boolean`, `list` or
`any`. `item` names the fields of a list's items (`picture`, `unfinished`). An LLM's named fields,
a State step's values, a Values step's values, a Loop's counter and a For each step's item come
from the step's own config and are added by the portal.

## Presets

```js
presets: [
  { id: 'planned', label: 'Draw what an LLM planned', tip: 'One picture per item of a list output.', config: { items: '', max_items: 3 } }
]
```

Shown when the step is added from the library. A preset only fills settings; the step is the same
type either way.

## Rules the tests enforce

- Every type in `NODE_TYPES` has exactly one manifest, and every manifest is a node type.
- Every manifest serializes to JSON and back unchanged.
- Setting keys are unique; levels, widgets, part ids and condition forms are known.
- Every placeholder in a sentence names a setting or a known `{@name}`.
- Tips are at most 160 characters; labels at most 40.
- Numeric bounds agree with `graph.js` where it checks them.
- The portal and kit copies equal what `npm run steps:build` writes.
