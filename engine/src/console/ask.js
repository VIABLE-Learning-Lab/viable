/**
 * Ask: a teacher says what they are teaching, and an agent sets it up, showing each step in their words, opening the details
 * on a click, and handing back cards to use. Its tools are the console's own routes, so it can do what a page can, with the
 * same checks (askTools.js). It drafts on its own; what learners would meet waits for a person's click, enforced here: the
 * model can only propose it. What goes to the model holds no learner's name or work. A host passes a model and somewhere to
 * keep threads. No Node built-ins.
 */
import { SSE_HEADERS, sseStream } from '../learner/logic.js';
import { ASK_CARD_CSS, drawCard } from './askCards.js';
import { ASK_TOOLS, toolSchemas, toolsFor } from './askTools.js';
import { CONSOLE_SCRIPT } from './client.js';
import { esc, FORMS_CSS } from './forms.js';

const refused = (message, status = 400, code = 'invalid_ask') => Object.assign(new Error(message), { status, code });
const LIMITS = { message: 8000, rounds: 14, calls: 8, shown: 300, kept: 80, running: 180000 };
const THREAD = /^thr_[a-f0-9]{24}$/;
const newId = (prefix) => `${prefix}_${[...crypto.getRandomValues(new Uint8Array(12))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
const clip = (text, limit) => (text.length > limit ? `${text.slice(0, limit)}…` : text);

const PROMPT = (notes) => `You are VIABLE's assistant for teachers. A teacher tells you what they are teaching, and you set it up for them with your tools: a course, its activities, how the AI helps in each. They may have never used this, and they are busy.

How you work:
- Do the work. If a detail is missing, choose a sensible default and say what you assumed. Ask only when you can't go on without the answer, and ask one thing.
- Reply in the language the teacher writes in, and write what learners will read in that language too, unless they say otherwise.
- Check what exists before you make something: a teacher may mean a course they already have.
- A good activity has a clear goal and says how far the AI may go. For practice, the default is hints only. Questions you write must be right: work out each answer before you give it.
- If it is math, look for common misconceptions and listen for the few that fit. Choose a few pieces of guidance from research that fit the activity, not many.
- Everything you make stays hidden from learners. Opening or hiding something shows the teacher a button, and only they can press it. So call open_activity only when the teacher asks to open something, and last. Never say something is open unless the teacher has pressed it.
- Never write a web address. The cards show the real links, and any address you wrote would be made up.
- Use a durable skill only if the teacher asks about collaboration, communication or critical thinking.
- Never ask for learners' names and never repeat them. If names come up, use show_class_list. You can only ever see counts of learners.
- When you have set something up, offer show_try, then show_share when it is ready for the class.
- You can't delete anything, or change who has access. Say where the teacher does that: on the course's Settings or People.

