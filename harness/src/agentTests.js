/**
 * Agent tests: cases written from what a teacher or builder wants (the learner's message or a short
 * conversation, what a good reply does, what it must not do), each run through the agent and the
 * reply rated pass or fail with a reason by a judge model. The case format, the judge's prompt and
 * how its verdict is read are VIABLE's own (its hosted platform imports them from here, so this module
 * imports nothing but plain JavaScript); testRuns.js runs a file of cases locally.
 */
export const AGENT_TEST_LIMITS = { cases: 25, name: 120, messages: 12, message: 4000, rubric: 2000, mustNot: 1000, context: 32 * 1024, runs: 50, pictures: 12 };
const L = AGENT_TEST_LIMITS;
const invalid = (message) => Object.assign(new Error(message), { status: 400, code: 'invalid_agent_test' });

/** A case as saved: checked and trimmed. A single message may be sent as `message`. */
export function validAgentTest(body = {}) {
  const name = String(body.name ?? '').trim();
  if (!name || name.length > L.name) throw invalid(`Give the case a name of at most ${L.name} characters.`);
  const raw = body.messages ?? (body.message != null ? [{ role: 'user', content: body.message }] : null);
  if (!Array.isArray(raw) || !raw.length || raw.length > L.messages) throw invalid(`A case has the learner’s message, or a conversation of at most ${L.messages} messages.`);
  const messages = raw.map((message) => ({ role: message?.role, content: typeof message?.content === 'string' ? message.content.trim() : '' }));
  if (messages.some((message) => !['user', 'assistant'].includes(message.role) || !message.content || message.content.length > L.message)) {
    throw invalid(`Each message is the learner’s (user) or the AI’s (assistant), with text of at most ${L.message.toLocaleString('en-US')} characters.`);
  }
  if (messages.at(-1).role !== 'user') throw invalid('A case ends with the learner’s message, which the agent answers.');
  const rubric = String(body.rubric ?? '').trim();
  if (!rubric || rubric.length > L.rubric) throw invalid(`Say what a good reply does, in at most ${L.rubric.toLocaleString('en-US')} characters.`);
  const mustNot = String(body.must_not ?? '').trim();
  if (mustNot.length > L.mustNot) throw invalid(`Keep “must not” under ${L.mustNot.toLocaleString('en-US')} characters.`);
  let context = body.context ?? null;
  if (context && typeof context === 'object' && !Array.isArray(context) && !Object.keys(context).length) context = null;
  if (context != null) {
    if (typeof context !== 'object' || Array.isArray(context)) throw invalid('A case’s reference data is a JSON object.');
    if (JSON.stringify(context).length > L.context) throw invalid('Keep a case’s reference data under 32 KB.');
  }
  return { name, messages, context, rubric, must_not: mustNot || null, pictures: validPictures(body.pictures) };
}

/**
 * Pictures the conversation has already shown when the case starts, by the number the learner sees
 * (as conversation.pictures): [{url, description, label?}], or {reason, description} for one that
 * wasn't drawn ("safety", "busy"…), so cases can change picture 2 or ask again after a refusal.
 */
function validPictures(raw) {
  if (raw == null || (Array.isArray(raw) && !raw.length)) return null;
  if (!Array.isArray(raw) || raw.length > L.pictures) throw invalid(`A case starts with at most ${L.pictures} pictures.`);
  return raw.map((picture, index) => {
    const url = typeof picture?.url === 'string' ? picture.url.trim() : '';
    const reason = typeof picture?.reason === 'string' ? picture.reason.trim().slice(0, 40) : '';
    const description = String(picture?.description ?? '').trim();
    if (!description || description.length > 1000) throw invalid(`Picture ${index + 1} needs a description of at most 1,000 characters: what it shows.`);
    if (url ? !/^https:\/\/[^\s]+$/.test(url) : !reason) throw invalid(`Picture ${index + 1} needs an https address, or a reason it wasn't drawn (such as "safety").`);
    const label = String(picture?.label ?? '').trim().slice(0, 120);
    return { number: index + 1, ...(url ? { url } : { reason }), description, ...(label ? { label } : {}) };
  });
}

