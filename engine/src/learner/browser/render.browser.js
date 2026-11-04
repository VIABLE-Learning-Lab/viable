// The chat page's message renderer. scripts/build-learner-assets.mjs bundles it (with marked and
// DOMPurify) into a file its host serves from its own origin.
//
// marked turns Markdown into HTML (GitHub-flavored: tables, task lists, strikethrough, autolinks, plus
// $…$ / $$…$$ / \(…\) / \[…\] math), DOMPurify keeps only a safe set of tags, and a pass over the
// result adds what a chat needs:
// - [n] citation chips that link to the answer's sources;
// - images only from this site's image store or from the reply itself. Any other address becomes a
//   plain link and is never fetched, so a reply steered by injected content can't load an outside URL
//   carrying the conversation. A bare ![alt] (a model's placeholder for an image it made) shows the
//   reply's next image;
// - a link for every web address, however it is wrapped;
// - code blocks with a language label and Copy, highlighted once highlight.js loads;
// - math, rendered as native MathML once temml loads;
// - Mermaid diagrams, drawn in a sandboxed, network-less frame (diagram.browser.js) and shown as an
//   image, with their code a click away and as the fallback when a diagram can't be drawn.
// Highlighting, math and diagrams are separate files, loaded the first time a message needs them.
import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const me = typeof document !== 'undefined' ? document.currentScript : null;
const NONCE = (me && me.nonce) || '';
const BUNDLES = { code: me ? me.dataset.code : '', math: me ? me.dataset.math : '', diagram: me ? me.dataset.diagram : '' };

const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// $$…$$ and \[…\] on their own lines are display math; $…$, $$…$$ and \(…\) inside text are inline.
// A $ only opens math before a non-space and closes after one, and never right before a digit, so
// "$5 and $10" stays text.
const MATH_BLOCK = /^ {0,3}(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n+|$)/;
const MATH_INLINE = /^(?:\$\$((?:\\.|[^\\$])+?)\$\$|\$(?=[^\s$])((?:\\.|[^\\$\n])*?[^\s\\$])\$(?!\d)|\\\(((?:\\.|[^\\\n])+?)\\\))/;

const marked = new Marked({
  gfm: true,
  breaks: false,
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start: (src) => { const at = src.search(/\$\$|\\\[/); return at < 0 ? undefined : at; },
      tokenizer(src) {
        const m = MATH_BLOCK.exec(src);
        if (m) return { type: 'mathBlock', raw: m[0], text: (m[1] ?? m[2]).trim() };
      },
      renderer: (token) => `<div class="math" data-display="true" data-tex="${esc(token.text)}">${esc(token.text)}</div>`
    },
    {
      name: 'mathInline',
      level: 'inline',
      start: (src) => { const at = src.search(/\$|\\\(/); return at < 0 ? undefined : at; },
      tokenizer(src) {
        const m = MATH_INLINE.exec(src);
        if (m) return { type: 'mathInline', raw: m[0], display: m[1] !== undefined, text: (m[1] ?? m[2] ?? m[3]).trim() };
      },
      renderer: (token) => `<span class="math"${token.display ? ' data-display="true"' : ''} data-tex="${esc(token.text)}">${esc(token.text)}</span>`
    }
  ],
  renderer: {
    code({ text, lang }) {
      const language = (String(lang || '').match(/^[\w#+.-]+/) || [''])[0].toLowerCase();
      return `<pre data-lang="${esc(language)}"><code${language ? ` class="language-${esc(language)}"` : ''}>${esc(text.replace(/\n$/, ''))}</code></pre>\n`;
    }
  }
});

const TAGS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'del', 's', 'u', 'mark', 'sub', 'sup', 'kbd', 'abbr', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'input', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'span', 'div', 'details', 'summary', 'dl', 'dt', 'dd'];
const ATTRS = ['href', 'title', 'src', 'alt', 'class', 'start', 'type', 'checked', 'disabled', 'align', 'open', 'data-lang', 'data-tex', 'data-display'];
const purifier = DOMPurify(window);

const isHttps = (url) => /^https:\/\//i.test(String(url || ''));
// From elsewhere only over https; from this site, however it is reached.
const shownHere = (url, ctx) => isHttps(url) || (Boolean(ctx.origin) && String(url || '').startsWith(`${ctx.origin}/`));
const imageAllowed = (url, ctx) => shownHere(url, ctx) && (url.indexOf(`${ctx.origin || '\u0000'}/v1/assets/`) === 0 || (ctx.images || []).some((image) => image && image.url === url));

function makeLink(href, text, nofollow) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = nofollow ? 'noopener nofollow' : 'noopener';
  a.textContent = text;
  return a;
}

function makeImage(url, alt) {
  const img = document.createElement('img');
  img.src = url;
  img.alt = alt || 'Image from the assistant';
  img.loading = 'lazy';
  img.decoding = 'async';
  return img;
}

// A web address stops before trailing punctuation, and keeps a closing parenthesis only when it
// opened one, as in https://en.wikipedia.org/wiki/Cat_(film).
function trimUrl(url) {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    const head = url.slice(0, end);
    if ('.,;:!?*_\'"]}>'.indexOf(ch) !== -1 || (ch === ')' && head.split('(').length < head.split(')').length)) end -= 1;
    else break;
  }
  return url.slice(0, end);
}

