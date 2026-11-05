/**
 * The console's shell: the look every page of it shares, on VIABLE's theme, and a left navigation made
 * from the pages that exist. No Node built-ins.
 */
import { markSvg, themeCss } from '../../../harness/src/ui/theme.js';
import { escapeHtml } from '../learner/shell.js';

const CONSOLE_CSS = `h1{font-size:clamp(1.9rem,3.4vw,2.6rem)}
h2{font-size:clamp(1.35rem,2.2vw,1.65rem);font-weight:400;letter-spacing:-.02em}
.console{display:grid;grid-template-columns:216px minmax(0,1fr);min-height:100vh}
.side{position:sticky;top:0;display:flex;flex-direction:column;gap:22px;height:100vh;padding:22px 16px;border-right:1px solid var(--public-rule);background:var(--surface)}
.brand{display:flex;align-items:center;gap:10px;padding:0 8px;color:var(--public-ink);line-height:1.2}
.brand-name{display:grid}
.brand-name strong{font-weight:600}
.brand-name small{color:var(--muted);font-size:.8125rem}
.side ul{display:grid;gap:2px;margin:0;padding:0;list-style:none}
.side a{display:block;padding:8px;border-radius:var(--radius-sm);color:var(--public-text);text-decoration:none}
.side a:hover{background:var(--field-mist)}
.side a[aria-current=page]{background:var(--field-mist);color:var(--public-ink);font-weight:600}
.side-foot{display:grid;gap:6px;margin-top:auto;font-size:.9375rem}
.side-foot button{padding:8px;border:0;border-radius:var(--radius-sm);background:none;color:var(--public-text);font:inherit;text-align:left;cursor:pointer}
.side-foot button:hover{background:var(--field-mist)}
.page{width:100%;max-width:1040px;padding:clamp(20px,4vw,44px) clamp(16px,4vw,44px) 72px}
.notice{margin:18px 0 0;padding:12px 16px;border-radius:var(--radius-sm);background:var(--query-soft);color:var(--public-ink)}
.notice code{overflow-wrap:anywhere}
@media (max-width:760px){.console{display:block}.side{position:static;flex-direction:row;flex-wrap:wrap;align-items:center;gap:6px 12px;height:auto;padding:10px 16px;border-right:0;border-bottom:1px solid var(--public-rule)}.brand{padding:0}.side ul{display:flex;flex-wrap:wrap}.side li a{white-space:nowrap}.side-foot{display:flex;margin:0 0 0 auto;font-size:.875rem}}`;

/** The headers every page of the console is served with. Nothing loads from elsewhere, no site frames it, and it is never kept. */
export const consoleHeaders = (nonce) => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; font-src data:; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff'
});

/** A page of the console. pages: [{ id, title }], the navigation: only what exists. links: [{ href, title }] beside it. */
export const consolePage = ({ title, pages, current, body, script = '', css = '', links = [], brand = 'VIABLE Engine', signOut = '/teacher/signout?next=console', notice = '' }, nonce) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · ${escapeHtml(brand)}</title>
<style nonce="${nonce}">${themeCss()}
${CONSOLE_CSS}
${css}</style>
</head>
<body>
<div class="console">
<header class="side">
<div class="brand">${markSvg({ size: 28 })}<span class="brand-name"><strong>${escapeHtml(brand.split(' ')[0])}</strong><small>${escapeHtml(brand.split(' ').slice(1).join(' '))}</small></span></div>
<nav aria-label="The console"><ul>${pages.filter((page) => page.nav !== false).map((page) => `<li><a href="/console/${escapeHtml(page.id)}"${page.id === current ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}</a></li>`).join('')}</ul></nav>
<div class="side-foot">${links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.title)}</a>`).join('')}<form method="post" action="${escapeHtml(signOut)}"><button type="submit">Sign out</button></form></div>
</header>
<main class="page" id="main">${notice}${body}</main>
</div>
${script ? `<script nonce="${nonce}">${script}</script>` : ''}
</body>
</html>`;