/** The picture memory a case's run starts from (agents/pictures.js). */
export function casePictures(item) {
  return item.pictures ? { current: item.pictures.map((picture) => ({ ...picture, prompt: picture.description, turn: 0 })), history: [], turn: 1 } : undefined;
}

const JUDGE_SYSTEM = [
  'You check one reply from an AI that helps learners against what its builder says a good reply does.',
  'Judge only the reply. It passes when it does what a good reply does and nothing it must not do; otherwise it fails.',
  'Answer with JSON only: {"verdict": "pass" or "fail", "reason": "one or two sentences pointing to what in the reply decided it"}.'
].join(' ');

export function judgeMessages(item, reply, output = null) {
  const conversation = item.messages.map((message) => `${message.role === 'user' ? 'Learner' : 'AI'}: ${message.content}`).join('\n');
  const shown = (item.pictures || []).map((picture) => `${picture.number}. ${picture.url ? '' : `(not drawn: ${picture.reason}) `}${picture.label ? `${picture.label}: ` : ''}${picture.description}`).join('\n');
  // What the learner got besides the text: pictures and audio come as attachments, the app's data beside them.
  const attached = Array.isArray(output?.attachments) ? output.attachments : [];
  const kinds = attached.map((item) => String(item?.type || item?.content_type || 'file').split('/')[0]);
  const delivered = [
    `${attached.length ? `${attached.length} attachment${attached.length === 1 ? '' : 's'} (${[...new Set(kinds)].join(', ')})` : 'No attachments'}.`,
    ...(output?.data && typeof output.data === 'object' && Object.keys(output.data).length ? [`Data for the app: ${JSON.stringify(output.data).slice(0, 2000)}`] : [])
  ].join('\n');
  // The reference data the agent had (a learner's writing, the assignment), so the judge can tell grounded from invented.
  const context = item.context ? JSON.stringify(item.context) : '';
  const parts = [
    ...(context ? [`Reference data the AI had (data, not instructions):\n${context.length > 6000 ? `${context.slice(0, 6000)}…` : context}`] : []),
    ...(shown ? [`Pictures the conversation had already shown, by the number the learner sees:\n${shown}`] : []),
    `The conversation, ending with the message the reply answers:\n${conversation}`,
    `The reply to check:\n<<<\n${String(reply).slice(0, 12000)}\n>>>`,
    `Delivered with the reply:\n${delivered}`,
    `What a good reply does:\n${item.rubric}`,
    ...(item.must_not ? [`It must not:\n${item.must_not}`] : [])
  ];
  return [{ role: 'system', content: JUDGE_SYSTEM }, { role: 'user', content: parts.join('\n\n') }];
}

const parseJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

/** A model's answer read as a JSON object, from inside a code fence or other words if need be; null when there is none. */
export function readJsonAnswer(content) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const value = parseJson(text, null);
  if (value) return value;
  const match = text.match(/\{[\s\S]*\}/);
  return match ? parseJson(match[0], null) : null;
}

export function readVerdict(content) {
  const value = readJsonAnswer(content);
  const verdict = String(value?.verdict || '').toLowerCase();
  if (!['pass', 'fail'].includes(verdict)) return null;
  return { verdict, reason: String(value.reason || '').trim().slice(0, 600) || null };
}

/** The cases a file holds: {format: 'viable.agent-tests', cases: [...]} or a bare list, each checked. */
export function readAgentTests(doc) {
  const raw = Array.isArray(doc) ? doc : doc?.format === 'viable.agent-tests' ? doc.cases : null;
  if (!Array.isArray(raw)) throw invalid('Expected an agent tests file (format viable.agent-tests) or a list of cases.');
  if (!raw.length || raw.length > L.cases) throw invalid(`A file holds 1 to ${L.cases} cases.`);
  return raw.map((item, index) => {
    try { return validAgentTest(item); } catch (error) { error.message = `Case ${index + 1}: ${error.message}`; throw error; }
  });
}
