/**
 * Agent graph schema: validation, model extraction, and slug helpers.
 *
 * The graph JSON is the canonical artifact shared by the visual canvas and the
 * runtime. Shape:
 *   { version, name, entry, variables, nodes: [...], edges: [...] }
 *   node: { id, type, config, next?, branches? }
 * `edges` is visual-only metadata and is ignored by the engine.
 */

import { MODEL_REGISTRY, normalizeModelId, resolveAlias } from '../config/models.js';

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

export class GraphValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'GraphValidationError';
    this.status = 400;
    this.code = 'invalid_graph';
    this.details = details;
  }
}

export function validateGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new GraphValidationError('Graph must be a JSON object.');
  }

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  if (!nodes.length) errors.push('Graph must contain at least one node.');

  const ids = new Set();
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
    if (!NODE_TYPES.includes(node.type)) {
      errors.push(`Node "${node.id}" has unknown type "${node.type}".`);
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
    if (node.type === 'image' && !node.config?.model) {
      errors.push(`Image node "${node.id}" requires config.model.`);
    }
  }

  const hasOutput = nodes.some((n) => n?.type === 'output');
  if (!hasOutput) errors.push('Graph must contain at least one "output" node.');

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
export function validateGraphModels(graph, { allowedModels = null } = {}) {
  const errors = [];
  const allowSet = Array.isArray(allowedModels) && allowedModels.length
    ? new Set(allowedModels.flatMap((m) => [normalizeModelId(m), resolveAlias(normalizeModelId(m))]))
    : null;

  for (const model of collectGraphModels(graph)) {
    if (!isListedModel(model)) {
      errors.push(`Model "${model}" is not available on the VIABLE Lab API.`);
      continue;
    }
    if (allowSet) {
      const normalized = normalizeModelId(model);
      if (!allowSet.has(normalized) && !allowSet.has(resolveAlias(normalized))) {
        errors.push(`API key is not allowed to use model "${model}".`);
      }
    }
  }

  if (errors.length) {
    throw new GraphValidationError('Graph references unavailable models.', errors);
  }
  return graph;
}

export function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'agent';
}