const TEXT_TOKENS = /!\[([^\]\n]*)\](?!\()|\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]|https?:\/\/[^\s<>"'`]+/g;

// Citations, image placeholders and bare addresses in text, outside links, code blocks and math.
function enhanceText(root, ctx) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement && node.parentElement.closest('a, pre, .math, .cite') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    TEXT_TOKENS.lastIndex = 0;
    if (!TEXT_TOKENS.test(text)) continue;
    TEXT_TOKENS.lastIndex = 0;
    const out = document.createDocumentFragment();
    let last = 0;
    let match;
    while ((match = TEXT_TOKENS.exec(text))) {
      const [whole, alt, group] = match;
      let replacement = null;
      let consumed = whole;
      if (alt !== undefined) {
        const next = (ctx.images || []).find((image) => image && shownHere(image.url, ctx) && !ctx.used.has(image.url));
        if (next) { ctx.used.add(next.url); replacement = makeImage(next.url, alt); } else replacement = document.createTextNode('');
      } else if (group !== undefined) {
        const parts = group.split(',').map((n) => Number(n.trim()));
        if (parts.every((n) => (ctx.cites || []).some((c) => c.index === n))) {
          replacement = document.createDocumentFragment();
          for (const n of parts) {
            const cite = ctx.cites.find((c) => c.index === n);
            const a = makeLink(/^https?:\/\//i.test(String(cite.url || '')) ? cite.url : '#', String(n));
            a.className = 'cite';
            a.title = cite.title || 'Source';
            replacement.appendChild(a);
          }
        }
      } else {
        consumed = trimUrl(whole);
        if (consumed.length > 'https://'.length) replacement = makeLink(consumed, consumed);
        else consumed = whole;
      }
      if (!replacement) continue;
      out.appendChild(document.createTextNode(text.slice(last, match.index)));
      out.appendChild(replacement);
      last = match.index + consumed.length;
      TEXT_TOKENS.lastIndex = last;
    }
    if (last === 0) continue;
    out.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(out, node);
  }
}

const loading = {};
function load(name) {
  if (!BUNDLES[name]) return Promise.reject(new Error(`No ${name} bundle`));
  loading[name] = loading[name] || new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = BUNDLES[name];
    script.nonce = NONCE;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => { delete loading[name]; reject(new Error(`Could not load ${name}`)); };
    document.head.appendChild(script);
  });
  return loading[name];
}

