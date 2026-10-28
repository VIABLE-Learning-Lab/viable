// Field-level compare-and-set: independent fields merge; competing edits are
// rejected visibly instead of silently replacing another person's work.
import { formatDisplayName } from './displayName.js';
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => equal(value, b[index]));
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

export function draftDocument(graph) {
  const { nodes = [], ...rest } = graph;
  return { ...rest, nodes: Object.fromEntries(nodes.map(node => [node.id, node])) };
}

export function draftGraph(document) {
  return { ...document, nodes: Object.values(document.nodes) };
}

export function applyDraftChanges(document, changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 4000) throw new Error('Invalid change batch.');
  for (const change of changes) {
    const path = change.path;
    if (!Array.isArray(path) || !path.length || path.length > 16 || path.some(key => typeof key !== 'string' || !key || key.length > 256 || forbidden.has(key))
      || !['version', 'name', 'entry', 'variables', 'nodes', 'edges', 'sketch', 'run_limits'].includes(path[0]) || (path[0] === 'nodes' && path.length < 2)) throw new Error('Invalid field path.');
    let current = document;
    for (const key of path) current = current?.[key];
    if (!equal(current, change.before)) {
      const error = new Error('Someone changed the same field. Your edits are retained; review the shared draft before retrying.');
      error.code = 'draft_conflict';
      throw error;
    }
  }
  const result = structuredClone(document);
  for (const { path, after } of changes) {
    let target = result;
    for (const key of path.slice(0, -1)) {
      // Never resurrect a remotely deleted node or replace a scalar container.
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) throw new Error('Field container no longer exists.');
      target = target[key];
    }
    if (after === undefined) delete target[path.at(-1)];
    else target[path.at(-1)] = structuredClone(after);
  }
  validateDraftDocument(result);
  return result;
}

export function validateDraftDocument(document) {
  const graph = draftGraph(document);
  if ((graph.entry !== undefined && typeof graph.entry !== 'string') || (graph.name !== undefined && typeof graph.name !== 'string')
    || (graph.variables !== undefined && !object(graph.variables)) || (graph.edges !== undefined && !Array.isArray(graph.edges)) || (graph.run_limits !== undefined && !object(graph.run_limits))
    || graph.nodes.length > 1000 || graph.nodes.some(node => !node || typeof node.id !== 'string' || !node.id || typeof node.type !== 'string' || !node.type || forbidden.has(node.id)
      || (node.config !== undefined && !object(node.config)) || (node.next != null && typeof node.next !== 'string')
      || (node.branches !== undefined && (!object(node.branches) || Object.values(node.branches).some(value => typeof value !== 'string')))
      || ['x', 'y'].some(key => node[key] !== undefined && !Number.isFinite(node[key])))
    || Object.entries(document.nodes).some(([id, node]) => id !== node.id) || !validSketch(document.sketch)
    || new TextEncoder().encode(JSON.stringify(document)).length > 1024 * 1024) throw new Error('Invalid or oversized draft.');
}

// Canvas drawings: { strokeId: { tool, color, width, points: [x0, y0, x1, y1, ...] } }, keyed so
// people drawing at the same time never edit the same field.
const SKETCH_TOOLS = new Set(['pen', 'highlighter', 'arrow', 'rect']);
export function validSketch(sketch) {
  if (sketch === undefined) return true;
  if (!object(sketch) || Object.keys(sketch).length > 1500) return false;
  return Object.entries(sketch).every(([id, stroke]) => object(stroke) && /^[\w-]{1,40}$/.test(id) && SKETCH_TOOLS.has(stroke.tool)
    && typeof stroke.color === 'string' && stroke.color.length <= 32 && Number.isFinite(stroke.width) && stroke.width > 0 && stroke.width <= 40
    && Array.isArray(stroke.points) && stroke.points.length >= 2 && stroke.points.length <= 4000 && stroke.points.length % 2 === 0 && stroke.points.every(Number.isFinite));
}

export function publicPresence(session) {
  return { id: session.id, userId: session.user.id, name: formatDisplayName(session.user.display_name) || session.user.email,
    photo: /^https:\/\//.test(session.user.photo_url || '') ? session.user.photo_url : null,
    role: session.role, color: session.color, ...session.presence };
}

export function cleanPresence(value = {}) {
  const text = key => typeof value[key] === 'string' ? value[key].slice(0, 160) : null;
  return { nodeId: text('nodeId'), field: text('field'), panel: text('panel'),
    cursor: value.cursor && Number.isFinite(value.cursor.x) && Number.isFinite(value.cursor.y)
      ? { x: Math.max(-100000, Math.min(100000, value.cursor.x)), y: Math.max(-100000, Math.min(100000, value.cursor.y)), surface: ['panel', 'header'].includes(value.cursor.surface) ? value.cursor.surface : 'canvas' } : null,
    away: value.away === true, seenAt: Date.now() };
}
