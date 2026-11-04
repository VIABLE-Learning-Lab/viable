/**
 * Agent graph schema: validation, model extraction, and slug helpers.
 *
 * The graph JSON is the canonical artifact shared by the visual canvas and the
 * runtime. Shape:
 *   { version, name, entry, variables, nodes: [...], edges: [...] }
 *   node: { id, type, config, next?, branches? }
 * `edges` is visual-only metadata and is ignored by the engine.
 */

import { MODEL_MODES } from '../config/modelModes.js';
import { validSketch } from '../utils/agentCollaboration.js';
import { agentVettingControls, vettingControlErrors } from '../utils/vettingControls.js';
import { describeSteps } from './steps/index.js';
import { checkSchema, schemaFor } from '../schemas.js';
import { entryProblem } from '../components/contract.js';

export const NODE_TYPES = Object.freeze([
  'input',
  'llm',
  'condition',
  'image',
  'speech',
  'transcribe',
  'http',
  'loop',
  'each',
  'transform',
  'output',
  'subagent',
  'router',
  'agent',
  'knowledge',
  'memory',
  'state',
  'guardrail',
  'parallel',
  'ask',
  'note',
  'vetting',
  'component'
]);

export const DEFAULT_GRAPH_LIMITS = Object.freeze({
  maxNodes: 100,
  maxGraphBytes: 262144,
  maxConfigBytes: 32768,
  maxStructuredOutputs: 20
});

// Node types the validator rejects today. They stay in NODE_TYPES so a graph naming one gets a precise error.
export const UNAVAILABLE_NODE_TYPES = Object.freeze([]);

// The VETTING step's default reviewer, the same model the /v1/vetting endpoints default to.
export const DEFAULT_VETTING_REVIEWER = 'gpt-6-luna';

// Nodes that call a model. Memory and guardrail call one only in some modes.
export const MODEL_NODE_TYPES = new Set(['llm', 'image', 'speech', 'transcribe', 'router', 'agent', 'guardrail', 'memory', 'vetting']);
// The kind of model each step takes; the rest take chat models.
export const STEP_MODEL_MODES = Object.freeze({ image: MODEL_MODES.IMAGE_GENERATION, speech: MODEL_MODES.AUDIO_SPEECH, transcribe: MODEL_MODES.AUDIO_TRANSCRIPTION });
export const MODE_NAMES = Object.freeze({ chat: 'a chat model', image_generation: 'an image model', audio_speech: 'a speech model', audio_transcription: 'a transcription model', embedding: 'an embedding model' });
export const GUARDRAIL_MODEL_CHECKS = Object.freeze(['jailbreak', 'moderation', 'off_topic', 'custom']);
export const GUARDRAIL_CHECKS = Object.freeze(['pii', ...GUARDRAIL_MODEL_CHECKS]);
const HANDLE_NAME = /^[a-z][a-z0-9_-]{0,39}$/;

// What validateGraph requires of a node's config, for the published schema: `all` keys must be present and
// at least one `any` key must be. A test builds configs from this and checks the validator agrees both ways.
export const NODE_REQUIREMENTS = Object.freeze({
  llm: Object.freeze({ all: Object.freeze(['model']) }),
  image: Object.freeze({ all: Object.freeze(['model']) }),
  speech: Object.freeze({ all: Object.freeze(['model']) }),
  transcribe: Object.freeze({ all: Object.freeze(['model']) }),
  http: Object.freeze({ all: Object.freeze(['url']) }),
  condition: Object.freeze({ any: Object.freeze(['field', 'expr', 'cases']) }),
  subagent: Object.freeze({ all: Object.freeze(['slug']) }),
  router: Object.freeze({ all: Object.freeze(['model', 'routes']) }),
  agent: Object.freeze({ all: Object.freeze(['model']) }),
  knowledge: Object.freeze({ all: Object.freeze(['knowledge_bases']) }),
  guardrail: Object.freeze({ all: Object.freeze(['checks']) }),
  parallel: Object.freeze({ all: Object.freeze(['paths']) }),
  each: Object.freeze({ all: Object.freeze(['items']) }),
  vetting: Object.freeze({ all: Object.freeze(['model']) }),
  component: Object.freeze({ all: Object.freeze(['manifest']) })
});

/** Outgoing handle names a node exposes; router and parallel derive theirs from config. */
export function routerRoutes(config = {}) {
  return (Array.isArray(config.routes) ? config.routes : [])
    .filter((route) => route && typeof route.name === 'string' && HANDLE_NAME.test(route.name) && route.name !== 'fallback')
    .map((route) => ({ name: route.name, description: typeof route.description === 'string' ? route.description : '' }));
}

