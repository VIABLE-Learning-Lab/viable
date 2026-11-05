/**
 * What VETTING a written reply takes, without running it: the graph with the engine's own VETTING step
 * on the reply as a draft, and what comes back. No node: imports, so a host that runs the engine with
 * its own services makes the same review check.js does.
 */
const MAX_REWRITES = 9;
const fail = (message) => Object.assign(new Error(message), { status: 400, code: 'invalid_check' });

/**
 * reply: the reply to check. message and history: the learner's message and the conversation before
 * it ([{role, content}]). guideline: what the reply must do (simple mode); or question with answerKey
 * (and keyConcepts, explanation): the reviewer fails a reply that gives the answer away (full mode).
 * reference: material the reviewer checks facts against, never shown to the reply model. instructions:
 * what the reply model was told, so a rewrite keeps to it. model: the reply model, for rewrites;
 * reviewer: the reviewing model (default model).
 */
export function checkPlan({ reply, message = '', history = [], guideline = '', question = '', answerKey = '', keyConcepts = [], explanation = '', reference = '', instructions = '', rewrite = 0, model = null, reviewer = null } = {}) {
  if (typeof reply !== 'string' || !reply.trim()) throw fail('Give the reply to check.');
  const full = Boolean(String(answerKey || '').trim());
  if (full && !String(question || '').trim()) throw fail('An answer key needs the question it answers.');
  if (!Number.isInteger(rewrite) || rewrite < 0 || rewrite > MAX_REWRITES) throw fail(`rewrite is a whole number from 0 to ${MAX_REWRITES}.`);
  const verifier = reviewer || model;
  if (!verifier) throw fail('Name the reviewing model (reviewer, or model).');
  const concepts = (Array.isArray(keyConcepts) ? keyConcepts : String(keyConcepts).split(',')).map((item) => String(item).trim()).filter(Boolean);
  // The texts travel in context and the step reads them by reference, so a {{...}} in a reply or a
  // guideline stays text instead of becoming a template.
  const context = { reply, instructions: String(instructions || ''), guideline: String(guideline || ''), reference: String(reference || ''), question: String(question || ''), answer_key: String(answerKey || ''), key_concepts: concepts.join(', '), explanation: String(explanation || '') };
  const config = {
    mode: full ? 'full' : 'simple',
    draft: '{{context.reply}}',
    model: model || verifier,
    verification_model: verifier,
    max_attempts: 1 + rewrite,
    includeHistory: true,
    ...(context.instructions.trim() ? { chat_prompt: '{{context.instructions}}' } : {}),
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
  return { graph, input: message, history, context };
}

/**
 * A finished check's { outcome, passed, reply, revised, stop_reason, rounds, reviewer, usage,
 * model_calls, answer_reached? }: answer_reached when the learner had already written the answer. outcome is passed, unverified (it failed every review, or couldn't be reviewed:
 * stop_reason says which) or attention (a rewrite raised a safety concern). Only a passed reply is
 * checked.
 */
export function checkOutcome(result) {
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
    model_calls: result.modelCalls,
    ...(out.answer_reached ? { answer_reached: true } : {})
  };
}
