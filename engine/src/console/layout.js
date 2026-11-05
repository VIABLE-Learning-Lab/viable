/**
 * The console's shell: the look every page of it shares, on VIABLE's theme, and a left navigation made
 * from the pages that exist. No Node built-ins.
 */
import { markSvg, themeCss } from '../../../harness/src/ui/theme.js';
import { escapeHtml } from '../learner/shell.js';
import { CONSOLE_SCRIPT } from './client.js';
import { icon } from './icons.js';

const CONSOLE_CSS = `h1{font-size:clamp(1.9rem,3.4vw,2.6rem)}
h2{font-size:clamp(1.35rem,2.2vw,1.65rem);font-weight:400;letter-spacing:-.02em}
html{scrollbar-color:var(--public-rule-strong) transparent;scrollbar-width:thin}
.v-icon{flex:none}
.turned{display:inline-grid;transform:rotate(180deg)}
.console{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh;min-height:100dvh}
.side{position:sticky;top:0;display:flex;flex-direction:column;gap:22px;height:100vh;height:100dvh;padding:22px 16px;border-right:1px solid var(--public-rule);background:var(--surface)}
.brand{display:flex;align-items:center;gap:10px;padding:0 8px;color:var(--public-ink);line-height:1.2;text-decoration:none}
.brand-name{display:grid}
.brand-name strong{font-weight:600}
.brand-name small{color:var(--muted);font-size:.8125rem}
.side ul{display:grid;gap:2px;margin:0;padding:0;list-style:none}
.side a:not(.brand){display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border-radius:var(--radius-sm);color:var(--public-text);text-decoration:none}
.side a:not(.brand):hover{background:var(--field-mist);color:var(--public-ink)}
.side a[aria-current=page]{background:var(--field-mist);color:var(--public-ink);font-weight:600}
.side-foot{display:grid;gap:2px;margin-top:auto;font-size:.875rem}
.side-foot a:not(.brand){white-space:nowrap}
.side-foot a .v-icon{color:var(--muted)}
.side-who{margin:8px 0 0;padding:8px 8px 0;border-top:1px solid var(--public-rule);color:var(--muted);font-size:.8125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-foot button{width:100%;padding:8px;border:0;border-radius:var(--radius-sm);background:none;color:var(--public-text);font:inherit;text-align:left;cursor:pointer}
.side-foot button:hover{background:var(--field-mist);color:var(--public-ink)}
.page{width:100%;max-width:1040px;padding:clamp(20px,4vw,44px) clamp(16px,4vw,44px) 72px}
.notice{margin:18px 0 0;padding:12px 16px;border-radius:var(--radius-sm);background:var(--query-soft);color:var(--public-ink)}
.notice code{overflow-wrap:anywhere}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.missing{display:grid;gap:14px;justify-items:start;max-width:52ch;padding-top:clamp(24px,12vh,120px)}
.missing p{margin:0}
.missing .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
dialog.v-dialog{width:min(440px,calc(100vw - 32px));padding:22px;border:1px solid var(--public-rule);border-radius:var(--radius-lg);background:var(--surface);color:var(--public-ink);box-shadow:0 24px 64px -24px rgb(10 16 28/.5)}
dialog.v-dialog::backdrop{background:rgb(10 16 28/.45)}
dialog.v-dialog[open]{animation:v-rise .18s var(--ease-out)}
dialog.v-dialog p{margin:0 0 16px;line-height:1.5;overflow-wrap:anywhere}
dialog.v-dialog label{display:grid;gap:6px;margin-bottom:16px}
dialog.v-dialog .actions{display:flex;flex-direction:row-reverse;flex-wrap:wrap;justify-content:flex-start;gap:10px}
.v-btn.is-danger{border-color:var(--pencil-red);background:var(--pencil-red);color:var(--surface)}
.v-btn.is-danger:hover{border-color:var(--pencil-red);opacity:.9}
@keyframes v-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.v-form{grid-template-columns:minmax(0,1fr)}
.v-menu-native{position:absolute;width:1px;height:1px;margin:0;padding:0;border:0;opacity:0;pointer-events:none}
.v-menu-field{position:relative;min-width:0}
.v-menu-button{display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;cursor:pointer}
.v-menu-button .v-icon{color:var(--muted);transition:transform .16s var(--ease-out)}
.v-menu-button[aria-expanded=true]{border-color:var(--ink-blue)}
.v-menu-button[aria-expanded=true] .v-icon{transform:rotate(180deg)}
.v-menu-button:disabled{opacity:.55;cursor:not-allowed}
.v-menu-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v-pop{position:fixed;inset:auto;margin:0;padding:6px;overflow:auto;border:1px solid var(--public-rule-strong);border-radius:var(--radius);background:var(--surface);color:var(--public-text);box-shadow:0 16px 40px -16px rgb(10 16 28/.45);scrollbar-width:thin}
.v-pop:popover-open{animation:v-rise .14s var(--ease-out)}
.v-pop:focus{outline:none}
.v-option{display:grid;grid-template-columns:minmax(0,1fr) 18px;gap:1px 10px;align-items:center;padding:8px 10px;border-radius:var(--radius-sm);cursor:pointer}
.v-option strong{color:var(--public-ink);font-weight:400;overflow-wrap:anywhere}
.v-option small{grid-column:1;color:var(--muted);font-size:.8125rem;line-height:1.4}
.v-option .v-icon{grid-column:2;grid-row:1;color:var(--ink-blue)}
.v-option.is-active{background:var(--field-mist)}
.v-option[aria-selected=true] strong{font-weight:600}
.page details>summary{list-style:none;cursor:pointer}
.page details>summary::-webkit-details-marker{display:none}
.page details>summary::before{content:"";display:inline-block;width:.42em;height:.42em;margin:0 .55em .12em .1em;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .14s var(--ease-out)}
.page details[open]>summary::before{transform:rotate(45deg)}
.page .ask-run>summary::before,.page .ask-step>details>summary::before{display:none}
.v-drop{display:grid;justify-items:center;gap:4px;padding:26px 18px;border:1.5px dashed var(--public-rule-strong);border-radius:var(--radius);color:var(--public-text);text-align:center;cursor:pointer;transition:border-color .16s ease,background-color .16s ease}
.v-drop:hover,.v-drop:focus-within,.v-drop.is-over{border-color:var(--ink-blue)}
.v-drop.is-over{background:var(--field-mist)}
.v-drop.is-busy{cursor:progress;opacity:.7}
.v-drop .v-icon{margin-bottom:4px;color:var(--muted)}
.v-drop strong{color:var(--public-ink);font-weight:600}
.v-drop u{color:var(--ink-blue);text-decoration:underline 1px var(--ink-blue-line);text-underline-offset:.22em}
.v-drop small{color:var(--muted);font-size:.8125rem;line-height:1.45}
@media (prefers-reduced-motion:reduce){dialog.v-dialog[open],.v-pop:popover-open{animation:none}.v-menu-button .v-icon{transition:none}}
@media (max-width:760px){.console{display:block}.side{position:static;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 12px;height:auto;padding:10px 16px;border-right:0;border-bottom:1px solid var(--public-rule)}.brand{padding:0}.side nav{grid-column:1/-1;grid-row:2;margin:0 -16px;padding:0 16px;overflow-x:auto;scrollbar-width:none}.side ul{display:flex;gap:2px}.side li a{white-space:nowrap}.side-foot{display:flex;align-items:center;gap:2px;margin:0}.side-foot a:not(:first-child),.side-who{display:none}.side-foot button{width:auto}}`;