export function parallelPaths(config = {}) {
  return (Array.isArray(config.paths) ? config.paths : [])
    .filter((name) => typeof name === 'string' && HANDLE_NAME.test(name) && name !== 'join');
}

function describeRequirement({ all = [], any = [] } = {}) {
  return [
    ...all.map((key) => `config.${key}`),
    ...(any.length ? [`one of ${any.map((key) => `config.${key}`).join(', ')}`] : [])
  ];
}

export function describeGraphSchema(limits = DEFAULT_GRAPH_LIMITS) {
  return {
    object: 'agent.graph_schema',
    version: 1,
    graph: {
      required: ['entry', 'nodes'],
      fields: {
        version: 'Integer, currently 1.',
        name: 'Human-readable workflow name.',
        entry: 'ID of the first node, usually "input".',
        variables: 'Optional initial values read as {{vars.name}}.',
        nodes: 'Execution steps.',
        edges: 'Optional visual metadata; routing comes from node next, branches, and condition cases.',
        groups: 'Optional canvas frames: at most 50 { id, label, description, nodes: [step ids], collapsed, settings }, each step in at most one. description (at most 280 characters) says what the block does. settings (at most 8 { step, key, label }) are settings shown on the block: step is one of its steps, key a dot path in that step\'s config such as params.temperature, label at most 40 characters. Runs ignore groups.',
        run_limits: 'Optional limits for each run: max_model_calls (1–60, default 20) and timeout_seconds (10–120, default 60) for runs a caller waits on. Background jobs get at least 5 minutes.'
      }
    },
    node_types: NODE_TYPES.map((type) => ({
      type,
      available: !UNAVAILABLE_NODE_TYPES.includes(type),
      requires: describeRequirement(NODE_REQUIREMENTS[type]),
      ...(MODEL_NODE_TYPES.has(type) ? { model_mode: STEP_MODEL_MODES[type] || MODEL_MODES.CHAT } : {}),
      ...(UNAVAILABLE_NODE_TYPES.includes(type) ? { note: 'Reserved. Validation rejects this type until it is enabled.' } : {})
    })),
    limits: { ...limits },
    rules: [
      `A graph needs at least one node and at most ${limits.maxNodes}.`,
      `A graph may be at most ${limits.maxGraphBytes} bytes and a node config at most ${limits.maxConfigBytes} bytes.`,
      'Every node needs a unique string id and a known, available type.',
      'entry must name an existing node.',
      'Every next, branches, and condition case target must name an existing node.',
      'A condition step checks config.cases [{when, to, label}] in order: the first case that holds decides, else config.default. label (1–60 characters) names a case on its connection; routing ignores it, and the step\'s result adds the matched case\'s case_number and label.',
      'An each step ("For each") runs its body once per item of config.items (a list, such as an llm list output), one item after another, up to max_items (default 10, at most 25). branches.each is the body\'s first step and the body\'s last step points back to the each step; branches.done (else next) runs after the last item. Body steps read the item as {{item}} and {{item_number}} (or the name in config.as). Its result: count, items, results [{item, number, outputs: {stepId: output}}] and values (config.collect worked out after each item, else the last body step\'s output). Body steps count toward the run\'s step and model call limits and can\'t reply or ask.',
      'At least one output node must be reachable from entry.',
      'A step\'s config.model must be a model whose mode in /v1/models is the step\'s model_mode: chat models answer, image steps take image_generation, speech steps audio_speech and transcribe steps audio_transcription.',
      'Image steps default to operation=generate. operation=edit requires source (a picture number of this conversation, or an address), image (one URL) or images ([{image_url}]), and a model connection with image_editing=true; operation=auto edits when source names a picture and generates otherwise. Operation and source values may be templates. Missing sources never fall back to generation.',
      'Several pictures: config.items (a list, usually an llm list output such as {{plan.json.pictures}}) makes one request per item, up to max_items (default 4, at most 6) and 8 pictures in all, three at a time. Each item reads as {{item}} and {{item_number}}; prompt defaults to {{item.prompt}} (or the item itself for text), label to item.label, description (what the picture shows, kept for later turns) to item.description or item.scene, source to item.source, n to item.n (pictures from that one prompt, 1–4). One scene several times is one item with n>1; several scenes are several items.',
      'With items, a picture never stops the run: a safety refusal is status=blocked and is not retried on its own, a busy service is retried once (max_attempts, default 2), and anything else is status=failed with a reason (safety, busy, time, limit, source_missing, no_source, no_prompt, missing, error). fallback_prompt (a template; {{prompt}} is the first prompt, {{item}} the item) is tried once when the safety check stops a picture, for example "{{prompt}} Show it as a storybook illustration, not a photograph." (image safety checks refuse realistic photos of children and teens far more often than drawings); an empty result skips the retry, so {{ item.source > 0 ? "" : prompt + "…" }} leaves edits alone. A picture drawn this way has fallback=true. The result lists pictures [{number, url, prompt, label, status, reason, fallback, slot, item}], urls, url, ready_count, blocked_count, failed_count, ready_numbers, blocked_numbers, failed_numbers, fallback_numbers (ready pictures drawn with fallback_prompt), partial, unfinished, status (completed, partial, failed or skipped) and summary: sentences for the learner by the numbers they see, such as "Pictures 1 and 2 are ready. Picture 3 couldn’t be drawn. Try describing it differently." (empty when nothing was asked for), which a reply can show as it is. Single image steps keep opt-in recovery: max_attempts=2 retries one transient rejection and on_error=continue returns status=failed instead of stopping. Never put diagnostics in assistant prose.',
      'Picture memory: on a server-kept conversation, picture steps (remember, default true) keep the pictures shown by the number the learner sees. Every step reads {{conversation.pictures}} [{number, url, prompt, label, description}], {{conversation.unfinished}} (numbers not drawn; pass as items to finish them in the same numbers) and {{conversation.picture_history}}. One edited picture keeps its number; several pictures (new ones, versions, a mixture) become a new set numbered from 1. Pictures a run draws but its reply does not attach are not remembered. An llm step with pictures=true is told the current pictures by number, the newest marked, at the start of its turn message. Do not copy picture URLs or plans into State.',
      'An llm step can attach images from earlier steps with config.images=[{image_url:"{{step.url}}"}]. A URL in prompt text is only text. Typed image inputs are downloaded safely and converted to provider-native image data; the selected chat model must support image input.',
      `An llm node may declare at most ${limits.maxStructuredOutputs} structured outputs: type string, number, boolean or list. A list ({name, type: "list", max_items 1–10, fields: [{name, type, description}]}) returns several items with up to 10 fields each, or text items without fields; use it instead of numbered copies like prompt_1, prompt_2.`,
      'A component step runs another team\'s method from its manifest, held inline in config.manifest (schemas/component.schema.json; slot step, runs http or mcp). config.inputs maps each field the manifest receives to a template, such as {"learner_message": "{{input}}"}; only those fields are sent, to the entry on a host its sends_to lists, without following a redirect, within 30 seconds and 1 MiB. Later steps read {{id.output}} and {{id.flags}} [{label, reason}]. A refusal, timeout or answer out of shape stops the run unless config.on_error is continue, which returns status=failed and error {code, message}. Hosts may run fewer kinds: VIABLE calls http components only, over public HTTPS, so an mcp component runs with viable-harness on your own machine.',
      `run_limits may set max_model_calls (${RUN_LIMITS.max_model_calls.join('–')}) and timeout_seconds (${RUN_LIMITS.timeout_seconds.join('–')}).`
    ],
    // Each step type's settings, outputs and plain-language sentence, as the portal's step panel shows them.
    steps: describeSteps(),
    documentation: 'https://developers.viablelab.org/agents/viablelab-api.md'
  };
}

