/**
 * VIABLE's look, for every page the harness shows a person: the learner pages, the teacher's page,
 * the MCP views. The tokens carry the names and light values of VIABLE's portal's stylesheet (its "public
 * chrome"), so the two can't drift; dark is here. With the fonts, the mark and a few base components.
 * No node: imports: a Worker can use it.
 *
 *   <style>${themeCss()}</style>                     a single file: the fonts inlined (about 69 KB)
 *   <style>${themeCss({ fonts: 'url' })}</style>     a served page: add fontRoutes() to createHandler's routes
 *   <style>${themeCss({ fonts: 'none' })}</style>    the device's own fonts
 *
 * Use the tokens (var(--public-ink)) and the classes (v-btn, v-card, v-mark...); add to them here rather
 * than forking a colour. The dark values are chosen, not inverted. <html data-theme="light|dark">
 * overrides the system's choice, and print is always light.
 */
import { MONO, NEXT } from './fontData.js';

export const TOKENS = {
  light: {
    surface: '#ffffff', 'public-page': '#ffffff',
    'public-ink': '#141c28', 'public-text': '#444e5e', muted: '#54607a',
    'public-rule': '#dfe3ea', 'public-rule-strong': '#c4cad5',
    'ink-blue': '#1f47a8', 'ink-blue-deep': '#17357f', 'on-ink-blue': '#ffffff', 'ink-blue-line': 'rgba(31, 71, 168, 0.35)',
    'field-mist': '#e9eef5', 'field-sage': '#e7eee9', 'field-stone': '#efede7', 'field-lilac': '#ecebf4',
    'pass-green': '#2e6f4c', 'pencil-red': '#a8423a', 'query-ochre': '#8a5a12',
    'pass-soft': '#e7f1eb', 'pencil-soft': '#f7eae8', 'query-soft': '#f6efe0',
    'code-bg': '#0b1324', 'code-ink': '#dbe3f2', 'code-line': 'rgba(255, 255, 255, 0.09)',
    'public-shadow': '0 1px 2px rgba(20,28,40,.05),0 24px 48px -36px rgba(20,28,40,.28)'
  },
  dark: {
    surface: '#172030', 'public-page': '#0e1420',
    'public-ink': '#eef1f6', 'public-text': '#b8c0ce', muted: '#99a3b4',
    'public-rule': '#273041', 'public-rule-strong': '#3b4659',
    'ink-blue': '#93b2f7', 'ink-blue-deep': '#b4caf9', 'on-ink-blue': '#0b1324', 'ink-blue-line': 'rgba(147, 178, 247, 0.4)',
    'field-mist': '#131b2a', 'field-sage': '#132019', 'field-stone': '#181b21', 'field-lilac': '#191a2d',
    'pass-green': '#7fcba0', 'pencil-red': '#ec9a90', 'query-ochre': '#e0b767',
    'pass-soft': '#15291f', 'pencil-soft': '#2f1b19', 'query-soft': '#2b2213',
    'code-bg': '#080d18', 'code-ink': '#dbe3f2', 'code-line': 'rgba(255, 255, 255, 0.08)',
    'public-shadow': '0 0 0 1px #232c3c'
  }
};
// The same in light and dark.
export const SHARED_TOKENS = {
  'font-public': '"Atkinson Hyperlegible Next", Inter, ui-sans-serif, system-ui, sans-serif',
  'font-public-mono': '"Atkinson Hyperlegible Mono", "JetBrains Mono", ui-monospace, monospace',
  radius: '12px', 'radius-sm': '9px', 'radius-lg': '18px', 'radius-pill': '999px',
  'ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)'
};
// The tokens the portal's stylesheet doesn't have: the rest keep its names and light values (test/theme.test.js).
export const HARNESS_ONLY_TOKENS = ['public-page', 'on-ink-blue', 'ink-blue-line', 'query-ochre', 'pass-soft', 'pencil-soft', 'query-soft', 'public-shadow'];

const FONT_NEXT = 'atkinson-hyperlegible-next-latin.woff2';
const FONT_MONO = 'atkinson-hyperlegible-mono-latin.woff2';
const FONTS = { [FONT_NEXT]: NEXT, [FONT_MONO]: MONO };
export const FONT_PATH = '/_viable/fonts';

