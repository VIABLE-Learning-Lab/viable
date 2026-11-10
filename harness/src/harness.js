/**
 * The Harness in three calls, around whatever writes the reply:
 *
 *   const turn = await prepare({ teaching, message, history });        // before: context and rules
 *   const reply = await yourAgent(`${yourPrompt}\n\n${turn.instructions}`, message);
 *   const result = await check({ turn, reply, reviewer: 'a-model' });  // after: did it meet the bar
 *   await record({ turn, result, learner: 'L-1', store });             // after: what happened
 *
 * No Node built-ins, so it runs wherever fetch does.
 */
import { checkReply } from './check.js';
import { openAICompatible } from './models.js';
import { readJsonAnswer } from './agentTests.js';
import { TASKS } from './tasks/index.js';
import { teachingSettings } from './utils/teaching.js';
import { wordCount } from './utils/researchMetrics.js';

const invalid = (message) => Object.assign(new Error(message), { status: 400, code: 'invalid_task' });

/**
 * Removes what the rules don't allow from a list of tools: names, or { name }, or OpenAI's
 * { function: { name } }. A step or an app's own list goes through this, because a rule a model only reads
 * isn't a rule.
 */
export function allowedTools(tools, rules) {
  const off = new Set(rules?.tools_off ?? []);
  if (!off.size || !Array.isArray(tools)) return tools;
  return tools.filter((tool) => !off.has(typeof tool === 'string' ? tool : tool?.function?.name ?? tool?.name));
}

/**
 * What a model needs before it does this piece of teaching work. task: an id in TASKS (default tutoring, a
 * reply to a learner); the rest is the task's own input. picker, or pickerModel with baseUrl, apiKey and
 * fetch: a small model reads the moment instead of rules. Returns { task, instructions, messages, rules,
 * ...what the task chose }: instructions go after your own system prompt; messages, for a task that isn't a
 * conversation, are the whole request. Nothing in it is the learner's name or identifier.
 */
export async function prepare({ task = 'tutoring', picker = null, pickerModel = null, baseUrl, apiKey, fetch, ...input } = {}) {
  const definition = TASKS[task];
  if (!definition) throw invalid(`No task "${task}". Tasks: ${Object.keys(TASKS).join(', ')}.`);
  const settings = teachingSettings(input.teaching);
  const chosen = await definition.build({ ...input, picker: picker ?? (pickerModel ? { call: openAICompatible({ baseUrl, apiKey, fetch }), model: pickerModel } : null) });
  return {
    task,
    teaching: input.teaching ?? null,
    section: input.section ?? null,
    message: input.message ?? null,
    history: input.history ?? [],
    ...(input.question ? { question: input.question } : {}),
    ...(input.answer ? { answer: input.answer } : {}),
    rules: { help: settings?.help ?? null, tools_off: settings?.tools_off ?? [] },
    instructions: null,
    messages: null,
    ...chosen
  };
}

/**
 * Checks a reply against what the turn prepared: the same review as checkReply, with the turn's settings
 * and conversation filled in. Without a turn it is checkReply.
 */
export function check({ turn = null, ...options } = {}) {
  if (!turn) return checkReply(options);
  // The turn's problem and key, and the act code decided for it, so the check holds a reply to them.
  return checkReply({ message: turn.message ?? '', history: turn.history ?? [], teaching: turn.teaching ?? null, section: turn.section ?? null, ...(turn.answer ? { question: turn.question ?? '', answerKey: turn.answer } : {}), ...(turn.act ? { act: turn.act.act } : {}), ...(turn.instructions ? { note: turn.instructions } : {}), ...options });
}

/**
 * Keeps what happened, in the shape viable-harness view and suggest read: which moment it was and what went
 * in, how the check went. learner: a pseudonymous ID, never a name; without one nothing is kept as a learner's.
 * keepText keeps the words too. Returns the record; with store ({ put }) it is also saved. A failed save throws:
 * a caller with a learner waiting should catch it, so a record can't cost them the reply.
 */
export async function record({ turn = null, reply = null, result = null, learner = null, activity = null, conversation = null, index = null, at = new Date().toISOString(), keepText = false, store = null } = {}) {
  const entry = {
    started_at: at,
    ...(conversation ? { conversation_id: conversation } : {}),
    ...(index != null ? { turn_index: index } : {}),
    ...(turn?.message ? { words: wordCount(turn.message) } : {}),
    ...(turn?.moment ? { moment: turn.moment } : {}),
    ...(turn?.chosen ? { chosen: turn.chosen } : {}),
    ...(turn?.flag ? { flag: turn.flag } : {}),
    ...(turn?.act ? { act: turn.act.act } : {}),
    ...(turn?.diagnosis ? { diagnosis: turn.diagnosis.id } : {}),
    ...(result?.outcome ? { vetting: result.outcome } : {}),
    ...(result?.code_checks?.length ? { code_checks: result.code_checks } : {}),
    ...(keepText ? { ...(turn?.message ? { message: turn.message } : {}), ...(reply ?? result?.reply ? { reply: reply ?? result.reply } : {}) } : {})
  };
  const doc = { ...(learner ? { user: learner } : {}), ...(activity ? { activity } : {}), ...(turn?.section ? { learner_group: turn.section } : {}), events: [], turns: [entry] };
  if (store && learner) await store.put(`harness/${activity ?? '_'}/records/${learner}/${at.replace(/[-:.]/g, '')}-${crypto.randomUUID().slice(0, 8)}`, doc);
  return doc;
}

/**
 * Runs a task that isn't a conversation, on a model: prepare, the request, and its answer read and checked as
 * the task says. Returns { output, problems, usage, turn }; problems lists what the task's check found.
 */
export async function runTask({ model, baseUrl, apiKey, fetch, callChatModel = null, ...input }) {
  const turn = await prepare(input);
  if (!turn.messages) throw invalid(`The task "${turn.task}" writes a reply to a learner: call prepare, then your own model.`);
  const call = callChatModel ?? openAICompatible({ baseUrl, apiKey, fetch });
  const answer = await call(null, { model, temperature: 0.2, messages: turn.messages });
  const output = turn.expects === 'json' ? readJsonAnswer(answer.content) : answer.content;
  return { output, problems: TASKS[turn.task].check?.(output, turn) ?? [], usage: answer.usage, turn };
}