export class GraphValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'GraphValidationError';
    this.status = 400;
    this.code = 'invalid_graph';
    this.details = details;
  }
}

export const RUN_LIMITS = Object.freeze({ max_model_calls: [1, 60], timeout_seconds: [10, 120] });

function validRunLimits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, n]) => RUN_LIMITS[key] && Number.isInteger(n) && n >= RUN_LIMITS[key][0] && n <= RUN_LIMITS[key][1]);
}

const SETTING_PATH = /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/;
const shortText = (value, max) => typeof value === 'string' && value.length <= max;

// Settings shown on a group's block: { step, key, label? }, a dot path in one of the group's own steps.
const validGroupSettings = (settings, nodes) => Array.isArray(settings) && settings.length <= 8
  && settings.every((item) => item && typeof item === 'object' && nodes.includes(item.step) && typeof item.key === 'string' && SETTING_PATH.test(item.key) && (item.label == null || shortText(item.label, 40)));

function validGroups(groups, ids) {
  if (!Array.isArray(groups) || groups.length > 50) return false;
  const grouped = new Set();
  const groupIds = new Set();
  for (const group of groups) {
    if (!group || typeof group !== 'object' || typeof group.id !== 'string' || !group.id || group.id.length > 64 || groupIds.has(group.id)) return false;
    if (group.label != null && !shortText(group.label, 80)) return false;
    if (group.description != null && !shortText(group.description, 280)) return false;
    if (group.collapsed != null && typeof group.collapsed !== 'boolean') return false;
    if (!Array.isArray(group.nodes) || group.nodes.some((id) => !ids.has(id) || grouped.has(id))) return false;
    if (group.settings != null && !validGroupSettings(group.settings, group.nodes)) return false;
    groupIds.add(group.id);
    group.nodes.forEach((id) => grouped.add(id));
  }
  return true;
}

