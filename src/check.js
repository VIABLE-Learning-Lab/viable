/**
 * VETTING as a function: checks one reply before a learner sees it, against a teacher's guideline or
 * a question's answer key, and against the activity's teaching settings when given. It runs the
 * engine's own VETTING step on the reply as a draft, so a host that calls it gets the review a VIABLE
 * agent's step gives. With rewrite above 0, a reply that fails is rewritten by the reply model and
 * reviewed again, up to that many times.
 */
import { checkOutcome, checkPlan } from './checkPlan.js';
import { runWithServices } from './server/runtime.js';

/**
 * The reply and what it is checked against as checkPlan takes them; teaching and section as the
 * activity's settings; the rest as runAgent. Returns what checkOutcome gives.
 */
export async function checkReply({ teaching = null, section = null, baseUrl, apiKey, fetch, services = {}, hooks = {}, ...check } = {}) {
  const { graph, input, history, context } = checkPlan(check);
  const result = await runWithServices({ format: 'viable.agent', name: 'VETTING', graph }, { input, history, context, teaching: teaching || false, section, baseUrl, apiKey, fetch, services, hooks });
  return checkOutcome(result);
}
