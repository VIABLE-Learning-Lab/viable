/**
 * The Engine's conformance: the graph and expression suites, and the Harness's teaching and vetting suites
 * run through a real agent run, so what a step sends and what the Harness says it sends have to agree.
 */
import { RUN as HARNESS, SUITES as HARNESS_SUITES, loadSuite as loadHarnessSuite, runSuite as runHarnessSuite } from '../../harness/src/conformance.js';
import { evaluateExpression, renderTemplate } from './agents/expression.js';
import { validateGraph } from './agents/graph.js';
import { runAgent } from './run.js';
import { validateDocument } from './validate.js';

export { compare } from '../../harness/src/conformance.js';

const ROOT = new URL('../', import.meta.url);
export const SUITES = ['formats', 'graph', 'expressions', 'teaching', 'vetting', 'measures', 'xapi'];
const OWN = new Set(['graph', 'expressions']);
const NO_USAGE = { prompt: 0, completion: 0, total: 0 };
const failure = (error) => ({ error: true, message: String(error?.message || error) });

// The instructions (system message) of each model call an agent of one step makes, with a scripted model.
async function instructions(step, { teaching = null, section = null, message = null, replies = ['What have you tried so far?', 'PASS'] } = {}) {
  const sent = [];
  const callChatModel = async (_env, request) => {
    sent.push(request.messages.find((message) => message.role === 'system')?.content ?? '');
    return { content: replies[Math.min(sent.length, replies.length) - 1], usage: NO_USAGE, cost: 0 };
  };
  const graph = { entry: 'in', nodes: [{ id: 'in', type: 'input', next: 'step' }, { id: 'step', next: 'out', ...step }, { id: 'out', type: 'output', config: { text: 'done' } }] };
  await runAgent(graph, { input: message ?? 'Can you help me with this?', teaching: teaching ?? false, section, services: { callChatModel } });
  return sent;
}

const RUN = {
  ...HARNESS,
  formats({ kind, document, file }) {
    if (file) return HARNESS.formats({ kind, document, file });
    const { errors } = validateDocument(document, kind);
    return { valid: !errors.length, errors: [...new Set(errors.map((error) => error.slice(0, error.indexOf(': '))))].sort() };
  },
  graph({ graph }) {
    try {
      validateGraph(graph);
      return { valid: true };
    } catch (error) {
      return { valid: false, code: error.code ?? null, text: [error.message, ...(error.details || [])].join('\n') };
    }
  },
  expressions({ expression, template, scope = {} }) {
    try {
      return template != null ? { text: renderTemplate(template, scope) } : { value: evaluateExpression(expression, scope) };
    } catch (error) {
      return failure(error);
    }
  },
  async teaching({ teaching = null, section = null }) {
    const [text] = await instructions({ type: 'llm', config: { model: 'local', system: 'You are a tutor.' } }, { teaching, section });
    return { text };
  },
  async vetting(input) {
    if (typeof input.reviewer === 'string' || typeof input.reply === 'string' || input.answer !== undefined) return HARNESS.vetting(input);
    const [generation, verification] = await instructions({ type: 'vetting', config: { model: 'local', ...(input.config || {}) } }, { teaching: input.teaching ?? null, message: input.message ?? null });
    return { text: input.prompt === 'verification' ? verification : generation };
  }
};

export const loadSuite = (name) => (OWN.has(name) ? loadHarnessSuite(name, { suites: SUITES, root: ROOT }) : loadHarnessSuite(name, { suites: HARNESS_SUITES }));
export const runSuite = (doc) => runHarnessSuite(doc, { run: RUN, exact: new Set(['expressions']) });

/** Runs the named suites (all of them by default). */
export async function runConformance(names = SUITES) {
  const results = [];
  for (const name of names) results.push(await runSuite(loadSuite(name)));
  return results;
}