const face = (family, src, project) => `/* ${family}, (c) 2020-2024 The ${family} Project Authors (${project}), SIL Open Font License 1.1: https://openfontlicense.org */
@font-face{font-family:"${family}";font-style:normal;font-weight:200 800;font-display:swap;src:url(${src}) format("woff2")}`;

/** The @font-face rules: inlined (data: URLs), or by URL from `base` (see fontRoutes). `mono: false` leaves the mono out. */
export function fontFaces({ url = false, base = FONT_PATH, mono = true } = {}) {
  const src = (file) => (url ? `${base}/${file}` : `data:font/woff2;base64,${FONTS[file]}`);
  return [
    face('Atkinson Hyperlegible Next', src(FONT_NEXT), 'https://github.com/googlefonts/atkinson-hyperlegible-next'),
    mono ? face('Atkinson Hyperlegible Mono', src(FONT_MONO), 'https://github.com/googlefonts/atkinson-hyperlegible-next-mono') : ''
  ].filter(Boolean).join('\n');
}

/** A route module for createHandler's `routes`: serves the fonts at `base`, for pages using themeCss({ fonts: 'url' }). */
export const fontRoutes = (base = FONT_PATH) => () => async (request, url) => {
  if (!url.pathname.startsWith(`${base}/`) || !['GET', 'HEAD'].includes(request.method)) return null;
  const data = FONTS[url.pathname.slice(base.length + 1)];
  if (!data) return null;
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  return new Response(request.method === 'HEAD' ? null : bytes, { headers: { 'content-type': 'font/woff2', 'content-length': String(bytes.length), 'cache-control': 'public, max-age=31536000, immutable' } });
};

// `host` names a host's CSS variable for a token, which wins where the host sets it (the MCP views).
const vars = (values, host = {}) => Object.entries(values).map(([name, value]) => `--${name}:${host[name] ? `var(${host[name]},${value})` : value}`).join(';');

// Print is always light: dark values apply on screens only.
const tokensCss = (host) => `:root{color-scheme:light dark;${vars(TOKENS.light, host)};${vars(SHARED_TOKENS, host)}}
:root[data-theme=light]{color-scheme:light}
@media screen and (prefers-color-scheme:dark){:root:not([data-theme=light]){${vars(TOKENS.dark, host)}}}
@media screen{:root[data-theme=dark]{color-scheme:dark;${vars(TOKENS.dark, host)}}}
@media print{:root{--public-shadow:none}}`;

// Zero specificity: a page's own rule always wins.
export const BASE_CSS = `:where(*,*::before,*::after){box-sizing:border-box}
:where(html){-webkit-text-size-adjust:100%}
:where(body){margin:0;background:var(--public-page);color:var(--public-text);font:400 1rem/1.6 var(--font-public);overflow-wrap:break-word;-webkit-font-smoothing:antialiased}
:where(h1,h2,h3,h4){margin:0;color:var(--public-ink);text-wrap:balance}
:where(h1){font-size:clamp(2.4rem,5.2vw,4rem);font-weight:300;line-height:1.05;letter-spacing:-.04em}
:where(h2){font-size:clamp(1.75rem,3.2vw,2.5rem);font-weight:300;line-height:1.1;letter-spacing:-.035em}
:where(h3){font-size:1.3125rem;font-weight:400;line-height:1.25;letter-spacing:-.02em}
:where(h4){font-size:1rem;font-weight:600;line-height:1.35}
:where(a){color:var(--ink-blue);text-decoration:underline 1px var(--ink-blue-line);text-underline-offset:.22em}
:where(a:hover){text-decoration-color:currentColor}
:where(code,kbd,samp,pre){font-family:var(--font-public-mono);font-size:.92em}
:where(:focus-visible){outline:2px solid var(--ink-blue);outline-offset:2px;border-radius:4px}
::selection{background:var(--ink-blue);color:var(--on-ink-blue)}`;

