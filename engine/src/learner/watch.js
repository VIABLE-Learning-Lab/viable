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
import { asSource, ATTRIBUTES, h, HELP_NAMES, helpScale, MARKS, mark, OUTCOMES, PARTS_CSS, quote, str, TAGS, TEST_VERDICTS, vettingRounds, treeDom, VERDICTS, vettingRound } from '../../../harness/src/ui/parts.js';
import { fontFaces, markSvg, themeCss, TOKENS } from '../../../harness/src/ui/theme.js';
import { HELP_LEVELS, teachingSettings } from '../../../harness/src/utils/teaching.js';
import { scriptJson } from './shell.js';
import { SPEAK_UP } from '../../../harness/src/speakUp.js';

// A passage as a sentence to read: without its headings and its marks.
const plain = (text) => String(text ?? '').replace(/^#+\s.*$|^\*[^*\n]+\*$/gm, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
const clipped = (value, limit) => (typeof value === 'string' && value.length > limit ? `${value.slice(0, limit).replace(/\s+\S*$/, '')}…` : value);

/** What the panel says of an activity's settings, with a section's own help level over them. What the teacher wants to hear about is for the teacher, and isn't given to the AI. */
export function settingsShown(teaching, section = null) {
  const saved = teachingSettings(teaching);
  if (!saved) return null;
  const help = (section && saved.sections?.[section]?.help) || saved.help;
  return {
    goal: saved.goal, help, told: help ? HELP_LEVELS[help] : null, role: saved.role || null,
    standard: saved.standard ? { code: saved.standard.code || null, description: saved.standard.description } : null,
    listens_for: (saved.misconceptions || []).map((item) => item.description)
  };
}

/**
 * What a run keeps for its record (context.turn_record), so What the AI did can be drawn again from what the host stored: the step the
 * learner was on, and what the Harness read of the moment, with where each thing came from. Never the learner's words.
 */
export function turnRecord(brief, step = null) {
  const named = (source) => [source?.name, source?.license].filter(Boolean).join(', ') || null;
  return {
    ...(step ? { step: { title: step.title, brief: step.brief || null } } : {}),
    ...(brief ? { brief: { moment: brief.moment, move: brief.move || null, move_source: brief.move_source || null, by: brief.by || 'rules', flag: brief.flag || null, went_in: [
      ...(brief.misconceptions || []).map((item) => ({ what: 'A misconception that may be behind it', text: item.description, source: named(item.source) })),
      ...(brief.components || []).map((item) => ({ what: 'The part of the skill in play', text: item.description, source: named(item.source) })),
      ...(brief.prior || []).map((item) => ({ what: 'What to go back to', text: item.description, source: named(item.source) })),
      ...(brief.guidance || []).map((item) => ({ what: 'From research', text: item.text, source: item.source || null }))
    ] } } : {})
  };
}

/**
 * A turn a host kept, as the events the panel draws: { message, first, started_at, completed_at, status, error, reply, citations, context,
 * steps: [{ nodeType, input, output }] }. Each host keeps the same parts (a run's context with its turn_record, its review and its search),
 * so the record is the same wherever it is read, in any browser, for as long as the turn is kept.
 */
export function turnEvents(turn) {
  const at = Date.parse(turn.started_at || '') || null;
  const end = Date.parse(turn.completed_at || '') || at;
  const record = turn.context?.turn_record || {};
  const steps = Array.isArray(turn.steps) ? turn.steps : [];
  const events = [{ kind: 'turn', at, message: turn.first ? null : turn.message ?? null, ...(turn.first ? { first: turn.first } : {}), teaching: settingsShown(turn.context?.workspace?.teaching || null), ...(record.step ? { step: record.step } : {}) }];
  if (record.brief) events.push({ kind: 'brief', ...record.brief });
  let outcome = null;
  for (const step of steps) {
    if (step.nodeType === 'knowledge') events.push({ kind: 'passages', query: step.input?.query ?? null, items: (step.output?.results || []).map((item) => ({ index: item.index, title: item.title || null, text: clipped(plain(item.text), 260) })) });
    if (step.nodeType !== 'vetting') continue;
    events.push({ kind: 'step', type: 'vetting', holds_key: step.input?.mode === 'full' });
    for (const round of step.output?.attempt_details || []) {
      if (round.reply != null) events.push({ kind: 'draft', attempt: round.attempt, source: round.source, reply: round.reply });
      events.push({ kind: 'round', round: { attempt: round.attempt, source: round.source, verdict: round.verdict, reply: round.reply, feedback: round.feedback } });
    }
    outcome = step.output?.outcome ?? outcome;
  }
  events.push(turn.status === 'failed' ? { kind: 'failed', at: end, message: turn.error || 'The run stopped.' } : { kind: 'reached', at: end, text: turn.reply ?? '', citations: turn.citations || [], outcome });
  return events;
}

/** How a turn's record looks on a teacher's page (turnTree), with the parts it is made of. */
export const TRACE_CSS = `${PARTS_CSS}
.trace{display:grid;gap:10px}
.trace>summary.trace-head{cursor:pointer}
.trace:not([open])>summary .trace-first,.trace:not([open])>summary blockquote{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:1}
.trace-head{display:flex;flex-wrap:wrap;align-items:start;justify-content:space-between;gap:8px 14px}
.trace-head blockquote,.trace-first{flex:1 1 260px;margin:0;color:var(--public-ink);font-weight:500}
.trace-facts{display:flex;align-items:center;gap:6px;margin:0}
.trace-brief{display:grid;gap:4px;padding:10px 12px;border-radius:var(--radius-sm);background:var(--field-mist);font-size:.875rem;line-height:1.5}
.trace-brief p{margin:0}`;

/** A turn as the Engine's store keeps it (server/learner.js keepTurn), as turnEvents reads it. */
export const keptTurnEvents = (turn) => turnEvents({ message: turn.message, first: turn.signals?.source === 'ai_first' ? turn.signals.moment : null, started_at: turn.started_at, completed_at: turn.completed_at || turn.started_at, status: 'completed', reply: turn.reply, citations: [], context: { workspace: { teaching: turn.run?.teaching || null }, turn_record: turn.turn_record || null }, steps: turn.run?.steps || [] });

// Math as a person reads it, as the panel does (its readable): a fraction as 2/3, a times sign as ×.
const asRead = (text) => String(text ?? '').replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2').replace(/\\[([]\s*/g, '').replace(/\s*\\[)\]]/g, '').replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/[ \t]+\n/g, '\n').trim();

// The moment as the panel says it, after “The learner is”.
const MOMENT_PHRASES = { attempt: 'giving an answer or some working', asks_answer: 'asking for the answer', stuck: 'stuck, with nothing tried yet', repeated: 'still not there after trying more than once', other: 'saying something else' };

/**
 * One turn's record, drawn once on a server (parts.js treeHtml) for a teacher's page: what the panel shows, in the same words, without
 * its motion. events: turnEvents's.
 */
export function turnTree(events, { fold = false, open = true } = {}) {
  const turn = events.find((event) => event.kind === 'turn') || {};
  const brief = events.find((event) => event.kind === 'brief');
  const rounds = events.filter((event) => event.kind === 'round').map((event) => ({ ...event.round, reply: event.round.reply == null ? event.round.reply : asRead(event.round.reply) }));
  const reached = events.find((event) => event.kind === 'reached');
  const failed = events.find((event) => event.kind === 'failed');
  const passed = rounds.at(-1)?.verdict === 'pass';
  const seconds = turn.at && (reached || failed)?.at ? Math.max(1, Math.round(((reached || failed).at - turn.at) / 1000)) : null;
  const said = turn.first ? h('p', { class: 'trace-first' }, `The AI wrote first: ${(SPEAK_UP[turn.first]?.label || 'a moment the teacher chose').toLowerCase()}.`) : quote(turn.message == null ? turn.message : asRead(turn.message), 'No words: a recording or a file.');
  const head = [said, h('p', { class: 'trace-facts' },
      failed ? mark('unverified', 'The run stopped') : passed ? mark('pass', rounds.length > 1 ? `Rewritten ${rounds.length - 1 === 1 ? 'once' : `${rounds.length - 1} times`} before it passed` : 'Passed the check') : rounds.length ? mark(MARKS[reached?.outcome] || 'unverified', OUTCOMES[reached?.outcome]?.[0] || 'Unverified') : mark('unverified', 'Not checked'),
      seconds ? h('span', { class: 'muted' }, ` ${seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`}`) : null)];
  const body = [
    turn.step ? h('p', { class: 'note' }, `In the step “${str(turn.step.title)}”.`) : null,
    brief ? h('div', { class: 'trace-brief' },
      h('p', null, h('strong', null, 'The VIABLE Harness read the moment. '), turn.first ? `${str(SPEAK_UP[turn.first]?.label || '')}.` : `The learner is ${MOMENT_PHRASES[brief.moment] || MOMENT_PHRASES.other}.`),
      brief.move ? h('p', null, 'So the AI was told: ', brief.move, brief.move_source ? h('span', { class: 'muted' }, ` (${brief.move_source})`) : null) : null,
      ...(brief.went_in || []).map((item) => h('p', null, `${str(item.what)}: `, str(item.text), item.source ? h('span', { class: 'muted' }, ` (${item.source})`) : null))) : null,
    rounds.length ? vettingRounds(rounds) : null,
    failed ? h('p', { class: 'note' }, str(failed.message)) : passed ? null : h('div', null, h('p', { class: 'note' }, rounds.length ? 'What reached the learner:' : 'Nothing checked this reply: this AI has no second reader.'), quote(reached?.text == null ? reached?.text : asRead(reached.text), 'No reply.'))];
  // Folded, a list of turns reads as one line each until one is opened.
  return fold ? h('details', { class: 'trace', ...(open ? { open: '' } : {}) }, h('summary', { class: 'trace-head' }, ...head), ...body) : h('article', { class: 'trace' }, h('header', { class: 'trace-head' }, ...head), ...body);
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
    // Each thing that went in, with where it came from, so whoever reads this can see what the Harness added and whose work it is.
    onBrief: (brief) => {
      const named = (source) => [source?.name, source?.license].filter(Boolean).join(', ') || null;
      say({ kind: 'brief', moment: brief.moment, move: brief.move, move_source: brief.move_source || null, by: brief.by, flag: brief.flag, went_in: [
        ...brief.misconceptions.map((item) => ({ what: 'A misconception that may be behind it', text: item.description, source: named(item.source) })),
        ...brief.components.map((item) => ({ what: 'The part of the skill in play', text: item.description, source: named(item.source) })),
        ...brief.prior.map((item) => ({ what: 'What to go back to', text: item.description, source: named(item.source) })),
        ...(brief.guidance || []).map((item) => ({ what: 'From research', text: item.text, source: item.source || null }))
      ] });
    },
    onVettingDraft: (node, draft) => say({ kind: 'draft', attempt: draft.attempt, source: draft.source, reply: draft.reply }),
    onVettingRound: (node, round) => say({ kind: 'round', round: { attempt: round.attempt, source: round.source, verdict: round.verdict, reply: round.reply, feedback: round.feedback } })
  };
}

// The panel, as a function so a bundler renames it and what it calls together (asSource). Everything
// from a learner or a model goes in as text, never as markup.
function watchPanel(config) {
  let teaching = config.teaching;
  let turn = null;
  let replaying = false;
  // The record is the host's: every reply here is kept with its run and read again when the panel opens (record), so a reload,
  // another day or any number of turns loses nothing. What arrives while it is read waits its turn.
  let loading = Boolean(config.record);
  const waiting = [];
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
  close.addEventListener('click', () => { host.classList.remove('open'); document.documentElement.classList.add('ai-watch-hidden'); opener.focus(); });
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
  const empty = el('p', 'empty', config.hint || 'Each message to the AI shows here, as it happens.');
  const foot = el('p', 'foot', config.record ? 'Every reply is kept with its run: this reads the same after a reload, and the activity’s page keeps your previews.' : 'Only while this page is open.');
  foot.hidden = true;
  scroller.append(empty, turns, foot);
  panel.append(head, settingsPart(), says, scroller);
  root.append(style, panel);
  opener.addEventListener('click', () => { document.documentElement.classList.remove('ai-watch-hidden'); host.classList.add('open'); close.focus(); });

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toEnd = () => scroller.scrollTo({ top: scroller.scrollHeight, behavior: reduce || replaying ? 'auto' : 'smooth' });

  // The teacher's settings, and in a try-out the small control that changes them.
  function settingsPart() {
    const part = el('details', 'settings');
    part.open = true;
    drawSettings(part);
    return part;
  }
  function drawSettings(part = root.querySelector('.settings'), note = '') {
    const set = teaching || {};
    // Folded once a turn begins, to the two things that matter, so what happened has the room.
    const shortly = [set.help ? HELP_NAMES[set.help] : null, set.goal].filter(Boolean).join(': ');
    const kids = [el('summary', null, el('span', 'label', 'The teacher’s settings'), shortly ? el('span', 'shortly', shortly) : null)];
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
      kids.push(el('p', 'row-label', 'How much the AI does'), scale);
    }
    kids.push(goalPart(part, set));
    if (set.role) kids.push(el('div', 'goal-row', el('p', 'row-label', 'Who the AI is here'), el('p', 'goal', set.role)));
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
  // A reply as the learner reads it: their page draws its math and its emphasis, and here a fraction shouldn't read as code.
  const readable = (text) => String(text ?? '').replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2').replace(/\\[([]\s*/g, '').replace(/\s*\\[)\]]/g, '').replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/[ \t]+\n/g, '\n').trim();

  function begin(event) {
    empty.hidden = true;
    foot.hidden = false;
    if (turn) turn.node.open = false;
    if (event.teaching && !replaying) teaching = event.teaching;
    root.querySelector('.settings').open = false;
    const told = [event.teaching?.role ? `Who it is here: ${event.teaching.role}` : null, event.teaching?.told, event.step?.brief ? `In “${event.step.title}”: ${event.step.brief}` : null].filter(Boolean);
    const rounds = el('ol', 'rounds watch live');
    const statusLine = el('p', 'status');
    // A turn the AI began says so, and why: the moment the teacher chose.
    const first = event.first ? config.firstWords?.[event.first] || 'A moment the teacher chose' : null;
    const said = el('blockquote', 'said', first || event.message);
    const facts = el('p', 'facts');
    facts.hidden = true;
    const node = el('details', `turn${replaying ? ' is-past' : ''}${first ? ' is-first' : ''}`, el('summary', null, el('span', 'label', first ? 'The AI wrote first' : 'The learner wrote'), said, facts));
    node.open = true;
    const part = (kids, className = '') => { const item = el('li', `part ${className}`, ...kids); item.hidden = true; return item; };
    const briefLine = part([], 'brief');
    const toldLine = part(told.length ? [el('p', 'label', 'What the teacher set went with it'), ...told.map((text) => el('p', 'said-to', text))] : []);
    toldLine.hidden = !told.length;
    const heardLine = part([], 'heard');
    const passages = part([], 'passages');
    const reviewing = el('p', 'review-note');
    reviewing.hidden = true;
    const roundsPart = part([reviewing, rounds, statusLine], 'checks');
    roundsPart.hidden = false;
    const end = part([], 'reached');
    node.append(el('ol', 'trail', briefLine, toldLine, heardLine, passages, roundsPart, end));
    turn = { node, rounds, status: statusLine, briefLine, heardLine, passages, review: reviewing, end, facts, waiting: null, last: null, tries: 0, began: event.at || Date.now(), heard: new Set(), direct: false, first };
    turns.append(node);
    status('Writing a reply');
    toEnd();
  }

  function onDraft(event) {
    const item = treeDom(h('li', { class: 'round' },
      h('p', { class: 'round-name' }, `Round ${str(event.attempt)}, ${named(event.attempt)}`),
      h('div', { class: 'round-body' }, h('div', { class: 'draft reading' }, quote(readable(event.reply))))));
    turn.rounds.append(item);
    turn.waiting = item;
    status('The reviewer is reading it');
    toEnd();
  }

  function onRound(round) {
    const item = treeDom(vettingRound({ ...round, reply: round.reply == null ? round.reply : readable(round.reply) }, Number(round.attempt) - 1));
    if (turn.waiting) turn.waiting.replaceWith(item); else turn.rounds.append(item);
    turn.waiting = null;
    turn.last = round;
    turn.tries += 1;
    status(round.verdict === 'fail' ? 'Rewriting, with the reviewer’s reason' : '');
    toEnd();
  }

  function onPassages(event) {
    const items = event.items || [];
    turn.passages.hidden = false;
    turn.passages.replaceChildren(
      el('p', 'label', items.length ? 'It looked in what it was given' : 'It looked in what it was given, and found nothing'),
      el('ol', null, ...items.map((item) => {
        const row = el('li', null, el('strong', null, item.title || 'Untitled'), el('span', null, item.text || ''));
        row.dataset.index = String(item.index);
        return row;
      })));
    status('Writing a reply');
    toEnd();
  }

  // What the turn came to, on its folded line too, so a look down the list says how each went.
  function closeTurn(words, kind, at) {
    const seconds = Math.max(1, Math.round(((at || Date.now()) - turn.began) / 1000));
    turn.facts.hidden = false;
    turn.facts.replaceChildren(treeDom(mark(kind, words)), el('span', 'took', seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`));
  }
  function onReached(event) {
    status('');
    const passed = turn.last?.verdict === 'pass' && readable(turn.last.reply) === readable(event.text);
    const outcome = OUTCOMES[event.outcome];
    const kids = [];
    closeTurn(passed ? (turn.tries > 1 ? `Rewritten ${turn.tries - 1 === 1 ? 'once' : `${turn.tries - 1} times`} before it passed` : 'Passed the check') : outcome ? outcome[0] : 'Not checked', passed ? 'pass' : outcome ? MARKS[event.outcome] : 'query', event.at);
    if (passed) kids.push(treeDom(mark('pass', 'This is what reached the learner')));
    else {
      kids.push(el('p', 'label', 'What reached the learner'), el('blockquote', null, readable(event.text)));
      if (outcome) kids.push(treeDom(mark(MARKS[event.outcome], `${outcome[0]}: ${outcome[1]}`)));
      else kids.push(el('p', 'note', 'Nothing checked this reply: this AI has no second reader, so it went straight to the learner. Which AI an activity uses is on its page.'));
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
    turn.heardLine.replaceChildren(el('p', 'label', 'Heard in this message'), ...event.items.map((text) => el('p', 'heard-text', text)), el('p', 'note', 'A misconception the teacher chose to listen for. The Harness asked a model about this message separately.'));
    drawSettings();
    toEnd();
  }

  // What the model was given before it wrote anything: this moment, and only what it calls for.
  function onBrief(event) {
    const moments = { attempt: 'giving an answer or some working', asks_answer: 'asking for the answer', stuck: 'stuck, with nothing tried yet', repeated: 'still not there after trying more than once', other: 'saying something else' };
    const from = (source) => (source ? el('cite', 'source', source) : null);
    // Older records said these as bare words.
    const parts = event.went_in || [...(event.misconceptions || []), ...(event.components || []), ...(event.prior || []), ...(event.guidance || [])].map((text) => ({ text }));
    turn.briefLine.hidden = false;
    // What the panel says of a misconception once this has said it.
    turn.heardLine.hidden = true;
    const how = config.docs ? el('a', 'link', 'How this works') : null;
    if (how) { how.href = config.docs; how.target = '_blank'; how.rel = 'noopener'; }
    turn.briefLine.replaceChildren(...[
      el('p', 'label', 'The VIABLE Harness read the moment'),
      el('p', 'moment', turn.first ? `${turn.first}. The teacher chose this moment for the AI to write first, unasked.` : `The learner is ${moments[event.moment] || moments.other}.`),
      event.move ? el('div', 'went', el('span', 'what', 'So the AI was told'), el('p', null, event.move), from(event.move_source)) : null,
      ...parts.map((item) => el('div', 'went', item.what ? el('span', 'what', item.what) : null, el('p', null, item.text), from(item.source))),
      el('p', 'note', event.by === 'model' ? 'A small model read this message. ' : 'Read by rules: no model, no cost. ', how),
      event.flag ? el('p', 'note', 'The teacher will see this one.') : null
    ].filter(Boolean));
    toEnd();
  }

  const handle = (event) => {
    if (event.kind === 'turn') return begin(event);
    if (!turn) return;
    if (event.kind === 'brief') return onBrief(event);
    if (event.kind === 'step' && event.type === 'vetting') {
      turn.review.hidden = false;
      turn.review.textContent = event.holds_key ? 'A second reader checks every draft for one thing: that it doesn’t give the answer away. It holds the answer key, and the AI writing the reply doesn’t. It reads only the reply, never the learner’s words, so whether the reply is a good one is for you to read.' : 'A second reader checks every draft against what the teacher set. It reads only the reply, never the learner’s words, so whether the reply is a good one is for you to read.';
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
      closeTurn('The run stopped', 'unverified', event.at);
      turn.end.replaceChildren(treeDom(mark('unverified', 'The run stopped')), el('p', 'note', event.message));
      turn.end.hidden = false;
      return toEnd();
    }
  };
  window.addEventListener('viable:trace', ({ detail }) => {
    if (!detail) return;
    const event = { ...detail, at: Date.now() };
    if (loading) waiting.push(event); else handle(event);
  });
  // What was kept, as it was, then what came meanwhile. A turn that stopped in the middle says so.
  const replay = (events) => {
    replaying = true;
    for (const event of events) { try { handle(event); } catch { /* An old record doesn't stop the panel. */ } }
    if (turn && !turn.end.children.length) { status(''); turn.status.hidden = false; turn.status.classList.add('is-stopped'); turn.status.textContent = 'This one didn’t finish.'; }
    replaying = false;
  };
  if (config.record) {
    const visitor = window.VIABLE_CHAT && window.VIABLE_CHAT.visitor ? window.VIABLE_CHAT.visitor() : null;
    fetch(location.pathname.replace(/\/$/, '') + '/watch' + location.search, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor }) })
      .then((res) => (res.ok ? res.json() : { turns: [] }))
      .catch(() => ({ turns: [] }))
      .then((data) => {
        for (const kept of data.turns || []) replay(kept.events || []);
        loading = false;
        for (const event of waiting.splice(0)) handle(event);
        toEnd();
      });
  }
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
.head .mode{padding:6px 10px;border:1px solid var(--public-rule-strong);border-radius:10px;color:var(--public-text);font-size:.8125rem;line-height:1.35}
.head .warning{color:var(--pencil-red)}
.close{padding:6px 12px;border:1px solid var(--public-rule-strong);border-radius:var(--radius-pill);background:transparent;color:var(--public-ink);font:600 .875rem var(--font-public);cursor:pointer}
.caption{flex:none;margin:0 22px 10px;padding:10px 14px;border-radius:var(--radius-sm);background:var(--code-bg);color:var(--code-ink);font-size:.9375rem;line-height:1.35}
.scroll{flex:1;min-height:0;padding:12px 22px 28px;border-top:1px solid var(--public-rule);overflow-y:auto;overscroll-behavior:contain}
.label{margin:0;color:var(--public-ink);font-size:.8125rem;font-weight:600;line-height:1.4;letter-spacing:0}
.row-label{margin:12px 0 8px;color:var(--muted);font-size:.8125rem;font-weight:500;line-height:1.3}
.settings{flex:none;padding:0 22px 12px}
.settings>summary{display:grid;gap:1px;list-style:none;cursor:pointer}
.settings>summary::-webkit-details-marker{display:none}
.settings>summary .label::after{content:"";display:inline-block;width:.42em;height:.42em;margin:0 0 .14em .55em;border-right:1.5px solid var(--muted);border-bottom:1.5px solid var(--muted);transform:rotate(45deg);transition:transform .14s var(--ease-out)}
.settings[open]>summary .label::after{transform:rotate(-135deg) translate(-2px,-2px)}
.shortly{overflow:hidden;color:var(--muted);font-size:.8125rem;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}
.settings[open] .shortly{display:none}
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
.turn{margin-bottom:10px;padding:14px 16px;border-radius:var(--radius);background:var(--surface);box-shadow:var(--public-shadow)}
.turn:not([open]){padding:10px 16px}
.facts{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:2px 10px;margin:6px 0 0;font-size:.8125rem}
.facts .v-mark{font-size:.8125rem}
.took{color:var(--muted);font-variant-numeric:tabular-nums}
.foot{margin:10px 0 0;color:var(--muted);font-size:.75rem}
.foot .link{font-size:.75rem}
.trail{display:grid;gap:12px;margin:12px 0 0 3px;padding:0 0 0 15px;border-left:1px solid var(--public-rule);list-style:none}
.part{position:relative;min-width:0}
.part::before{content:"";position:absolute;top:.48em;left:-19px;width:7px;height:7px;border-radius:50%;background:var(--public-rule-strong);box-shadow:0 0 0 3px var(--surface)}
.part.reached::before{background:var(--pass-green)}
.said-to{margin:3px 0 0;color:var(--public-text);font-size:.875rem;line-height:1.42}
.moment{margin:3px 0 0;color:var(--public-ink);font-size:.875rem;line-height:1.4}
.went{margin-top:9px;font-size:.875rem;line-height:1.42}
.went p{margin:1px 0 0;color:var(--public-text)}
.what{color:var(--muted);font-size:.75rem;font-weight:600}
.source{display:block;margin-top:3px;color:var(--ink-blue);font-size:.75rem;font-style:normal;line-height:1.35}
.heard-text{color:var(--query-ochre);font-weight:600}
.status.is-stopped::before{display:none}
.is-past .draft.reading::after{animation:none}
.turn>summary{display:block;list-style:none;cursor:pointer}
.turn>summary::-webkit-details-marker{display:none}
.turn>summary:focus-visible{outline:2px solid var(--ink-blue);outline-offset:4px;border-radius:4px}
.said{margin:2px 0 0;color:var(--public-ink);font-size:1.3125rem;font-weight:300;line-height:1.25;letter-spacing:-.02em;overflow-wrap:anywhere}
.turn:not([open]) .said{font-size:1rem;display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:1}
.is-first .said{color:var(--ink-blue);font-style:normal}
.review-note{margin:0;color:var(--muted);font-size:.8125rem;line-height:1.4}
.rounds{margin-top:8px}
.rounds:empty{display:none}
.round+.round{margin-top:12px;padding-top:12px}
.round-body{grid-template-columns:minmax(0,1fr);gap:8px}
.draft blockquote,.draft del{font-size:.9375rem;line-height:1.45}
.pencil{font-size:.875rem}
.live .round:nth-child(n){--at:0s}
.status{display:flex;align-items:center;gap:9px;margin:12px 0 0;color:var(--muted);font-size:.8125rem}
.status::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;background:var(--ink-blue);animation:watch-breathe 1.4s ease-in-out infinite}
.reached blockquote{margin:3px 0 8px;color:var(--public-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.reached .note{margin:6px 0 0;font-size:.8125rem}
.reached .v-mark{font-size:.875rem}
.heard p{margin:2px 0 0;font-size:.875rem;line-height:1.35}
.heard .note,.brief .note{margin-top:8px;color:var(--muted);font-size:.8125rem;font-weight:400}
.passages ol{margin:6px 0 0;padding:0;list-style:none}
.passages li{padding:7px 0 7px 10px;border-left:1.5px solid var(--public-rule);font-size:.8125rem;line-height:1.35}
.passages li+li{margin-top:2px}
.passages li.cited{border-left-color:var(--pass-green)}
.passages strong{display:block;color:var(--public-ink);font-weight:600}
.passages span{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2}
@keyframes watch-breathe{50%{opacity:.25}}
@media (prefers-reduced-motion:no-preference){
.watch .draft.reading::after{animation:v-read 1.7s ease-in-out infinite alternate}
.turn:not(.is-past) .part:not([hidden]){animation:part-in .45s var(--ease-out) both}}
@media (prefers-reduced-motion:reduce){.status::before{animation:none}}
@media (max-height:640px){.panel{overflow-y:auto}.scroll{flex:none;overflow:visible}}
@media (max-width:1023px){.panel{border-left:0}}`;

// On the page: room at its side, and on a narrow screen a bar above it that opens the panel over it.
const INK_BLUE = TOKENS.light['ink-blue'];
const pageCss = (fontBase) => `${fontFaces(fontBase === null ? {} : { url: true, base: fontBase })}
:root{--beside:clamp(360px,31vw,480px)}
html{padding-right:var(--beside)}
#ai-watch{position:fixed;top:0;right:0;bottom:0;z-index:40;width:var(--beside);display:block}
#ai-watch-open{display:none}
html.ai-watch-hidden{padding-right:0;--beside:0px}
html.ai-watch-hidden #ai-watch{display:none}
@media (min-width:1024px){html.ai-watch-hidden #ai-watch-open{position:fixed;top:50%;right:0;z-index:30;display:block;padding:14px 7px;border:0;border-radius:10px 0 0 10px;background:${INK_BLUE};color:#fff;font:600 .8125rem/1 ui-sans-serif,system-ui,sans-serif;writing-mode:vertical-rl;transform:translateY(-50%);cursor:pointer}}
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
 * try-out (POST { page, help?, goal? } answers { teaching }); extra: more of the host's own script;
 * fontBase: where this host serves the type (fontRoutes), or null to carry it in the page.
 */
export function watchSlot({ teaching = null, note = null, warning = null, hint = null, control = null, signOut = null, record = false, extra = '', fontBase, docs = 'https://github.com/VIABLE-Learning-Lab/viable/blob/main/harness/docs/how-it-works.md' } = {}, nonce) {
  const config = { teaching: settingsShown(teaching), note, warning, hint, control, signOut, record: Boolean(record), firstWords: Object.fromEntries(Object.entries(SPEAK_UP).map(([kind, moment]) => [kind, moment.label])), docs, css: PANEL_CSS, nonce, mark: markSvg({ size: 24 }) };
  return {
    css: pageCss(fontBase),
    html: '<aside id="ai-watch" aria-label="What the AI did"></aside><button id="ai-watch-open" type="button">What the AI did</button>',
    script: `(function(){\n${SOURCE}\n${NAME}(${scriptJson(config)});\n})();\n${extra}`
  };
}
