/**
 * VETTING as a function: checks one reply before a learner sees it, against a teacher's guideline or a
 * question's answer key, and against the activity's teaching settings when given. It runs the same review
 * a VETTING step in an agent runs (checks/vetting.js). With rewrite above 0, a reply that fails is rewritten
 * by the reply model and reviewed again, up to that many times.
 */
import { checkOutcome, checkPlan } from './checkPlan.js';
import { learnerWords, reachedAmong } from './checks/answerReached.js';
import { readReview, redraftTurns, replyText, reviewMessages, reviewRounds, vettingPromptSet, withTeacher } from './checks/vetting.js';
import { openAICompatible } from './models.js';
import { teacherNote, teachingContext } from './utils/teaching.js';
import { reasoningBudget, REVIEW_TOKENS, vettingModelOptions } from './utils/vettingControls.js';

const addUsage = (a, b = {}) => ({ prompt: a.prompt + (b.prompt || 0), completion: a.completion + (b.completion || 0), total: a.total + (b.total || 0) });

/**
 * The reply and what it is checked against as checkPlan takes them; teaching and section as the activity's
 * settings. baseUrl, apiKey and fetch say where model calls go, or services.callChatModel makes them. Returns
 * what checkOutcome gives.
 */
export async function checkReply({ teaching = null, section = null, baseUrl, apiKey, fetch, services = {}, hooks = {}, ...check } = {}) {
  const { graph, input, history, context } = checkPlan(check);
  const step = graph.nodes.find((node) => node.type === 'vetting');
  const cfg = step.config;
  const full = cfg.mode === 'full';
  const call = services.callChatModel || openAICompatible({ baseUrl, apiKey, fetch });
  const concepts = context.key_concepts ? context.key_concepts.split(',').map((item) => item.trim()).filter(Boolean) : [];
  const taught = teachingContext(teaching, section);
  const items = full ? [{ question: { text: context.question }, answerKey: { correctAnswer: context.answer_key, ...(concepts.length ? { keyConcepts: concepts } : {}), ...(context.explanation ? { explanation: context.explanation } : {}) } }] : [];
  const turns = [...history.map((turn) => ({ role: turn.role, content: turn.content })), { role: 'user', content: String(input ?? '') }];
  const reached = full ? reachedAmong(items, learnerWords(turns), { checked: check.answer_reached === true, holds: check.answer_holds === true }) : null;
  const prompts = withTeacher(await vettingPromptSet({
    full,
    chatPrompt: cfg.chat_prompt ? context.instructions : null,
    items,
    reached,
    guideline: context.guideline,
    reference: context.reference,
    decrypt: services.decryptPrompt ?? null
  }), taught ? teacherNote(taught.text) : null);
  let usage = { prompt: 0, completion: 0, total: 0 };
  let modelCalls = 0;
  const ask = async (request) => {
    modelCalls += 1;
    const answer = await call(null, request);
    usage = addUsage(usage, answer.usage);
    return answer;
  };
  const rounds = await reviewRounds({
    maxAttempts: cfg.max_attempts,
    draft: context.reply.trim(),
    write: async () => replyText(await ask({ model: cfg.model, messages: [{ role: 'system', content: prompts.chat }, ...turns], ...vettingModelOptions({}, { temperature: 0.7, ...reasoningBudget(services.models, cfg.model, 1024) }) })),
    review: async (reply) => readReview(full, (await ask({ model: cfg.verification_model, messages: reviewMessages(full, prompts.verify, reply), ...vettingModelOptions({}, { temperature: 0.1, ...reasoningBudget(services.models, cfg.verification_model, REVIEW_TOKENS) }) })).content),
    redraft: (reply, verdict) => turns.push(...redraftTurns(reply, prompts.feedback(verdict.verificationOutput))),
    onRound: (item) => hooks.onVettingRound?.(step, item),
    onDraft: (item) => hooks.onVettingDraft?.(step, item)
  });
  const reviewed = rounds.attempts.filter((item) => item.reply !== null);
  return checkOutcome({
    steps: [{ nodeId: 'vetting', output: {
      content: rounds.response, passed: rounds.outcome === 'passed', requires_attention: rounds.requiresAttention, outcome: rounds.outcome, stop_reason: rounds.stopReason,
      attempts: reviewed.length, verification: reviewed.at(-1)?.verification ?? null, attempt_details: rounds.attempts,
      revised: rounds.response !== context.reply.trim(), model: cfg.model, verification_model: cfg.verification_model,
      ...(reached?.items?.length ? { answer_reached: true } : {})
    } }],
    usage,
    modelCalls
  });
}
