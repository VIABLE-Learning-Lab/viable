/**
 * "What the AI did": a panel beside a learner's page that shows, as it happens, what the harness did
 * with a turn: what the teacher set, the draft, the reviewer's marks, the rewrite, what reached the
 * learner, what was noticed and what was cited. One copy for every host, off by default.
 *
 * It carries instructions, drafts and reviewers' reasons, so a learner must never get it. A host's route
 * decides per request, and only then passes watchSlot's result
 * as the page's slots.beside and sends watchHooks' events on the turn's stream as run.trace. The page
 * only passes them on. No Node built-ins.
 */
import { asSource, ATTRIBUTES, h, HELP_NAMES, helpScale, MARKS, mark, OUTCOMES, PARTS_CSS, quote, str, TAGS, TEST_VERDICTS, treeDom, VERDICTS, vettingRound } from '../../../harness/src/ui/parts.js';
import { fontFaces, markSvg, themeCss, TOKENS } from '../../../harness/src/ui/theme.js';
import { HELP_LEVELS, teachingSettings } from '../../../harness/src/utils/teaching.js';
import { scriptJson } from './shell.js';

// A passage as a sentence to read: without its headings and its marks.
const plain = (text) => String(text ?? '').replace(/^#+\s.*$|^\*[^*\n]+\*$/gm, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
const clipped = (value, limit) => (typeof value === 'string' && value.length > limit ? `${value.slice(0, limit).replace(/\s+\S*$/, '')}…` : value);

/** What the panel says of an activity's settings. What the teacher wants to hear about is for the teacher, and isn't given to the AI. */
export function settingsShown(teaching) {
  const saved = teachingSettings(teaching);
  if (!saved) return null;
  return {
    goal: saved.goal, help: saved.help, told: saved.help ? HELP_LEVELS[saved.help] : null,
    standard: saved.standard ? { code: saved.standard.code || null, description: saved.standard.description } : null,
    listens_for: (saved.misconceptions || []).map((item) => item.description)
  };
}

/** Run hooks that tell emit what happens, on top of a route's own. A listener never stops the run. */
export function watchHooks(emit, base = {}) {
  const say = (event) => { try { emit(event); } catch { /* A listener never stops the run. */ } };
  return {
    ...base,
    onStepStart(node) {
      base.onStepStart?.(node);
      if (['knowledge', 'llm', 'agent', 'vetting'].includes(node.type)) say({ kind: 'step', type: node.type, id: node.id, ...(node.type === 'vetting' ? { holds_key: node.config?.mode === 'full' } : {}) });
    },
    onStep(step) {
      base.onStep?.(step);
      if (step.nodeType === 'knowledge') say({ kind: 'passages', query: step.input?.query ?? null, items: (step.output?.results || []).map((item) => ({ index: item.index, title: item.title || null, text: clipped(plain(item.text), 260) })) });
    },
    onBrief: (brief) => say({ kind: 'brief', moment: brief.moment, move: brief.move, by: brief.by, flag: brief.flag, misconceptions: brief.misconceptions.map((item) => item.description), components: brief.components.map((item) => item.description), guidance: (brief.guidance || []).map((item) => `${item.text}${item.source ? ` (${item.source})` : ''}`), prior: brief.prior.map((item) => item.description) }),
    onVettingDraft: (node, draft) => say({ kind: 'draft', attempt: draft.attempt, source: draft.source, reply: draft.reply }),
    onVettingRound: (node, round) => say({ kind: 'round', round: { attempt: round.attempt, source: round.source, verdict: round.verdict, reply: round.reply, feedback: round.feedback } })
  };
}

// The panel, as a function so a bundler renames it and what it calls together (asSource). Everything
// from a learner or a model goes in as text, never as markup.
function watchPanel(config) {
  let teaching = config.teaching;
  let turn = null;
  const host = document.getElementById('ai-watch');
  const opener = document.getElementById('ai-watch-open');
  if (['light', 'dark'].includes(document.documentElement.dataset.theme)) host.dataset.theme = document.documentElement.dataset.theme;
  const root = host.attachShadow({ mode: 'open' });
  const el = (tag, className, ...kids) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.append(...kids.filter((kid) => kid != null));
    return node;
  };
  const style = el('style', null, config.css);
  style.nonce = config.nonce;
  const says = el('p', 'caption');
  says.setAttribute('role', 'status');
  says.hidden = true;
  const scroller = el('div', 'scroll');
  const panel = el('div', 'panel');
  const logo = el('span', 'logo');
  logo.innerHTML = config.mark; // Our own drawing, from the server.
  const close = el('button', 'close', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => { host.classList.remove('open'); opener.focus(); });
  // A signed-in teacher can end it here, on a computer someone else uses next.
  const signOut = el('button', 'link', 'Sign out');
  signOut.type = 'button';
  signOut.addEventListener('click', async () => {
    await fetch(config.signOut, { method: 'POST', redirect: 'manual' }).catch(() => {});
    location.replace(location.pathname);
  });
  const head = el('header', 'head',
    el('div', 'title', logo, el('h2', null, 'What the AI did'), close),
    el('p', null, 'What happens behind each reply, as it happens. A learner never sees this.'),
    config.signOut ? el('p', 'signed-in', 'Signed in as the teacher. ', signOut) : null,
    config.note ? el('p', 'mode', config.note) : null,
    config.warning ? el('p', 'warning', config.warning) : null);
  const turns = el('div', 'turns');
  turns.setAttribute('aria-live', 'polite');
  const empty = el('p', 'empty', config.hint || 'Send a message and watch here.');
  scroller.append(empty, turns);
  panel.append(head, settingsPart(), says, scroller);
  root.append(style, panel);
  opener.addEventListener('click', () => { host.classList.add('open'); close.focus(); });

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toEnd = () => scroller.scrollTo({ top: scroller.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });

  // The teacher's settings, and in a try-out the small control that changes them.
  function settingsPart() {
    const part = el('section', 'settings');
    part.setAttribute('aria-label', 'The teacher’s settings');
    drawSettings(part);
    return part;
  }
  function drawSettings(part = root.querySelector('.settings'), note = '') {
    const set = teaching || {};
    const kids = [el('h3', 'label', 'The teacher’s settings')];
    if (config.control || set.help) {
      const scale = el('ol', 'scale');
      for (const [level, name] of Object.entries(HELP_NAMES)) {
        const item = el('li', level === set.help ? 'on' : null);
        if (config.control) {
          const pick = el('button', null, name);
          pick.type = 'button';
          pick.setAttribute('aria-pressed', String(level === set.help));
          pick.addEventListener('click', () => change({ help: level }));
          item.append(pick);
        } else item.append(name);
        scale.append(item);
      }
      kids.push(el('p', 'row-label', 'How far the AI may help'), scale);
    }
    kids.push(goalPart(part, set));
    if (set.listens_for?.length) {
      const list = el('ul', null, ...set.listens_for.map((text) => el('li', turn?.heard?.has(text) ? 'heard' : null, text)));
      const more = el('details', 'listening', el('summary', null, `Listening for ${set.listens_for.length} misconception${set.listens_for.length === 1 ? '' : 's'}`), list);
      kids.push(more);
    }
    const said = el('p', 'said-back', note);
    said.setAttribute('role', 'status');
    kids.push(said);
    part.replaceChildren(...kids);
  }
  function goalPart(part, set) {
    const line = el('p', 'goal', set.goal || 'None set.');
    const row = el('div', 'goal-row', el('p', 'row-label', 'The goal'), line);
    if (!config.control) return row;
    const edit = el('button', 'link', 'Change the goal');
    edit.type = 'button';
    edit.addEventListener('click', () => {
      const box = el('textarea', 'v-input');
      box.rows = 3;
      box.maxLength = 1000;
      box.value = set.goal || '';
      box.setAttribute('aria-label', 'The goal');
      const save = el('button', 'v-btn is-primary is-small', 'Use this goal');
      save.type = 'button';
      save.addEventListener('click', () => change({ goal: box.value.trim() }));
      const cancel = el('button', 'link', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', () => drawSettings(part));
      row.replaceChildren(el('p', 'row-label', 'The goal'), box, el('div', 'goal-tools', save, cancel));
      box.focus();
    });
    row.append(edit);
    return row;
  }
  async function change(what) {
    try {
      const res = await fetch(config.control.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: config.control.page, ...what }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'That didn’t save.');
      teaching = data.teaching;
      drawSettings(undefined, 'Changed for this try only. Ask again to see the difference.');
    } catch (error) { drawSettings(undefined, error.message); }
  }

  const status = (text) => {
    if (!turn) return;
    turn.status.hidden = !text;
    turn.status.textContent = text || '';
  };
  const named = (attempt) => (attempt === 1 ? 'the draft' : 'a rewrite');

  function begin(event) {
    empty.hidden = true;
    if (turn) turn.node.open = false;
    if (event.teaching) teaching = event.teaching;
    const told = event.teaching?.told;
    const rounds = el('ol', 'rounds watch live');
    const statusLine = el('p', 'status');
    const said = el('blockquote', 'said', event.message);
    const node = el('details', 'turn',
      el('summary', null, el('span', 'label', 'The learner wrote'), said),
      told ? el('div', 'told', el('p', 'label', 'The teacher told the AI'), el('p', null, told)) : null);
    node.open = true;
    const briefLine = el('div', 'heard brief');
    briefLine.hidden = true;
    const heardLine = el('div', 'heard');
    heardLine.hidden = true;
    const passages = el('div', 'passages');
    passages.hidden = true;
    const review = el('p', 'review-note');
    review.hidden = true;
    const end = el('div', 'reached');
    end.hidden = true;
    node.append(briefLine, heardLine, passages, review, rounds, statusLine, end);
    turn = { node, rounds, status: statusLine, briefLine, heardLine, passages, review, end, waiting: null, last: null, heard: new Set(), direct: false };
    turns.append(node);
    status('Writing a reply');
    toEnd();
  }

  function onDraft(event) {
    const item = treeDom(h('li', { class: 'round' },
      h('p', { class: 'round-name' }, `Round ${str(event.attempt)}, ${named(event.attempt)}`),
      h('div', { class: 'round-body' }, h('div', { class: 'draft reading' }, quote(event.reply)))));
    turn.rounds.append(item);
    turn.waiting = item;
    status('The reviewer is reading it');
    toEnd();
  }

  function onRound(round) {
    const item = treeDom(vettingRound(round, Number(round.attempt) - 1));
    if (turn.waiting) turn.waiting.replaceWith(item); else turn.rounds.append(item);
    turn.waiting = null;
    turn.last = round;
    status(round.verdict === 'fail' ? 'Rewriting, with the reviewer’s reason' : '');
    toEnd();
  }

  function onPassages(event) {
    const items = event.items || [];
    turn.passages.hidden = false;
    turn.passages.replaceChildren(
      el('p', 'label', items.length ? 'It looked in its own files' : 'It looked in its own files, and found nothing'),
      el('ol', null, ...items.map((item) => {
        const row = el('li', null, el('strong', null, item.title || 'Untitled'), el('span', null, item.text || ''));
        row.dataset.index = String(item.index);
        return row;
      })));
    status('Writing a reply');
    toEnd();
  }

  function onReached(event) {
    status('');
    const passed = turn.last?.verdict === 'pass' && String(turn.last.reply).trim() === String(event.text).trim();
    const outcome = OUTCOMES[event.outcome];
    const kids = [];
    if (passed) kids.push(treeDom(mark('pass', 'This is what reached the learner')));
    else {
      kids.push(el('p', 'label', 'What reached the learner'), el('blockquote', null, event.text));
      if (outcome) kids.push(treeDom(mark(MARKS[event.outcome], `${outcome[0]}: ${outcome[1]}`)));
      else kids.push(el('p', 'note', 'This agent has no reviewer, so its reply went straight to the learner.'));
    }
    for (const cited of event.citations || []) {
      const row = turn.passages.querySelector(`li[data-index="${Number(cited.index)}"]`);
      if (row) row.classList.add('cited');
    }
    if (event.citations?.length) kids.push(el('p', 'note', `It cited ${event.citations.map((cited) => `[${cited.index}] ${cited.title || 'a passage'}`).join(', ')}.`));
    turn.end.replaceChildren(...kids);
    turn.end.hidden = false;
    if (opener) opener.dataset.state = turn.rounds.querySelector('.round.fail') ? 'struck' : 'done';
    toEnd();
  }

  function onHeard(event) {
    if (!turn.briefLine.hidden) return;
    if (!event.items?.length) return;
    for (const text of event.items) turn.heard.add(text);
    turn.heardLine.hidden = false;
    turn.heardLine.replaceChildren(el('p', 'label', 'Heard in this message'), ...event.items.map((text) => el('p', null, text)), el('p', 'note', 'A misconception the teacher chose to listen for. The harness asked the model about this message separately.'));
    drawSettings();
    toEnd();
  }

  // What the model was given before it wrote anything: this moment, and only what it calls for.
  function onBrief(event) {
    const moments = { attempt: 'giving an answer or some working', asks_answer: 'asking for the answer', stuck: 'stuck, with nothing tried yet', repeated: 'still not there after trying more than once', other: 'saying something else' };
    const parts = [...event.misconceptions, ...event.components, ...event.prior, ...(event.guidance || [])];
    turn.briefLine.hidden = false;
    // What the panel says of a misconception once this has said it.
    turn.heardLine.hidden = true;
    turn.briefLine.replaceChildren(...[
      el('p', 'label', 'Before the reply'),
      el('p', null, `The learner is ${moments[event.moment] || moments.other}.`),
      event.move ? el('p', 'note', event.move) : null,
      parts.length ? el('p', 'label', 'What went in for this message') : null,
      ...parts.map((text) => el('p', null, text)),
      event.flag ? el('p', 'note', 'The teacher will see this one.') : null
    ].filter(Boolean));
    toEnd();
  }

  window.addEventListener('viable:trace', ({ detail: event }) => {
    if (!event) return;
    if (event.kind === 'turn') return begin(event);
    if (!turn) return;
    if (event.kind === 'brief') return onBrief(event);
    if (event.kind === 'step' && event.type === 'vetting') {
      turn.review.hidden = false;
      turn.review.textContent = event.holds_key ? 'A reviewer reads every draft before the learner sees anything. It holds the answer key. The AI writing the reply doesn’t.' : 'A reviewer reads every draft before the learner sees anything.';
      status('Writing a draft');
      return toEnd();
    }
    if (event.kind === 'step' && event.type === 'knowledge') return status('Looking in its own files');
    if (event.kind === 'passages') return onPassages(event);
    if (event.kind === 'heard') return onHeard(event);
    if (event.kind === 'draft') return onDraft(event);
    if (event.kind === 'round') return onRound(event.round);
    if (event.kind === 'reached') return onReached(event);
    if (event.kind === 'failed') {
      status('');
      turn.end.replaceChildren(treeDom(mark('unverified', 'The run stopped')), el('p', 'note', event.message));
      turn.end.hidden = false;
      return toEnd();
    }
  });
  // For a scripted tour: the panel's own control, and a line of caption.
  host.watch = { change, say(text) { says.textContent = text || ''; says.hidden = !text; } };
}

