// The open formats' checks, with the Engine's own checks on an agent's graph.
import { validateDocument as check, kindOf } from '../../harness/src/validate.js';
import { graphKnowledgeRefs, linkKnowledgeRefs, validateGraph } from './agents/graph.js';

export { KINDS, SCHEMA_BASE, checkSchema, kindOf, schemaFor } from '../../harness/src/validate.js';

export const validateDocument = (doc, kind = kindOf(doc)) => check(doc, kind, { graphKnowledgeRefs, linkKnowledgeRefs, validateGraph });