// The mark, as this page's icon: nothing to fetch, so it shows under the page's own rules.
const FAVICON = `data:image/svg+xml,${encodeURIComponent(markSvg({ size: 64 }))}`;
/** The tag that gives a page VIABLE's mark in its browser tab. */
export const faviconTag = `<link rel="icon" type="image/svg+xml" href="${FAVICON}">`;

/** The headers every page of the console is served with. Nothing loads from elsewhere, no site frames it, and it is never kept. */
export const consoleHeaders = (nonce) => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; font-src data:; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff'
});

/** A page of the console. pages: [{ id, title }], the navigation: only what exists. links: [{ href, title }] beside it. home: where its name leads. who: who is signed in. */
export const consolePage = ({ title, pages, current, body, script = '', css = '', links = [], brand = 'VIABLE Engine', signOut = '/teacher/signout?next=console', notice = '', home = null, who = null }, nonce) => {
  const name = `${markSvg({ size: 28 })}<span class="brand-name"><strong>${escapeHtml(brand.split(' ')[0])}</strong><small>${escapeHtml(brand.split(' ').slice(1).join(' '))}</small></span>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · ${escapeHtml(brand)}</title>
${faviconTag}
<style nonce="${nonce}">${themeCss()}
${CONSOLE_CSS}
${css}</style>
</head>
<body>
<div class="console">
<header class="side">
${home ? `<a class="brand" href="${escapeHtml(home)}">${name}</a>` : `<div class="brand">${name}</div>`}
<nav aria-label="The console"><ul>${pages.filter((page) => page.nav !== false).map((page) => `<li><a href="/console/${escapeHtml(page.id)}"${page.id === current ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}</a></li>`).join('')}</ul></nav>
<div class="side-foot">${links.map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener">${escapeHtml(link.title)}${icon('out', 15)}</a>`).join('')}${who ? `<p class="side-who" title="${escapeHtml(who)}">${escapeHtml(who)}</p>` : ''}<form method="post" action="${escapeHtml(signOut)}" data-confirm="Sign out of ${escapeHtml(brand)}?" data-yes="Sign out"><button type="submit">Sign out</button></form></div>
</header>
<main class="page" id="main">${notice}${body}</main>
</div>
<script nonce="${nonce}">${CONSOLE_SCRIPT}
${script}</script>
</body>
</html>`;
};

/** What a page of the console says when the address finds nothing: inside its own shell, with the way back. */
export const missingBody = (message = 'The address may be mistyped, or what was here has moved.') => `<div class="missing"><h1>We can’t find that page</h1><p class="v-lead">${escapeHtml(message)}</p><div class="actions"><a class="v-btn is-primary" href="/console/ask">Go to Ask</a><a class="v-btn" href="/console/courses">Your courses</a></div></div>`;

/** A page for when there's no console to stand in: signed out, or something broke. Learners never see this. */
export const standalonePage = ({ title, heading = title, message = '', action = null, brand = 'VIABLE', home = null }, nonce) => {
  const name = `${markSvg({ size: 30 })}<span class="brand-name"><strong>${escapeHtml(brand.split(' ')[0])}</strong><small>${escapeHtml(brand.split(' ').slice(1).join(' '))}</small></span>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · ${escapeHtml(brand)}</title>${faviconTag}<style nonce="${nonce}">${themeCss()}body{display:grid;place-items:center;min-height:100vh;min-height:100dvh;margin:0;padding:24px}main{display:grid;gap:16px;justify-items:start;width:100%;max-width:460px}.brand{display:flex;align-items:center;gap:10px;color:var(--public-ink);line-height:1.2;text-decoration:none}.brand-name{display:grid}.brand-name strong{font-weight:600}.brand-name small{color:var(--muted);font-size:.8125rem}h1{font-size:clamp(1.9rem,6vw,2.4rem);line-height:1.15}p{margin:0}</style></head><body><main>${home ? `<a class="brand" href="${escapeHtml(home)}">${name}</a>` : `<div class="brand">${name}</div>`}<h1>${escapeHtml(heading)}</h1>${message ? `<p class="v-lead">${escapeHtml(message)}</p>` : ''}${action ? `<a class="v-btn is-primary" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>` : ''}</main></body></html>`;
};
