// Draws Mermaid diagrams for the chat page. This runs inside a hidden iframe that is sandboxed
// (scripts only: no same-origin access, no forms, popups or navigation) and network-less (its CSP
// allows only this site's scripts and inline styles; no fetches, images or fonts). The page posts
// {id, code, theme}; the frame answers with the diagram as SVG text, which the page shows as an <img>,
// where nothing in it can run or load anything. Mermaid itself is code-split, so each diagram type
// loads only when a reply uses it. Built by scripts/build-learner-assets.mjs.
import mermaid from 'mermaid';
import { repairMermaid } from './mermaidRepair.js';

let theme = null;
function setup(next) {
  if (theme === next) return;
  theme = next;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: next === 'dark' ? 'dark' : 'default',
    // Plain SVG text instead of HTML labels: the result is shown as an image, where HTML labels
    // (foreignObject) don't render everywhere.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    suppressErrorRendering: true,
    deterministicIds: true,
    maxTextSize: 20000,
    maxEdges: 500
  });
}

let queue = Promise.resolve();
window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  const { type, id, code, theme: wanted } = event.data || {};
  if (type !== 'viable-diagram:render' || typeof code !== 'string' || code.length > 20000) return;
  queue = queue.then(async () => {
    try {
      setup(wanted === 'dark' ? 'dark' : 'light');
      // A flowchart that doesn't parse gets one try with the usual model mistakes repaired (labels
      // quoted, "end" renamed); correct code is drawn exactly as written.
      let source = code;
      try {
        await mermaid.parse(source);
      } catch (error) {
        const repaired = repairMermaid(source);
        if (repaired === source) throw error;
        try { await mermaid.parse(repaired); } catch { throw error; }
        source = repaired;
      }
      const { svg } = await mermaid.render(`d${String(id).replace(/\W/g, '')}`, source);
      window.parent.postMessage({ type: 'viable-diagram:done', id, svg }, '*');
    } catch (error) {
      window.parent.postMessage({ type: 'viable-diagram:failed', id, error: String((error && error.message) || error).slice(0, 300) }, '*');
    }
  });
});
window.parent.postMessage({ type: 'viable-diagram:ready' }, '*');