const CONSTANTS = { TAGS, ATTRIBUTES, OUTCOMES, VERDICTS, TEST_VERDICTS, HELP_NAMES, MARKS };
const SOURCE = asSource(CONSTANTS, [h, str, quote, mark, vettingRound, helpScale, treeDom, watchPanel]).replace(/<\//g, '<\\/');
const NAME = /function\s+([\w$]+)/.exec(String(watchPanel))[1];

// Tokens on the panel's own root: it stands on any page, whatever that page calls its colours.
const SHADOW_THEME = themeCss({ fonts: 'none' }).replace(/:root:not\(\[data-theme=light\]\)/g, ':host(:not([data-theme=light]))').replace(/:root\[data-theme=(\w+)\]/g, ':host([data-theme=$1])').replace(/:root/g, ':host');

const PANEL_CSS = `${SHADOW_THEME}
${PARTS_CSS}
[hidden]{display:none!important}
.panel{display:flex;flex-direction:column;height:100%;border-left:1px solid var(--public-rule);background:var(--field-mist);color:var(--public-text);font:400 .9375rem/1.5 var(--font-public);-webkit-font-smoothing:antialiased}
.head{flex:none;padding:16px 22px 10px}
.title{display:flex;align-items:center;gap:10px}
.logo{display:flex;flex:none}
.head h2{flex:1;margin:0;color:var(--public-ink);font-size:1.5rem;font-weight:300;line-height:1.15;letter-spacing:-.03em}
.head p{margin:6px 0 0;color:var(--muted);font-size:.875rem;line-height:1.4}
.head .mode{display:inline-block;padding:1px 10px;border:1px solid var(--public-rule-strong);border-radius:var(--radius-pill);color:var(--public-text);font-size:.8125rem}
.head .warning{color:var(--pencil-red)}
.close{display:none;padding:6px 12px;border:1px solid var(--public-rule-strong);border-radius:var(--radius-pill);background:transparent;color:var(--public-ink);font:600 .875rem var(--font-public);cursor:pointer}
.caption{flex:none;margin:0 22px 10px;padding:10px 14px;border-radius:var(--radius-sm);background:var(--code-bg);color:var(--code-ink);font-size:.9375rem;line-height:1.35}
.scroll{flex:1;min-height:0;padding:12px 22px 28px;border-top:1px solid var(--public-rule);overflow-y:auto;overscroll-behavior:contain}
.label{margin:0;color:var(--public-ink);font-size:.8125rem;font-weight:600;line-height:1.4;letter-spacing:0}
.row-label{margin:12px 0 8px;color:var(--muted);font-size:.8125rem;font-weight:500;line-height:1.3}
.settings{flex:none;padding:0 22px 12px}
.settings .scale{margin:0}
.settings .scale li{padding-top:10px}
.settings .scale button{display:block;width:100%;padding:0 2px 4px 0;border:0;background:none;color:inherit;font:inherit;font-weight:inherit;line-height:1.25;text-align:left;cursor:pointer}
.settings .scale button:hover{color:var(--ink-blue)}
.settings .scale button:focus-visible{outline:2px solid var(--ink-blue);outline-offset:2px;border-radius:4px}
.goal{display:-webkit-box;margin:0;overflow:hidden;color:var(--public-ink);font-size:.875rem;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.goal-row .row-label{margin-top:12px;margin-bottom:2px}
.link{padding:2px 0;border:0;background:none;color:var(--ink-blue);font:500 .8125rem var(--font-public);text-decoration:underline 1px var(--ink-blue-line);text-underline-offset:.22em;cursor:pointer}
.link:hover{text-decoration-color:currentColor}
.goal-tools{display:flex;align-items:center;gap:12px;margin-top:8px}
.settings textarea{resize:vertical;font-size:.875rem;min-height:0}
.listening{margin-top:10px;font-size:.8125rem}
.listening summary{color:var(--muted);font-weight:500;cursor:pointer}
.listening ul{margin:6px 0 0;padding-left:1.1rem;color:var(--public-text);line-height:1.4}
.listening li+li{margin-top:3px}
.listening .heard{color:var(--query-ochre);font-weight:600}
.said-back{margin:8px 0 0;color:var(--ink-blue);font-size:.8125rem;font-weight:500}
.said-back:empty{display:none}
.empty{margin:4px 0 0;padding:16px 18px;border:1px dashed var(--public-rule-strong);border-radius:var(--radius-sm);color:var(--public-text);font-size:.9375rem;line-height:1.45}
.turn{margin-bottom:12px;padding:16px 18px;border-radius:var(--radius);background:var(--surface);box-shadow:var(--public-shadow)}
.turn>summary{display:block;list-style:none;cursor:pointer}
.turn>summary::-webkit-details-marker{display:none}
.turn>summary:focus-visible{outline:2px solid var(--ink-blue);outline-offset:4px;border-radius:4px}
.said{margin:2px 0 0;color:var(--public-ink);font-size:1.3125rem;font-weight:300;line-height:1.25;letter-spacing:-.02em;overflow-wrap:anywhere}
.turn:not([open]) .said{font-size:1rem;display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:1}
.told{margin-top:12px;padding-top:10px;border-top:1px solid var(--public-rule)}
.told p:last-child{margin:2px 0 0;color:var(--public-text);font-size:.875rem;line-height:1.4}
.review-note{margin:10px 0 0;color:var(--muted);font-size:.8125rem;line-height:1.4}
.rounds{margin-top:12px}
.rounds:empty{display:none}
.round+.round{margin-top:12px;padding-top:12px}
.round-body{grid-template-columns:minmax(0,1fr);gap:8px}
.draft blockquote,.draft del{font-size:.9375rem;line-height:1.45}
.pencil{font-size:.875rem}
.live .round:nth-child(n){--at:0s}
.status{display:flex;align-items:center;gap:9px;margin:12px 0 0;color:var(--muted);font-size:.8125rem}
.status::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;background:var(--ink-blue);animation:watch-breathe 1.4s ease-in-out infinite}
.reached{margin-top:12px;padding-top:10px;border-top:1px solid var(--public-rule)}
.reached blockquote{margin:3px 0 8px;color:var(--public-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.reached .note{margin:6px 0 0;font-size:.8125rem}
.reached .v-mark{font-size:.875rem}
.heard{margin-top:12px;padding-top:10px;border-top:1px solid var(--public-rule)}
.heard p{margin:2px 0 0;color:var(--query-ochre);font-size:.875rem;font-weight:600;line-height:1.35}
.heard .label{color:var(--public-ink)}
.heard .note{color:var(--muted);font-size:.8125rem;font-weight:400}
.passages{margin-top:12px;padding-top:10px;border-top:1px solid var(--public-rule)}
.passages ol{margin:6px 0 0;padding:0;list-style:none}
.passages li{padding:7px 0 7px 10px;border-left:1.5px solid var(--public-rule);font-size:.8125rem;line-height:1.35}
.passages li+li{margin-top:2px}
.passages li.cited{border-left-color:var(--pass-green)}
.passages strong{display:block;color:var(--public-ink);font-weight:600}
.passages span{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2}
@keyframes watch-breathe{50%{opacity:.25}}
@media (prefers-reduced-motion:no-preference){
.watch .draft.reading::after{animation:v-read 1.7s ease-in-out infinite alternate}
.turn:last-child .told,.heard:not([hidden]),.passages:not([hidden]),.reached:not([hidden]){animation:part-in .45s var(--ease-out) both}}
@media (prefers-reduced-motion:reduce){.status::before{animation:none}}
@media (max-height:640px){.panel{overflow-y:auto}.scroll{flex:none;overflow:visible}}
@media (max-width:1023px){.panel{border-left:0}.close{display:block}}`;

// On the page: room at its side, and on a narrow screen a bar above it that opens the panel over it.
const INK_BLUE = TOKENS.light['ink-blue'];
const pageCss = (fontBase) => `${fontFaces({ url: true, base: fontBase })}
:root{--beside:clamp(360px,31vw,480px)}
html{padding-right:var(--beside)}
#ai-watch{position:fixed;top:0;right:0;bottom:0;z-index:40;width:var(--beside);display:block}
#ai-watch-open{display:none}
body.ai-corner .app,body.ai-corner .ws-ai{right:calc(var(--beside) + 18px)}
.crs-stale{left:calc((100vw - var(--beside))/2)}
@media (max-width:1023px){
:root{--beside:0px}
html{padding-top:40px}
#ai-watch{left:0;width:auto;display:none}
#ai-watch.open{display:block}
#ai-watch-open{position:fixed;top:0;right:0;left:0;z-index:30;display:flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border:0;background:${INK_BLUE};color:#fff;font:600 .875rem/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
#ai-watch-open:focus-visible{outline:2px solid #fff;outline-offset:-4px}
#ai-watch-open[data-state=struck]::after{content:"";width:8px;height:8px;border-radius:50%;background:#ec9a90}}`;

/**
 * The panel as a page's slots.beside. Give it only to a request the host has granted it. teaching: the
 * settings as settingsShown says them; note: a few words saying what is answering; warning: what's wrong
 * with this page, if anything; hint: what the empty panel suggests; control: { url, page }, where the settings can be changed for a
 * try-out (POST { page, help?, goal? } answers { teaching }); extra: more of the host's own script.
 */
export function watchSlot({ teaching = null, note = null, warning = null, hint = null, control = null, signOut = null, extra = '', fontBase } = {}, nonce) {
  const config = { teaching: settingsShown(teaching), note, warning, hint, control, signOut, css: PANEL_CSS, nonce, mark: markSvg({ size: 24 }) };
  return {
    css: pageCss(fontBase),
    html: '<aside id="ai-watch" aria-label="What the AI did"></aside><button id="ai-watch-open" type="button">What the AI did</button>',
    script: `(function(){\n${SOURCE}\n${NAME}(${scriptJson(config)});\n})();\n${extra}`
  };
}
