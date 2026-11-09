// A page the teacher wrote: the case, the task, what to read before talking to the AI. Markdown, drawn by the same renderer as the AI's
// replies, so what it may show is what a reply may show.
import { el, icon, onwardFoot } from './core.js';

export function page(panel, api) {
  const wrap = el('div', 'ws-page sheet');
  if (api.aiAvailable && (panel.sees || []).length) {
    const strip = el('div', 'ws-strip');
    strip.append(icon('eye', 13), el('span', null, api.seesSentence(panel)));
    wrap.append(strip);
  }
  const body = el('article', 'md ws-sheet');
  const draw = () => {
    if (window.ViableRender) body.replaceChildren(window.ViableRender.render(panel.text || '', { origin: location.origin, images: [], used: new Set(), cites: [] }));
    else body.textContent = panel.text || '';
  };
  draw();
  // The renderer can arrive after the panel: what was drawn as plain words is drawn again.
  if (!window.ViableRender) addEventListener('load', draw, { once: true });
  wrap.append(body);
  // Read to its end, the way on is there.
  const foot = onwardFoot(api);
  if (foot) wrap.append(foot);
  return { el: wrap, state: () => ({ panel: panel.id }) };
}
