import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test } from 'node:test';
import { NODE_TYPES, validateGraph } from '../src/agents/graph.js';
import {
  CONDITION_FORMS, SENTENCE_PHRASES, SETTING_LEVELS, SETTING_WIDGETS, STEP_CATEGORIES, STEP_MANIFESTS, STEP_PARTS,
  matchesWhen, settingDefault, stepManifest
} from '../src/agents/steps/index.js';
import { kitPath, kitText, portalPath, portalText } from '../scripts/build-steps.mjs';

const FLOW_KINDS = ['next', 'terminal', 'none', 'branches', 'routes', 'paths', 'cases'];
const LOADERS = ['voices', 'reasoning_efforts'];

// The step settings panel before manifests (the portal's agentNodeTypes.ts, 2026-11-01): every field
// it showed, the parts it placed, its label and a new step's config. Manifests drop none of them.
const BEFORE = {
  input: { fields: ['guidance', 'example', 'history'] },
  output: { label: 'Reply', fields: ['text', 'attachments', 'data', 'sources'] },
  ask: { label: 'Ask user', fields: ['text'] },
  llm: { label: 'LLM', fields: ['model', 'system', 'includeHistory', 'includeContext', 'user', 'images', 'pictures'], parts: ['@outputs'] },
  agent: { fields: ['model', 'system', 'tools.knowledge_bases', 'tools.memory', 'tools.fetch', 'tools.agents', 'max_turns', 'includeHistory', 'includeContext', 'input'], defaults: { tools: {}, max_turns: 5 } },
  router: { fields: ['model', 'routes', 'instructions', 'input', 'includeHistory'], defaults: { routes: [{ name: 'question', description: 'The user asks a question' }, { name: 'task', description: 'The user wants something done' }] } },
  image: { fields: ['model', 'items', 'operation', 'prompt', 'label', 'description', 'source', 'image', 'images', 'mask', 'n', 'max_items', 'size', 'quality', 'aspect_ratio', 'remember', 'fallback_prompt', 'max_attempts', 'on_error'], parts: ['@pictures'] },
  speech: { fields: ['model', 'text', 'voice', 'speed', 'format'] },
  transcribe: { fields: ['model', 'audio', 'language', 'prompt'] },
  knowledge: { fields: ['knowledge_bases', 'query', 'top_k'] },
  memory: { fields: ['mode', 'query', 'limit', 'model', 'source', 'instructions', 'content'], defaults: { mode: 'recall' } },
  state: { fields: ['scope', 'assignments'], defaults: { scope: 'conversation', assignments: [{ name: 'topic', value: '{{input}}' }] } },
  condition: { label: 'Branch', fields: [], parts: ['@cases'] },
  loop: { fields: ['count', 'while', 'var'], parts: ['@loop'], defaults: { count: 3 } },
  each: { label: 'For each', fields: ['items', 'as', 'max_items', 'collect'], defaults: { items: '' } },
  parallel: { fields: ['paths'], defaults: { paths: ['a', 'b'] } },
  http: { label: 'Fetch URL', fields: ['url', 'method', 'headers', 'body'], defaults: { method: 'GET' } },
  transform: { label: 'Values', fields: ['output'], defaults: { output: { message: '{{input}}' } } },
  vetting: { label: 'VETTING', fields: ['mode', 'model', 'verification_model', 'draft', 'guideline', 'reference', 'question', 'answer_key', 'key_concepts', 'explanation', 'chat_prompt', 'verification_prompt', 'max_attempts', 'require_closing_question', 'includeHistory', 'input'], parts: ['@outcomes'], defaults: { mode: 'simple', max_attempts: 3 } },
  guardrail: { fields: ['checks', 'text', 'model', 'topic', 'policy', 'includeHistory'], defaults: { checks: ['pii'] } },
  subagent: { label: 'Sub-agent', fields: ['slug', 'input'] },
  note: { fields: ['text'], defaults: { text: '' } }
};