export function validateGraph(graph, options = {}) {
  const limits = { ...DEFAULT_GRAPH_LIMITS, ...(options.limits || {}) };
  const errors = [];
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new GraphValidationError('Graph must be a JSON object.');
  }

  const graphBytes = roughJsonSize(graph);
  if (graphBytes > limits.maxGraphBytes) {
    errors.push(`Graph is too large (${graphBytes} bytes). Maximum is ${limits.maxGraphBytes} bytes.`);
  }

  // Canvas drawings are kept with the graph for collaborators; runs ignore them.
  if (!validSketch(graph.sketch)) errors.push('Graph sketch must map stroke ids to { tool, color, width, points } (at most 1,500 strokes).');

  // An agent's own run limits; without them runs get the platform's (20 model calls, 60 seconds).
  if (graph.run_limits != null && !validRunLimits(graph.run_limits)) errors.push(`Graph run_limits may set max_model_calls (${RUN_LIMITS.max_model_calls.join('–')}) and timeout_seconds (${RUN_LIMITS.timeout_seconds.join('–')}), as whole numbers.`);

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  if (!nodes.length) errors.push('Graph must contain at least one node.');
  if (nodes.length > limits.maxNodes) errors.push(`Graph has too many nodes (${nodes.length}). Maximum is ${limits.maxNodes}.`);

  const ids = new Set();
  const nodeMap = new Map();
  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      errors.push('Each node must be an object.');
      continue;
    }
    if (!node.id || typeof node.id !== 'string') {
      errors.push('Each node requires a string "id".');
      continue;
    }
    if (ids.has(node.id)) errors.push(`Duplicate node id "${node.id}".`);
    ids.add(node.id);
    nodeMap.set(node.id, node);
    if (!NODE_TYPES.includes(node.type)) {
      errors.push(`Node "${node.id}" has unknown type "${node.type}".`);
    }
    if (UNAVAILABLE_NODE_TYPES.includes(node.type)) {
      errors.push(`Node "${node.id}" uses type "${node.type}", which is not enabled yet.`);
    }
    if (node.config != null && (typeof node.config !== 'object' || Array.isArray(node.config))) {
      errors.push(`Node "${node.id}" config must be an object.`);
    } else if (roughJsonSize(node.config || {}) > limits.maxConfigBytes) {
      errors.push(`Node "${node.id}" config is too large. Maximum is ${limits.maxConfigBytes} bytes.`);
    }
  }

  if (!graph.entry || !ids.has(graph.entry)) {
    errors.push('Graph "entry" must reference an existing node id.');
  }

  // Canvas groups: a frame around steps that belong together, for the editor only; runs ignore them.
  if (graph.groups != null && !validGroups(graph.groups, ids)) errors.push('Graph groups must be a list of at most 50 { id, label (at most 80 characters), description (at most 280), nodes: [step ids], collapsed, settings }, with each step in at most one group. settings lists at most 8 { step, key, label } shown on the block: step is one of the group\'s steps, key a setting path such as params.temperature, label at most 40 characters.');

  // Reference integrity for next / branches.
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    for (const ref of referencedNodeIds(node)) {
      if (ref && !ids.has(ref)) {
        errors.push(`Node "${node.id}" references missing node "${ref}".`);
      }
    }
    if (node.type === 'condition' && !node.config?.field && !node.config?.expr && !Array.isArray(node.config?.cases)) {
      errors.push(`Condition node "${node.id}" needs a field to branch on (or an advanced expression).`);
    }
    if (node.type === 'llm' && !node.config?.model) {
      errors.push(`LLM node "${node.id}" requires config.model.`);
    }
    if (node.type === 'llm' && Array.isArray(node.config?.outputs) && node.config.outputs.length > limits.maxStructuredOutputs) {
      errors.push(`LLM node "${node.id}" declares too many structured outputs. Maximum is ${limits.maxStructuredOutputs}.`);
    }
    if (node.type === 'llm') errors.push(...outputErrors(node));
    if (node.type === 'image' && !node.config?.model) {
      errors.push(`Image node "${node.id}" requires config.model.`);
    }
    if (node.type === 'speech' && !node.config?.model) {
      errors.push(`Speech node "${node.id}" requires config.model (a speech model).`);
    }
    if (node.type === 'transcribe' && !node.config?.model) {
      errors.push(`Transcribe node "${node.id}" requires config.model (a transcription model).`);
    }
    if (node.type === 'http' && !node.config?.url) {
      errors.push(`HTTP node "${node.id}" requires config.url.`);
    }
    errors.push(...validateOrchestrationNode(node));
    if (node.type === 'component') errors.push(...componentErrors(node, options.componentRuns));
  }

  for (const node of nodes) {
    if (node?.type === 'each' && node.branches?.each && ids.has(node.branches.each)) errors.push(...eachBodyErrors(node, nodeMap));
  }

  const hasOutput = nodes.some((n) => n?.type === 'output');
  if (!hasOutput) errors.push('Graph must contain at least one "output" node.');
  if (graph.entry && ids.has(graph.entry)) {
    const reachable = reachableNodeIds(graph.entry, nodeMap);
    const reachableOutput = nodes.some((n) => n?.type === 'output' && reachable.has(n.id));
    if (!reachableOutput) errors.push('Graph entry must be able to reach at least one "output" node.');
  }

  if (errors.length) {
    throw new GraphValidationError('Graph validation failed.', errors);
  }
  return graph;
}

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
// A list output ({ type: 'list', max_items, fields }) holds text, or items with up to 10 text, number or
// true/false fields. Other outputs are checked as they always were, so older graphs keep saving.
function outputErrors(node) {
  const outputs = node.config?.outputs;
  if (outputs == null) return [];
  const label = `LLM node "${node.id}"`;
  if (!Array.isArray(outputs)) return [`${label} outputs must be a list of { name, type, description }.`];
  const errors = [];
  for (const o of outputs) {
    if (o?.type !== 'list') continue;
    const list = `${label} list "${o.name}"`;
    if (o.max_items != null && (!Number.isInteger(o.max_items) || o.max_items < 1 || o.max_items > 10)) errors.push(`${list} max_items must be between 1 and 10.`);
    if (o.fields == null) continue;
    if (!Array.isArray(o.fields) || o.fields.length > 10) {
      errors.push(`${list} may have at most 10 fields.`);
      continue;
    }
    const names = o.fields.map((f) => f?.name);
    if (o.fields.some((f) => !f || !FIELD_NAME.test(f.name || ''))) errors.push(`${list} field names must be letters, numbers or _, starting with a letter or _.`);
    else if (new Set(names).size !== names.length) errors.push(`${list} field names must be unique.`);
    if (o.fields.some((f) => f?.type != null && !['string', 'number', 'boolean'].includes(f.type))) errors.push(`${list} fields must be string, number or boolean.`);
  }
  return errors;
}

