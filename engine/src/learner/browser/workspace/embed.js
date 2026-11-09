// An embedded activity in a sandboxed frame, and its bridge (window.postMessage): the page sends
//   { viable: 1, type: 'hello', session }  once the frame loads;
// the activity may send
//   { viable: 1, type: 'event', verb, object?, score?, max_score?, success?, completion?, response?, duration_ms?, data? }
//   { viable: 1, type: 'state', data }    (what the AI may be told it shows, at most every 5 s)
//   { viable: 1, type: 'ask', text }      (a question put in the chat box for the learner to send).
import { onwardFoot, el, emit, icon, session } from './core.js';

export function embed(panel, api) {
  const wrap = el('div', 'ws-page embed');
  if (api.aiAvailable) {
    const strip = el('div', 'ws-strip');
    strip.append(icon((panel.sees || []).length ? 'eye' : 'eyeOff', 13), el('span', null, api.seesSentence(panel)));
    wrap.append(strip);
  }
  const frame = el('iframe', 'ws-frame');
  frame.src = panel.url;
  frame.title = panel.title;
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock');
  frame.setAttribute('allow', 'fullscreen; autoplay; clipboard-write');
  frame.referrerPolicy = 'no-referrer';
  wrap.append(frame);
  const foot = onwardFoot(api, 'ws-foot ws-edge');
  if (foot) wrap.append(foot);
  const origin = new URL(panel.url).origin;
  const recent = [];
  let stateAt = 0, pending = null, timer = 0;
  const hello = () => { try { frame.contentWindow.postMessage({ viable: 1, type: 'hello', session }, origin); } catch { /* not ready */ } };
  frame.addEventListener('load', hello);
  // A state is kept at most every 5 s, and the latest of a burst once the 5 s pass, so the AI never sees a stale one.
  const keepState = () => {
    timer = 0; stateAt = Date.now();
    emit(panel.id, 'state', { data: pending });
    recent.push({ type: 'state', data: { data: pending } });
    while (recent.length > 20) recent.shift();
  };
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== origin || !e.data || e.data.viable !== 1) return;
    const msg = e.data;
    api.touch();
    if (msg.type === 'event') {
      const data = { verb: msg.verb, object: msg.object, score: msg.score, max_score: msg.max_score, success: msg.success, completion: msg.completion, response: msg.response, duration_ms: msg.duration_ms, data: msg.data };
      emit(panel.id, 'event', data, typeof msg.object === 'string' ? msg.object : null);
      recent.push({ type: 'event', data });
    } else if (msg.type === 'state') {
      pending = msg.data;
      if (Date.now() - stateAt >= 5000) keepState();
      else if (!timer) timer = setTimeout(keepState, 5000 - (Date.now() - stateAt));
    } else if (msg.type === 'hello') hello(); // a page that started listening late asks again
    else if (msg.type === 'ask' && typeof msg.text === 'string') api.askAi(msg.text);
    while (recent.length > 20) recent.shift();
  });
  return { el: wrap, state: () => ({ panel: panel.id, recent: recent.map((item) => ({ type: item.type, data: item.data })) }) };
}