When you finish, say in a few short lines what you set up, what you assumed, and what is left for them. Don't list what the cards already show. Don't use the words tool, function or API. ${notes || ''}`.trim();

// A pasted class list shouldn't reach a model: lines that read as names, in any script or case, with or without numbering, an ID or an email.
// Reading a note as a list costs one click to send it anyway; the other mistake sends a learner's name to a model, so this leans that way.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const WIDE = /^[\p{Script=Han}\p{Script=Hangul}\p{Script=Katakana}\p{Script=Hiragana}]+$/u;
// Written small, these are English; An, To and In are also people's names, so a capital lets them through.
const SMALL_WORDS = /(?<!\p{L})(?:an|the|and|or|for|with|to|of|in|on|at|by|from|my|our|their|they|this|that|is|are|be|it|we|you)(?!\p{L})/u;
const TEACHERS_WORDS = /(?<!\p{L})(?:the|this|they|that|please|grades?|class(?:es)?|courses?|units?|weeks?|days?|lessons?|activit(?:y|ies)|practice|quiz(?:zes)?|questions?|hints?|students?|learners?)(?!\p{L})/iu;
function readsAsName(line) {
  const bare = line.replace(/^(?:[-*•]|\(?\d{1,3}[.):]?)\s+/, '').replace(EMAIL, '').replace(/[\s,;|-]*\d[\d-]{2,}\s*$/, '').replace(/[\s,;|<>()-]+$/, '').trim();
  const [name, rest = ''] = bare.split(/\t|,(?=\s)/);
  if (rest.length > 40 || SMALL_WORDS.test(name) || TEACHERS_WORDS.test(name)) return null;
  if (WIDE.test(name)) return name.length <= 5 ? name : null;
  return /^\p{L}[\p{L}\p{M}'’.-]*(?: \p{L}[\p{L}\p{M}'’.-]*){0,3}$/u.test(name) ? name : null;
}
export function looksLikeClassList(message) {
  const lines = String(message).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.filter((line) => EMAIL.test(line)).length >= 2) return true;
  const names = lines.map(readsAsName).filter(Boolean);
  if (lines.length === 2) return names.length === 2 && names.every((name) => name.includes(' ') || WIDE.test(name));
  return names.length >= 2 && names.length / lines.length >= 0.6;
}

// A message whose steps were cut off, by a closed tab or a stopped Worker, still needs an answer to each: a model refuses a conversation without them.
export function settled(messages) {
  return messages.flatMap((message, index) => [message, ...(message.tool_calls || [])
    .filter((asked) => !messages.slice(index + 1).some((later) => later.role === 'tool' && later.tool_call_id === asked.id))
    .map((asked) => ({ role: 'tool', tool_call_id: asked.id, content: JSON.stringify({ error: 'This was cut off before it finished. Check what is there before doing it again.' }) }))]);
}

// A little Markdown from a model, as text: nothing in it can be markup. A link goes only to the web or this console.
function said(text) {
  const inline = (line) => esc(line)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]\n]+)\]\(((?:https:\/\/|\/console\/(?!\/))[^\s)"']+)\)/g, '<a href="$2">$1</a>');
  return String(text).trim().split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((line) => /^\s*[-*] /.test(line))) return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`;
    if (lines.every((line) => /^\s*\d+\. /.test(line))) return `<ol>${lines.map((line) => `<li>${inline(line.replace(/^\s*\d+\. /, ''))}</li>`).join('')}</ol>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

// A model makes up addresses that look real. Only one the teacher wrote stays: the cards hold the real links.
const withoutMadeUpLinks = (text, thread) => {
  const known = thread.shown.filter((item) => item.kind === 'you').map((item) => item.text).join('\n');
  return String(text).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s)>\]"']+/g, (found, label, url) => (known.includes(url || found) ? found : label || 'the link on the card'));
};

const TICK = '<span class="ask-tick" aria-hidden="true">✓</span>';
function stepHtml(step) {
  const failed = step.state === 'failed';
  const inner = [
    step.detail ? `<p class="ask-detail">${esc(step.detail)}</p>` : '',
    step.link ? `<p><a href="${esc(step.link.href)}">${esc(step.link.label)}</a></p>` : '',
    `<details class="ask-call"><summary>What it did</summary><pre>${esc(step.tool)}\n${esc(JSON.stringify(step.args ?? {}, null, 2))}</pre></details>`
  ].join('');
  return `<li class="ask-step${failed ? ' is-failed' : ''}"><details${failed ? ' open' : ''}><summary>${failed ? '<span class="ask-tick" aria-hidden="true">!</span>' : TICK} ${esc(step.label)}</summary><div>${inner}</div></details></li>`;
}

// The thread as a page: steps in a row fold together, once they are done.
async function threadHtml(here, thread) {
  const parts = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const failed = group.some((step) => step.state === 'failed');
    parts.push(`<details class="ask-group"${failed ? ' open' : ''}><summary>${group.length === 1 ? esc(group[0].label) : `${group.length} steps`}</summary><ol class="ask-steps">${group.map(stepHtml).join('')}</ol></details>`);
    group = [];
  };
  for (const item of thread.shown) {
    if (item.kind === 'step') { group.push(item); continue; }
    flush();
    if (item.kind === 'you') parts.push(`<div class="ask-you">${esc(item.text)}</div>`);
    else if (item.kind === 'said') parts.push(`<div class="ask-said">${said(item.text)}</div>`);
    else if (item.kind === 'card') parts.push(await drawCard(here, item.card, { thread: thread.id, id: item.id, state: item.state }));
  }
  flush();
  return parts.join('');
}

const STARTERS = [
  'A practice set on equivalent fractions for my grade 5 class. They keep adding the denominators.',
  'A writing task on argument essays, with an AI that gives feedback but doesn’t write for them.',
  'Questions on photosynthesis for grade 7, with a tutor that asks before it explains.',
  'Speaking practice for beginners in English: ordering at a café.',
  'A short reading on the water cycle with a tutor who only asks questions.',
  'I want a check-in on last week’s unit, with no AI.'
];

const composer = (thread, disabled) => `<form class="ask-form" id="ask-form" data-thread="${esc(thread?.id || '')}">
<label class="sr" for="ask-message">${thread ? 'Your message' : 'What are you teaching?'}</label>
<textarea class="v-input" id="ask-message" name="message" rows="${thread ? 2 : 4}" maxlength="${LIMITS.message}" placeholder="${thread ? 'Say what to change, or what’s next' : 'Say it in your own words: the subject, who it is for, and what they find hard.'}"${disabled ? ' disabled' : ''}></textarea>
<div class="ask-send"><span class="v-note ask-status" id="ask-status" role="status">Please don’t type learners’ names here. A class list has its own box.</span><button class="v-btn is-primary" id="ask-go" type="submit"${disabled ? ' disabled' : ''}>Send</button></div>
</form>`;

async function askBody(here, match) {
  const { threads, askModel } = here;
  const thread = match?.[1] ? await threads?.get(match[1]) : null;
  if (match?.[1] && !thread) throw refused('That conversation isn’t here anymore.', 404, 'thread_not_found');
  const ready = askModel && await askModel.ready();
  const needs = !ready ? `<p class="notice">${esc(askModel?.missing || 'Ask needs a model.')} ${askModel?.setUp ? `<a href="${esc(askModel.setUp)}">Set one up</a>.` : ''} You can always <a href="/console/courses">set up a course yourself</a>.</p>` : '';
  if (thread) {
    return {
      title: thread.title || 'Ask',
      body: `<nav class="crumbs" aria-label="Where you are"><a href="/console/ask">Ask</a></nav>
