/**
 * The console's shell: the look every page of it shares, on VIABLE's theme, and a left navigation made
 * from the pages that exist. No Node built-ins.
 */
import { markSvg, themeCss } from '../../../harness/src/ui/theme.js';
import { escapeHtml } from '../learner/shell.js';
import { CONSOLE_SCRIPT } from './client.js';
import { DATE_PICKER_CSS } from './datePicker.js';
import { DRAG_ORDER_CSS } from './dragOrder.js';
import { icon } from './icons.js';

const CONSOLE_CSS = `[hidden]{display:none!important}
h1{font-size:clamp(1.9rem,3.4vw,2.6rem)}
.v-tip{position:fixed;top:0;left:0;z-index:1000;max-width:min(280px,calc(100vw - 16px));padding:5px 9px;border-radius:7px;background:var(--public-ink);color:var(--public-page);font-size:.8125rem;font-weight:500;line-height:1.35;overflow-wrap:anywhere;pointer-events:none;opacity:0;transition:opacity .12s}
.v-tip.is-on{opacity:1}
@media (prefers-reduced-motion:reduce){.v-tip{transition:none}}
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
.side-account{position:relative}
.side-account-button{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:var(--radius-sm);color:var(--public-ink);cursor:pointer;list-style:none;transition:background-color .12s}
.side-account-button::-webkit-details-marker{display:none}
.side-account-button:hover,.side-account[open]>.side-account-button{background:var(--field-mist)}
.side-account-button:focus-visible{outline:2px solid var(--ink-blue);outline-offset:2px}
.side-account-button>.v-icon:last-child{flex:none;margin-left:auto;color:var(--muted);transform:rotate(180deg);transition:transform .16s}
.side-account[open]>.side-account-button>.v-icon:last-child{transform:none}
.side-avatar{display:grid;flex:none;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--ink-blue);color:var(--on-ink-blue);font-size:.8125rem;font-weight:600}
.side-account-name{min-width:0;overflow:hidden;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.side-account-low{flex:none;width:7px;height:7px;border-radius:50%;background:var(--pencil-red)}
.side-account-panel{position:absolute;bottom:calc(100% + 8px);left:0;z-index:20;display:grid;grid-template-columns:minmax(0,1fr);gap:1px;width:max(100%,256px);padding:6px;border:1px solid var(--public-rule);border-radius:var(--radius);background:var(--surface);box-shadow:var(--public-shadow);transform-origin:bottom left}
.side-account[open]>.side-account-panel{animation:side-pop .16s var(--ease-out,cubic-bezier(.22,1,.36,1))}
@keyframes side-pop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
.side-account-who{display:grid;gap:2px;min-width:0;margin:0 0 4px;padding:6px 8px 9px;border-bottom:1px solid var(--public-rule)}
.side-account-who strong{overflow:hidden;color:var(--public-ink);font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.side-account-who small{overflow:hidden;color:var(--muted);font-size:.8125rem;text-overflow:ellipsis;white-space:nowrap}
.side .side-account-panel>a,.side .side-account-panel button{display:flex;align-items:center;justify-content:flex-start;gap:10px;min-width:0;padding:8px;border-radius:var(--radius-sm);color:var(--public-text);font:inherit;text-align:left;white-space:nowrap}
.side .side-account-panel>a>span,.side .side-account-panel button>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.side .side-account-panel .v-icon{flex:none;color:var(--muted)}
.side .side-account-panel>a>.v-icon:last-child:not(:first-child){margin-left:auto}
.side .side-account-panel>a:hover,.side .side-account-panel button:hover{background:var(--field-mist);color:var(--public-ink)}
.side .side-account-panel>a:hover .v-icon,.side .side-account-panel button:hover .v-icon{color:var(--public-text)}
.side .side-account-panel form{margin:4px 0 0;padding-top:4px;border-top:1px solid var(--public-rule)}
.side .side-account-panel>a.side-credit{align-items:flex-start}
.side-credit-words{display:grid;flex:1;gap:7px;min-width:0}
.side-credit-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.side-credit-top small{color:var(--muted);font-size:.8125rem;font-variant-numeric:tabular-nums}
.side-meter{display:block;height:4px;overflow:hidden;border-radius:999px;background:var(--field-mist)}
.side-meter i{display:block;width:0;height:100%;border-radius:inherit;background:var(--ink-blue);transition:width .4s var(--ease-out,ease-out)}
.side-meter.is-low i{background:var(--pencil-red)}
@media (prefers-reduced-motion:reduce){.side-account[open]>.side-account-panel{animation:none}.side-account-button>.v-icon:last-child,.side-meter i{transition:none}}
.side-foot a:not(.brand){white-space:nowrap}
.side-foot a .v-icon{color:var(--muted)}
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
.v-dialog-list{display:grid;gap:6px;margin:12px 0 16px;padding:0;list-style:none}
.v-dialog-list li{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;padding:9px 12px;border-radius:var(--radius-sm);background:var(--field-mist);font-size:.9375rem}
.v-dialog-list a{font-weight:600;white-space:nowrap}
dialog.v-dialog[open]{animation:v-rise .18s var(--ease-out)}
dialog.v-dialog p{margin:0 0 16px;line-height:1.5;overflow-wrap:anywhere}
dialog.v-dialog label{display:grid;gap:6px;margin-bottom:16px}
dialog.v-dialog .actions{display:flex;flex-direction:row-reverse;flex-wrap:wrap;justify-content:flex-start;gap:10px}
.v-btn.is-danger{border-color:var(--pencil-red);background:var(--pencil-red);color:var(--surface)}
.v-btn.is-danger:hover{border-color:var(--pencil-red);opacity:.9}
.v-btn.danger{border-color:var(--pencil-red);color:var(--pencil-red)}
.v-btn.danger:hover{border-color:var(--pencil-red);background:color-mix(in srgb,var(--pencil-red) 8%,transparent)}
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
@media (max-width:760px){.console{display:block}.side{position:static;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 12px;height:auto;padding:10px 16px;border-right:0;border-bottom:1px solid var(--public-rule)}.brand{padding:0}.side nav{grid-column:1/-1;grid-row:2}.side ul{display:flex;flex-wrap:wrap;gap:2px}.side li a{white-space:nowrap}.side-foot{display:flex;align-items:center;gap:2px;margin:0}.side-account-name,.side-account-button>.v-icon:last-child{display:none}.side-account-button{padding:4px}.side-account-panel{top:calc(100% + 6px);bottom:auto;left:auto;right:0;width:min(280px,calc(100vw - 32px));transform-origin:top right}.side-foot button{width:100%}}
@media (max-width:760px){.page input.v-input,.page textarea{font-size:max(16px,1em)}}`;

