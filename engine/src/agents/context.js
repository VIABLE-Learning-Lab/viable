/**
 * How much of a conversation goes to a model, for an agent's steps (engine.js) and for Ask (console/ask.js): one set of rules.
 * It is counted in tokens, never in messages. A tool's answer always goes with the call that asked for it, and a call with its
 * answer: a provider refuses a conversation that breaks either. What is cut is cut where an exchange begins, so nothing the
 * person asked is left without what came before it. No Node built-ins.
 */

/** A conservative token estimate: about 4 characters a token, one per CJK character. */
export function estimateTokens(text) {
  const value = String(text ?? '');
  let wide = 0;
  for (const char of value) if (char.charCodeAt(0) > 0x2e7f) wide += 1;
  return Math.ceil((value.length - wide) / 4) + wide;
}

/** A message's words, whatever shape its content takes: an attachment counts as its kind. */
export function messageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? '');
  return content.map((part) => (part?.type === 'text' || part?.type === 'input_text' ? part.text : `[${part?.type || 'attachment'}]`)).join(' ');
}

/** What a message weighs, the calls it makes included. */
export const messageTokens = (message) => estimateTokens(messageText(message?.content)) + 4
  + (message?.tool_calls?.length ? estimateTokens(message.tool_calls.map((call) => `${call.function?.name || ''}${call.function?.arguments || ''}`).join('')) : 0);

export const conversationTokens = (messages) => (messages || []).reduce((sum, message) => sum + messageTokens(message), 0);

/** What a model's window leaves for the request after room for its answer and reasoning. */
export const usableWindow = (window) => window - Math.min(32000, Math.floor(window / 4));

/** The summary leads the first remaining message, which keeps roles alternating for every provider. */
export function withSummary(messages, text) {
  if (!text) return messages;
  const lead = `Earlier in this conversation (summary):\n${text}\n\n---\n\n`;
  if (!messages.length) return [{ role: 'user', content: lead.trim() }];
  const [first, ...rest] = messages;
  const content = Array.isArray(first.content) ? [{ type: 'text', text: lead }, ...first.content] : `${lead}${first.content ?? ''}`;
  return [{ ...first, content }, ...rest];
}

const CUT_OFF = JSON.stringify({ error: 'This was cut off before it finished. Check what is there before doing it again.' });

/**
 * Every call answered and every answer asked for: a call cut off before its answer (a closed tab, a stopped server) gets one
 * saying so, right after it, and an answer whose call isn't there goes. What a provider would refuse never reaches it.
 */
export function wholePairs(messages, cutOff = CUT_OFF) {
  const out = [];
  let open = [];
  // A call still open when the next one speaks gets its answer, after the answers that came, in the order the calls were made.
  const close = () => { for (const id of open) out.push({ role: 'tool', tool_call_id: id, content: cutOff }); open = []; };
  for (const message of messages || []) {
    if (message.role === 'tool') {
      if (!open.includes(message.tool_call_id)) continue;
      open = open.filter((id) => id !== message.tool_call_id);
      out.push(message);
      continue;
    }
    close();
    out.push(message);
    open = (message.tool_calls || []).map((call) => call.id);
  }
  close();
  return out;
}

/** Where a conversation may begin after a cut: a person's message, or a reply whose calls are all answered after it. */
export const isCutPoint = (message) => message?.role === 'user' || message?.role === 'assistant';

/**
 * The index to keep from so that what follows weighs at most keepTokens, starts at a cut point, and holds at least the last
 * message; 0 when it all fits.
 */
export function keepFrom(messages, keepTokens) {
  let kept = 0;
  let from = messages.length;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    kept += messageTokens(messages[index]);
    if (kept > keepTokens && from < messages.length) break;
    if (isCutPoint(messages[index])) from = index;
  }
  return kept <= keepTokens ? 0 : from;
}

/**
 * The older tools' answers, past the newest keepTokens of them, replaced by note: the call stays, so the model knows it can
 * ask again. Changes messages in place, so the conversation sent next time starts the same (a provider's cache holds). How many it cleared.
 */
export function clearOlderResults(messages, { keepTokens, note, keep = () => false }) {
  let kept = 0;
  let cleared = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'tool' || message.cleared) continue;
    kept += messageTokens(message);
    if (kept <= keepTokens || keep(message)) continue;
    messages[index] = { ...message, content: note, cleared: true };
    cleared += 1;
  }
  return cleared;
}
