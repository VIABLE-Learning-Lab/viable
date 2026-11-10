/**
 * Checks a file against the open formats (schemas/*.schema.json, checked by checkSchema in schemas.js). A
 * host that runs agents passes its graph checks too: the Engine's validateDocument does.
 */
import { KINDS, checkSchema, schemaFor } from './schemas.js';

export { KINDS, SCHEMA_BASE, checkSchema, schemaFor } from './schemas.js';

/** Which of the harness's formats a document is in. */
export function kindOf(doc) {
  if (doc?.format === 'viable.agent') return 'agent';
  if (doc?.format === 'viable.course-package') return 'course-package';
  if (Array.isArray(doc?.events)) return 'learning-events';
  if (typeof doc?.slot === 'string' && typeof doc?.id === 'string' && doc?.runs) return 'component';
  return 'teaching';
}

function graphErrors(graph, where, validateGraph) {
  try { validateGraph(graph); return []; } catch (error) { return [`${where}: ${[error.message, ...(error.details || [])].join(' ')}`]; }
}

// A package's parts refer to each other by ref, and these are checked as VIABLE checks a package it imports.
function refErrors(pkg, graphKnowledgeRefs) {
  const errors = [];
  const refs = (list) => new Set((Array.isArray(list) ? list : []).map((item) => item?.ref));
  const agents = refs(pkg.agents);
  const sets = refs(pkg.question_sets);
  const units = refs(pkg.course?.units);
  const goals = refs(pkg.course?.goals);
  const files = refs(pkg.files);
  const knowledgeBases = refs(pkg.knowledge_bases);
  (pkg.knowledge_bases || []).forEach((kb, i) => (kb?.file_refs || []).forEach((ref, j) => { if (!files.has(ref)) errors.push(`$.knowledge_bases[${i}].file_refs[${j}]: the package has no file "${ref}"`); }));
  if (graphKnowledgeRefs) (pkg.agents || []).forEach((agent, i) => graphKnowledgeRefs(agent?.graph).forEach((ref) => { if (!knowledgeBases.has(ref)) errors.push(`$.agents[${i}].graph: the package has no knowledge base "${ref}"`); }));
  (pkg.course?.goals || []).forEach((goal, i) => { if (goal?.unit_ref != null && !units.has(goal.unit_ref)) errors.push(`$.course.goals[${i}].unit_ref: the package has no unit "${goal.unit_ref}"`); });
  (pkg.course?.activities || []).forEach((activity, i) => {
    const where = `$.course.activities[${i}]`;
    (activity?.goals || []).forEach((ref, j) => { if (!goals.has(ref)) errors.push(`${where}.goals[${j}]: the package has no goal "${ref}"`); });
    if (activity?.agent_ref != null && !agents.has(activity.agent_ref)) errors.push(`${where}.agent_ref: the package has no agent "${activity.agent_ref}"`);
    if (activity?.unit_ref != null && !units.has(activity.unit_ref)) errors.push(`${where}.unit_ref: the package has no unit "${activity.unit_ref}"`);
    (activity?.workspace?.panels || []).forEach((panel, j) => {
      if (panel?.type === 'questions' && !sets.has(panel.set_ref)) errors.push(`${where}.workspace.panels[${j}].set_ref: the package has no question set "${panel.set_ref}"`);
      if (panel?.type === 'reading' && panel.file_ref != null && !files.has(panel.file_ref)) errors.push(`${where}.workspace.panels[${j}].file_ref: the package has no file "${panel.file_ref}"`);
    });
  });
  return errors;
}

/**
 * A document's errors in its format (detected, or given as kind). Model names aren't checked: a
 * local run sends them to your endpoint (VIABLE's import checks them against its own list).
 */
export function validateDocument(doc, kind = kindOf(doc), graph = null) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown format "${kind}"; one of ${KINDS.join(', ')}.`);
  const errors = checkSchema(schemaFor(kind), doc);
  if (!errors.length && kind === 'agent' && graph) errors.push(...graphErrors(doc.graph, '$.graph', graph.validateGraph));
  if (!errors.length && kind === 'course-package') {
    // Knowledge bases named by ref stand in for IDs, as on import.
    if (graph) doc.agents?.forEach((agent, i) => errors.push(...graphErrors(graph.linkKnowledgeRefs(agent.graph, (ref) => `kb_${ref}`), `$.agents[${i}].graph`, graph.validateGraph)));
    errors.push(...refErrors(doc, graph?.graphKnowledgeRefs));
  }
  return { kind, errors };
}