// The panel's `when` functions, as they were written, and configs to compare them on.
const BEFORE_WHEN = {
  'image.items': (c) => c.items != null,
  'image.source': (c) => c.items != null || c.operation != null && c.operation !== 'generate',
  'image.image': (c) => c.items == null && c.source == null && c.operation != null && c.operation !== 'generate',
  'image.images': (c) => c.items == null && c.operation != null && c.operation !== 'generate',
  'image.mask': (c) => c.items == null && c.operation != null && c.operation !== 'generate',
  'image.max_items': (c) => c.items != null,
  'image.on_error': (c) => c.items == null,
  'memory.query': (c) => !c.mode || c.mode === 'recall',
  'memory.limit': (c) => !c.mode || c.mode === 'recall',
  'memory.model': (c) => c.mode === 'extract',
  'memory.source': (c) => c.mode === 'extract',
  'memory.instructions': (c) => c.mode === 'extract',
  'memory.content': (c) => c.mode === 'save',
  'loop.while': (c) => c.count == null || c.count === '',
  'vetting.guideline': (c) => c.mode !== 'full',
  'vetting.reference': (c) => c.mode !== 'full',
  'vetting.question': (c) => c.mode === 'full',
  'vetting.answer_key': (c) => c.mode === 'full',
  'vetting.key_concepts': (c) => c.mode === 'full',
  'vetting.explanation': (c) => c.mode === 'full',
  'vetting.verification_prompt': (c) => c.mode === 'full',
  'guardrail.model': (c) => Array.isArray(c.checks) && c.checks.some((check) => check !== 'pii'),
  'guardrail.topic': (c) => Array.isArray(c.checks) && c.checks.includes('off_topic'),
  'guardrail.policy': (c) => Array.isArray(c.checks) && c.checks.includes('custom'),
  'guardrail.includeHistory': (c) => Array.isArray(c.checks) && c.checks.some((check) => check !== 'pii')
};
const product = (choices) => Object.entries(choices).reduce((configs, [key, values]) => configs.flatMap((config) => values.map((value) => (value === undefined ? config : { ...config, [key]: value }))), [{}]);
const SAMPLES = {
  image: product({ items: [undefined, null, '', '{{plan.json.pictures}}'], operation: [undefined, 'generate', 'edit', 'auto', '{{plan.json.op}}'], source: [undefined, 2] }),
  memory: product({ mode: [undefined, 'recall', 'extract', 'save'] }),
  loop: product({ count: [undefined, null, '', 0, 3], while: [undefined, 'vars.n < 3'] }),
  vetting: product({ mode: [undefined, 'simple', 'full'] }),
  guardrail: product({ checks: [undefined, [], ['pii'], ['pii', 'jailbreak'], ['moderation'], ['off_topic'], ['custom'], ['pii', 'off_topic', 'custom']] })
};

const settingOf = (type, key) => stepManifest(type).settings.find((setting) => setting.key === key);

// Every condition object in a manifest: settings, conditional defaults, sentence and outputs.
function conditionsOf(manifest) {
  const found = [];
  const walk = (when) => {
    if (when == null) return;
    found.push(when);
    for (const part of [...(when.all || []), ...(when.any || []), ...(when.not ? [when.not] : [])]) walk(part);
  };
  for (const setting of manifest.settings) { walk(setting.when); for (const option of setting.defaults || []) walk(option.when); }
  for (const segment of manifest.sentence) walk(segment.when);
  for (const output of manifest.outputs) walk(output.when);
  return found;
}

test('every node type has exactly one manifest, and every manifest is a node type', () => {
  assert.deepEqual(STEP_MANIFESTS.map((manifest) => manifest.type).sort(), [...NODE_TYPES].sort());
  assert.equal(new Set(STEP_MANIFESTS.map((manifest) => manifest.type)).size, STEP_MANIFESTS.length);
});

test('every manifest serializes to JSON and back unchanged', () => {
  for (const manifest of STEP_MANIFESTS) assert.deepEqual(JSON.parse(JSON.stringify(manifest)), manifest, manifest.type);
});