function validateOrchestrationNode(node) {
  const cfg = node.config || {};
  const errors = [];
  const label = `${node.type[0].toUpperCase()}${node.type.slice(1)} node "${node.id}"`;
  if (['router', 'agent', 'vetting'].includes(node.type) && !cfg.model) errors.push(`${label} requires config.model.`);
  if (node.type === 'image') {
    if (cfg.on_error != null && !['stop', 'continue'].includes(cfg.on_error)) errors.push(`${label} on_error must be stop or continue.`);
    if (cfg.max_attempts != null && (!Number.isInteger(cfg.max_attempts) || cfg.max_attempts < 1 || cfg.max_attempts > 2)) errors.push(`${label} max_attempts must be 1 or 2.`);
    if (typeof cfg.operation === 'string' && cfg.operation && !cfg.operation.includes('{{') && !['generate', 'edit', 'auto'].includes(cfg.operation)) errors.push(`${label} operation must be generate, edit or auto (or a template).`);
    if (cfg.items != null && typeof cfg.items !== 'string' && !Array.isArray(cfg.items)) errors.push(`${label} items must be a list, or a template that gives one such as {{plan.json.pictures}}.`);
    if (cfg.max_items != null && (!Number.isInteger(cfg.max_items) || cfg.max_items < 1 || cfg.max_items > 6)) errors.push(`${label} max_items must be between 1 and 6.`);
    if (cfg.remember != null && typeof cfg.remember !== 'boolean') errors.push(`${label} remember must be true or false.`);
    if (cfg.fallback_prompt != null && typeof cfg.fallback_prompt !== 'string') errors.push(`${label} fallback_prompt must be text (a template).`);
  }
  if (node.type === 'vetting') {
    if (cfg.mode != null && !['simple', 'full'].includes(cfg.mode)) errors.push(`${label} mode must be simple or full.`);
    if (cfg.mode === 'full' && cfg.items == null && (!cfg.question || !cfg.answer_key)) errors.push(`${label} needs config.question and config.answer_key (or config.items) in full mode.`);
    if (cfg.max_attempts != null && (!Number.isInteger(Number(cfg.max_attempts)) || Number(cfg.max_attempts) < 1 || Number(cfg.max_attempts) > 10)) errors.push(`${label} max_attempts must be between 1 and 10.`);
    errors.push(...vettingControlErrors(agentVettingControls(cfg), label));
    if (cfg.draft != null && typeof cfg.draft !== 'string') errors.push(`${label} draft must be text, such as {{answer.content}}.`);
  }
  // A case's name, shown on its connection and in the trace; routing never reads it.
  if (node.type === 'condition' && Array.isArray(cfg.cases) && cfg.cases.some((item) => item?.label != null && (typeof item.label !== 'string' || !item.label.trim() || item.label.trim().length > 60))) {
    errors.push(`${label} case labels must be text of 1 to 60 characters, such as "A picture plan is incomplete".`);
  }
  if (node.type === 'subagent' && !cfg.slug) errors.push(`${label} requires config.slug, the published agent to call.`);
  if (node.type === 'router') {
    const routes = routerRoutes(cfg);
    if (!Array.isArray(cfg.routes) || !cfg.routes.length) errors.push(`${label} requires config.routes.`);
    else if (routes.length !== cfg.routes.length) errors.push(`${label} route names must be lowercase letters, numbers, - or _, and not "fallback".`);
    if (new Set(routes.map((route) => route.name)).size !== routes.length) errors.push(`${label} has duplicate route names.`);
    if (routes.length > 12) errors.push(`${label} supports at most 12 routes.`);
  }
  if (node.type === 'each') {
    if (cfg.items == null || cfg.items === '') errors.push(`${label} requires config.items, the list to go through, such as {{plan.json.questions}}.`);
    if (cfg.max_items != null && (!Number.isInteger(cfg.max_items) || cfg.max_items < 1 || cfg.max_items > 25)) errors.push(`${label} max_items must be between 1 and 25.`);
    if (cfg.as != null && !/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(cfg.as)) errors.push(`${label} as must be a name of letters, numbers or _, such as question.`);
  }
  if (node.type === 'parallel') {
    const paths = parallelPaths(cfg);
    if (!Array.isArray(cfg.paths)) errors.push(`${label} requires config.paths.`);
    else if (paths.length !== cfg.paths.length || new Set(paths).size !== paths.length) errors.push(`${label} path names must be unique lowercase handle names, not "join".`);
    else if (paths.length < 2 || paths.length > 6) errors.push(`${label} needs between 2 and 6 paths.`);
  }
  if (node.type === 'knowledge' || (node.type === 'agent' && cfg.tools?.knowledge_bases != null)) {
    const ids = node.type === 'knowledge' ? cfg.knowledge_bases : cfg.tools.knowledge_bases;
    if (!Array.isArray(ids) || !ids.length || ids.length > 5 || ids.some((id) => typeof id !== 'string' || !id)) {
      errors.push(`${label} needs between 1 and 5 knowledge base IDs${node.type === 'agent' ? ' in tools.knowledge_bases' : ' in config.knowledge_bases'}.`);
    }
  }
  if (node.type === 'agent' && cfg.tools?.agents != null && (!Array.isArray(cfg.tools.agents) || cfg.tools.agents.length > 5 || cfg.tools.agents.some((slug) => typeof slug !== 'string' || !slug))) {
    errors.push(`${label} tools.agents must list at most 5 agent slugs.`);
  }
  if (node.type === 'guardrail') {
    const checks = Array.isArray(cfg.checks) ? cfg.checks : [];
    if (!checks.length || checks.some((check) => !GUARDRAIL_CHECKS.includes(check))) errors.push(`${label} config.checks must list one or more of ${GUARDRAIL_CHECKS.join(', ')}.`);
    if (checks.some((check) => GUARDRAIL_MODEL_CHECKS.includes(check)) && !cfg.model) errors.push(`${label} needs config.model for model-based checks.`);
  }
  if (node.type === 'memory') {
    if (cfg.mode != null && !['recall', 'save', 'extract'].includes(cfg.mode)) errors.push(`${label} mode must be recall, save or extract.`);
    if (cfg.mode === 'extract' && !cfg.model) errors.push(`${label} needs config.model to extract memories.`);
    if (cfg.mode === 'save' && !cfg.content) errors.push(`${label} needs config.content to save.`);
  }
  if (node.type === 'state') {
    const items = cfg.assignments;
    if (items != null && (!Array.isArray(items) || items.length > 20 || items.some((item) => !item || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(item.name || '')))) {
      errors.push(`${label} assignments need valid variable names (at most 20).`);
    }
    if (cfg.scope != null && !['run', 'conversation'].includes(cfg.scope)) errors.push(`${label} scope must be run or conversation.`);
  }
  return errors;
}