const TICK = '4% 51%,8% 50%,13% 54%,20% 63%,27% 74%,33% 84%,46% 58%,59% 41%,73% 26%,87% 14%,96% 7%,97% 9%,85% 24%,72% 41%,60% 59%,49% 77%,38% 96%,33% 97%,26% 87%,17% 73%,9% 61%';
const CROSS = '10% 12%,23% 28%,37% 46%,53% 63%,71% 79%,88% 94%,92% 90%,78% 72%,62% 55%,46% 37%,30% 22%,14% 8%,10% 12%,86% 6%,86% 6%,70% 20%,54% 35%,37% 52%,22% 70%,8% 88%,12% 92%,29% 76%,46% 60%,63% 44%,77% 26%,90% 10%,86% 6%,10% 12%';

export const COMPONENTS_CSS = `.v-label{color:var(--public-ink);font-size:.875rem;font-weight:600;line-height:1.35}
.v-note{color:var(--muted);font-size:.9375rem;line-height:1.5}
.v-lead{color:var(--public-text);font-size:clamp(1.0625rem,1.3vw,1.1875rem);line-height:1.55}
.v-rule{height:1px;margin:0;border:0;background:var(--public-rule)}
.v-rows{margin:0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.v-rows>*{padding:12px 0;border-bottom:1px solid var(--public-rule)}
.v-field{background:var(--field-mist)}
.v-field.is-sage{background:var(--field-sage)}.v-field.is-stone{background:var(--field-stone)}.v-field.is-lilac{background:var(--field-lilac)}
.v-card{padding:20px 22px;border-radius:var(--radius);background:var(--surface);box-shadow:var(--public-shadow)}
.v-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 22px;border:1px solid var(--public-rule-strong);border-radius:var(--radius-pill);background:transparent;color:var(--public-ink);font:600 .9375rem var(--font-public);text-decoration:none;white-space:nowrap;cursor:pointer;transition:background .16s ease,border-color .16s ease}
.v-btn:hover{border-color:var(--public-ink)}
.v-btn.is-primary{border-color:var(--ink-blue);background:var(--ink-blue);color:var(--on-ink-blue)}
.v-btn.is-primary:hover{border-color:var(--ink-blue-deep);background:var(--ink-blue-deep)}
.v-btn.is-small{min-height:34px;padding:0 14px;font-size:.875rem}
.v-btn:disabled{opacity:.5;cursor:not-allowed}
.v-btn:focus-visible{border-radius:var(--radius-pill);outline:2px solid var(--ink-blue);outline-offset:3px}
.v-pill{display:inline-flex;align-items:center;gap:6px;padding:1px 10px;border:1px solid var(--public-rule);border-radius:var(--radius-pill);color:var(--public-text);font-size:.8125rem;line-height:1.6;white-space:nowrap}
.v-pill.is-field{border-color:transparent;background:var(--field-mist)}
.v-pill code{font-size:1em}
.v-mark{display:inline-flex;align-items:center;gap:.42em;color:var(--muted);font-size:.9375rem;font-weight:600;line-height:1.25}
.v-mark::before{content:"";display:grid;flex:none;place-items:center;width:1.1em;height:1.1em;background:currentColor;line-height:1;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.v-mark.pass{color:var(--pass-green)}
.v-mark.pass::before{clip-path:polygon(${TICK})}
.v-mark.fail{color:var(--pencil-red)}
.v-mark.fail::before{clip-path:polygon(${CROSS})}
.v-mark.unverified{color:var(--query-ochre)}
.v-mark.unverified::before{content:"?";border:1.25px dashed currentColor;border-radius:50%;background:none;font-size:.82em;width:1.4em;height:1.4em}
.v-mark.attention{color:var(--pencil-red)}
.v-mark.attention::before{content:"!";border-radius:50%;background:var(--pencil-red);color:var(--surface);font-size:.82em;font-weight:700;width:1.4em;height:1.4em}
.v-mark.is-word-hidden{gap:0;font-size:1.0625rem}
.v-table{width:100%;border-collapse:collapse;font-size:.9375rem;line-height:1.45}
.v-table th,.v-table td{padding:10px 12px 10px 0;border-bottom:1px solid var(--public-rule);text-align:left;vertical-align:top}
.v-table thead th{padding-top:0;color:var(--muted);font-size:.8125rem;font-weight:600;vertical-align:bottom}
.v-table tbody th{color:var(--public-ink);font-weight:500}
.v-table .is-num{padding-right:0;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.v-code{margin:0;padding:16px 18px;overflow-x:auto;border:1px solid var(--code-line);border-radius:var(--radius-sm);background:var(--code-bg);color:var(--code-ink);font:400 .875rem/1.6 var(--font-public-mono);white-space:pre}
.v-code ::selection{background:rgba(164,173,255,.4);color:#fff}
.v-tag{padding:1px 6px;border-radius:6px;background:var(--field-mist);color:var(--public-ink);font-family:var(--font-public-mono);font-size:.86em}
.v-form{display:grid;gap:6px}
.v-input{width:100%;min-height:44px;padding:9px 14px;border:1px solid var(--public-rule-strong);border-radius:var(--radius-sm);background:var(--surface);color:var(--public-ink);font:400 1rem/1.45 var(--font-public);transition:border-color .16s ease}
.v-input:hover{border-color:var(--muted)}
.v-input:focus-visible{border-color:var(--ink-blue);border-radius:var(--radius-sm);outline:2px solid var(--ink-blue);outline-offset:0}
.v-input::placeholder{color:var(--muted)}
.v-empty{padding:18px 20px;border:1px dashed var(--public-rule-strong);border-radius:var(--radius-sm);color:var(--muted);font-size:.9375rem;line-height:1.5}
.v-reading{position:relative;overflow:hidden}
.v-reading::after{content:"";position:absolute;right:0;left:0;top:0;height:1.5px;background:var(--ink-blue);animation:v-read 1.7s ease-in-out infinite alternate}
@keyframes v-read{to{top:calc(100% - 1.5px)}}
@media (prefers-reduced-motion:reduce){.v-reading::after{display:none}.v-btn,.v-input{transition:none}}`;

