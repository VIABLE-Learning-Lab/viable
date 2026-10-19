/**
 * Agent graph schema: validation, model extraction, and slug helpers.
 *
 * The graph JSON is the canonical artifact shared by the visual canvas and the
 * runtime. Shape:
 *   { version, name, entry, variables, nodes: [...], edges: [...] }
 *   node: { id, type, config, next?, branches? }
 * `edges` is visual-only metadata and is ignored by the engine.
 */

import { MODEL_REGISTRY, assertModelNotRetired, normalizeModelId, resolveAlias } from '../config/models.js';
import { isProviderKeyModel, modelAllowedBy } from '../utils/providerKeys.js';
import { validSketch } from '../utils/agentCollaboration.js';

export const NODE_TYPES = Object.freeze([
  'input',
  'llm',
  'condition',
  'image',
  'http',
  'loop',
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
  'vetting'
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

// Nodes that call a chat model. Memory and guardrail call one only in some modes.
const MODEL_NODE_TYPES = new Set(['llm', 'image', 'router', 'agent', 'guardrail', 'memory', 'vetting']);
export const GUARDRAIL_MODEL_CHECKS = Object.freeze(['jailbreak', 'moderation', 'off_topic', 'custom']);
export const GUARDRAIL_CHECKS = Object.freeze(['pii', ...GUARDRAIL_MODEL_CHECKS]);
const HANDLE_NAME = /^[a-z][a-z0-9_-]{0,39}$/;

// What validateGraph requires of a node's config, for the published schema: `all` keys must be present and
// at least one `any` key must be. A test builds configs from this and checks the validator agrees both ways.
export const NODE_REQUIREMENTS = Object.freeze({
  llm: Object.freeze({ all: Object.freeze(['model']) }),
  image: Object.freeze({ all: Object.freeze(['model']) }),
  http: Object.freeze({ all: Object.freeze(['url']) }),
  condition: Object.freeze({ any: Object.freeze(['field', 'expr', 'cases']) }),
  subagent: Object.freeze({ all: Object.freeze(['slug']) }),
  router: Object.freeze({ all: Object.freeze(['model', 'routes']) }),
  agent: Object.freeze({ all: Object.freeze(['model']) }),
  knowledge: Object.freeze({ all: Object.freeze(['knowledge_bases']) }),
  guardrail: Object.freeze({ all: Object.freeze(['checks']) }),
  parallel: Object.freeze({ all: Object.freeze(['paths']) }),
  vetting: Object.freeze({ all: Object.freeze(['model']) })
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
        run_limits: 'Optional limits for each run: max_model_calls (1–60, default 20) and timeout_seconds (10–120, default 60) for runs a caller waits on. Background jobs get at least 5 minutes.'
      }
    },
    node_types: NODE_TYPES.map((type) => ({
      type,
      available: !UNAVAILABLE_NODE_TYPES.includes(type),
      requires: describeRequirement(NODE_REQUIREMENTS[type]),
      ...(UNAVAILABLE_NODE_TYPES.includes(type) ? { note: 'Reserved. Validation rejects this type until it is enabled.' } : {})
    })),
    limits: { ...limits },
    rules: [
      `A graph needs at least one node and at most ${limits.maxNodes}.`,
      `A graph may be at most ${limits.maxGraphBytes} bytes and a node config at most ${limits.maxConfigBytes} bytes.`,
      'Every node needs a unique string id and a known, available type.',
      'entry must name an existing node.',
      'Every next, branches, and condition case target must name an existing node.',
      'At least one output node must be reachable from entry.',
      `An llm node may declare at most ${limits.maxStructuredOutputs} structured outputs.`,
      `run_limits may set max_model_calls (${RUN_LIMITS.max_model_calls.join('–')}) and timeout_seconds (${RUN_LIMITS.timeout_seconds.join('–')}).`
    ],
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
    if (node.type === 'image' && !node.config?.model) {
      errors.push(`Image node "${node.id}" requires config.model.`);
    }
    if (node.type === 'http' && !node.config?.url) {
      errors.push(`HTTP node "${node.id}" requires config.url.`);
    }
    errors.push(...validateOrchestrationNode(node));
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

function validateOrchestrationNode(node) {
  const cfg = node.config || {};
  const errors = [];
  const label = `${node.type[0].toUpperCase()}${node.type.slice(1)} node "${node.id}"`;
  if (['router', 'agent', 'vetting'].includes(node.type) && !cfg.model) errors.push(`${label} requires config.model.`);
  if (node.type === 'vetting') {
    if (cfg.mode != null && !['simple', 'full'].includes(cfg.mode)) errors.push(`${label} mode must be simple or full.`);
    if (cfg.mode === 'full' && cfg.items == null && (!cfg.question || !cfg.answer_key)) errors.push(`${label} needs config.question and config.answer_key (or config.items) in full mode.`);
    if (cfg.max_attempts != null && (!Number.isInteger(Number(cfg.max_attempts)) || Number(cfg.max_attempts) < 1 || Number(cfg.max_attempts) > 10)) errors.push(`${label} max_attempts must be between 1 and 10.`);
  }
  if (node.type === 'subagent' && !cfg.slug) errors.push(`${label} requires config.slug, the published agent to call.`);
  if (node.type === 'router') {
    const routes = routerRoutes(cfg);
    if (!Array.isArray(cfg.routes) || !cfg.routes.length) errors.push(`${label} requires config.routes.`);
    else if (routes.length !== cfg.routes.length) errors.push(`${label} route names must be lowercase letters, numbers, - or _, and not "fallback".`);
    if (new Set(routes.map((route) => route.name)).size !== routes.length) errors.push(`${label} has duplicate route names.`);
    if (routes.length > 12) errors.push(`${label} supports at most 12 routes.`);
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

function referencedNodeIds(node) {
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

function isListedModel(model) {
  const normalized = normalizeModelId(model);
  if (!normalized) return false;
  return Boolean(MODEL_REGISTRY[resolveAlias(normalized)]);
}

/**
 * Ensure every model referenced by the graph is listed in the registry and,
 * when the key restricts models, allowed by that key.
 */
export function validateGraphModels(graph, { allowedModels = null, allowUnlisted = false } = {}) {
  const errors = [];
  let hasPermissionError = false;
  const allowSet = Array.isArray(allowedModels) && allowedModels.length
    ? new Set(allowedModels.flatMap((m) => {
      const normalized = normalizeModelId(m);
      return normalized ? [normalized, resolveAlias(normalized)] : [];
    }))
    : null;

  for (const model of collectGraphModels(graph)) {
    assertModelNotRetired(model);
    if (!allowUnlisted && !isProviderKeyModel(model) && !isListedModel(model)) {
      errors.push(`Model "${model}" is not available on the VIABLE API.`);
      continue;
    }
    if (allowSet) {
      if (!modelAllowedBy(allowSet, model)) {
        hasPermissionError = true;
        errors.push(`API key is not allowed to use model "${model}".`);
      }
    }
  }

  if (errors.length) {
    const error = new GraphValidationError('Graph references unavailable models.', errors);
    if (hasPermissionError) {
      error.status = 403;
      error.code = 'api_key_model_not_allowed';
    }
    throw error;
  }
  return graph;
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
