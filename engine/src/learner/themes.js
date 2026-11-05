/**
 * A course's look (Course → Settings → Appearance): what every page of the course
 * shares, the course home (home.js) and its activities (chatPage.js). Each look has
 * its own type, colors, light and dark, a default color the course's own replaces, and the few rules
 * that give the home and the activities their shape. Fonts are the device's own: learner pages load
 * nothing from elsewhere (pageHeaders' Content-Security-Policy), so each stack names fonts found on
 * Macs, Windows, Chromebooks and Linux, falling back to the system's.
 */

const SYSTEM = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif';
const HUMANIST = `Seravek,"Gill Sans Nova",Ubuntu,Calibri,"DejaVu Sans",source-sans-pro,${SYSTEM}`;
const GEOMETRIC = `Avenir,"Avenir Next LT Pro",Montserrat,Corbel,"URW Gothic",source-sans-pro,${SYSTEM}`;
const ROUNDED = `ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",Quicksand,Comfortaa,Manjari,"Arial Rounded MT","Arial Rounded MT Bold",Calibri,source-sans-pro,${SYSTEM}`;
const INDUSTRIAL = `Bahnschrift,"DIN Alternate","Franklin Gothic Medium","Nimbus Sans Narrow",sans-serif-condensed,${SYSTEM}`;
const OLDSTYLE = '"Iowan Old Style","Palatino Linotype","URW Palladio L",P052,serif';
const TRANSITIONAL = 'Charter,"Bitstream Charter","Sitka Text",Cambria,serif';
const SLAB = 'Rockwell,"Rockwell Nova","Roboto Slab","DejaVu Serif","Sitka Small",serif';

const vars = (values) => Object.entries(values).map(([key, value]) => `--${key}:${value}`).join(';');