/**
 * Everything a page needs in one <style>. fonts: 'inline' (a single file), 'url' (served, with
 * fontRoutes; `fontBase` is where) or 'none'. components: false for only the tokens and the base.
 * host: { token: '--a-hosts-variable' }.
 */
export function themeCss({ fonts = 'inline', fontBase = FONT_PATH, mono = true, components = true, host = {} } = {}) {
  return [
    fonts === 'none' ? '' : fontFaces({ url: fonts === 'url', base: fontBase, mono }),
    tokensCss(host), BASE_CSS, components ? COMPONENTS_CSS : ''
  ].filter(Boolean).join('\n');
}

const BOOK = (x, top) => `M${x + 7} ${top}h11a7 7 0 0 1 7 7v123c-1-4-3-5-7-5h-11c-4 0-6 1-7 5V${top + 7}a7 7 0 0 1 7-7z`;
const BRACE = 'M72 65H62C49 65 41.5 71 41.5 88v10C41.5 112 36 121 26.5 121v16C36 137 41.5 146 41.5 160v11C41.5 188 49 194 62 194h10v-16h-6c-6 0-7.5-3-8-10l-.5-16C57 141 53 134 46 129c7-5 11-12 11.5-23l.5-16c.5-6 2-9 8-9h6z';

/** VIABLE's mark as inline SVG, on its white coin so it reads on dark. `label` names it; with none it's decoration. */
export function markSvg({ size = 32, label = '' } = {}) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}" ${a11y}><defs><linearGradient id="v-mark-ring" x1="0" y1="0" x2="0" y2="1"><stop offset=".3" stop-color="#83b2ff"/><stop offset="1" stop-color="#8f7fd2"/></linearGradient></defs><circle cx="128" cy="128" r="124" fill="#fff" stroke="url(#v-mark-ring)" stroke-width="8"/><path fill="#004aad" d="${BRACE}"/><path fill="#004aad" transform="matrix(-1 0 0 1 256 0)" d="${BRACE}"/><path fill="#4577ce" d="${BOOK(86, 61)}${BOOK(144, 61)}"/><path fill="#004aad" d="${BOOK(115, 90).replace('v123', 'v94')}"/></svg>`;
}
