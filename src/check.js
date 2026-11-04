/**
 * VETTING as a function: checks one reply before a learner sees it, against a teacher's guideline or
 * a question's answer key, and against the activity's teaching settings when given. It runs the
 * engine's own VETTING step on the reply as a draft, so a host that calls it gets the review a VIABLE
 * agent's step gives. With rewrite above 0, a reply that fails is rewritten by the reply model and
 * reviewed again, up to that many times.
 */
import { runAgent } from './run.js';

const MAX_REWRITES = 9;
const fail = (message) => Object.assign(new Error(message), { status: 400, code: 'invalid_check' });

/**
 * reply: the reply to check. message and history: the learner's message and the conversation before
 * it ([{role, content}]). guideline: what the reply must do (simple mode); or question with answerKey
 * (and keyConcepts, explanation): the reviewer fails a reply that gives the answer away (full mode).
 * reference: material the reviewer checks facts against, never shown to the reply model. model: the
 * reply model, for rewrites; reviewer: the reviewing model (default model). The rest as runAgent.
 *
 * Returns { outcome, passed, reply, revised, stop_reason, rounds, reviewer, usage, model_calls }.
 * outcome is passed, unverified (it failed every review, or couldn't be reviewed: stop_reason says
 * which) or attention (a rewrite raised a safety concern). Only a passed reply is checked.
 */
export async function checkReply({ reply, message = '', history = [], guideline = '', question = '', answerKey = '', keyConcepts = [], explanation = '', reference = '', teaching = null, section = null, rewrite = 0, model = null, reviewer = null, baseUrl, apiKey, fetch, services = {}, hooks = {} } = {}) {
  if (typeof reply !== 'string' || !reply.trim()) throw fail('Give the reply to check.');
  const full = Boolean(String(answerKey || '').trim());
  if (full && !String(question || '').trim()) throw fail('An answer key needs the question it answers.');
  if (!Number.isInteger(rewrite) || rewrite < 0 || rewrite > MAX_REWRITES) throw fail(`rewrite is a whole number from 0 to ${MAX_REWRITES}.`);
  const verifier = reviewer || model;
  if (!verifier) throw fail('Name the reviewing model (reviewer, or model).');
  const concepts = (Array.isArray(keyConcepts) ? keyConcepts : String(keyConcepts).split(',')).map((item) => String(item).trim()).filter(Boolean);
  // The texts travel in context and the step reads them by reference, so a {{...}} in a reply or a
  // guideline stays text instead of becoming a template.
  const context = { reply, guideline: String(guideline || ''), reference: String(reference || ''), question: String(question || ''), answer_key: String(answerKey || ''), key_concepts: concepts.join(', '), explanation: String(explanation || '') };
  const config = {
    mode: full ? 'full' : 'simple',
    draft: '{{context.reply}}',
    model: model || verifier,
    verification_model: verifier,
    max_attempts: 1 + rewrite,
    includeHistory: true,
    ...(full
      ? { question: '{{context.question}}', answer_key: '{{context.answer_key}}', ...(concepts.length ? { key_concepts: '{{context.key_concepts}}' } : {}), ...(context.explanation ? { explanation: '{{context.explanation}}' } : {}) }
      : { ...(context.guideline.trim() ? { guideline: '{{context.guideline}}' } : {}), ...(context.reference.trim() ? { reference: '{{context.reference}}' } : {}) })
  };
  const graph = {
    entry: 'input',
    nodes: [
      { id: 'input', type: 'input', next: 'vetting' },
      { id: 'vetting', type: 'vetting', config, next: 'reply' },
      { id: 'reply', type: 'output', config: { text: '{{vetting.content}}' } }
    ]
  };
  const result = await runAgent({ format: 'viable.agent', name: 'VETTING', graph }, { input: message, history, context, teaching: teaching || false, section, baseUrl, apiKey, fetch, services, hooks });
  const out = result.steps.find((step) => step.nodeId === 'vetting')?.output || {};
  return {
    outcome: out.outcome,
    passed: out.outcome === 'passed',
    reply: out.content,
    revised: Boolean(out.revised),
    stop_reason: out.stop_reason,
    rounds: out.attempt_details || [],
    reviewer: out.verification_model,
    usage: result.usage,
    model_calls: result.modelCalls
  };
}