export const THEMES = Object.freeze({
  // A clean sheet: humanist type, open lists divided by hairlines, the next activity marked by a bar.
  clear: {
    name: 'Clear', accent: '#1f6b55',
    type: { font: HUMANIST, head: HUMANIST, 'head-weight': 700, 'head-track': '-.02em', r: '14px', 'r-sm': '10px', bw: '1px', size: '15px' },
    light: { bg: '#f5f6f4', panel: '#ffffff', ink: '#17201c', 'ink-2': '#3a4641', muted: '#66716c', line: '#dde2df', 'line-2': '#edf0ee', code: '#f0f2f1' },
    dark: { bg: '#0f1312', panel: '#161b19', ink: '#e9eeec', 'ink-2': '#c3ccc8', muted: '#8c9894', line: '#2a312e', 'line-2': '#1e2422', code: '#1c2220' },
    home: '',
    page: ''
  },
  // An exercise book: ruled paper with a margin line, the next activity on a sticky note, writing on the lines.
  notebook: {
    name: 'Notebook', accent: '#b03a2e',
    type: { font: SYSTEM, head: TRANSITIONAL, 'head-weight': 700, 'head-track': '-.01em', r: '4px', 'r-sm': '6px', bw: '1px', size: '15px' },
    light: { bg: '#e9edf1', panel: '#fffffd', ink: '#1e2a3f', 'ink-2': '#3b4860', muted: '#6c778a', line: '#d5dde7', 'line-2': '#edf1f5', code: '#f1f4f8', rule: '#d3dfee', margin: '#eaa9a9', note: '#fff1a8', 'note-ink': '#3d3510' },
    dark: { bg: '#12161d', panel: '#1a1f28', ink: '#e6ebf3', 'ink-2': '#c0c9d6', muted: '#8995a7', line: '#2d3542', 'line-2': '#222935', code: '#232a35', rule: '#273141', margin: '#6e3a3d', note: '#4a4322', 'note-ink': '#f4ecc4' },
    home: `
.sheet{position:relative;max-width:820px;margin:28px auto 64px;padding:32px 40px 64px 84px;background-color:var(--panel);background-image:linear-gradient(to right,transparent 58px,var(--margin) 58px,var(--margin) 60px,transparent 60px),repeating-linear-gradient(to bottom,transparent 0 25px,var(--rule) 25px 26px,transparent 26px 32px);box-shadow:0 1px 0 var(--line),0 18px 40px -28px rgba(30,42,63,.45)}
.sheet,.sheet p,.sheet .card p,.sheet .state,.sheet .unit-head .count,.sheet .unit-head .dates{line-height:32px}
.sheet .hero h1{line-height:64px;font-size:2.15rem}
.sheet .hero p{margin:0}.sheet .hero .kept{margin:0;gap:0 12px}
.sheet .bar{margin:0;height:32px}.sheet .bar span{height:3px;border-radius:0}
.sheet .next{margin:32px 0 0;padding:16px 20px;border:0;border-radius:2px;background:var(--note);color:var(--note-ink);box-shadow:0 12px 20px -14px rgba(0,0,0,.45);transform:rotate(-.5deg)}
.sheet .next small{color:var(--note-ink);opacity:.75}.sheet .next p{color:var(--note-ink)}
.sheet .next .kind{border-radius:50%}
.sheet .unit{margin-top:32px}
.sheet .unit-head{padding:0;border:0;min-height:64px;align-items:flex-end}
.sheet .unit-head h2{font-size:1.25rem;line-height:32px}
.sheet .list li+li{border-top:0}
.sheet .card{align-items:flex-start;padding:0 6px;margin:0 -6px;border-radius:0;min-height:64px}
.sheet a.card:hover{background:color-mix(in srgb,var(--note) 55%,transparent)}
.sheet .card strong{font-size:1.02rem;line-height:32px}
.sheet .kind{width:32px;height:32px;border:0;border-radius:0;color:var(--ink)}
.sheet .card.done .kind{background:none;color:var(--ok)}
.sheet .card.done strong{text-decoration:line-through;text-decoration-color:var(--accent);text-decoration-thickness:2px}
.sheet .chip{border-radius:2px;background:none;border:1px solid var(--line);line-height:1.5}
.sheet .info{margin-top:32px;padding:0;border:0;background:none}
@media (max-width:640px){.sheet{margin:0;padding:32px 18px 64px 44px;background-image:linear-gradient(to right,transparent 30px,var(--margin) 30px,var(--margin) 32px,transparent 32px),repeating-linear-gradient(to bottom,transparent 0 25px,var(--rule) 25px 26px,transparent 26px 32px)}}
`,
    page: `
.ws-paper{border-radius:2px;background-color:var(--panel);background-image:linear-gradient(to right,transparent 52px,var(--margin) 52px,var(--margin) 54px,transparent 54px),repeating-linear-gradient(to bottom,transparent 0 25px,var(--rule) 25px 26px,transparent 26px 32px);background-attachment:local;padding:32px 28px 32px 72px;font-size:17px;line-height:32px}
.ws-paper.plan{padding:32px 20px 32px 24px;line-height:32px;background-image:repeating-linear-gradient(to bottom,transparent 0 25px,var(--rule) 25px 26px,transparent 26px 32px);background-color:var(--panel)}
` },
  // A naturalist's field guide: graph paper, slab headings, each activity a specimen tag with its hole.
  field: {
    name: 'Field guide', accent: '#3f6d2e',
    type: { font: GEOMETRIC, head: SLAB, 'head-weight': 700, 'head-track': '0', r: '6px', 'r-sm': '6px', bw: '1.5px', size: '15px' },
    light: { bg: '#eef2ea', panel: '#fbfcf8', ink: '#1f2a20', 'ink-2': '#3d4a3e', muted: '#687468', line: '#c9d3c4', 'line-2': '#e2e8de', code: '#eef2ea', grid: '#dbe3d5' },
    dark: { bg: '#111611', panel: '#181e18', ink: '#e6ece4', 'ink-2': '#c1cbbf', muted: '#8d998b', line: '#313b30', 'line-2': '#222a22', code: '#1f261f', grid: '#1b231b' },
    home: `
body{background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px}
.hero h1{font-size:clamp(1.8rem,4.4vw,2.5rem)}
.next{border:var(--bw) solid var(--ink);border-radius:var(--r);background:var(--panel);box-shadow:3px 3px 0 var(--accent)}
a.next:hover{border-color:var(--ink)}
.unit-head{border-bottom:var(--bw) solid var(--ink)}
.unit-head .dates{font-style:italic}
.list{gap:10px;padding-top:12px}
.list li+li{border-top:0}
.card{margin:0;padding:14px 16px;border:var(--bw) dashed var(--line);border-radius:var(--r);background:var(--panel)}
a.card:hover{border-style:solid;border-color:var(--accent);background:var(--panel)}
.card .kind{background:var(--bg);border:var(--bw) solid var(--ink-2);color:var(--ink)}
.card.done{border-style:solid}
.card.done .kind{border-color:var(--ok);background:var(--bg)}
.chip{border-radius:3px}
.info{border-style:dashed}
`,
    page: `
.ws{background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px}
.ws-card,.ws-paper{border-width:var(--bw)}
.ws-card{border-style:dashed}
` },
  // A library's reading room: one serif throughout, the activities a book's contents with dotted leaders, the next one marked by a ribbon.
  reading: {
    name: 'Reading room', accent: '#7a2b2b',
    type: { font: OLDSTYLE, head: OLDSTYLE, 'head-weight': 500, 'head-track': '-.005em', r: '3px', 'r-sm': '3px', bw: '1px', size: '17px' },
    light: { bg: '#f1f1ee', panel: '#fbfbf9', ink: '#231d1b', 'ink-2': '#4a403c', muted: '#776c67', line: '#d9d5cf', 'line-2': '#e9e6e1', code: '#efede9' },
    dark: { bg: '#141211', panel: '#1b1817', ink: '#ece6e1', 'ink-2': '#cbc2bb', muted: '#968b84', line: '#352f2c', 'line-2': '#25211f', code: '#25211f' },
    home: `
main{max-width:660px}
.hero{text-align:center}
.hero h1{font-size:clamp(2rem,5vw,2.8rem);line-height:1.12}
.hero p{margin-inline:auto}.hero .kept{justify-content:center}
.hero::after{content:"";display:block;width:64px;height:1px;margin:26px auto 0;background:var(--accent)}
.bar{max-width:320px;margin-inline:auto}
.next{position:relative;padding:20px 76px 20px 22px;border:1px solid var(--line);border-radius:var(--r)}
.next::before{content:"";position:absolute;top:-1px;right:26px;width:22px;height:46px;background:var(--accent);clip-path:polygon(0 0,100% 0,100% 100%,50% 74%,0 100%)}
.next .kind{display:none}
.next small{font-style:italic;font-weight:400}
.next .go{background:none;color:var(--accent-text);padding:0;text-decoration:underline;text-underline-offset:4px}
#units{counter-reset:activity}
.unit{margin-top:44px}
.unit-head{flex-direction:column;align-items:center;gap:2px;padding:0 0 14px;border:0;text-align:center}
.unit-head h2{font-size:1.3rem;font-style:italic;font-weight:400}
.unit-head .count{margin:0}
.list li+li{border-top:0}
.card{display:grid;grid-template-columns:2.2em minmax(0,1fr) auto;align-items:baseline;gap:0;padding:9px 0;margin:0;border-radius:0;background-image:radial-gradient(circle,var(--muted) .9px,transparent 1.2px);background-size:7px 7px;background-repeat:repeat-x;background-position:0 calc(9px + 1.05em)}
.card::before{counter-increment:activity;content:counter(activity);align-self:stretch;padding-right:14px;background:var(--bg);color:var(--muted);font-variant-numeric:oldstyle-nums;text-align:right}
a.card:hover{background-color:transparent}a.card:hover strong{color:var(--accent-text)}
.card .kind{display:none}
.card .body strong{display:inline;padding-right:8px;background:var(--bg);font-size:1.06rem;font-weight:600}
.card .body p{padding-right:8px;font-size:.92rem}
.card .state{padding-left:8px;background:var(--bg);font-weight:500;font-style:italic}
.card .state svg{display:none}
.card.done strong{color:var(--ink-2)}
.chip{padding:0;background:none;font-style:italic;font-weight:400}
.chip+.chip::before{content:"·";margin-right:6px}
.info{border-width:1px 0;border-radius:0;background:none;padding-inline:0}
`,
    page: `
.ws-task p,.ws-q-prompt{font-size:1.04rem}
.ws-paper{font-size:18px;line-height:1.75}
` },
  // For young learners: rounded type, thick outlines with hard shadows, the activities as big tiles.
  playground: {
    name: 'Playground', accent: '#ffbf1f',
    type: { font: ROUNDED, head: ROUNDED, 'head-weight': 800, 'head-track': '-.01em', r: '20px', 'r-sm': '14px', bw: '2.5px', size: '16px' },
    light: { bg: '#e4f1fb', panel: '#ffffff', ink: '#1f1b2e', 'ink-2': '#3d3850', muted: '#625d74', line: '#c9d6e2', 'line-2': '#edf3f8', code: '#f2f6fa', edge: '#1f1b2e' },
    dark: { bg: '#13202b', panel: '#1b2a37', ink: '#f4f7fb', 'ink-2': '#d5dde6', muted: '#9fadbb', line: '#2e4152', 'line-2': '#223241', code: '#223241', edge: '#ffd25e' },
    home: `
.hero h1{font-size:clamp(2rem,5vw,2.7rem)}
.bar span{height:12px;border:2px solid var(--edge)}.bar i{background:var(--accent)}
.next{border:var(--bw) solid var(--edge);border-radius:var(--r);background:var(--accent);color:var(--on-accent);box-shadow:5px 5px 0 var(--edge)}
.next small,.next p{color:var(--on-accent)}
.next .kind{background:var(--panel);color:var(--ink);border:2px solid var(--edge)}
.next .go{background:var(--ink);color:var(--bg)}
a.next:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--edge)}
.unit{margin-top:40px}
.unit-head{border:0;padding-bottom:14px}
.unit-head h2{font-size:1.35rem}
.list{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px}
.list li{display:grid}.list li+li{border-top:0}
.card{flex-direction:column;align-items:flex-start;gap:10px;margin:0;padding:18px;border:var(--bw) solid var(--edge);border-radius:var(--r);background:var(--panel);box-shadow:4px 4px 0 var(--edge);transition:transform .12s,box-shadow .12s}
a.card:hover{background:var(--panel);transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--edge)}
a.card:active{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--edge)}
.card .kind{width:54px;height:54px;border-radius:16px;border:2px solid var(--edge);background:var(--accent);color:var(--on-accent)}
.card .kind svg{width:26px;height:26px}
.card.done .kind{background:var(--ok);color:#fff;border-color:var(--edge)}
.card.locked{box-shadow:none;border-style:dashed}.card.locked .kind{background:var(--line-2);color:var(--muted)}
.card strong{font-size:1.1rem;font-weight:800}
.card .body{flex:1}
.card .state{margin-top:4px;padding:6px 14px;border:2px solid var(--edge);border-radius:999px;font-weight:800}
.card.new:not(.locked) .state,.card.started .state{background:var(--accent);color:var(--on-accent)}
.chip{border:2px solid var(--line)}
.info,.gate-card{border:var(--bw) solid var(--edge);box-shadow:5px 5px 0 var(--edge)}
.btn{border-width:2px;border-color:var(--edge);font-weight:800}
.slot-card{border:var(--bw) solid var(--edge);box-shadow:4px 4px 0 var(--edge)}
`,
    page: `
.ws-card,.ws-paper,.slot-card{border:var(--bw) solid var(--edge);box-shadow:4px 4px 0 var(--edge)}
.ws-option,.ws-order-item,.ws-q-text{border:2px solid var(--edge)}
.ws-option:has(input:checked){box-shadow:3px 3px 0 var(--edge)}
.ws-btn{border-width:2px;font-weight:800}.ws-btn.primary{border-color:var(--edge)}
` },
  // A transit map: each unit a line, each activity a stop on it, the next one on the departures board.
  route: {
    name: 'Route', accent: '#b8336a',
    type: { font: SYSTEM, head: INDUSTRIAL, 'head-weight': 650, 'head-track': '.005em', r: '10px', 'r-sm': '8px', bw: '1px', size: '15px' },
    light: { bg: '#f1f2f4', panel: '#ffffff', ink: '#1b1e23', 'ink-2': '#3c424b', muted: '#69707a', line: '#d8dce1', 'line-2': '#eceef1', code: '#eef0f3', board: '#1e2227', 'board-ink': '#f5f6f7', 'board-hi': '#ffb81c' },
    dark: { bg: '#0f1114', panel: '#171a1e', ink: '#eceef1', 'ink-2': '#c4c9d0', muted: '#8b929c', line: '#2b3037', 'line-2': '#1f2328', code: '#1f2328', board: '#262b31', 'board-ink': '#f5f6f7', 'board-hi': '#ffb81c' },
    home: `
.next{border:0;border-radius:var(--r);background:var(--board);color:var(--board-ink)}
a.next:hover{border:0;box-shadow:inset 0 0 0 2px var(--board-hi)}
.next small{color:var(--board-hi);font-family:var(--font-head);font-weight:600;letter-spacing:.04em}
.next strong{font-size:1.25rem}
.next p{color:color-mix(in srgb,var(--board-ink) 72%,transparent)}
.next .kind{border-radius:50%;background:var(--board-hi);color:#1b1e23}
.next .go{background:var(--board-hi);color:#1b1e23}
.unit{margin-top:40px}
.unit-head{border:0;padding:0 0 6px 62px}
.unit-head h2{font-size:1.3rem}
.list{position:relative}
.list::before{content:"";position:absolute;left:21px;top:6px;bottom:6px;width:6px;border-radius:3px;background:var(--accent)}
.list li+li{border-top:0}
.card{position:relative;padding:12px 8px 12px 0;margin:0;gap:16px;background:none}
a.card:hover{background:none}a.card:hover strong{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px}
.card .kind{z-index:1;width:48px;height:48px;border-radius:50%;border:5px solid var(--accent);background:var(--panel);color:var(--accent-text)}
.card .kind svg{width:17px;height:17px}
.card.done .kind{border-color:var(--accent);background:var(--accent);color:var(--on-accent)}
.card.locked .kind{border-color:var(--line);color:var(--muted)}
.card strong{font-family:var(--font-head);font-size:1.08rem;font-weight:600}
.chip{border-radius:4px}
`,
    page: `
.ws-bar,.crs-strip{box-shadow:inset 0 4px 0 var(--accent)}
.ws-steps-dots{gap:0}
.ws-steps-dots li{position:relative;padding:3px 12px 3px 22px;border-radius:0;background:none}
.ws-steps-dots li::after{content:"";position:absolute;left:0;top:50%;width:12px;height:12px;margin-top:-6px;border:3px solid var(--line);border-radius:50%;background:var(--panel);box-sizing:border-box}
.ws-steps-dots li.on::after{border-color:var(--accent)}.ws-steps-dots li.done::after{border-color:var(--accent);background:var(--accent)}
.ws-steps-dots li.done::before{content:none}
` }
});

