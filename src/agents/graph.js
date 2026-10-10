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

export const NODE_TYPES = Object.freeze([
  'input',
  'llm',
  'condition',
  'image',
  'http',
  'loop',
  'transform',
  'output',
  'subagent'
]);

export const DEFAULT_GRAPH_LIMITS = Object.freeze({
  maxNodes: 100,
  maxGraphBytes: 262144,
  maxConfigBytes: 32768,
  maxStructuredOutputs: 20
});

// Node types the validator rejects today. They stay in NODE_TYPES so a graph naming one gets a precise error.
export const UNAVAILABLE_NODE_TYPES = Object.freeze(['subagent']);

// What validateGraph requires of a node's config, for the published schema: `all` keys must be present and
// at least one `any` key must be. A test builds configs from this and checks the validator agrees both ways.
export const NODE_REQUIREMENTS = Object.freeze({
  llm: Object.freeze({ all: Object.freeze(['model']) }),
  image: Object.freeze({ all: Object.freeze(['model']) }),
  http: Object.freeze({ all: Object.freeze(['url']) }),
  condition: Object.freeze({ any: Object.freeze(['field', 'expr', 'cases']) })
});

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
        edges: 'Optional visual metadata; routing comes from node next, branches, and condition cases.'
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
      `An llm node may declare at most ${limits.maxStructuredOutputs} structured outputs.`
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
    if (node.type === 'subagent' && options.allowSubagents !== true) {
      errors.push(`Sub-agent node "${node.id}" is not enabled yet.`);
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

/** Model ids referenced by llm/image nodes. */
export function collectGraphModels(graph) {
  const models = new Set();
  for (const node of graph?.nodes || []) {
    if ((node?.type === 'llm' || node?.type === 'image') && node.config?.model) {
      models.add(String(node.config.model));
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
    if (!allowUnlisted && !isListedModel(model)) {
      errors.push(`Model "${model}" is not available on the VIABLE API.`);
      continue;
    }
    if (allowSet) {
      const normalized = normalizeModelId(model);
      if (!allowSet.has(normalized) && !allowSet.has(resolveAlias(normalized))) {
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