// A Component step's manifest is inline: it fits schemas/component.schema.json, fills the step slot and
// runs in a way this host can (componentRuns: http and mcp unless the host says fewer); its inputs name
// only fields the manifest receives.
function componentErrors(node, componentRuns = ['http', 'mcp']) {
  const cfg = node.config || {};
  const label = `Component node "${node.id}"`;
  const manifest = cfg.manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return [`${label} requires config.manifest, the component's manifest as JSON (schemas/component.schema.json).`];
  const errors = checkSchema(schemaFor('component'), manifest).map((error) => `${label} manifest ${error}.`);
  if (errors.length) return errors;
  const { id, runs, receives } = manifest;
  if (manifest.slot !== 'step') errors.push(`${label} runs ${id}, a ${manifest.slot} component; a Component step runs step components.`);
  if (runs.kind === 'core') errors.push(`${label}: ${id} runs in the harness's own process${runs.step_type ? `, as the ${runs.step_type} step` : ''}, not as a Component step.`);
  else if (!componentRuns.includes(runs.kind)) errors.push(`${label} runs ${id} over ${runs.kind}, which this host can't: it runs only ${componentRuns.join(' and ')} components.${runs.kind === 'mcp' ? ' An MCP server runs with viable-harness on your own machine.' : ''}`);
  else if (runs.kind === 'http' && entryProblem(manifest)) errors.push(`${label}: ${entryProblem(manifest)}`);
  const inputs = cfg.inputs ?? {};
  if (typeof inputs !== 'object' || Array.isArray(inputs)) errors.push(`${label} inputs must map fields the component receives to values, such as { "learner_message": "{{input}}" }.`);
  else {
    const extra = Object.keys(inputs).filter((key) => !receives.includes(key));
    if (extra.length) errors.push(`${label} sends ${extra.join(', ')}, which ${id} doesn't receive (it receives ${receives.join(', ') || 'nothing'}).`);
  }
  if (cfg.on_error != null && !['stop', 'continue'].includes(cfg.on_error)) errors.push(`${label} on_error must be stop or continue.`);
  return errors;
}