test('manifests use known categories, flows, levels, widgets, parts, loaders and condition forms', () => {
  for (const manifest of STEP_MANIFESTS) {
    const at = manifest.type;
    for (const field of ['label', 'summary', 'use', 'keywords', 'docs']) assert.equal(typeof manifest[field], 'string', `${at}.${field}`);
    assert.ok(Number.isInteger(manifest.version) && manifest.version >= 1, at);
    assert.ok(STEP_CATEGORIES.includes(manifest.category), `${at} category`);
    assert.ok(FLOW_KINDS.includes(manifest.flow.kind), `${at} flow`);
    assert.ok(manifest.calls_model === undefined || ['always', 'some'].includes(manifest.calls_model), `${at} calls_model`);
    assert.ok(Array.isArray(manifest.sentence) && manifest.sentence.length, `${at} sentence`);
    const keys = manifest.settings.map((setting) => setting.key);
    assert.equal(new Set(keys).size, keys.length, `${at} has duplicate setting keys`);
    for (const setting of manifest.settings) {
      assert.ok(SETTING_LEVELS.includes(setting.level), `${at}.${setting.key} level`);
      assert.ok(SETTING_WIDGETS.includes(setting.widget), `${at}.${setting.key} widget`);
      assert.ok(setting.loader === undefined || LOADERS.includes(setting.loader), `${at}.${setting.key} loader`);
      if (setting.options && setting.default !== undefined) assert.ok(setting.options.includes(setting.default), `${at}.${setting.key} default is an option`);
      for (const label of Object.keys(setting.option_labels || {})) assert.ok(setting.options.includes(label), `${at}.${setting.key} labels ${label}`);
      if (setting.empty_choice) assert.equal(setting.empty_choice.length, 2, `${at}.${setting.key} empty_choice`);
    }
    for (const part of manifest.parts) {
      assert.ok(STEP_PARTS.includes(part.id), `${at} part ${part.id}`);
      assert.ok(SETTING_LEVELS.includes(part.level), `${at} part ${part.id} level`);
      assert.ok(part.after === undefined || keys.includes(part.after), `${at} part ${part.id} after`);
    }
    for (const when of conditionsOf(manifest)) {
      const forms = Object.keys(when);
      assert.equal(forms.length, 1, `${at}: a condition has one form, not ${forms}`);
      assert.ok(CONDITION_FORMS.includes(forms[0]), `${at}: unknown condition form ${forms[0]}`);
    }
    assert.ok(Array.isArray(manifest.presets) && manifest.defaults && typeof manifest.defaults === 'object', at);
    assert.equal(new Set(manifest.presets.map((preset) => preset.id)).size, manifest.presets.length, `${at} preset ids`);
  }
});

test('every sentence placeholder names a setting or a known phrase', () => {
  for (const manifest of STEP_MANIFESTS) {
    const keys = new Set(manifest.settings.map((setting) => setting.key));
    for (const { text } of manifest.sentence) {
      for (const [, name] of text.matchAll(/\{([^{}]+)\}/g)) {
        assert.ok(name.startsWith('@') ? SENTENCE_PHRASES.includes(name) : keys.has(name), `${manifest.type}: {${name}} in “${text}”`);
      }
    }
  }
});

test('tips are at most 160 characters and labels at most 40', () => {
  for (const manifest of STEP_MANIFESTS) {
    assert.ok(manifest.label.length <= 40, manifest.type);
    for (const item of [...manifest.settings, ...manifest.outputs, ...manifest.presets]) {
      const name = `${manifest.type}.${item.key || item.path || item.id}`;
      assert.ok(typeof item.label === 'string' && item.label.length && item.label.length <= 40, `${name} label: ${item.label}`);
      assert.ok(item.tip === undefined || item.tip.length <= 160, `${name} tip is ${item.tip?.length} characters`);
    }
    for (const setting of manifest.settings) assert.ok(setting.tip, `${manifest.type}.${setting.key} has a tip`);
  }
});

test('labels never show config keys', () => {
  const keyish = /^[a-z]+(?:[._][a-z]+)+$|^(n|source|json|items|slot|vars)$/;
  for (const manifest of STEP_MANIFESTS) {
    for (const setting of manifest.settings) assert.ok(!keyish.test(setting.label), `${manifest.type}.${setting.key}: ${setting.label}`);
  }
});

test('every output path is unique per step', () => {
  for (const manifest of STEP_MANIFESTS) {
    const paths = manifest.outputs.map((output) => output.path);
    assert.equal(new Set(paths).size, paths.length, manifest.type);
    for (const output of manifest.outputs) assert.ok(['string', 'number', 'boolean', 'list', 'any'].includes(output.type), `${manifest.type}.${output.path} type`);
  }
});

