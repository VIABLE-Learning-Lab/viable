/**
 * Materials: what a teacher brings for Ask to read, kept as they gave it, with the words the AI reads from it. Everything goes through what the
 * host passes as `materials`: { accept, hint, add, addLink, list, get, remove, retry, words, link, read, search, forReading, drive }. A host without
 * it shows no such page, and Ask offers no files. No Node built-ins.
 */
import { dropZone, esc, FORMS_CSS, say, when } from './forms.js';
import { icon } from './icons.js';

const refused = (message, status = 400, code = 'invalid_material') => Object.assign(new Error(message), { status, code });
const FILE_BYTES = 16 * 1048576;
const SHOWN_CHARS = 40000;
const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes || 0} bytes`);
const STATE = { ready: 'Ready', reading: 'Reading…', failed: 'Couldn’t be read' };

const addParts = ({ materials }) => `<div class="material-add" id="material-add" data-say-box>
${dropZone({ id: 'material-file', label: 'Drop files here', accept: materials.accept, upload: 'POST materials', multiple: true, hint: materials.hint })}
${materials.drive ? '<button class="v-btn is-small" type="button" id="material-drive">Choose from Google Drive</button>' : ''}
<form class="material-link" id="material-link" data-api="POST materials/link" data-busy="Getting it…">
<label class="v-label" for="material-url">Or a Google Doc, Slides or Sheet</label>
<div class="material-link-row"><input class="v-input" id="material-url" name="url" type="url" required placeholder="https://docs.google.com/…" autocomplete="off"><button class="v-btn" type="submit">Add</button></div>
<small class="v-note">Shared as “Anyone with the link can view”. We keep a copy from today, and it doesn’t change when the original does.</small>
</form>
${say()}
</div>`;

const row = (material) => `<li class="material${material.status === 'reading' ? ' is-reading' : ''}"${material.status === 'reading' ? ' data-reading' : ''}>
<a class="material-name" href="/console/materials/${esc(material.id)}">${material.status === 'reading' ? '<span class="ask-spin" aria-hidden="true"></span>' : icon(material.status === 'failed' ? 'alert' : 'file', 16)}<span>${esc(material.name)}</span></a>
<span class="material-facts">${esc(STATE[material.status])} · ${esc(size(material.size))} · ${when(material.added_at)}</span>
</li>`;

async function listBody(here) {
  const list = await here.materials.list();
  return {
    title: 'Materials',
    body: `<h1>Materials</h1>
<p class="v-lead">What you bring for Ask to read: the file as you gave it, and the words the AI takes from it. Learners see one only if you make it the reading in an activity, and the AI beside them knows one only if you give it to that course’s tutor.</p>
<section class="block">${addParts(here)}</section>
<section class="block" aria-labelledby="materials-title">
<h2 id="materials-title" class="sr">Your materials</h2>
${list.length ? `<ul class="materials">${list.map(row).join('')}</ul>` : '<p class="v-empty">Nothing here yet. Add a file above, or use + in Ask.</p>'}
</section>`,
    css: `${FORMS_CSS}\n${CSS}`,
    script: POLL
  };
}

async function oneBody(here, match) {
  const material = await here.materials.get(match[1]);
  const words = material.status === 'ready' ? await here.materials.words(material.id) : null;
  return {
    title: material.name,
    body: `<nav class="crumbs" aria-label="Where you are"><a href="/console/materials">Materials</a></nav>