<div class="ask" id="ask" data-ready="${ready ? '1' : ''}"><div class="ask-thread" id="ask-thread">${await threadHtml(here, thread)}</div>${needs}${composer(thread, !ready)}</div>`,
      css: ASK_CSS, script: ASK_SCRIPT
    };
  }
  const earlier = threads ? await threads.list() : [];
  return {
    title: 'Ask',
    body: `<div class="ask ask-home" id="ask" data-ready="${ready ? '1' : ''}">
<div class="ask-hello" id="ask-hello"><h1>What are you teaching?</h1>
<p class="v-lead">Say it in your own words. It sets up the course and shows you each step, and nothing reaches learners until you press a button.</p></div>
${needs}
<div class="ask-thread" id="ask-thread"></div>
${composer(null, !ready)}
<div class="ask-below" id="ask-below">
<ul class="ask-starters">${STARTERS.filter((text) => !here.simple || !/\breading\b/.test(text)).map((text) => `<li><button class="chip" type="button" data-starter="${esc(text)}"${ready ? '' : ' disabled'}>${esc(text)}</button></li>`).join('')}</ul>
<p class="v-note">Prefer to do it yourself? <a href="/console/courses">Set up a course on its page</a>.</p>
${earlier.length ? `<h2 class="ask-earlier">Earlier</h2><ul class="ask-rows">${earlier.slice(0, 12).map((item) => `<li><div><a href="/console/ask/${esc(item.id)}"><strong>${esc(item.title || 'A conversation')}</strong></a><small>${esc(String(item.updated_at || '').slice(0, 10))}</small></div></li>`).join('')}</ul>` : ''}
</div></div>`,
    css: ASK_CSS, script: ASK_SCRIPT
  };
}

// What the model hears next time: the last few turns, cut where a turn begins so a tool's answer is never left without its question.
function keptMessages(messages) {
  if (messages.length <= LIMITS.kept) return messages;
  const cut = messages.findIndex((message, index) => index >= messages.length - LIMITS.kept && message.role === 'user');
  return cut < 0 ? messages.slice(-LIMITS.kept) : messages.slice(cut);
}

/** One message's work: the model and its tools in turn, each step said as it happens. */
export async function runAsk({ here, thread, message, emit, call }) {
  const tools = new Map(toolsFor(here).map((tool) => [tool.name, tool]));
  const schemas = toolSchemas(here);
  const save = () => here.threads.put(thread);
  // The oldest make way, so what was just said and a card just shown are always there.
  const show = async (item) => { thread.shown.push(item); thread.shown.splice(0, Math.max(0, thread.shown.length - LIMITS.shown)); await save(); return item; };
  thread.messages = settled(thread.messages);
  thread.messages.push({ role: 'user', content: message });
  let touched = null;
  let made = false;
  let waiting = false;
  for (let round = 0; round < LIMITS.rounds; round += 1) {
    const stopped = await here.threads.get(thread.id);
    if (stopped?.stop) { emit('said', { html: said('Stopped. What is already made stays, as a draft.') }); await show({ kind: 'said', text: 'Stopped. What is already made stays, as a draft.' }); break; }
    const answer = await here.askModel.chat({ messages: [{ role: 'system', content: PROMPT(here.askModel.notes) }, ...keptMessages(thread.messages)], tools: schemas });
    const text = withoutMadeUpLinks(answer.content || '', thread).trim();
    if (!answer.calls?.length) {
      thread.messages.push({ role: 'assistant', content: text });
      if (text) { await show({ kind: 'said', text }); emit('said', { html: said(text) }); }
      break;
    }
    thread.messages.push({ role: 'assistant', content: text, tool_calls: answer.calls });
    if (text) { await show({ kind: 'said', text }); emit('said', { html: said(text) }); }
    for (const asked of answer.calls.slice(LIMITS.calls)) thread.messages.push({ role: 'tool', tool_call_id: asked.id, content: JSON.stringify({ error: `At most ${LIMITS.calls} at a time. Do this one next.` }) });
    for (const asked of answer.calls.slice(0, LIMITS.calls)) {
      const tool = tools.get(asked.function?.name);
      let args = asked.function?.arguments;
      if (typeof args === 'string') { try { args = JSON.parse(args || '{}'); } catch { args = {}; } }
      args = args && typeof args === 'object' ? args : {};
      const id = newId('stp');
      let forModel;
      if (!tool) {
        forModel = { error: 'There is no such thing to do.' };
      } else {
        const says = tool.says(args);
        emit('step', { id, label: says, state: 'running' });
        try {
          if (tool.tier === 'reach') {
            const proposed = await tool.propose(here, args);
            const cardId = newId('pnd');
            await show({ kind: 'step', label: says, tool: tool.name, args, state: 'done' });
            const item = await show({ kind: 'card', id: cardId, card: proposed.card, tool: tool.name, state: 'waiting' });
            touched = proposed.course || touched;
            emit('step', { id, label: says, state: 'done', html: stepHtml({ label: says, tool: tool.name, args, state: 'done' }) });
            emit('card', { html: await drawCard(here, item.card, { thread: thread.id, id: cardId, state: 'waiting' }) });
            waiting = true;
            forModel = { waiting_for_the_teacher: true, note: `The teacher now has a button for “${proposed.title}”. It hasn't changed.` };
          } else {
            const result = await tool.run(here, args, call);
            touched = result.course || touched;
            if (tool.tier === 'draft') made = true;
            const step = { kind: 'step', label: result.done || says, tool: tool.name, args, detail: result.detail || null, link: result.link || null, state: 'done' };
            await show(step);
            emit('step', { id, label: step.label, state: 'done', html: stepHtml(step) });
            for (const spec of result.cards || []) {
              const item = await show({ kind: 'card', id: newId('crd'), card: spec });
              emit('card', { html: await drawCard(here, item.card, { thread: thread.id, id: item.id }) });
            }
            forModel = result.forModel;
          }
        } catch (error) {
          const known = error?.status >= 400 && error.status < 500;
          if (!known) console.error(error);
          const words = known ? error.message : 'That didn’t work.';
          const step = { kind: 'step', label: `${says}: ${words}`, tool: tool.name, args, state: 'failed' };
          await show(step);
          emit('step', { id, label: step.label, state: 'failed', html: stepHtml(step) });
          forModel = { error: words };
        }
      }
      thread.messages.push({ role: 'tool', tool_call_id: asked.id, content: JSON.stringify(forModel ?? {}) });
    }
    await save();
    // A proposal ends the turn, so nothing a model says next can claim it happened. What comes after follows the teacher's click.
    if (waiting) {
      if (made && touched) {
        const item = await show({ kind: 'card', id: newId('crd'), card: { kind: 'course', course: touched } });
        emit('card', { html: await drawCard(here, item.card, { thread: thread.id, id: item.id }) });
      }
      const words = 'Press the button when you’re ready. Nothing changes for learners until you do.';
      thread.messages.push({ role: 'assistant', content: words });
      await show({ kind: 'said', text: words });
      emit('said', { html: said(words) });
      break;
    }
    if (round === LIMITS.rounds - 1) { const words = 'That took more steps than I can take at once. What is made so far stays. Say what to do next.'; await show({ kind: 'said', text: words }); emit('said', { html: said(words) }); }
  }
  // What was set up, as something to use.
  if (made && touched && !waiting) {
    const item = await show({ kind: 'card', id: newId('crd'), card: { kind: 'course', course: touched } });
    emit('card', { html: await drawCard(here, item.card, { thread: thread.id, id: item.id }) });
  }
  thread.messages = keptMessages(thread.messages);
}

