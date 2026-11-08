/*
 * A learning page's workspace (../workspace.js), in the browser: panels as tabs beside the
 * AI, and what the learner does in them, sent as events. Loaded after the chat script, which says
 * when the learner may start (viable:ready), sends window.VIABLE_WS.state() with each message,
 * asks window.VIABLE_WS.intro() for its empty state, and passes each answer to VIABLE_WS.reply().
 * The parts: workspace/core.js (settings, events, helpers), shell.js (the bar, tabs, the divider,
 * the AI docked, hidden, in a corner or a sheet), and a module per panel type.
 */
import { CONFIG, post, ready, replies } from './workspace/core.js';
import { createShell } from './workspace/shell.js';
import { writing } from './workspace/writing.js';
import { questions } from './workspace/questions.js';
import { embed } from './workspace/embed.js';
import { reading } from './workspace/reading.js';
import { page } from './workspace/page.js';
import { loadStep, stepBar } from './workspace/steps.js';

const panels = CONFIG.panels || [];
// What the host makes of the page for this learner, where it varies: its AI's place, or none, and what
// the AI is shown of each panel. It arrives before the learner is let in.
function applyVariant(variant) {
  const shown = variant && variant.workspace;
  if (!shown) return;
  CONFIG.ai = variant.ai ? shown.ai : 'off';
  if (variant.look && variant.look.title) CONFIG.title = variant.look.title;
  for (const panel of panels) { const own = (shown.panels || []).find((entry) => entry.id === panel.id); if (own) panel.sees = own.sees; }
}
if (document.getElementById('ws') && panels.length) {
  let shell = null;
  // What the AI says first at the step they have reached.
  let reached = null;
  // The step they are on, when there are steps: whether the AI is part of it.
  let onStep = null;
  const make = (shown = panels.filter((panel) => !panel.locked), first = shown[0]) => {
    shell = createShell({ panels: shown, factories: { writing, questions, embed, reading, page } });
    shell.open(first);
  };
  // With steps, the panels wait for the learner's step (once they are let in).
  const stepped = async () => {
    try {
      const { data, shown } = await loadStep(panels);
      const step = data.steps[data.index];
      onStep = step;
      reached = step.says ? { says: step.says, since: data.started_at ? Date.parse(data.started_at) : 0, starters: [] } : { says: null };
      // Earlier steps stay as tabs where they can go back; what opens is this step's.
      make(shown, shown.find((panel) => step.panels.includes(panel.id)) || shown[0]);
      const bar = stepBar(data);
      document.querySelector('#ws .ws-bar')?.after(bar);
      // A long page ends where they will be when they finish it, so the way on is there too.
      const onward = bar.querySelector('.ws-steps-go');
      const sheet = onward && !document.querySelector('.ws-steps-next[hidden]') ? document.querySelector('#ws .ws-page.sheet:not([hidden])') : null;
      if (sheet) {
        const end = document.createElement('div');
        end.className = 'ws-sheet-end';
        const go = onward.cloneNode(true);
        go.addEventListener('click', () => { onward.click(); bar.scrollIntoView({ block: 'nearest' }); });
        end.append(go);
        sheet.append(end);
      }
      window.VIABLE_CHAT?.redraw?.();
    } catch (error) { make(); }
    shell.start();
  };
  window.VIABLE_WS = {
    state: () => (shell ? shell.state() : null),
    intro: () => (shell ? shell.intro() : null),
    opening: () => reached,
    aiHere: () => CONFIG.ai !== 'off' && !(onStep && onStep.ai === 'off'),
    nudge: () => { if (shell && shell.nudge) shell.nudge(); },
    reply: (text) => { if (text) { replies.push(String(text)); if (replies.length > 20) replies.shift(); } }
  };
  // Where the page varies by learner, the panels are drawn once the host has said how.
  if (CONFIG.steps) ready.then(() => { if (CONFIG.course && CONFIG.course.varies) applyVariant(window.VIABLE_VARIANT); return stepped(); });
  else if (CONFIG.course && CONFIG.course.waiting) ready.then(async () => {
    // A page for some, not all: its panels come once the server knows who this is.
    const data = await post('/panels', {}).catch((error) => { const ws = document.getElementById('ws'); ws.textContent = error.message || 'This isn’t open for you yet.'; return null; });
    if (!data) return;
    for (const whole of data.panels || []) { const i = panels.findIndex((panel) => panel.id === whole.id); if (i >= 0) panels[i] = whole; }
    if (CONFIG.course.varies) applyVariant(window.VIABLE_VARIANT);
    make();
    shell.start();
  });
  else if (CONFIG.course && CONFIG.course.varies) ready.then(() => { applyVariant(window.VIABLE_VARIANT); make(); shell.start(); });
  else { make(); ready.then(() => shell.start()); }
}
