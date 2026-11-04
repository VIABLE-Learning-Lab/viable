/**
 * One learner shell (docs/product-map.md, section 4): what every page a learner or visitor opens
 * shares, the course home (home.js), a course activity and an agent's chat page
 * (chatPage.js): colors and type, buttons and cards, the security headers, and the page shown
 * when something isn't available. A page's accent is its course's or agent's
 * color in its course's look (themes.js); light and dark follow the system unless a page sets one.
 */
import { themeVars } from './themes.js';

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (ch) => (ch === '\u2028' ? '\\u2028' : '\\u2029'));
/** The page's colors and type: a course's look (themes.js) in its color, or the default look. */
export function palette(accent, look = null) {
  return themeVars(look, accent);
}

/** What every learner page shares: type, buttons, cards. */
export const BASE_CSS = `
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--ink);font:var(--size)/1.6 var(--font);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent-text);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:10px 18px;border:1px solid var(--accent);border-radius:var(--r-sm);background:var(--accent);color:var(--on-accent);font-weight:640;text-decoration:none;cursor:pointer;transition:filter .15s,transform .12s,opacity .15s}
.btn:hover:not(:disabled){filter:brightness(1.06)}.btn:active:not(:disabled){transform:scale(.98)}
.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line)}
.btn.ghost:hover:not(:disabled){border-color:var(--accent-line);filter:none}
.btn.quiet{min-height:0;padding:4px 2px;border:0;background:none;color:var(--muted);font-size:.86rem;font-weight:560;text-decoration:underline;text-underline-offset:3px}
.btn:disabled{opacity:.55;cursor:default}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/** The headers every learner page is served with; frames: the sites its embedded activities come from. */
export const pageHeaders = (nonce, { ancestors = '*', frames = '', media = false } = {}) => ({
  'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' https: data: blob:;${media ? " media-src 'self' https: blob:;" : ''} frame-src 'self'${frames ? ` ${frames}` : ''}; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors}`,
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
});
/** The headers a chat page or an activity is served with. sites: who may frame it (space-separated origins, or *); frames: the sites its embedded activities come from; reads: a Reading panel's pdf.js runs its worker and image decoders (WebAssembly) from this site and loads the document's fonts; fonts: something beside the page takes its type from this site. */
export const chatPageHeaders = (nonce, { sites = '*', frames = [], reads = false, fonts = false } = {}) => ({
  'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'${reads ? " 'wasm-unsafe-eval'" : ''}; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' https: data: blob:; media-src 'self' https: blob:;${reads ? " worker-src 'self'; font-src 'self' data: blob:;" : fonts ? " font-src 'self';" : ''} frame-src 'self' ${frames.join(' ')}; base-uri 'none'; form-action 'none'; frame-ancestors ${sites}`,
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
});
// The diagram frame may run only this site's scripts and inline styles; it can't fetch, load images
// or fonts, or submit anything. Module chunks are fetched with CORS from its opaque origin.
export const FRAME_CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
export const UNAVAILABLE_HEADERS = { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" };

/** The page a learner sees when something isn't there or isn't open, with the way back. */
export function unavailablePage({ title = 'Not available', message = '', back = null, color = null, look = null } = {}) {
  return `<!doctype html><html lang="en" data-theme="auto"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>${palette(color, look)}${BASE_CSS}body{min-height:100vh;display:grid;place-items:center;padding:24px}main{width:100%;max-width:420px;display:grid;justify-items:center;gap:6px;padding:30px 26px;border:var(--bw) solid var(--line);border-radius:var(--r);background:var(--panel);text-align:center;box-shadow:var(--shadow)}h1{margin:0;font:var(--head-weight) 1.25rem/1.3 var(--font-head);letter-spacing:var(--head-track)}p{margin:0 0 10px;color:var(--ink-2)}main>i{width:42px;height:42px;margin-bottom:6px;display:grid;place-items:center;border-radius:var(--r-sm);background:var(--accent-soft);color:var(--accent-text);font-style:normal;font-weight:700}</style></head>
<body><main><i aria-hidden="true">i</i><h1>${escapeHtml(title)}</h1>${message ? `<p>${escapeHtml(message)}</p>` : ''}${back ? `<a class="btn" href="${escapeHtml(back.href)}">${escapeHtml(back.label)}</a>` : ''}</main></body></html>`;
}