function fromRoutes(here, pages) {
  // A tool's way to a page's route: the same handler a form reaches, with its checks.
  return async (method, path, body) => {
    const route = pages.flatMap((page) => page.api ?? []).find(([m, pattern]) => m === method && pattern.test(path));
    if (!route) throw refused('That can’t be done here.', 404, 'not_found');
    return route[2](here, route[1].exec(path), body);
  };
}

export const askPages = (getPages) => [{
  id: 'ask', title: 'Ask', section: 'ask',
  match: /^ask(?:\/(thr_[a-f0-9]{24}))?$/,
  render: async (here, match) => { const made = await askBody(here, match); return { ...made, css: `${FORMS_CSS}\n${made.css}`, script: `${CONSOLE_SCRIPT}\n${made.script}` }; },
  api: [
    ['POST', /^ask$/, async (here, _match, body) => {
      if (!here.threads || !here.askModel) throw refused('Ask isn’t set up here.', 409, 'ask_not_set_up');
      if (!await here.askModel.ready()) throw refused(here.askModel.missing || 'Ask needs a model.', 409, 'no_model');
      const message = String(body?.message ?? '').trim().slice(0, LIMITS.message);
      if (!message) throw refused('Say something first.');
      await here.askModel.admit?.();
      let thread = body?.thread != null ? (THREAD.test(String(body.thread)) ? await here.threads.get(String(body.thread)) : null) : null;
      if (body?.thread != null && !thread) throw refused('That conversation isn’t here anymore.', 404, 'thread_not_found');
      if (thread?.running_at && here.now() - Date.parse(thread.running_at) < LIMITS.running) throw refused('It’s still working on your last message.', 409, 'still_working');
      // A class list goes straight to a list: its names are never kept in a thread, which goes to the model.
      const aList = body?.not_a_list !== true && looksLikeClassList(message);
      thread ||= { id: newId('thr'), title: aList ? 'A class list' : clip(message.split('\n')[0], 80), created_at: new Date(here.now()).toISOString(), messages: [], shown: [] };
      Object.assign(thread, { updated_at: new Date(here.now()).toISOString(), running_at: new Date(here.now()).toISOString(), stop: false });
      thread.shown.push({ kind: 'you', text: aList ? `A list of ${message.split(/\r?\n/).filter((line) => line.trim()).length} lines, not sent to the AI.` : message });
      await here.threads.put(thread);

      const stream = sseStream();
      const emit = (name, data) => stream.event(name, data);
      const work = (async () => {
        try {
          emit('thread', { id: thread.id });
          if (aList) {
            const courses = await here.library.courses();
            const course = courses.length === 1 ? courses[0].code : null;
            const words = course ? 'That looks like a class list, so I didn’t send it to the AI. Check it here, and add it.' : 'That looks like a class list, so I didn’t send it to the AI. Open a course’s People page to paste it there.';
            thread.shown.push({ kind: 'said', text: words });
            emit('replace-you', { text: thread.shown.at(-2).text });
            emit('said', { html: `${said(words)}<p><button class="v-btn is-small" type="button" data-send-anyway>It isn’t a list: send it to the AI</button></p>` });
            if (course) {
              // Its text stays in this page only: never in the thread, which goes to the model.
              emit('card', { html: await drawCard(here, { kind: 'class-list', course, prefill: message }, { thread: thread.id }) });
              thread.shown.push({ kind: 'card', id: newId('crd'), card: { kind: 'class-list', course } });
            }
          } else await runAsk({ here, thread, message, emit, call: fromRoutes(here, getPages()) });
        } catch (error) {
          const known = error?.status >= 400 && error.status < 500;
          if (!known) console.error(error);
          const words = known ? error.message : 'The model couldn’t answer just now. What is made so far stays. Try again in a moment.';
          thread.shown.push({ kind: 'said', text: words });
          emit('said', { html: said(words), failed: true });
        } finally {
          thread.running_at = null;
          await here.threads.put(thread).catch((error) => console.error(error));
          await emit('done', { id: thread.id });
          await stream.close();
        }
      })();
      here.keepAlive?.(work);
      return new Response(stream.readable, { status: 200, headers: SSE_HEADERS });
    }],
    ['POST', /^ask\/(thr_[a-f0-9]{24})\/stop$/, async (here, match) => {
      const thread = await here.threads?.get(match[1]);
      if (!thread) throw refused('That conversation isn’t here anymore.', 404, 'thread_not_found');
      thread.stop = true;
      await here.threads.put(thread);
      return { said: 'Stopping after this step.' };
    }],
    // A person's answer to a card. Only this runs what reaches learners, and nothing a model says can call it.
    ['POST', /^ask\/(thr_[a-f0-9]{24})\/pending\/(pnd_[a-f0-9]{24})$/, async (here, match, body) => {
      const thread = await here.threads?.get(match[1]);
      const item = thread?.shown.find((entry) => entry.kind === 'card' && entry.id === match[2]);
      if (!item) throw refused('That isn’t here anymore.', 404, 'pending_not_found');
      if (item.state !== 'waiting') return { said: 'That’s already settled.' };
      const tool = ASK_TOOLS.find((entry) => entry.name === item.tool);
      if (body?.yes === true) {
        await tool.apply(here, item.card, fromRoutes(here, getPages()));
        item.state = 'done';
        thread.messages.push({ role: 'user', content: `[The teacher pressed the button: ${item.card.open ? 'open' : 'hide'} the activity ${item.card.activity}. It is done.]` });
        if (item.card.open) thread.shown.splice(thread.shown.indexOf(item) + 1, 0, { kind: 'card', id: newId('crd'), card: { kind: 'share', course: item.card.course } });
      } else {
        item.state = 'declined';
        thread.messages.push({ role: 'user', content: `[The teacher pressed Not yet for the activity ${item.card.activity}. It is as it was.]` });
      }
      await here.threads.put(thread);
      return { said: item.state === 'done' ? 'Done.' : 'Left as it was.' };
    }]
  ]
}];

