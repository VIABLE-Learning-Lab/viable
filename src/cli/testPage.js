/**
 * viable-harness test --html: a test run as a page, drawn with the same parts as the teacher's page. With
 * --out it is one file; without, it is served on this computer until Ctrl-C, with no other route.
 */
import { writeFile } from 'node:fs/promises';
import { listen } from '../server/node.js';
import { h, mark, PARTS_CSS, testCase, treeHtml } from '../ui/parts.js';
import { markSvg, themeCss } from '../ui/theme.js';
import { openBrowser } from './try.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);

const CSS = `.wrap{width:min(860px,100%);margin:0 auto;padding-inline:clamp(16px,4vw,40px)}
.head{padding-block:clamp(20px,3vw,32px) clamp(24px,4vw,44px);background:var(--field-mist)}
.brand{display:flex;align-items:center;gap:10px;margin:0 0 clamp(20px,4vw,44px);color:var(--public-ink);font-weight:600}
.tally{display:flex;flex-wrap:wrap;gap:6px 22px;margin:14px 0 0}
.judge{margin:12px 0 0;color:var(--muted);font-size:.9375rem}
main{padding-block:clamp(20px,3vw,36px) 48px}
.credits{margin:22px 0 0;color:var(--muted);font-size:.875rem;line-height:1.5}
.credits p{margin:6px 0 0}`;

/** The page for runAgentTests' result. cases: the cases it ran. credits: lines a resource asks to be kept with its results. */
export function testRunPage(run, cases = [], { title = 'Agent tests', credits = [] } = {}) {
  const results = run.results || [];
  const heading = results.length ? `${run.passed} of ${results.length} passed` : 'No cases ran';
  const tally = [['pass', run.passed, 'passed'], ['fail', run.failed, 'failed'], ['unverified', run.errors, run.errors === 1 ? 'error' : 'errors']].filter(([, count]) => count);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(heading)} | ${esc(title)}</title>
<style>${themeCss()}
${PARTS_CSS}
${CSS}</style>
</head>
<body>
<header class="head"><div class="wrap">
<p class="brand">${markSvg({ size: 30 })}${esc(title)}</p>
<h1>${esc(heading)}</h1>
<div class="tally">${tally.map(([kind, count, word]) => treeHtml(mark(kind, `${count} ${word}`))).join('')}</div>
<p class="judge">Judged by ${esc([run.judge_model, run.judge_prompt].filter(Boolean).join(' with '))}. A judge is a model: read its reasons, and decide for yourself.</p>
</div></header>
<main class="wrap">
${treeHtml(h('ol', { class: 'cases' }, ...results.map((result) => testCase(result, cases.find((item) => item?.name === result?.name) ?? null))))}
${credits.length ? `<div class="credits">${credits.map((line) => `<p>${esc(line)}</p>`).join('')}</div>` : ''}
</main>
</body>
</html>
`;
}

/** Writes the page to out, or serves it here until the process stops. */
export async function showTestRun(page, { out = null, open = true } = {}) {
  if (out) {
    await writeFile(out, page);
    return console.error(`Wrote ${out}.`);
  }
  const respond = (request) => (new URL(request.url).pathname === '/' && request.method === 'GET'
    ? new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'", 'cache-control': 'no-store' } })
    : new Response('Not found', { status: 404 }));
  const { server, url } = await listen(respond, { port: 0, host: '127.0.0.1' });
  console.error(`The results: ${url}\nPress Ctrl-C to stop.`);
  if (open) openBrowser(url);
  await new Promise((resolve) => { for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(resolve)); });
}