export function referencedNodeIds(node) {
  const refs = [];
  if (node.next) refs.push(node.next);
  if (node.branches && typeof node.branches === 'object') {
    for (const value of Object.values(node.branches)) {
      if (typeof value === 'string') refs.push(value);
    }
  }
  if (Array.isArray(node.config?.cases)) {
    for (const c of node.config.cases) {
      if (c && typeof c.to === 'string') refs.push(c.to);
    }
    if (typeof node.config?.default === 'string') refs.push(node.config.default);
  }
  return refs;
}

// Where steps without saved coordinates go: a column per step from the entry, so a graph made through
// the API or CLI reads left to right (in its card and when first opened) before anyone lays it out.
export function layeredPositions(graph) {
  const nodes = (Array.isArray(graph?.nodes) ? graph.nodes : []).filter((node) => node && typeof node.id === 'string');
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const start = byId.has(graph?.entry) ? graph.entry : nodes[0]?.id;
  const depth = new Map(start ? [[start, 0]] : []);
  for (const id of depth.keys()) {
    for (const target of referencedNodeIds(byId.get(id))) if (byId.has(target) && !depth.has(target)) depth.set(target, depth.get(id) + 1);
  }
  const unreached = Math.max(-1, ...depth.values()) + 1;
  const rows = new Map();
  return Object.fromEntries(nodes.map((node) => {
    const column = depth.get(node.id) ?? unreached;
    const row = rows.get(column) || 0;
    rows.set(column, row + 1);
    return [node.id, { x: column * 260, y: row * 130 }];
  }));
}