const ASK_CSS = `${ASK_CARD_CSS}
.ask{display:grid;gap:18px;max-width:760px;margin:0 auto}
.ask-home{padding-top:clamp(12px,7vh,72px)}
.ask-hello h1{font-size:clamp(2rem,4.2vw,2.9rem)}
.ask-hello .v-lead{margin-top:10px;max-width:58ch}
.ask-thread{display:grid;gap:14px}
.ask-thread:empty{display:none}
.ask-you{justify-self:end;max-width:82%;padding:10px 14px;border-radius:var(--radius);background:var(--field-mist);color:var(--public-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.ask-said{color:var(--public-ink);line-height:1.55}
.ask-said>*+*{margin-top:8px}
.ask-said p,.ask-said ul,.ask-said ol{margin-block:0}
.ask-said ul,.ask-said ol{padding-left:1.3em}
.ask-group{color:var(--public-text);font-size:.9375rem}
.ask-group>summary{width:fit-content;color:var(--muted);cursor:pointer}
.ask-steps{display:grid;gap:2px;margin:6px 0 0;padding:0;list-style:none}
.ask-step summary{display:flex;gap:8px;align-items:baseline;color:var(--public-text);cursor:pointer;list-style:none}
.ask-step summary::-webkit-details-marker{display:none}
.ask-step summary:hover{color:var(--public-ink)}
.ask-tick{flex:none;color:var(--pass-green);font-weight:700}
.ask-step.is-failed summary,.ask-step.is-failed .ask-tick{color:var(--pencil-red)}
.ask-step.is-running summary{color:var(--muted)}
.ask-spin{flex:none;width:.8em;height:.8em;border:2px solid var(--public-rule-strong);border-top-color:var(--ink-blue);border-radius:50%;animation:ask-spin .8s linear infinite;align-self:center}
@keyframes ask-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ask-spin{animation:none}}
.ask-step>details>div{display:grid;gap:6px;margin:4px 0 8px 1.3em;padding:8px 12px;border-left:2px solid var(--public-rule)}
.ask-detail{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.ask-step p{margin:0}
.ask-call summary{color:var(--muted);font-size:.8125rem}
.ask-call pre{margin:6px 0 0;padding:8px 10px;border-radius:var(--radius-sm);background:var(--field-mist);font:400 .8125rem/1.45 var(--font-public-mono);white-space:pre-wrap;overflow-wrap:anywhere}
.ask-form{position:sticky;bottom:12px;z-index:5;display:grid;gap:8px;padding:12px;border:1px solid var(--public-rule-strong);border-radius:var(--radius-lg);background:var(--surface);box-shadow:var(--public-shadow)}
.ask-form textarea{border:0;background:transparent;box-shadow:none;resize:vertical;min-height:2.6em}
.ask-form textarea:focus{outline:none}
.ask-form:focus-within{border-color:var(--ink-blue)}
.ask-send{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ask-send .v-btn{min-height:38px;padding:0 18px}
.ask-status{font-size:.875rem}
.ask-below{display:grid;gap:14px}
.ask-starters{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.ask-starters .chip{display:inline-block;min-height:0;padding:7px 12px;background:transparent;font:inherit;font-size:.875rem;line-height:1.35;text-align:left;cursor:pointer}
.ask-earlier{margin-top:12px;font-size:1rem;font-weight:600;letter-spacing:0}
.ask .sr{position:absolute}`;