export const THEME_IDS = Object.freeze(Object.keys(THEMES));
export const themeOf = (id) => (Object.hasOwn(THEMES, String(id)) ? THEMES[id] : THEMES.clear);

// The accent's relative luminance (WCAG), to choose the text on it and its shade as text.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The page's colors and type for a look and an accent: light, dark, or the system's (html data-theme
 * auto). On a light accent text is dark; as text, a light accent is darkened on light pages and a
 * dark one lightened on dark pages, so it stays readable whatever color a teacher picks.
 */
export function themeVars(look, accent) {
  const theme = themeOf(look);
  const color = /^#[0-9a-f]{6}$/i.test(String(accent || '')) ? String(accent) : theme.accent;
  const l = luminance(color);
  const lightText = l > 0.4 ? 'color-mix(in oklab,var(--accent) 52%,#000)' : l > 0.22 ? 'color-mix(in oklab,var(--accent) 78%,#000)' : 'var(--accent)';
  const darkText = l < 0.08 ? 'color-mix(in oklab,var(--accent) 50%,#fff)' : l < 0.2 ? 'color-mix(in oklab,var(--accent) 72%,#fff)' : 'var(--accent)';
  const { font, head, size, ...type } = theme.type;
  const base = `--accent:${color};--on-accent:${l > 0.42 ? '#15171a' : '#fff'};--font:${font};--font-head:${head};--size:${size};${vars(type)}`;
  const light = `${vars(theme.light)};--accent-text:${lightText};--accent-soft:color-mix(in srgb,var(--accent) 12%,transparent);--accent-line:color-mix(in srgb,var(--accent) 34%,transparent);--ok:#16794a;--warn:#a35a00;--danger:#c42b1c;--shadow:0 1px 2px rgba(15,23,42,.05),0 10px 30px -14px rgba(15,23,42,.18);color-scheme:light`;
  const dark = `${vars(theme.dark)};--accent-text:${darkText};--accent-soft:color-mix(in srgb,var(--accent) 22%,transparent);--accent-line:color-mix(in srgb,var(--accent) 48%,transparent);--ok:#3fbf7a;--warn:#f0a531;--danger:#f2776b;--shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px -14px rgba(0,0,0,.6);color-scheme:dark`;
  return `:root{${base};${light}}
:root[data-theme=dark]{${dark}}
@media (prefers-color-scheme:dark){:root[data-theme=auto]{${dark}}}`;
}