// A For each step's body runs once per item: it starts at branches.each and comes back to the step
// (a body step's next is the For each step). It can't reply or ask, and can't run on past the loop.
function eachBodyErrors(node, nodeMap) {
  const label = `Each node "${node.id}"`;
  const seen = new Set();
  const stack = [node.branches.each];
  let returns = false;
  const errors = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === node.id) { returns = true; continue; }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const step = nodeMap.get(id);
    if (!step) continue;
    if (step.type === 'output' || step.type === 'ask') errors.add(`${label}: step "${id}" is inside the loop, so it can't reply or ask. Reply after the loop, from branches.done.`);
    if (id === node.branches.done) errors.add(`${label}: the loop body reaches "${id}", the step after the loop. Point the body's last step back to "${node.id}".`);
    stack.push(...referencedNodeIds(step));
  }
  if (!returns) errors.add(`${label}: no step in the loop body goes back to "${node.id}". Set the last body step's next to "${node.id}".`);
  return [...errors];
}

function reachableNodeIds(entry, nodeMap) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = nodeMap.get(id);
    if (!node) continue;
    for (const ref of referencedNodeIds(node)) {
      if (ref && !seen.has(ref)) stack.push(ref);
    }
  }
  return seen;
}

/** Model ids referenced by model-calling nodes. */
export function collectGraphModels(graph) {
  const models = new Set();
  for (const node of graph?.nodes || []) {
    if (MODEL_NODE_TYPES.has(node?.type) && node.config?.model) {
      models.add(String(node.config.model));
    }
    if (node?.type === 'vetting') {
      models.add(String(node.config?.verification_model || DEFAULT_VETTING_REVIEWER));
    }
  }
  return [...models];
}

function roughJsonSize(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  } catch (_) {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'agent';
}

// A course package names knowledge bases by ref: a Knowledge step's
// config.knowledge_base_refs and an Agent step's config.tools.knowledge_base_refs.
export const graphKnowledgeRefs = (graph) => (Array.isArray(graph?.nodes) ? graph.nodes : []).flatMap((node) => [node?.config?.knowledge_base_refs, node?.config?.tools?.knowledge_base_refs].filter(Array.isArray).flat());

/** A package's graph with its knowledge base refs as the IDs the engine reads (idOf: ref → ID). */
export function linkKnowledgeRefs(graph, idOf) {
  if (!Array.isArray(graph?.nodes)) return graph;
  return { ...graph, nodes: graph.nodes.map((node) => {
    let config = node?.config;
    if (Array.isArray(config?.knowledge_base_refs)) { const { knowledge_base_refs: refs, ...rest } = config; config = { ...rest, knowledge_bases: refs.map(idOf) }; }
    if (Array.isArray(config?.tools?.knowledge_base_refs)) { const { knowledge_base_refs: refs, ...tools } = config.tools; config = { ...config, tools: { ...tools, knowledge_bases: refs.map(idOf) } }; }
    return config === node?.config ? node : { ...node, config };
  }) };
}

/** The agents a graph calls, by slug: its Sub-agent steps and its Agent steps' tools.agents. */
export const graphAgentSlugs = (graph) => [...new Set((Array.isArray(graph?.nodes) ? graph.nodes : []).flatMap((node) => [node?.type === 'subagent' ? node.config?.slug : null, ...(Array.isArray(node?.config?.tools?.agents) ? node.config.tools.agents : [])]).filter(Boolean))];

/** A graph with those slugs replaced (slugOf: a slug's new one, or nothing to keep it). */
export function linkAgentSlugs(graph, slugOf) {
  if (!Array.isArray(graph?.nodes)) return graph;
  return { ...graph, nodes: graph.nodes.map((node) => {
    let config = node?.config;
    if (node?.type === 'subagent' && config?.slug) config = { ...config, slug: slugOf(config.slug) ?? config.slug };
    if (Array.isArray(config?.tools?.agents)) config = { ...config, tools: { ...config.tools, agents: config.tools.agents.map((slug) => slugOf(slug) ?? slug) } };
    return config === node?.config ? node : { ...node, config };
  }) };
}