const ASK_SCRIPT = String.raw`(() => {
  const $ = (id) => document.getElementById(id);
  let running = false;
  let thread = ($('ask-form') || { dataset: {} }).dataset.thread || '';
  const setStatus = (text) => { const box = $('ask-status'); if (box) box.textContent = text ?? 'Please don’t type learners’ names here. A class list has its own box.'; };
  const atBottom = () => window.scrollTo({ top: document.body.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const add = (html) => { $('ask-thread').insertAdjacentHTML('beforeend', html); atBottom(); };
  const group = () => {
    const last = $('ask-thread').lastElementChild;
    if (last && last.classList.contains('ask-group')) return last.querySelector('.ask-steps');
    add('<details class="ask-group" open><summary>Working…</summary><ol class="ask-steps"></ol></details>');
    return $('ask-thread').lastElementChild.querySelector('.ask-steps');
  };
  const onStep = (data) => {
    const held = document.querySelector('[data-step="' + data.id + '"]');
    if (data.state === 'running') {
      const row = document.createElement('li');
      row.className = 'ask-step is-running';
      row.dataset.step = data.id;
      const line = document.createElement('summary');
      line.append(Object.assign(document.createElement('span'), { className: 'ask-spin' }), data.label);
      const wrap = document.createElement('details');
      wrap.append(line);
      row.append(wrap);
      group().append(row);
      atBottom();
      return;
    }
    const template = document.createElement('template');
    template.innerHTML = data.html || '';
    const made = template.content.firstElementChild;
    if (held && made) held.replaceWith(made); else if (made) group().append(made);
    atBottom();
  };
  const fold = () => {
    for (const box of document.querySelectorAll('.ask-group[open]')) {
      const steps = box.querySelectorAll('.ask-step').length;
      const summary = box.querySelector(':scope > summary');
      if (summary && summary.textContent === 'Working…') summary.textContent = steps === 1 ? box.querySelector('.ask-step summary').textContent.replace(/^\s*✓\s*/, '') : steps + ' steps';
      if (!box.querySelector('.is-failed')) box.removeAttribute('open');
    }
  };
  const handlers = {
    thread: (data) => { thread = data.id; $('ask-form').dataset.thread = data.id; history.replaceState(null, '', location.pathname.replace(/\/ask(\/.*)?$/, '/ask/' + data.id)); },
    step: onStep,
    said: (data) => add('<div class="ask-said' + (data.failed ? ' is-failed' : '') + '">' + data.html + '</div>'),
    card: (data) => add(data.html),
    'replace-you': (data) => { const all = document.querySelectorAll('.ask-you'); if (all.length) all[all.length - 1].textContent = data.text; }
  };
  let lastText = '';
  const send = async (text, notAList = false) => {
    if (running || !text) return;
    running = true;
    lastText = text;
    const go = $('ask-go');
    go.disabled = true;
    setStatus('Working…');
    for (const id of ['ask-hello', 'ask-below']) { const part = $(id); if (part) part.remove(); }
    document.querySelector('.ask').classList.remove('ask-home');
    const you = document.createElement('div');
    you.className = 'ask-you';
    you.textContent = text;
    $('ask-thread').append(you);
    $('ask-message').value = '';
    $('ask-message').rows = 2;
    $('ask-message').placeholder = 'Say what to change, or what’s next';
    atBottom();
    try {
      const response = await fetch(window.location.pathname.split('/ask')[0] + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, ...(notAList ? { not_a_list: true } : {}), ...(thread ? { thread } : {}) }) });
      if (response.status === 401) { location.reload(); return; }
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data.error && data.error.message) || 'That didn’t work. Try again.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const name = /^event: (.+)$/m.exec(frame);
          const data = /^data: (.+)$/m.exec(frame);
          if (name && data && handlers[name[1]]) handlers[name[1]](JSON.parse(data[1]));
        }
      }
    } catch (error) {
      add('<div class="ask-said is-failed"></div>');
      $('ask-thread').lastElementChild.textContent = error.message || 'That didn’t work. Try again.';
    } finally {
      fold();
      running = false;
      go.disabled = false;
      setStatus();
      $('ask-message').focus({ preventScroll: true });
    }
  };
  document.addEventListener('submit', (event) => {
    if (event.target.id !== 'ask-form') return;
    event.preventDefault();
    send($('ask-message').value.trim());
  });
  document.addEventListener('keydown', (event) => {
    if (event.target.id === 'ask-message' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(event.target.value.trim()); }
  });
  document.addEventListener('click', (event) => {
    const anyway = event.target.closest && event.target.closest('[data-send-anyway]');
    if (anyway) { anyway.closest('p').remove(); send(lastText, true); return; }
    const starter = event.target.closest && event.target.closest('[data-starter]');
    if (!starter) return;
    $('ask-message').value = starter.dataset.starter;
    $('ask-message').focus();
  });
  if (document.querySelector('.ask-thread:not(:empty)')) window.scrollTo(0, document.body.scrollHeight);
  // Words brought from another page, in the address's fragment so they never reach a server.
  const brought = new URLSearchParams(location.hash.slice(1)).get('say');
  if (brought && !$('ask-message').value) {
    $('ask-message').value = brought.slice(0, $('ask-message').maxLength);
    history.replaceState(null, '', location.pathname + location.search);
    $('ask-message').focus();
  }
})();`;
