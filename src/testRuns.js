// Runs a file of agent tests locally: each case through the agent, each reply rated by a judge model
// or a judge component; and drafts cases from an activity's How the AI helps.
import { casePictures, judgeMessages, readAgentTests, readVerdict } from './agentTests.js';
import { callComponent, checkManifest } from './components/call.js';
import { draftMessages, readDrafts } from './testCases.js';
import { openAICompatible, runAgent } from './run.js';

const invalid = (message) => Object.assign(new Error(message), { status: 400, code: 'invalid_agent_test' });

/**
 * Has model draft count cases (default 8) from teaching settings (testCases.js draftMessages), on the
 * endpoint or the host's callChatModel. Returns { model, section, kinds, cases, rejected, missing,
 * tokens }: every case in cases passes validAgentTest; the others are in rejected with the reason.
 * Drafts are a model's guesses at what the teacher means: a person reads each before it is run.
 */
export async function draftCases(teaching, { count = 8, section = null, model, baseUrl, apiKey, fetch, callChatModel = null } = {}) {
  if (!model) throw invalid('Name the model that drafts the cases.');
  const { messages, kinds } = draftMessages(teaching, { count, section });
  const call = callChatModel || openAICompatible({ baseUrl, apiKey, fetch });
  const answer = await call({}, { model, messages, max_tokens: 1000 + 600 * count, response_format: { type: 'json_object' } });
  return { model, section, kinds, ...readDrafts(answer.content, { count, kinds }), tokens: answer.usage?.total || 0 };
}

/**
 * Runs each case through the agent and has judgeModel rate the reply. The agent's own models go to
 * the endpoint as named unless model replaces them; the judge always gets judgeModel, at temperature
 * 0. judgeComponent, a judge component's manifest, replaces the judge model: it gets the case, the
 * reply and the conversation (components/call.js). Returns { judge_model, judge_component?, results:
 * [{ name, reply, verdict: pass|fail|error, reason, tokens }], passed, failed, errors }. A case whose
 * run fails is an error, never a fail: the reply wasn't judged.
 */
export async function runAgentTests(doc, cases, { judgeModel, judgeComponent = null, agent = null, teaching = null, section = null, model = null, baseUrl, apiKey, fetch, services = {}, onResult = null } = {}) {
  if (judgeComponent) checkManifest(judgeComponent, 'judge');
  else if (!judgeModel) throw invalid('Name the judge model.');
  const items = readAgentTests(cases);
  const judge = services.callChatModel || openAICompatible({ baseUrl, apiKey, fetch });
  const results = [];
  for (const item of items) {
    const history = item.messages.slice(0, -1);
    let result;
    let entry;
    try {
      result = await runAgent(doc, { input: item.messages.at(-1).content, history, context: item.context, teaching, section, agent, model, baseUrl, apiKey, fetch, services, ...(item.pictures ? { pictures: casePictures(item) } : {}) });
    } catch (error) {
      entry = { name: item.name, reply: null, verdict: 'error', reason: String(error?.message || error).slice(0, 500), tokens: 0 };
    }
    if (!entry) {
      const reply = result.output?.text || '';
      let tokens = result.usage?.total || 0;
      entry = { name: item.name, reply, verdict: 'fail', reason: 'The agent gave no reply.', tokens };
      if (reply.trim()) {
        try {
          if (judgeComponent) {
            const { messages: conversation, ...testCase } = item;
            entry = { ...entry, ...(await callComponent(judgeComponent, { case: testCase, reply, conversation })) };
          } else {
            const judged = await judge({}, { model: judgeModel, messages: judgeMessages(item, reply, result.output), max_tokens: 2000, temperature: 0, response_format: { type: 'json_object' } });
            tokens += judged.usage?.total || 0;
            const read = readVerdict(judged.content);
            entry = { ...entry, tokens, ...(read || { verdict: 'error', reason: 'The judge’s answer couldn’t be read as a verdict.' }) };
          }
        } catch (error) {
          entry = { ...entry, tokens, verdict: 'error', reason: `The judge couldn’t read this reply: ${String(error?.message || error).slice(0, 400)}` };
        }
      }
    }
    results.push(entry);
    onResult?.(entry);
  }
  const count = (verdict) => results.filter((entry) => entry.verdict === verdict).length;
  return { judge_model: judgeComponent ? null : judgeModel, ...(judgeComponent ? { judge_component: `${judgeComponent.id}@${judgeComponent.version}` } : {}), results, passed: count('pass'), failed: count('fail'), errors: count('error') };
}