function highlight(codes) {
  if (!codes.length) return;
  load('code').then(() => {
    const hljs = window.ViableHighlight;
    for (const code of codes) {
      if (code.dataset.highlighted) continue;
      try {
        hljs.highlightElement(code);
        // A block without a language shows the one highlight.js detected.
        const detected = (code.className.match(/language-([\w#+.-]+)/) || [])[1];
        const label = code.closest('.code') && code.closest('.code').querySelector('.code-head span');
        if (detected && label && label.textContent === 'code') label.textContent = detected;
      } catch { /* left plain */ }
    }
  }).catch(() => {});
}

function typeset(nodes) {
  if (!nodes.length) return;
  load('math').then(() => {
    for (const node of nodes) {
      try {
        // temml's inline style attributes are removed from its markup before anything parses it: the
        // page's CSP allows no inline styles (even parsing them reports a violation), and the page's
        // stylesheet lays out display math instead.
        const markup = window.ViableMath.renderToString(node.dataset.tex, { displayMode: node.dataset.display === 'true', throwOnError: false, trust: false });
        node.innerHTML = purifier.sanitize(markup.replace(/\sstyle="[^"]*"/g, ''), { USE_PROFILES: { mathMl: true } });
        node.classList.add('ready');
        node.setAttribute('aria-label', node.dataset.tex);
      } catch { /* the TeX source stays visible */ }
    }
  }).catch(() => {});
}

// One hidden frame draws every diagram on the page: sandboxed to scripts only (no access to this page,
// its storage or the conversation) and, by its own CSP, unable to fetch anything.
let diagramFrame = null;
const diagramJobs = new Map();
let diagramSeq = 0;
function diagramRenderer() {
  if (diagramFrame) return diagramFrame;
  const pending = new Promise((resolve, reject) => {
    if (!BUNDLES.diagram) { reject(new Error('No diagram renderer')); return; }
    const frame = document.createElement('iframe');
    frame.src = BUNDLES.diagram;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.title = 'Diagram renderer';
    // Laid out off-screen (Mermaid measures text), never seen or reachable.
    Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '1024px', height: '768px', border: '0', opacity: '0', pointerEvents: 'none' });
    // A failure is not kept: the next diagram builds the frame again (a slow first load, a network blip).
    const fail = (message) => { clearTimeout(timer); if (diagramFrame === pending) diagramFrame = null; frame.remove(); reject(new Error(message)); };
    const timer = setTimeout(() => fail('The diagram renderer did not load'), 20000);
    // A browser or in-app view that blocks sandboxed frames still fires load (on an error page): show
    // the code soon instead of waiting out the timer.
    frame.addEventListener('load', () => setTimeout(() => { if (!ready) fail('The diagram renderer is blocked here'); }, 8000), { once: true });
    let ready = false;
    window.addEventListener('message', (event) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data || {};
      if (data.type === 'viable-diagram:ready') { ready = true; clearTimeout(timer); resolve(frame); return; }
      const job = diagramJobs.get(data.id);
      if (!job) return;
      diagramJobs.delete(data.id);
      if (data.type === 'viable-diagram:done' && typeof data.svg === 'string') job.resolve(data.svg);
      else job.reject(new Error(data.error || 'The diagram could not be drawn'));
    });
    document.body.appendChild(frame);
  });
  diagramFrame = pending;
  return pending;
}

function drawDiagram(code) {
  const root = document.documentElement.getAttribute('data-theme');
  const theme = root === 'dark' || (root !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  return diagramRenderer().then((frame) => new Promise((resolve, reject) => {
    const id = ++diagramSeq;
    diagramJobs.set(id, { resolve, reject });
    frame.contentWindow.postMessage({ type: 'viable-diagram:render', id, code, theme }, '*');
    setTimeout(() => { if (diagramJobs.delete(id)) reject(new Error('The diagram took too long to draw')); }, 20000);
  }));
}

/** Mermaid's SVG as an image source, sized by its viewBox. As an <img>, nothing in it runs or loads. */
function svgImageSource(svg) {
  const open = String(svg).match(/<svg\b[^>]*>/);
  if (!open) throw new Error('Not an SVG');
  let tag = open[0].replace(/\s(width|height|style)="[^"]*"/g, '');
  const box = tag.match(/viewBox="([^"]+)"/);
  const [, , width, height] = box ? box[1].trim().split(/[\s,]+/).map(Number) : [];
  if (width > 0 && height > 0) tag = tag.replace('<svg', `<svg width="${Math.ceil(width)}" height="${Math.ceil(height)}"`);
  if (!/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(tag)) tag = tag.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(svg).replace(open[0], tag))}`;
}

function toolButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/** The diagram's image as a PNG download (twice its size), or its SVG where a canvas can't take it. */
function downloadDiagram(img) {
  const save = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth * 2;
    canvas.height = img.naturalHeight * 2;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { save(img.src, 'diagram.svg'); return; }
      const url = URL.createObjectURL(blob);
      save(url, 'diagram.png');
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  } catch { save(img.src, 'diagram.svg'); }
}

function diagramBlock(pre, code) {
  const block = document.createElement('div');
  block.className = 'code diagram';
  const head = document.createElement('div');
  head.className = 'code-head';
  const label = document.createElement('span');
  label.textContent = 'diagram';
  const tools = document.createElement('span');
  tools.className = 'tools';
  head.append(label, tools);
  const view = document.createElement('div');
  view.className = 'diagram-view';
  const wait = document.createElement('p');
  wait.className = 'diagram-wait';
  wait.textContent = 'Drawing the diagram…';
  view.appendChild(wait);
  pre.hidden = true;
  block.append(head, view, pre);
  const showCode = (note, retry) => {
    view.hidden = true;
    pre.hidden = false;
    tools.replaceChildren(...(retry ? [toolButton('Try again', retry)] : []), copyButton(() => code.textContent));
    block.querySelector('.diagram-note')?.remove();
    if (note) { const p = document.createElement('p'); p.className = 'diagram-note'; p.textContent = note; block.insertBefore(p, pre); }
  };
  // Why the code is showing: a mistake in the diagram (with its line when Mermaid gives one), or a
  // browser that can't run the sandboxed renderer.
  const reason = (error) => {
    const message = String((error && error.message) || '');
    const line = message.match(/Parse error on line (\d+)/);
    if (line) return `This diagram has a mistake on line ${line[1]}, so here is its code.`;
    if (/blocked|did not load|No diagram renderer/.test(message)) return 'Diagrams can’t be drawn in this browser right now, so here is the code.';
    if (/took too long/.test(message)) return 'This diagram took too long to draw, so here is its code.';
    return 'This diagram couldn’t be drawn, so here is its code.';
  };
  const attempt = () => { view.hidden = false; pre.hidden = true; view.replaceChildren(wait); block.querySelector('.diagram-note')?.remove(); tools.replaceChildren(); draw(); };
  const draw = () => drawDiagram(code.textContent).then((svg) => {
    const img = document.createElement('img');
    img.alt = 'Diagram';
    img.decoding = 'async';
    img.onerror = () => showCode('This diagram couldn’t be shown, so here is its code.');
    img.onload = () => {
      view.replaceChildren(img);
      let showing = 'diagram';
      const toggle = toolButton('Code', () => {
        showing = showing === 'diagram' ? 'code' : 'diagram';
        view.hidden = showing === 'code';
        pre.hidden = showing !== 'code';
        toggle.textContent = showing === 'code' ? 'Diagram' : 'Code';
      });
      tools.replaceChildren(toggle, copyButton(() => code.textContent), toolButton('Download', () => downloadDiagram(img)));
    };
    img.src = svgImageSource(svg);
  }).catch((error) => showCode(reason(error), /Parse error/.test(String(error && error.message)) ? null : attempt));
  draw();
  return block;
}

function copyButton(getText) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy';
  button.textContent = 'Copy';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy'; }, 1600);
    } catch { /* clipboard unavailable */ }
  });
  return button;
}

/**
 * The message as a DocumentFragment. ctx: { cites: [{index, title, url}], images: [{url}], origin,
 * used: Set, inline } — images shown in the text are added to ctx.used so the gallery under the reply
 * can skip them; inline: one line of text without blocks (a choice, a hint), so "1." stays text.
 */
function render(text, ctx = {}) {
  ctx = { cites: [], images: [], origin: '', ...ctx, used: ctx.used || new Set() };
  const html = ctx.inline ? marked.parseInline(String(text || ''), { async: false }) : marked.parse(String(text || ''), { async: false });
  const root = purifier.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, ALLOW_DATA_ATTR: false, RETURN_DOM_FRAGMENT: true });
  // A reply's text can come from anywhere (a knowledge base, a fetched page), so of the classes in it
  // only the two this renderer writes stay: the page's own would let it draw as the page.
  for (const node of [...root.querySelectorAll('[class]')]) {
    const own = [...node.classList].filter((name) => name === 'math' || /^language-[\w#+.-]+$/.test(name));
    if (own.length) node.className = own.join(' ');
    else node.removeAttribute('class');
  }

  for (const a of [...root.querySelectorAll('a')]) {
    const href = a.getAttribute('href') || '';
    if (!/^(https?:|mailto:)/i.test(href)) { a.replaceWith(...a.childNodes); continue; }
    a.target = '_blank';
    a.rel = 'noopener';
  }
  for (const img of [...root.querySelectorAll('img')]) {
    const url = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    if (imageAllowed(url, ctx)) {
      ctx.used.add(url);
      img.replaceWith(makeImage(url, alt));
    } else if (/^https?:\/\//i.test(url)) {
      img.replaceWith(makeLink(url, alt || 'Image', true));
    } else img.remove();
  }
  // Task-list checkboxes are the only inputs a reply may show, and they can't be changed.
  for (const box of [...root.querySelectorAll('input')]) {
    if (String(box.getAttribute('type')).toLowerCase() === 'checkbox') box.disabled = true;
    else box.remove();
  }
  enhanceText(root, ctx);

  for (const table of [...root.querySelectorAll('table')]) {
    const wrap = document.createElement('div');
    wrap.className = 'table';
    table.replaceWith(wrap);
    wrap.appendChild(table);
  }
  const codes = [];
  for (const pre of [...root.querySelectorAll('pre')]) {
    const code = pre.querySelector('code') || pre;
    // While a reply is still being written (ctx.live) a diagram is shown as its code: drawing every
    // partial version would queue up work the finished one waits behind.
    if (pre.getAttribute('data-lang') === 'mermaid' && code !== pre && !ctx.live) {
      const placeholder = document.createElement('div');
      pre.replaceWith(placeholder);
      placeholder.replaceWith(diagramBlock(pre, code));
      continue;
    }
    const block = document.createElement('div');
    block.className = 'code';
    const head = document.createElement('div');
    head.className = 'code-head';
    const label = document.createElement('span');
    label.textContent = pre.getAttribute('data-lang') || 'code';
    head.append(label, copyButton(() => code.textContent));
    pre.replaceWith(block);
    block.append(head, pre);
    if (code !== pre && !['text', 'plaintext', 'txt'].includes(pre.getAttribute('data-lang'))) codes.push(code);
  }
  if (!ctx.live) {
    highlight(codes);
    typeset([...root.querySelectorAll('.math[data-tex]')]);
  }
  return root;
}

window.ViableRender = { render, svgImageSource };
