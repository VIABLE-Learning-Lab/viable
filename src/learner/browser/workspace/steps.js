// Steps (workspace.steps, a course activity's): the learner sees the panels of the step they have
// reached (and of earlier ones, where the step lets them go back), the AI only where the step has
// it, and a fresh chat where it starts one. A bar says which step this is and how the next opens:
// "I'm ready" (warning first when there is no way back), at the earliest after some minutes, or on
// its own when its minutes are up. The server keeps the step and refuses work outside it; a later
// step's panels (its questions) come from it only once reached (the host's …/step).
import { CONFIG, button, el, icon, post } from './core.js';

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

/** The bar under the workspace's own: this step, and the way to the next. */
export function stepBar(data) {
  const steps = data.steps;
  const step = steps[data.index];
  const next = steps[data.index + 1] || null;
  const bar = el('div', 'ws-steps');
  bar.setAttribute('role', 'status');
  const where = el('div', 'ws-steps-where');
  const dots = el('ol', 'ws-steps-dots');
  steps.forEach((entry, i) => { const dot = el('li', i < data.index ? 'done' : i === data.index ? 'on' : '', entry.title); if (i === data.index) dot.setAttribute('aria-current', 'step'); dots.append(dot); });
  where.append(el('span', 'ws-steps-n', 'Step ' + (data.index + 1) + ' of ' + steps.length), dots);
  bar.append(where);
  if (!next) return bar;
  const action = el('div', 'ws-steps-next');
  const note = el('span', 'ws-steps-note');
  const go = button('ws-steps-go', [el('span', null, 'I’m ready: ' + next.title), icon('right', 14)]);
  action.append(note, go);
  bar.append(action);
  const opensAt = data.next && data.next.opens_at ? Date.parse(data.next.opens_at) : 0;
  let moving = false;
  async function move(by) {
    if (moving) return;
    moving = true; go.disabled = true; yes.disabled = true;
    try { await post('/step', { action: 'next', to: data.index + 1, by }); location.reload(); }
    catch (error) {
      moving = false; go.disabled = false; yes.disabled = false; sure.hidden = true; action.hidden = false;
      note.textContent = error.code === 'step_not_open' ? 'Not yet: wait for the timer.' : (error.message || 'That didn’t work. Try again.');
    }
  }
  const leaving = steps[data.index].panels.filter((id) => !openAt(steps, data.index + 1, id)).length > 0;
  // Going on with no way back is said first, in the bar: Go on, or Not yet.
  const sure = el('div', 'ws-steps-sure');
  sure.hidden = true;
  const sureText = el('span', null, 'You won’t be able to come back to “' + step.title + '” after this.');
  const yes = button('ws-steps-go', 'Go on', () => move('ready'));
  const no = button('ws-steps-no', 'Not yet', () => { sure.hidden = true; action.hidden = false; go.focus(); });
  sure.append(sureText, no, yes);
  bar.append(sure);
  go.addEventListener('click', () => {
    if (!next.back && leaving) { action.hidden = true; sure.hidden = false; yes.focus(); return; }
    move('ready');
  });
  if (next.move === 'auto') go.hidden = true;
  const tick = () => {
    const left = opensAt - Date.now();
    // A preview needn't wait: the author sees the timer learners get, and may go on at once.
    if (left > 0 && CONFIG.course && CONFIG.course.preview) {
      note.textContent = 'Learners wait ' + clock(left) + (next.move === 'auto' ? ', then it opens on its own' : '') + ' · preview: go on now';
      go.hidden = false; go.disabled = false;
      setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
      return;
    }
    if (left > 0) {
      note.textContent = next.move === 'auto' ? next.title + ' opens in ' + clock(left) : 'You can go on in ' + clock(left);
      go.disabled = true;
      setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
      return;
    }
    go.disabled = false;
    if (next.move === 'auto') { note.textContent = 'Opening ' + next.title + '…'; move('auto'); }
    else note.textContent = next.back ? '' : 'You won’t come back to ' + step.title + '.';
  };
  tick();
  return bar;
}