test('no setting, part, label or new step config of the panel before manifests is dropped', () => {
  for (const [type, before] of Object.entries(BEFORE)) {
    const manifest = stepManifest(type);
    const keys = manifest.settings.map((setting) => setting.key);
    for (const key of before.fields) assert.ok(keys.includes(key), `${type} lost ${key}`);
    for (const id of before.parts || []) assert.ok(manifest.parts.some((part) => part.id === id), `${type} lost ${id}`);
    assert.equal(manifest.label, before.label || type[0].toUpperCase() + type.slice(1));
    assert.deepEqual(manifest.defaults, before.defaults || {}, `${type} defaults`);
  }
});

test('each manifest condition holds exactly where the panel’s function did', () => {
  for (const [name, before] of Object.entries(BEFORE_WHEN)) {
    const [type, key] = name.split('.');
    const setting = settingOf(type, key);
    for (const config of SAMPLES[type]) {
      // The panel compared operation to 'generate' as written, so '' never reaches these configs.
      assert.equal(matchesWhen(setting.when, config), before(config), `${name} for ${JSON.stringify(config)}`);
    }
  }
});

test('matchesWhen follows the condition table', () => {
  const rows = [
    [{ set: 'a' }, [[{}, false], [{ a: null }, false], [{ a: '' }, false], [{ a: [] }, false], [{ a: 0 }, true], [{ a: false }, true], [{ a: 'x' }, true], [{ a: [1] }, true]]],
    [{ unset: 'a' }, [[{}, true], [{ a: '' }, true], [{ a: [] }, true], [{ a: 0 }, false], [{ a: 'x' }, false]]],
    [{ present: 'a' }, [[{}, false], [{ a: null }, false], [{ a: '' }, true], [{ a: [] }, true], [{ a: 'x' }, true]]],
    [{ absent: 'a' }, [[{}, true], [{ a: null }, true], [{ a: '' }, false], [{ a: 'x' }, false]]],
    [{ is: { mode: 'full' } }, [[{ mode: 'full' }, true], [{ mode: 'simple' }, false], [{}, false]]],
    [{ is: { mode: ['recall', null] } }, [[{}, true], [{ mode: '' }, true], [{ mode: 'recall' }, true], [{ mode: 'save' }, false]]],
    [{ is: { mode: 'a', kind: 'b' } }, [[{ mode: 'a', kind: 'b' }, true], [{ mode: 'a' }, false]]],
    [{ is: { remember: false } }, [[{ remember: false }, true], [{}, false], [{ remember: true }, false]]],
    [{ has: { checks: ['off_topic', 'custom'] } }, [[{ checks: ['pii', 'custom'] }, true], [{ checks: ['pii'] }, false], [{ checks: 'custom' }, false], [{}, false]]],
    [{ has: { checks: 'pii' } }, [[{ checks: ['pii'] }, true], [{ checks: [] }, false]]],
    [{ set: 'params.temperature' }, [[{ params: { temperature: 0 } }, true], [{ params: {} }, false], [{ params: 'x' }, false], [{}, false]]],
    [{ not: { set: 'a' } }, [[{}, true], [{ a: 1 }, false]]],
    [{ all: [{ set: 'a' }, { set: 'b' }] }, [[{ a: 1, b: 1 }, true], [{ a: 1 }, false]]],
    [{ any: [{ set: 'a' }, { set: 'b' }] }, [[{ b: 1 }, true], [{}, false]]],
    [{ all: [] }, [[{}, true]]],
    [{ any: [] }, [[{}, false]]],
    [undefined, [[{}, true]]],
    [{ unknown: 'a' }, [[{ a: 1 }, false]]]
  ];
  for (const [when, cases] of rows) {
    for (const [config, expected] of cases) assert.equal(matchesWhen(when, config), expected, `${JSON.stringify(when)} on ${JSON.stringify(config)}`);
  }
});

test('settingDefault takes the first matching conditional default, else the default', () => {
  const operation = settingOf('image', 'operation');
  assert.equal(settingDefault(operation, {}), 'generate');
  assert.equal(settingDefault(operation, { items: '' }), 'auto');
  assert.equal(settingDefault(settingOf('image', 'max_attempts'), { items: '{{plan.json.pictures}}' }), 2);
  assert.equal(settingDefault(settingOf('image', 'max_attempts')), 1);
  assert.equal(settingDefault({ default: 1, defaults: [{ when: { set: 'a' }, value: 2 }, { when: { set: 'a' }, value: 3 }] }, { a: 1 }), 2);
  assert.equal(settingDefault({ key: 'x' }, {}), undefined);
  assert.equal(settingDefault(settingOf('vetting', 'verification_model')), 'gpt-6-luna');
});

