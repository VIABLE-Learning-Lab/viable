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
import { replyChecks } from './policy.js';
import { teacherNote, teachingContext } from './utils/teaching.js';
import { reasoningBudget, REVIEW_TOKENS, vettingModelOptions } from './utils/vettingControls.js';

const addUsage = (a, b = {}) => ({ prompt: a.prompt + (b.prompt || 0), completion: a.completion + (b.completion || 0), total: a.total + (b.total || 0) });

/**
 * The reply and what it is checked against as checkPlan takes them; teaching and section as the activity's
 * settings. act: the act code decided for this turn (policy.js), and note: the instructions the turn's reply model had; with
 * them a rewrite and the reviewer hold to the turn, not only to the activity. baseUrl, apiKey and fetch say where model
 * calls go, or services.callChatModel makes them. Returns what checkOutcome gives, with code_checks: which checks code
 * failed a reply on, if any. codeChecks: false leaves every reply to the reviewer, as it was before code checked any.
 */
export async function checkReply({ teaching = null, section = null, act = null, note = null, codeChecks = true, baseUrl, apiKey, fetch, services = {}, hooks = {}, ...check } = {}) {
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
  // note: what this turn's reply model was given (a brief, with the act for the turn), so a rewrite and the reviewer hold to the same.
  }), note || (taught ? teacherNote(taught.text) : null));
  let usage = { prompt: 0, completion: 0, total: 0 };
  let modelCalls = 0;
  const ask = async (request) => {
    modelCalls += 1;
    const answer = await call(null, request);
    usage = addUsage(usage, answer.usage);
    return answer;
  };
  // Code checks a reply first, wherever code can tell: a reply that states the key's answer, or asks two questions on a turn
  // that gets one, fails without a reviewer being asked. What it tells the reply model never holds the answer.
  const failedByCode = [];
  let drafts = 0;
  const byCode = (reply) => {
    if (!codeChecks) return null;
    drafts += 1;
    // A soft check (one question where one is asked for) is worth a rewrite, and no reason to hold back the last draft.
    const found = replyChecks({ reply, act, question: context.question, answer: context.answer_key, reached: Boolean(reached?.items?.length) }).filter((item) => !item.passed);
    if (found.length) failedByCode.push(...found.map((item) => item.id));
    const failed = found.filter((item) => !(item.soft && drafts >= cfg.max_attempts));
    return failed.length ? { passed: false, verificationOutput: `FAIL (checked by code): ${failed.map((item) => item.tell).join(' ')}`, reason: failed.map((item) => item.tell).join(' ') } : null;
  };
  const rounds = await reviewRounds({
    maxAttempts: cfg.max_attempts,
    draft: context.reply.trim(),
    write: async () => replyText(await ask({ model: cfg.model, messages: [{ role: 'system', content: prompts.chat }, ...turns], ...vettingModelOptions({}, { temperature: 0.7, ...reasoningBudget(services.models, cfg.model, 1024) }) })),
    review: async (reply) => byCode(reply) ?? readReview(full, (await ask({ model: cfg.verification_model, messages: reviewMessages(full, prompts.verify, reply), ...vettingModelOptions({}, { temperature: 0.1, ...reasoningBudget(services.models, cfg.verification_model, REVIEW_TOKENS) }) })).content),
    redraft: (reply, verdict) => turns.push(...redraftTurns(reply, prompts.feedback(verdict.verificationOutput))),
    onRound: (item) => hooks.onVettingRound?.(step, item),
    onDraft: (item) => hooks.onVettingDraft?.(step, item)
  });
  const reviewed = rounds.attempts.filter((item) => item.reply !== null);
  return { ...checkOutcome({
    steps: [{ nodeId: 'vetting', output: {
      content: rounds.response, passed: rounds.outcome === 'passed', requires_attention: rounds.requiresAttention, outcome: rounds.outcome, stop_reason: rounds.stopReason,
      attempts: reviewed.length, verification: reviewed.at(-1)?.verification ?? null, attempt_details: rounds.attempts,
      revised: rounds.response !== context.reply.trim(), model: cfg.model, verification_model: cfg.verification_model,
      ...(reached?.items?.length ? { answer_reached: true } : {})
    } }],
    usage,
    modelCalls
  }), ...(failedByCode.length ? { code_checks: [...new Set(failedByCode)] } : {}) };
}
