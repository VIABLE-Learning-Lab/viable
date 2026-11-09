// Steps (workspace.steps, a course activity's): one step on screen at a time. The bar says which ("Step 2 of 5", and the
// list of steps a press away, where an earlier one can be looked at again if the step allows it). The way on is where the
// work ends: each panel puts onward() at the right of its footer. It says how the next step opens: "Next: <title>"
// (saying first what isn't sent, and when there is no way back), at the earliest after some minutes, or on its own when
// its minutes are up, a minute's warning first with More time (5 minutes, as often as they need: a timer they can't stop
// is a barrier, WCAG 2.2.1). Looking at an earlier step, it leads back to the one they are on, never past it. The server keeps
// the step and refuses work outside it; a later step's panels (its questions) come from it only once reached.
import { CONFIG, button, el, icon, post, store } from './core.js';

const openAt = (steps, index, id) => steps[index].panels.includes(id) || (steps[index].back && steps.slice(0, index).some((step) => step.panels.includes(id)));
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/** The learner's step from the server, with the panels open there made whole. */
export async function loadStep(panels) {
  const data = await post('/step', {});
  for (const whole of data.panels || []) { const i = panels.findIndex((panel) => panel.id === whole.id); if (i >= 0) panels[i] = whole; }
  const step = data.steps[data.index];
  if (step.ai === 'off') {
    CONFIG.ai = 'off';
    document.body.classList.remove('ai-right', 'ai-left', 'ai-corner');
    document.body.classList.add('ai-off');
  }
  if (step.chat === 'new' && data.index > 0 && data.started_at && window.VIABLE_CHAT && window.VIABLE_CHAT.since) window.VIABLE_CHAT.since(Date.parse(data.started_at));
  return { data, shown: panels.filter((panel) => !panel.locked && openAt(data.steps, data.index, panel.id)) };
}

/**
 * The steps of one learner: data is the server's ({ steps, index, next, started_at }); shown, the panels open to them.
 * shell() is the shell, made once this is (it shows a step's panels and says what isn't sent). Returns the bar's part,
 * onward() for each footer, and look(i) to show a step.
 */