// What every page shares is one file each, kept by the browser for good under a name that changes with what is in it, so a click fetches only what is new on the next page.
const hashOf = (text) => { let hash = 0x811c9dc5; for (let at = 0; at < text.length; at += 1) { hash ^= text.charCodeAt(at); hash = Math.imul(hash, 0x01000193); } return (hash >>> 0).toString(36); };
const SPEED_CSS = `html.is-going::before,html.is-working::before{content:"";position:fixed;top:0;left:0;right:0;z-index:100;height:2px;background:var(--ink-blue);transform-origin:left;animation:v-going 1.4s var(--ease-out) .08s both}
@keyframes v-going{from{transform:scaleX(0)}to{transform:scaleX(.9)}}
.v-btn.is-busy,button.is-busy{opacity:.65;cursor:progress}
.side a:active,.tabs a:active{opacity:.7}
.side{view-transition-name:v-side}
@media (prefers-reduced-motion:no-preference){@view-transition{navigation:auto}::view-transition-old(root),::view-transition-new(root){animation-duration:.14s}}
@media (prefers-reduced-motion:reduce){html.is-going::before,html.is-working::before{animation:none;transform:scaleX(.9)}}`;
const SHARED_CSS = `${themeCss()}\n${CONSOLE_CSS}\n${SPEED_CSS}\n${DATE_PICKER_CSS}\n${DRAG_ORDER_CSS}`;
const ASSETS = Object.fromEntries([[`base-${hashOf(SHARED_CSS)}.css`, { type: 'text/css; charset=utf-8', body: SHARED_CSS }], [`base-${hashOf(CONSOLE_SCRIPT)}.js`, { type: 'text/javascript; charset=utf-8', body: CONSOLE_SCRIPT }]]);
const [SHARED_CSS_FILE, SHARED_JS_FILE] = Object.keys(ASSETS);
/** A page's own large stylesheet or script as a shared file too, named when the module loads so every copy of the server knows it. */
export const pageFile = (prefix, kind, body) => { const name = `${prefix}-${hashOf(body)}.${kind}`; ASSETS[name] = { type: kind === 'css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', body }; return name; };
/** A shared file of the console's by its name, or null. It holds no one's anything, so it needs no sign-in. */
export const consoleAsset = (name) => (Object.hasOwn(ASSETS, name) ? new Response(ASSETS[name].body, { status: 200, headers: { 'Content-Type': ASSETS[name].type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } }) : null);
// The pages a person is likely to go to next, fetched as they rest on a link, where the browser can.
const NEXT_PAGES = JSON.stringify({ prefetch: [{ where: { and: [{ href_matches: '/console/*' }, { not: { href_matches: '/console/api/*' } }, { not: { selector_matches: '[target],[data-no-ahead]' } }] }, eagerness: 'moderate' }] });