// Bounds validateGraph checks, tried at and past each edge so the manifests can't drift from it.
const BOUNDS = [
  ['image', 'max_attempts'], ['image', 'max_items'], ['each', 'max_items'], ['vetting', 'max_attempts'],
  ...['', 'verification_'].flatMap((prefix) => ['temperature', 'top_p', 'max_tokens', 'max_completion_tokens'].map((key) => ['vetting', `${prefix}${key}`]))
];
const REQUIRED = { image: { model: 'flux.2-klein' }, each: { items: '{{plan.json.questions}}' }, vetting: { model: 'viable-3' } };
function accepts(type, key, value) {
  const step = { id: 'step', type, config: { ...REQUIRED[type], [key]: value }, next: 'reply' };
  const nodes = [{ id: 'start', type: 'input', next: 'step' }, step, { id: 'reply', type: 'output' }];
  if (type === 'each') {
    step.branches = { each: 'body', done: 'reply' };
    nodes.push({ id: 'body', type: 'transform', next: 'step' });
  }
  try {
    validateGraph({ entry: 'start', nodes });
    return true;
  } catch (error) {
    if (error.code !== 'invalid_graph') throw error;
    return false;
  }
}

test('numeric bounds agree with graph.js where it checks them', () => {
  for (const [type, key] of BOUNDS) {
    const setting = settingOf(type, key);
    const name = `${type}.${key}`;
    assert.ok(setting && setting.widget === 'number', `${name} is a number setting`);
    assert.equal(typeof setting.min, 'number', `${name} has a minimum`);
    const step = setting.integer ? 1 : 0.01;
    assert.ok(accepts(type, key, setting.min), `${name} accepts its minimum ${setting.min}`);
    assert.ok(!accepts(type, key, setting.min - step), `${name} rejects below ${setting.min}`);
    if (setting.max === undefined) {
      assert.ok(accepts(type, key, 1_000_000), `${name} has no maximum in graph.js`);
    } else {
      assert.ok(accepts(type, key, setting.max), `${name} accepts its maximum ${setting.max}`);
      assert.ok(!accepts(type, key, setting.max + step), `${name} rejects above ${setting.max}`);
    }
    if (setting.integer) assert.ok(!accepts(type, key, setting.min + 0.5), `${name} rejects fractions`);
    if (setting.default !== undefined) assert.ok(accepts(type, key, setting.default), `${name} accepts its default`);
  }
});

test('the kit and portal copies equal what npm run steps:build writes', (t) => {
  assert.equal(readFileSync(kitPath, 'utf8'), kitText(), 'Run npm run steps:build.');
  const kit = JSON.parse(kitText());
  assert.equal(kit.object, 'agent.step_manifests');
  assert.equal(kit.version, 1);
  assert.deepEqual(kit.steps, JSON.parse(JSON.stringify(STEP_MANIFESTS)));
  if (!existsSync(dirname(portalPath))) return t.skip('the viablelab-developers checkout is missing');
  assert.equal(readFileSync(portalPath, 'utf8'), portalText(), 'Run npm run steps:build.');
});

test('Run step refuses exactly the types whose manifests say why, and recorded_as names a trace key', () => {
  const refused = STEP_MANIFESTS.filter((manifest) => manifest.cannot_run_alone).map((manifest) => manifest.type).sort();
  assert.deepEqual(refused, ['ask', 'each', 'input', 'loop', 'note', 'parallel']);
  for (const manifest of STEP_MANIFESTS) {
    if (manifest.cannot_run_alone !== undefined) assert.ok(typeof manifest.cannot_run_alone === 'string' && manifest.cannot_run_alone.length <= 140, manifest.type);
    for (const setting of manifest.settings) if (setting.recorded_as !== undefined) assert.match(setting.recorded_as, /^[a-z_]+$/, `${manifest.type}.${setting.key}`);
  }
});