export function stepper(data, shown, shell) {
  const steps = data.steps;
  const reached = data.index;
  const next = steps[reached + 1] || null;
  const has = (i) => steps[i].panels.some((id) => shown.some((panel) => panel.id === id));
  // Earlier steps can be looked at again where the step they are on allows it (the server opened their panels).
  const lookable = (i) => i < reached && Boolean(steps[reached].back) && has(i);
  let viewing = reached;
  const opensAt = data.next && data.next.opens_at ? Date.parse(data.next.opens_at) : 0;
  // More time, asked for on a step that opens on its own, kept in this browser so a reload doesn't take it back.
  const extraKey = 'viable-steps:extra:' + location.pathname + ':' + (reached + 1);
  let extra = Number(store.get(extraKey)) || 0;
  let warned = false;
  const preview = Boolean(CONFIG.course && CONFIG.course.preview);
  // Once they go on, the step they leave can't be come back to unless the next step lets them.
  const leaving = next ? steps[reached].panels.filter((id) => !openAt(steps, reached + 1, id)).length > 0 : false;

  // --- The bar: which step, and every step a press away ---
  const part = el('div', 'ws-stepper');
  const heard = el('span', 'sr');
  heard.setAttribute('aria-live', 'polite');
  const toggle = button('ws-stepper-btn', []);
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  const track = el('ol', 'ws-stepper-track');
  track.setAttribute('aria-hidden', 'true');
  const pop = el('div', 'ws-steps-pop');
  pop.id = 'ws-steps-list';
  pop.setAttribute('popover', 'auto');
  pop.setAttribute('aria-label', 'Steps');
  toggle.setAttribute('aria-controls', pop.id);
  const list = el('ol', 'ws-steps-list');
  pop.append(list);
  part.append(toggle, track, heard);
  document.body.append(pop);

  function drawBar() {
    toggle.replaceChildren(el('span', 'ws-stepper-n', 'Step ' + (viewing + 1) + ' of ' + steps.length), icon('down', 14));
    toggle.setAttribute('aria-label', 'Step ' + (viewing + 1) + ' of ' + steps.length + ': ' + steps[viewing].title + (viewing !== reached ? '. You are on step ' + (reached + 1) : '') + '. All steps');
    track.replaceChildren(...steps.map((step, i) => el('li', i < reached ? 'done' : i === reached ? 'here' : '', '')));
    track.children[viewing]?.classList.add('on');
    list.replaceChildren(...steps.map((step, i) => {
      const li = el('li', i < reached ? 'done' : i === reached ? 'here' : 'later');
      const mark = el('span', 'ws-steps-mark', i < reached ? '' : String(i + 1));
      if (i < reached) mark.append(icon('check', 13));
      const words = el('span', 'ws-steps-words');
      words.append(el('strong', null, step.title), el('small', null, i === viewing && i !== reached ? 'Looking at it' : i === reached ? 'You’re here' : i < reached ? 'Done' : i === reached + 1 && next && next.move === 'auto' ? 'Opens on its own' : 'Later'));
      const can = (i < reached && lookable(i)) || (i === reached && viewing !== reached);
      if (!can) { const row = el('span', 'ws-steps-row'); row.append(mark, words); li.append(row); if (i === viewing) row.setAttribute('aria-current', 'step'); return li; }
      const go = button('ws-steps-go', [mark, words], () => { pop.hidePopover(); look(i); toggle.focus(); });
      if (i === viewing) go.setAttribute('aria-current', 'step');
      li.append(go);
      return li;
    }));
  }
  const place = () => {
    const box = toggle.getBoundingClientRect();
    const width = Math.min(320, innerWidth - 24);
    pop.style.width = width + 'px';
    pop.style.top = box.bottom + 6 + 'px';
    pop.style.left = Math.max(12, Math.min(box.right - width, innerWidth - width - 12)) + 'px';
  };
  toggle.addEventListener('click', () => { if (pop.matches(':popover-open')) pop.hidePopover(); else { drawBar(); pop.showPopover(); place(); (list.querySelector('[aria-current]') || list.querySelector('button'))?.focus?.(); } });
  pop.addEventListener('toggle', (event) => { toggle.setAttribute('aria-expanded', String(event.newState === 'open')); });
  addEventListener('resize', () => { if (pop.matches(':popover-open')) place(); });

  /** Shows a step: an earlier one they may look at again, or the one they are on. */
  function look(i) {
    if (i !== reached && !lookable(i)) return;
    viewing = i;
    shell().showStep(steps[i].panels);
    drawBar();
    renders.forEach((render) => render());
    heard.textContent = i === reached ? 'Back to step ' + (i + 1) + ': ' + steps[i].title + '.' : 'Looking at step ' + (i + 1) + ': ' + steps[i].title + '. You are on step ' + (reached + 1) + '.';
  }

  // --- The way on, at the foot of each panel: one state, drawn in each place it is ---
  const renders = new Set();
  let moving = false;
  let note = '';
  let ready = !opensAt || preview;
  async function move(by) {
    if (moving) return;
    moving = true; renders.forEach((render) => render());
    try { await post('/step', { action: 'next', to: reached + 1, by }); location.reload(); }
    catch (error) {
      moving = false;
      note = error.code === 'step_not_open' ? 'Not yet: wait for the timer.' : (error.message || 'That didn’t work. Try again.');
      renders.forEach((render) => render());
    }
  }
  // What they would leave behind, said before they go on: questions not answered, writing not handed in where they can't
  // come back to it, and a step they can't come back to.
  const before = () => [...shell().unsent(steps[reached].panels).filter((item) => !item.leaving || !openAt(steps, reached + 1, item.panel)), ...(next && !next.back && leaving ? [{ text: 'You won’t be able to come back to “' + steps[reached].title + '” after this.' }] : [])];

  // options.quiet(): a quieter button while the panel's own action comes first (writing not yet handed in). Its parts are
  // made once and their words changed in place: the countdown redraws every second, and a button that was focused stays.
  function onward(options = {}) {
    if (!next && viewing === reached) return null;
    const box = el('div', 'ws-onward');
    const words = (text) => { const span = el('span', null, text); return span; };
    const backWords = words('');
    const back = button('ws-btn primary ws-onward-go', [backWords, icon('right', 15)], () => look(reached));
    const noteText = el('span', 'ws-onward-note');
    const more = button('ws-btn', 'More time', () => { extra += 5 * 60000; store.set(extraKey, extra); warned = false; heard.textContent = 'Five more minutes before ' + next.title + '.'; tick(); });
    const goWords = words('');
    const go = button('ws-btn primary ws-onward-go', [goWords, icon('right', 15)], () => {
      const left = before();
      if (!left.length) { move('ready'); return; }
      sure = asking(left);
      render();
      sure.focusFirst();
    });
    let sure = null;
    // What isn't done, said before they go on, with the way back to it and the way on anyway.
    function asking(left) {
      const part = el('div', 'ws-sure');
      part.setAttribute('role', 'group');
      part.setAttribute('aria-label', 'Before you go on');
      const text = el('p', 'ws-sure-text');
      left.forEach((item) => text.append(el('span', null, item.text)));
      const fix = left.find((item) => item.fix);
      const no = button('ws-btn ghost', fix ? fix.fixLabel || 'Go back to it' : 'Not yet', () => { sure = null; render(); if (fix) fix.fix(); else go.focus(); });
      const yes = button('ws-btn primary', fix ? 'Go on anyway' : 'Go on', () => { sure = null; move('ready'); });
      part.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); sure = null; render(); go.focus(); } });
      part.append(text, no, yes);
      part.focusFirst = () => (fix ? no : yes).focus();
      return part;
    }
    const render = () => {
      box.classList.toggle('is-back', viewing !== reached);
      const want = [];
      if (viewing !== reached) {
        backWords.textContent = 'Back to step ' + (reached + 1) + ': ' + steps[reached].title;
        want.push(back);
      } else if (next && sure) want.push(sure);
      else if (next) {
        const auto = next.move === 'auto' && !preview;
        noteText.textContent = note;
        if (note) want.push(noteText);
        if (auto && !ready) { if (warned) want.push(more); }
        else {
          goWords.textContent = (auto ? 'Opening: ' : 'Next: ') + next.title;
          go.className = 'ws-btn ' + (options.quiet && options.quiet() ? '' : 'primary ') + 'ws-onward-go';
          go.disabled = moving || !ready;
          want.push(go);
        }
      }
      if (want.length !== box.children.length || want.some((node, i) => box.children[i] !== node)) box.replaceChildren(...want);
    };
    renders.add(render);
    render();
    box.refresh = render;
    return box;
  }

  // The timer the server set, said where the way on is: one tick for every place.
  let timer = 0;
  function tick() {
    clearTimeout(timer);
    const left = opensAt + (next.move === 'auto' ? extra : 0) - Date.now();
    if (left > 0) {
      ready = preview;
      // A minute before a step opens on its own, they are told, and can ask for more time.
      if (next.move === 'auto' && !preview && left <= 60000 && !warned) { warned = true; heard.textContent = next.title + ' opens in a minute. You can ask for more time.'; }
      note = preview ? 'Learners wait ' + clock(left) + (next.move === 'auto' ? ', then it opens on its own' : '') + '. Preview: go on now.' : next.move === 'auto' ? next.title + ' opens in ' + clock(left) : 'You can go on in ' + clock(left);
      renders.forEach((render) => render());
      timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
      return;
    }
    ready = true;
    note = '';
    if (next.move === 'auto' && !preview) { note = 'Opening ' + next.title + '…'; heard.textContent = 'Opening ' + next.title + '.'; renders.forEach((render) => render()); move('auto'); return; }
    if (opensAt && !heard.textContent) heard.textContent = 'You can go on now.';
    renders.forEach((render) => render());
  }
  drawBar();
  if (next && opensAt) tick();
  return { part, onward, look, reached, viewing: () => viewing };
}
