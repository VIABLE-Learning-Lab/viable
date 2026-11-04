/**
 * Runs the conformance fixtures (conformance/*.json, described in conformance/README.md) against the
 * harness. The fixtures are the reference: another implementation of VIABLE's formats, expressions,
 * teaching layer, VETTING, measures or xAPI profile runs the same cases and should get the same results.
 */
import { readFileSync } from 'node:fs';
import { validateGraph } from './agents/graph.js';
import { evaluateExpression, renderTemplate } from './agents/expression.js';
import { parseSafetyPrefix, parseSimpleVerificationResult, parseVerificationResult } from './agents/vettingPrompts.js';
import { measureLearner } from './measures.js';
import { runAgent } from './run.js';
import { validateDocument } from './validate.js';
import { toStatements } from './xapi.js';

const ROOT = new URL('../', import.meta.url);
export const SUITES = ['formats', 'graph', 'expressions', 'teaching', 'vetting', 'measures', 'xapi'];

const failure = (error) => ({ error: true, message: String(error?.message || error) });
const NO_USAGE = { prompt: 0, completion: 0, total: 0 };

// The instructions (system message) of each model call an agent of one step makes, with a scripted model.
async function instructions(step, { teaching = null, section = null, replies = ['What have you tried so far?', 'PASS'] } = {}) {
  const sent = [];
  const callChatModel = async (_env, request) => {
    sent.push(request.messages.find((message) => message.role === 'system')?.content ?? '');
    return { content: replies[Math.min(sent.length, replies.length) - 1], usage: NO_USAGE, cost: 0 };
  };
  const graph = { entry: 'in', nodes: [{ id: 'in', type: 'input', next: 'step' }, { id: 'step', next: 'out', ...step }, { id: 'out', type: 'output', config: { text: '{{step.content}}' } }] };
  await runAgent(graph, { input: 'Can you help me with this?', teaching: teaching ?? false, section, services: { callChatModel } });
  return sent;
}

// Each suite turns a case's input into the result its expectations are checked against.
const RUN = {
  formats({ kind, document, file }) {
    const doc = file ? JSON.parse(readFileSync(new URL(file, ROOT), 'utf8')) : document;
    const { errors } = validateDocument(doc, kind);
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
  async vetting({ reviewer, mode = 'simple', reply, prompt, config = {}, teaching = null }) {
    if (typeof reviewer === 'string') {
      const verdict = mode === 'full' ? parseVerificationResult(reviewer) : parseSimpleVerificationResult(reviewer);
      return { passed: verdict.passed, reason: verdict.passed ? null : verdict.reason };
    }
    if (typeof reply === 'string') {
      const safety = parseSafetyPrefix(reply);
      return { requires_attention: safety.requiresAttention, content: safety.content };
    }
    const [generation, verification] = await instructions({ type: 'vetting', config: { model: 'local', ...config } }, { teaching });
    return { text: prompt === 'verification' ? verification : generation };
  },
  measures(record) {
    const measured = measureLearner(record);
    return {
      metrics: measured.metrics,
      skills: Object.fromEntries(measured.skills.map((skill) => [skill.skill, skill])),
      writing: Object.fromEntries(measured.writing.map((row) => [`${row.panel}/${row.field}`, row]))
    };
  },
  xapi({ record, options = {} }) {
    try {
      const statements = toStatements(record, options);
      return { count: statements.length, statements, text: JSON.stringify(statements) };
    } catch (error) {
      return failure(error);
    }
  }
};
// Suites whose expected objects must match whole; elsewhere an expected object lists only the fields it checks.
const EXACT = new Set(['expressions']);

const show = (value) => (value === undefined ? 'nothing' : JSON.stringify(value));

function differences(actual, want, path, exact) {
  if (Array.isArray(want)) {
    if (!Array.isArray(actual) || actual.length !== want.length) return [`${path}: expected ${show(want)}, got ${show(actual)}`];
    return want.flatMap((item, i) => differences(actual[i], item, `${path}[${i}]`, exact));
  }
  if (want && typeof want === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return [`${path}: expected ${show(want)}, got ${show(actual)}`];
    const extra = exact ? Object.keys(actual).filter((key) => actual[key] !== undefined && !Object.hasOwn(want, key)) : [];
    return [...extra.map((key) => `${path}.${key}: not expected, got ${show(actual[key])}`), ...Object.entries(want).flatMap(([key, value]) => differences(actual[key], value, `${path}.${key}`, exact))];
  }
  // A value that is absent counts as null: JSON has no undefined.
  const same = typeof want === 'number' && typeof actual === 'number' ? Math.abs(actual - want) < 1e-9 : (actual ?? null) === want;
  return same ? [] : [`${path}: expected ${show(want)}, got ${show(actual)}`];
}

/** What differs between a case's result and its expectations; empty when the case passes. */
export function compare(actual, expect = {}, exact = false) {
  const problems = [];
  for (const [key, want] of Object.entries(expect)) {
    if (key === 'includes' || key === 'excludes') {
      const text = typeof actual.text === 'string' ? actual.text : '';
      for (const part of want) if (text.includes(part) !== (key === 'includes')) problems.push(`${key === 'includes' ? 'lacks' : 'has'} ${JSON.stringify(part)}`);
    } else {
      problems.push(...differences(actual[key], want, key, exact));
    }
  }
  return problems;
}

/** A suite's fixture file, as parsed JSON. */
export function loadSuite(name) {
  if (!SUITES.includes(name)) throw new Error(`Unknown suite "${name}"; one of ${SUITES.join(', ')}.`);
  return JSON.parse(readFileSync(new URL(`conformance/${name}.json`, ROOT), 'utf8'));
}

/** Runs one suite (a fixture file's contents): { suite, cases: [{ id, description, passed, problems }] }. */
export async function runSuite(doc) {
  if (!Object.hasOwn(RUN, doc?.suite)) throw new Error(`Unknown suite "${doc?.suite}"; one of ${SUITES.join(', ')}.`);
  if (doc.version !== 1) throw new Error(`Suite "${doc.suite}" is version ${doc.version}; this runner reads version 1.`);
  const cases = [];
  for (const item of doc.cases) {
    let problems;
    try {
      problems = compare(await RUN[doc.suite](item.input ?? {}), item.expect, EXACT.has(doc.suite));
    } catch (error) {
      problems = [`failed to run: ${error.message}`];
    }
    cases.push({ id: item.id, description: item.description, passed: !problems.length, problems });
  }
  return { suite: doc.suite, cases };
}

/** Runs the named suites (all of them by default) from conformance/. */
export async function runConformance(names = SUITES) {
  const results = [];
  for (const name of names) results.push(await runSuite(loadSuite(name)));
  return results;
}