<h1 class="material-title">${esc(material.name)}</h1>
<p class="material-facts">${esc(STATE[material.status])} · ${esc(size(material.size))} · added ${when(material.added_at)}</p>
<div class="actions material-actions" id="material-do" data-say-box>
<a class="v-btn is-small is-primary" href="/console/api/materials/${esc(material.id)}/file" target="_blank" rel="noopener">Open the original</a>
<a class="v-btn is-small" href="/console/ask?material=${esc(material.id)}">Ask about this</a>
${material.status === 'failed' ? `<button class="v-btn is-small" type="button" data-api="POST materials/${esc(material.id)}/retry" data-said="Trying again.">Try again</button>` : ''}
<button class="v-btn is-small danger" type="button" data-api="DELETE materials/${esc(material.id)}" data-confirm="Delete “${esc(material.name)}”? Conversations that read it stay. A copy on your computer isn’t touched." data-yes="Delete">Delete</button>
${say()}
</div>
${material.status === 'failed' ? `<p class="notice">${esc(material.problem || 'This couldn’t be read.')}</p>` : ''}
${material.status === 'reading' ? '<p class="v-note" data-reading>It’s still being read. This page updates when it’s done.</p>' : ''}
${words != null ? `<section class="block" aria-labelledby="words-title"><h2 id="words-title">What the AI reads</h2>
<p class="v-note">Taken from the file, so a picture or a chart may be missing or described in words. The original above is always as you gave it.</p>
<div class="material-words" tabindex="0">${esc(words.slice(0, SHOWN_CHARS))}${words.length > SHOWN_CHARS ? '\n\n…' : ''}</div></section>` : ''}`,
    css: `${FORMS_CSS}\n${CSS}`,
    script: POLL
  };
}

// While something is being read, the page looks again until it's done.
const POLL = String.raw`(() => {
  const look = () => { if (document.querySelector('[data-reading]') && document.hasFocus()) window.viableConsole.refresh().catch(() => {}).finally(() => setTimeout(look, 3000)); else setTimeout(look, 3000); };
  setTimeout(look, 3000);
  document.addEventListener('click', (event) => { if (event.target.id === 'material-drive') open('/console/drive', 'viable-drive', 'width=960,height=680'); });
  addEventListener('message', (event) => { if (event.origin === location.origin && event.data && event.data.viableMaterial) window.viableConsole.refresh(); });
})();`;

const CSS = `.material-add{display:grid;gap:14px;max-width:720px}
.material-link{display:grid;gap:6px}
.material-link-row{display:flex;gap:8px}
.material-link-row .v-input{flex:1;min-width:0}
.materials{display:grid;max-width:720px;margin:0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.material{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 16px;padding:11px 0;border-bottom:1px solid var(--public-rule)}
.material-name{display:inline-flex;align-items:center;gap:8px;min-width:0;color:var(--public-ink);text-decoration:none}
.material-name:hover span{text-decoration:underline;text-underline-offset:.2em}
.material-name span{overflow-wrap:anywhere}
.material-name .v-icon{color:var(--muted)}
.material-facts{color:var(--muted);font-size:.875rem;font-variant-numeric:tabular-nums}
.material-title{overflow-wrap:anywhere}
.material-actions{margin-top:14px}
.material-words{max-width:720px;max-height:60vh;margin-top:10px;padding:14px 16px;overflow:auto;border:1px solid var(--public-rule);border-radius:var(--radius);color:var(--public-text);font-size:.9375rem;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.ask-spin{display:block;flex:none;width:13px;height:13px;border:1.75px solid var(--public-rule-strong);border-top-color:var(--ink-blue);border-radius:50%;animation:material-spin .8s linear infinite}
@keyframes material-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ask-spin{animation:none}}`;

export const materialPages = [
  {
    id: 'materials', title: 'Materials',
    render: (here) => listBody(here),
    api: [
      ['POST', /^materials$/, async ({ materials, request }, _match, bytes) => {
        const name = decodeURIComponent(request.headers.get('x-file-name') || 'file').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
        if (!bytes?.length) throw refused('That file is empty.');
        return materials.add({ name, bytes });
      }, { bytes: FILE_BYTES }],
      ['POST', /^materials\/link$/, async ({ materials }, _match, body) => materials.addLink(String(body?.url ?? '').trim())],
      ['GET', /^materials\/([\w-]+)$/, async ({ materials }, match) => materials.get(match[1])],
      ['DELETE', /^materials\/([\w-]+)$/, async ({ materials }, match) => { await materials.remove(match[1]); return { go: '/console/materials' }; }],
      ['POST', /^materials\/([\w-]+)\/retry$/, async ({ materials }, match) => { await materials.retry(match[1]); return {}; }],
      // The original opens from where files are kept, never from these pages' own address, so nothing in it runs here.
      ['GET', /^materials\/([\w-]+)\/file$/, async ({ materials }, match) => new Response(null, { status: 302, headers: { location: await materials.link(match[1]), 'cache-control': 'no-store' } })]
    ]
  },
  { id: 'material', title: 'A material', section: 'materials', nav: false, match: /^materials\/([\w-]+)$/, render: oneBody, api: [] }
];