// The mark, as this page's icon: nothing to fetch, so it shows under the page's own rules.
const FAVICON = `data:image/svg+xml,${encodeURIComponent(markSvg({ size: 64 }))}`;
/** The tag that gives a page VIABLE's mark in its browser tab. */
export const faviconTag = `<link rel="icon" type="image/svg+xml" href="${FAVICON}">`;

/** The headers every page of the console is served with. Nothing loads from elsewhere, no site frames it, and it is never kept. */
export const consoleHeaders = (nonce) => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; connect-src 'self'; font-src data:; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff'
});

// The person at the foot of the sidebar, and their menu. Credit says how much is left in words and a meter; the amount in money is on its page.
function accountHtml({ who, name, credit, links, brand, signOut }) {
  const label = name || who || 'This server';
  const avatar = who ? escapeHtml((label.trim()[0] || '?').toUpperCase()) : icon('server', 15);
  const external = (link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener">${icon(/help/i.test(link.title) ? 'help' : 'platform', 16)}<span>${escapeHtml(link.title)}</span>${icon('out', 14)}</a>`;
  return `<details class="side-account" data-close-outside>
<summary class="side-account-button"><span class="side-avatar" aria-hidden="true">${avatar}</span><span class="side-account-name">${escapeHtml(label)}</span>${credit ? `<span class="side-account-low" data-fill="${escapeHtml(credit.fill)}" data-fill-as="low" hidden></span>` : ''}${icon('chevron', 15)}</summary>
<div class="side-account-panel">
${who ? `<p class="side-account-who"><strong>${escapeHtml(label)}</strong>${name ? `<small>${escapeHtml(who)}</small>` : ''}</p>` : `<p class="side-account-who"><strong>${escapeHtml(brand)}</strong><small>This server</small></p>`}
${credit ? `<a class="side-credit" href="${escapeHtml(credit.href)}">${icon('gauge', 16)}<span class="side-credit-words"><span class="side-credit-top"><span>AI credit</span><small data-fill="${escapeHtml(credit.fill)}">&nbsp;</small></span><span class="side-meter" hidden><i data-fill="${escapeHtml(credit.fill)}" data-fill-as="meter"></i></span></span></a>` : ''}
<a href="/console/memory">${icon('memory', 16)}<span>What Ask remembers</span></a>
${links.map(external).join('')}
<form method="post" action="${escapeHtml(signOut)}" data-confirm="Sign out of ${escapeHtml(brand)}?" data-yes="Sign out"><button type="submit">${icon('signout', 16)}<span>Sign out</span></button></form>
</div>
</details>`;
}

/**
 * A page of the console. pages: [{ id, title }], the navigation: only what exists. home: where its name leads. The foot is the person: who is
 * signed in (person, their name, else who), and in their menu the AI credit where a host has it (credit: { fill, href }), what Ask remembers, the host's
 * links [{ href, title }], and Sign out. A server of one's own has no account: its foot is the server.
 */
export const consolePage = ({ title, pages, current, body, script = '', css = '', cssFile = null, scriptFile = null, links = [], brand = 'VIABLE Engine', signOut = '/teacher/signout?next=console', notice = '', home = null, who = null, person = null, credit = null }, nonce) => {
  const name = `${markSvg({ size: 28 })}<span class="brand-name"><strong>${escapeHtml(brand.split(' ')[0])}</strong><small>${escapeHtml(brand.split(' ').slice(1).join(' '))}</small></span>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · ${escapeHtml(brand)}</title>
${faviconTag}
<link rel="stylesheet" href="/console/assets/${SHARED_CSS_FILE}">
${cssFile ? `<link rel="stylesheet" href="/console/assets/${cssFile}">` : ''}
${css ? `<style nonce="${nonce}">${css}</style>` : ''}
<script type="speculationrules" nonce="${nonce}">${NEXT_PAGES}</script>
</head>
<body>
<div class="console">
<header class="side">
${home ? `<a class="brand" href="${escapeHtml(home)}">${name}</a>` : `<div class="brand">${name}</div>`}
<nav aria-label="The console"><ul>${pages.filter((page) => page.nav !== false).map((page) => `<li><a href="/console/${escapeHtml(page.id)}"${page.id === current ? ' aria-current="page"' : ''}${page.fill ? ` data-fill="${escapeHtml(page.fill)}"` : ''}>${escapeHtml(page.title)}</a></li>`).join('')}</ul></nav>
<div class="side-foot">${accountHtml({ who, name: person, credit, links, brand, signOut })}</div>
</header>
<main class="page" id="main">${notice}${body}</main>
</div>
<script src="/console/assets/${SHARED_JS_FILE}" nonce="${nonce}"></script>
${scriptFile ? `<script src="/console/assets/${scriptFile}" nonce="${nonce}"></script>` : ''}
${script ? `<script nonce="${nonce}">${script}</script>` : ''}
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
