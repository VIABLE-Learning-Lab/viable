/**
 * The console's Knowledge: knowledge bases by where each lives; a new one; a knowledge base's page, with its
 * files, its websites (read with the same code as `viable-engine knowledge refresh`, only over the server's
 * public-only fetch), and a search to try, the real one. Bytes go in first and the document names them after,
 * so a search never looks for a file that isn't there yet; a new version of the document is what the next
 * search reads. What a file or a site says stays text. No Node built-ins.
 */
import { graphKnowledgeRefs } from '../agents/graph.js';
import { publicUrl } from '../agents/http.js';
import { LIBRARY_LIMITS, slugOf } from '../server/library.js';
import { meaningFrom } from '../server/runtime.js';
import { readsLocally, searchPackage } from '../server/search.js';
import { REFRESH_LIMITS, refreshSite, siteReader } from '../server/siteRefresh.js';
import { extensionOf, readsAsText } from '../utils/textFormats.js';
import { CONSOLE_SCRIPT } from './client.js';
import { choose, esc, FORMS_CSS, say, text } from './forms.js';
import { agentsIn, clean, freeRef, knowledgeIn, NO_STORE, OWN, placeLabel, plural, refused, ROWS_CSS, utc } from './places.js';

const NAME_CHARS = 120;
const MOST_FILES = 50;
const MOST_BASES = 10;
const FOUND = 5;
const SHOWN_CHARS = 700;
// Someone is waiting on the page, so a read has this long; what it read by then is kept.
const READ_MS = 120000;
const TYPES = { md: 'text/markdown', markdown: 'text/markdown', mdx: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', html: 'text/html', htm: 'text/html' };
const ACCEPT = '.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm';

const baseIn = (doc, ref) => {
  const kb = (doc.knowledge_bases || []).find((item) => item.ref === ref);
  if (!kb) throw refused('That knowledge base isn’t here anymore.', 404, 'knowledge_not_found');
  return kb;
};
async function baseAt(library, id, ref) {
  const entry = (await library.entries()).find((item) => item.id === id);
  if (!entry) throw refused('That knowledge base isn’t here anymore.', 404, 'knowledge_not_found');
  return { entry, kb: baseIn(entry.doc, ref) };
}
const searchers = (entry, kb) => agentsIn(entry).filter((agent) => graphKnowledgeRefs(agent.graph).includes(kb.ref));
const filesOf = (doc, kb) => (kb.file_refs || []).map((ref) => (doc.files || []).find((file) => file.ref === ref)).filter(Boolean);
const pagesIn = (kb) => (kb.websites || []).flatMap((site) => site.snapshot || []);
const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} bytes`);
const lastRead = (site) => (site.snapshot || []).map((page) => page.read_at).filter(Boolean).sort().at(-1) ?? null;

// --- The list -----------------------------------------------------------------------------------------

function baseRow(entry, kb) {
  const files = (kb.file_refs || []).length;
  const pages = pagesIn(kb).length;
  const contents = [plural(files, 'file'), ...(kb.websites?.length ? [`${plural(kb.websites.length, 'website')}, ${plural(pages, 'page')}`] : [])].join(' · ');
  const agents = searchers(entry, kb).map((agent) => agent.name);
  return `<li class="row"><div class="row-what"><a href="/console/knowledge/${esc(entry.id)}/${esc(kb.ref)}"><strong>${esc(kb.name)}</strong></a><span class="v-note">${esc(contents)}</span><span class="v-note">${agents.length ? `Searched by ${esc(agents.join(', '))}` : 'No agent searches it yet'}</span></div></li>`;
}

async function listBody({ library, store, settings, url }) {
  const entries = await library.entries();
  const courses = entries.filter((entry) => entry.doc.course && knowledgeIn(entry).length);
  const own = entries.filter((entry) => !entry.doc.course && knowledgeIn(entry).length);
  const any = courses.length || own.length;
  const using = await settings.resolve();
  const places = entries.filter((entry) => entry.doc.course || agentsIn(entry).length || knowledgeIn(entry).length);
  const wanted = url.searchParams.get('place');
  return `<h1>Knowledge</h1>
<p class="v-lead">What an agent answers from: files and web pages it searches. ${esc(searchWords(using))}</p>
${store ? '' : NO_STORE}
<section class="block" aria-label="Knowledge bases">
${any ? '' : '<p class="v-empty">No knowledge bases yet.</p>'}
${courses.map((entry) => `<h2 class="group">${esc(entry.doc.course.title)}</h2><ul class="rows">${knowledgeIn(entry).map((kb) => baseRow(entry, kb)).join('')}</ul>`).join('')}
${own.length ? `${courses.length ? '<h2 class="group">On their own</h2>' : ''}<ul class="rows">${own.flatMap((entry) => knowledgeIn(entry).map((kb) => baseRow(entry, kb))).join('')}</ul>` : ''}
</section>
${store ? `<section class="block" aria-labelledby="new-title">
<h2 id="new-title">New knowledge base</h2>
<form class="v-card stack" id="new-base" data-api="POST knowledge">
${text('name', 'Its name', '', { required: true, maxlength: NAME_CHARS, autocomplete: 'off', placeholder: 'e.g. Library research guides' })}
${places.length ? choose('place', 'Where it lives', places.some((entry) => entry.id === wanted) ? wanted : OWN, [{ value: OWN, label: 'On its own' }, ...places.map((entry) => ({ value: entry.id, label: placeLabel(entry) }))], { hint: 'An agent searches only the knowledge bases beside it.' }) : `<input type="hidden" name="place" value="${OWN}">`}
<div class="actions"><button class="v-btn is-primary" type="submit">Create</button></div>${say()}
</form>
</section>` : ''}`;
}

// How a search goes on this server now, from the same role a run reads.
const searchWords = (using) => (using.roles.meaning?.model ? `It is searched by keywords, and by meaning with ${using.roles.meaning.model}.` : 'It is searched by keywords. To search by meaning too, set a model in Models.');

// --- A knowledge base's page --------------------------------------------------------------------------

function fileRow(entry, kb, file) {
  const read = readsLocally(file);
  const copy = !readsAsText(file.name);
  const facts = [...(file.bytes ? [size(file.bytes)] : []), ...(file.url ? ['By address'] : []), ...(copy && read ? ['Searched through its text copy'] : [])];
  return `<li class="row" id="file-${esc(file.ref)}" data-say-box>
<div class="row-what"><strong>${esc(file.name)}</strong>${facts.length ? `<span class="v-note">${esc(facts.join(' · '))}</span>` : ''}${read ? '' : '<span class="say bad">This server can’t read it, so every search of this knowledge base fails until it is removed.</span>'}</div>
<button class="v-btn is-small" type="button" aria-label="Remove ${esc(file.name)}" data-api="DELETE knowledge/${esc(entry.id)}/${esc(kb.ref)}/files/${esc(file.ref)}" data-confirm="Remove ${esc(file.name)}? It is deleted from this server, from older versions of this package too." data-yes="Remove">Remove</button>${say()}
</li>`;
}

function siteRow(entry, kb, site, index) {
  const at = lastRead(site);
  const api = `knowledge/${esc(entry.id)}/${esc(kb.ref)}/websites`;
  return `<li class="row" id="site-${index}" data-say-box>
<div class="row-what"><strong class="site-address">${esc(site.url)}</strong><span class="v-note">${esc(plural((site.snapshot || []).length, 'page'))}${at ? ` · last read ${esc(utc(at))}` : ''}</span></div>
<div class="actions">
<button class="v-btn is-small" type="button" id="read-${index}" aria-label="Read ${esc(site.url)} again" data-api="POST ${api}/read" data-body='${esc(JSON.stringify({ url: site.url }))}' data-busy="Reading it, a page at a time. This can take up to 2 minutes…" data-said="Done.">Read it again</button>
<button class="v-btn is-small" type="button" aria-label="Remove ${esc(site.url)}" data-api="DELETE ${api}" data-body='${esc(JSON.stringify({ url: site.url }))}' data-confirm="Remove ${esc(site.url)} and the pages kept from it?" data-yes="Remove">Remove</button>
</div>${say()}
</li>`;
}

async function baseBody({ library, settings, store }, match) {
  const { entry, kb } = await baseAt(library, match[1], match[2]);
  const using = await settings.resolve();
  const api = `knowledge/${esc(entry.id)}/${esc(kb.ref)}`;
  const files = filesOf(entry.doc, kb);
  const sites = kb.websites || [];
  const agents = searchers(entry, kb);
  const beside = agentsIn(entry);
  const agentLinks = (list) => list.map((agent) => `<a href="/console/agents/${esc(agent.slug)}">${esc(agent.name)}</a>`).join(', ');
  const locked = !store;
  return {
    title: `${kb.name} · Knowledge`,
    body: `<nav class="crumbs" aria-label="Where you are"><a href="/console/knowledge">Knowledge</a>${entry.doc.course ? ` / ${esc(entry.doc.course.title)}` : ''}</nav>
<h1>${esc(kb.name)}</h1>
<p class="v-lead">${agents.length ? `Searched by ${agentLinks(agents)}.` : beside.length ? `No agent searches it yet. Choose it on the page of ${agentLinks(beside)}.` : `No agent searches it yet. <a href="/console/agents">Make one beside it</a>, or <a href="/console/chat-pages">make a chat page that answers from it</a>.`}</p>
${locked ? NO_STORE : ''}
${entry.meta.version === 0 ? `<p class="notice">This comes from <code>${esc(entry.file)}</code>. The first change makes a copy on this server, and the file is no longer read.</p>` : ''}
<section class="block" aria-labelledby="files-title">
<h2 id="files-title">Files</h2>
${files.length ? `<ul class="rows">${files.map((file) => fileRow(entry, kb, file)).join('')}</ul>` : '<p class="v-empty">No files yet.</p>'}
${locked ? '' : `<div class="add-file" data-say-box><div class="v-form"><label class="v-label" for="base-file">Add files</label><input class="v-input" id="base-file" type="file" multiple accept="${ACCEPT}" data-upload="POST ${api}/files"><small class="v-note">Text, Markdown, CSV, JSON and HTML, up to ${Math.round(LIBRARY_LIMITS.file / 1048576)} MB each. A PDF or Word file isn’t read here: save it as text or Markdown first. A file with a name already here replaces it.</small></div>${say()}</div>`}
</section>
<section class="block" aria-labelledby="sites-title">
<h2 id="sites-title">Websites</h2>
<p class="v-note">A site is read when you add it and when you say so, then searched from what was read, never live. It reads a page at a time, as its robots.txt asks, only at public https addresses, for up to 2 minutes. What it read by then is kept.</p>
${sites.length ? `<ul class="rows site-rows">${sites.map((site, index) => siteRow(entry, kb, site, index)).join('')}</ul>` : ''}
${locked ? '' : `<form class="site-add" id="add-site" data-api="POST ${api}/websites" data-busy="Reading it, a page at a time. This can take up to 2 minutes…">
<div class="fields two">
${text('url', 'Its address', '', { type: 'url', required: true, placeholder: 'https://guides.example.edu/research', autocomplete: 'off', spellcheck: 'false', hint: 'It reads that page and the pages it links to in the same folder. An address ending in .xml is read as a sitemap.' })}
${text('max_pages', 'At most this many pages', REFRESH_LIMITS.crawlDefault, { type: 'number', min: 1, max: REFRESH_LIMITS.crawlPages, hint: '1 reads only that page.' })}
</div>
<div class="actions"><button class="v-btn" type="submit">Add and read it</button></div>${say()}
</form>`}
</section>
<section class="block" aria-labelledby="search-title">
<h2 id="search-title">Try a search</h2>
<p class="v-note">${esc(searchWords(using))}${using.roles.meaning?.model ? ' That makes a real model call: each search asks it once, and a new file’s passages are sent to it the first time.' : ' No model is called.'}</p>
<form class="find-line" id="try-search" data-search="${api}/search" data-into="search-found">
<label class="sr" for="search-q">What to search for</label><input class="v-input" id="search-q" name="q" type="search" required placeholder="What someone might ask" autocomplete="off">
<button class="v-btn is-small" type="submit">Search</button>
</form>
<div id="search-found" class="found-passages" aria-live="polite"></div>
</section>
${locked ? '' : `<section class="block" aria-labelledby="name-title">
<h2 id="name-title">Its name</h2>
<form class="stack" id="base-name" data-api="PUT ${api}">
<input type="hidden" name="version" value="${entry.meta.version}">
${text('name', 'Its name', kb.name, { required: true, maxlength: NAME_CHARS })}
<div class="actions"><button class="v-btn is-small" type="submit">Save name</button></div>${say()}
</form>
</section>
<section class="block" aria-labelledby="remove-title" data-say-box>
<h2 id="remove-title">Remove it</h2>
<p class="v-note">Its files and pages are deleted from this server, from older versions of this package too.</p>
<div class="actions file-actions"><button class="v-btn is-small danger" type="button" data-api="DELETE ${api}" data-confirm="Remove “${esc(kb.name)}” and everything in it? This can’t be undone." data-yes="Remove">Remove this knowledge base</button></div>${say()}
</section>`}`,
    css: BASE_CSS
  };
}

const BASE_CSS = `.add-file{display:grid;gap:8px;margin-top:16px;max-width:680px}
.site-rows{margin-top:14px}
.site-address{overflow-wrap:anywhere;font-weight:600}
.site-add{display:grid;gap:12px;margin-top:16px;max-width:680px}
.site-add .fields.two{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}
.find-line{display:flex;gap:8px;align-items:center;margin-top:12px;max-width:680px}
.find-line input{flex:1 1 auto;min-height:38px;padding:6px 12px}
.found-passages{max-width:680px;margin-top:12px}
.found-passages ol{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.found-passages li{display:grid;gap:4px;padding:12px 14px;border-radius:var(--radius-sm);background:var(--field-mist)}
.found-passages strong{font-weight:600;color:var(--public-ink);overflow-wrap:anywhere}
.found-passages p{margin:0;font-size:.9375rem;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-width:640px){.site-add .fields.two{grid-template-columns:minmax(0,1fr)}}`;

// --- Searching ----------------------------------------------------------------------------------------

// The search a run uses, one per version of a document: a new version reads its files again.
const searches = new WeakMap();
const searchOf = (tools, entry) => {
  if (!searches.has(entry.doc)) searches.set(entry.doc, searchPackage(entry.doc, { dir: entry.dir, zip: entry.zip, readPath: tools.library.readPath, fetch: tools.outward, meaning: meaningFrom(tools.settings, tools.fetch, tools.store) }));
  return searches.get(entry.doc);
};

async function trySearch(tools, match) {
  const { entry, kb } = await baseAt(tools.library, match[1], match[2]);
  const query = clean(tools.url.searchParams.get('q'), 2000);
  if (!query) return { html: '<p class="v-note">Type what to search for.</p>' };
  const found = await searchOf(tools, entry)({ knowledgeBaseIds: [kb.ref], query, topK: FOUND });
  if (!found.length) return { html: '<p class="v-note">Nothing found. Try other words.</p>' };
  const how = { keyword: 'By keywords', meaning: 'By meaning', hybrid: 'By keywords and meaning' };
  return { html: `<ol>${found.map((item) => `<li><strong>${esc(item.title || item.filename)}</strong><small class="v-note">${esc([...(item.heading && item.heading !== item.title ? [item.heading] : []), how[item.match] || '', ...(item.url ? [item.url] : [])].filter(Boolean).join(' · '))}</small><p>${esc(String(item.text).slice(0, SHOWN_CHARS))}${String(item.text).length > SHOWN_CHARS ? '…' : ''}</p></li>`).join('')}</ol>` };
}

// --- Changes ------------------------------------------------------------------------------------------

// An uploaded file's name is someone's text: the letters and digits it says, and never a path.
function fileNameOf(request) {
  let said = '';
  try { said = decodeURIComponent(request.headers.get('x-file-name') || ''); } catch { /* A name that can't be read is no name. */ }
  return said.split(/[\\/]/).pop().replace(/[^\p{L}\p{N}. _-]/gu, '_').replace(/^[. ]+/, '').slice(0, 120) || 'file.txt';
}

async function addBase({ library }, _match, body) {
  const name = clean(body?.name, NAME_CHARS);
  if (!name) throw refused('Give it a name.');
  const place = String(body?.place ?? OWN);
  if (place === OWN) {
    const ref = freeRef(name, new Set(), 'knowledge');
    const { id } = await library.add({ format: 'viable.course-package', version: 1, title: name, agents: [], files: [], knowledge_bases: [{ ref, name, file_refs: [] }] });
    return { go: `/console/knowledge/${id}/${ref}` };
  }
  const made = await library.change(place, null, (doc) => {
    const bases = doc.knowledge_bases ||= [];
    if (bases.length >= MOST_BASES) throw refused(`A package holds at most ${MOST_BASES} knowledge bases.`);
    const ref = freeRef(name, new Set(bases.map((kb) => kb.ref)), 'knowledge');
    bases.push({ ref, name, file_refs: [] });
    return ref;
  }, `Added ${name}`);
  return { go: `/console/knowledge/${place}/${made.answer}` };
}

async function addFile({ library, request }, match, bytes) {
  const name = fileNameOf(request);
  if (!readsAsText(name)) throw refused(`${name}: ${/\.pdf$/i.test(name) ? 'a PDF isn’t read here, so it wouldn’t be searched. Save it as text or Markdown, and add that.' : 'this server reads text, Markdown, CSV, JSON and HTML files. Save it as one of those, and add that.'}`);
  if (!bytes.length) throw refused(`${name} is empty.`);
  // A text file has no zero bytes; a renamed binary would be searched as nonsense.
  if (bytes.subarray(0, 65536).includes(0)) throw refused(`${name} isn’t a text file.`);
  const extension = extensionOf(name);
  const path = `files/${slugOf(name.slice(0, -extension.length - 1), 'file').slice(0, 40)}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
  const heading = ['md', 'markdown', 'mdx'].includes(extension) ? /^#\s+(.+)$/m.exec(new TextDecoder().decode(bytes.subarray(0, 65536)))?.[1].trim().slice(0, 200) : null;
  await library.putFile(match[1], path, bytes);
  let made;
  try {
    made = await library.change(match[1], null, (doc) => {
      const kb = baseIn(doc, match[2]);
      const files = doc.files ||= [];
      const entry = { name, type: TYPES[extension] || 'text/plain', bytes: bytes.length, path, ...(heading ? { title: heading } : {}) };
      const same = filesOf(doc, kb).find((file) => file.name === name);
      if (same) {
        // Under its ref, so whatever else names it gets the new bytes. What described the old ones goes.
        const old = [same.path, same.text_path];
        for (const key of ['sha256', 'url', 'title', 'text_path', 'text_sha256']) delete same[key];
        Object.assign(same, entry);
        return { replaced: true, old };
      }
      if (files.length >= MOST_FILES) throw refused(`A package holds at most ${MOST_FILES} files. Remove one, or put these in a knowledge base of their own.`);
      const ref = freeRef(name.slice(0, -extension.length - 1), new Set(files.map((file) => file.ref)), 'file');
      files.push({ ref, ...entry });
      (kb.file_refs ||= []).push(ref);
      return { replaced: false, old: [] };
    }, `Added ${name}`);
  } catch (error) {
    await library.dropFile(match[1], path);
    throw error;
  }
  await dropAll(library, match[1], made.answer.old);
  return { said: `${made.answer.replaced ? 'Replaced' : 'Added'} ${name}. The next search reads it.` };
}

// The bytes a document no longer names, once it has been saved without them.
const dropAll = async (library, id, paths) => { for (const path of paths) if (path) await library.dropFile(id, path); };
const namedElsewhere = (doc, kbRef, fileRef) => (doc.knowledge_bases || []).some((kb) => kb.ref !== kbRef && kb.file_refs?.includes(fileRef)) || (doc.course?.activities || []).some((activity) => activity.workspace?.panels?.some((panel) => panel.file_ref === fileRef));

async function removeFile({ library }, match) {
  const made = await library.change(match[1], null, (doc) => {
    const kb = baseIn(doc, match[2]);
    kb.file_refs = (kb.file_refs || []).filter((ref) => ref !== match[3]);
    if (namedElsewhere(doc, kb.ref, match[3])) return [];
    const file = (doc.files || []).find((item) => item.ref === match[3]);
    doc.files = (doc.files || []).filter((item) => item.ref !== match[3]);
    return [file?.path, file?.text_path];
  }, 'Removed a file');
  await dropAll(library, match[1], made.answer);
  return { said: 'Removed.' };
}

// A site read, and what to say of it: its pages are in the store under paths of their own before anything names them.
async function readSite({ library, outward }, id, doc, kb, site) {
  const written = [];
  const used = [...(doc.files || []), ...(doc.knowledge_bases || []).flatMap(pagesIn).filter((page) => !(site.snapshot || []).includes(page))].reduce((sum, item) => sum + (item.bytes || 0), 0);
  const done = await refreshSite(site, {
    reader: siteReader(new URL(site.url).origin, { fetch: outward }),
    room: { bytes: REFRESH_LIMITS.bytes - used },
    until: Date.now() + READ_MS,
    write: async (words) => {
      const path = `files/pages/${crypto.randomUUID()}.md`;
      await library.putFile(id, path, new TextEncoder().encode(words));
      written.push(path);
      return path;
    }
  });
  const pages = done.snapshot.map(({ read_this_time: _now, ...page }) => page);
  const why = [...done.failed.map((item) => `${item.url}: ${item.reason}`), ...(done.stopped ? [done.stopped] : [])];
  if (!pages.length) {
    await dropAll(library, id, written);
    throw refused(`Nothing could be read there${why.length ? `: ${why[0]}` : ''}.`, 422, 'website_not_read');
  }
  const said = [`Read ${plural(done.read, 'page')}${done.kept ? `, and kept ${plural(done.kept, 'page')} from before` : ''}.`, ...(done.failed.length ? [`${plural(done.failed.length, 'page')} couldn’t be read, such as ${done.failed[0].url}: ${done.failed[0].reason}.`] : []), ...(done.stopped ? [`It stopped early: ${done.stopped}. What it read is kept.`] : []), ...(done.left ? [`${plural(done.left, 'page')} didn’t fit in the package.`] : [])].join(' ');
  return { pages, said };
}

async function addSite(tools, match, body) {
  const { entry, kb } = await baseAt(tools.library, match[1], match[2]);
  let address;
  try { address = publicUrl(String(body?.url ?? '').trim()).href; } catch { throw refused('Give its whole address, starting with https://. Addresses on a private network, and bare IP addresses, aren’t read.'); }
  if ((kb.websites || []).some((site) => site.url === address)) throw refused('That site is already here. Read it again instead.');
  const wanted = Number(body?.max_pages);
  const sitemap = /\.xml$/i.test(new URL(address).pathname);
  const site = { kind: sitemap ? 'sitemap' : 'crawl', url: address, max_pages: Number.isInteger(wanted) && wanted > 0 ? Math.min(wanted, sitemap ? REFRESH_LIMITS.sitemapPages : REFRESH_LIMITS.crawlPages) : REFRESH_LIMITS.crawlDefault };
  const { pages, said } = await readSite(tools, entry.id, entry.doc, kb, site);
  await tools.library.change(entry.id, null, (doc) => { (baseIn(doc, kb.ref).websites ||= []).push({ ...site, snapshot: pages }); }, `Read ${address}`);
  return { said };
}

async function readAgain(tools, match, body) {
  const { entry, kb } = await baseAt(tools.library, match[1], match[2]);
  const site = (kb.websites || []).find((item) => item.url === body?.url);
  if (!site) throw refused('That site isn’t here anymore.', 404, 'website_not_found');
  const { pages, said } = await readSite(tools, entry.id, entry.doc, kb, site);
  const kept = new Set(pages.map((page) => page.path));
  const made = await tools.library.change(entry.id, null, (doc) => {
    const held = (baseIn(doc, kb.ref).websites || []).find((item) => item.url === site.url);
    if (!held) throw refused('That site isn’t here anymore.', 404, 'website_not_found');
    const old = (held.snapshot || []).map((page) => page.path).filter((path) => !kept.has(path));
    held.snapshot = pages;
    return old;
  }, `Read ${site.url}`);
  await dropAll(tools.library, entry.id, made.answer);
  return { said };
}

async function removeSite({ library }, match, body) {
  const made = await library.change(match[1], null, (doc) => {
    const kb = baseIn(doc, match[2]);
    const site = (kb.websites || []).find((item) => item.url === body?.url);
    if (!site) throw refused('That site isn’t here anymore.', 404, 'website_not_found');
    kb.websites = kb.websites.filter((item) => item !== site);
    return (site.snapshot || []).map((page) => page.path);
  }, 'Removed a website');
  await dropAll(library, match[1], made.answer);
  return { said: 'Removed.' };
}

async function removeBase({ library }, match) {
  const { entry, kb } = await baseAt(library, match[1], match[2]);
  const using = searchers(entry, kb).map((agent) => `“${agent.name}”`);
  if (using.length) throw refused(`${using.join(', ')} ${using.length === 1 ? 'searches' : 'search'} this. Change ${using.length === 1 ? 'that agent' : 'those agents'} first.`, 409, 'knowledge_in_use');
  const alone = !entry.doc.course && !agentsIn(entry).length && knowledgeIn(entry).length === 1;
  if (alone) {
    await library.remove(entry.id);
    return { go: '/console/knowledge' };
  }
  const made = await library.change(entry.id, null, (doc) => {
    const held = baseIn(doc, kb.ref);
    const gone = filesOf(doc, held).filter((file) => !namedElsewhere(doc, held.ref, file.ref));
    doc.files = (doc.files || []).filter((file) => !gone.includes(file));
    doc.knowledge_bases = doc.knowledge_bases.filter((item) => item !== held);
    return [...gone.flatMap((file) => [file.path, file.text_path]), ...pagesIn(held).map((page) => page.path)];
  }, `Removed ${kb.name}`);
  await dropAll(library, entry.id, made.answer);
  return { go: '/console/knowledge' };
}

export const knowledgePages = [
  {
    id: 'knowledge', title: 'Knowledge',
    render: async (tools) => ({ body: await listBody(tools), css: `${FORMS_CSS}\n${ROWS_CSS}`, script: CONSOLE_SCRIPT }),
    api: [
      ['POST', /^knowledge$/, addBase],
      ['PUT', /^knowledge\/([\w-]+)\/([\w.-]+)$/, async ({ library }, match, body) => {
        const name = clean(body?.name, NAME_CHARS);
        if (!name) throw refused('Give it a name.');
        await library.change(match[1], body?.version, (doc) => { baseIn(doc, match[2]).name = name; if (!doc.course && !doc.agents?.length && doc.knowledge_bases.length === 1) doc.title = name; }, 'Renamed a knowledge base');
        return { said: 'Saved.' };
      }],
      ['DELETE', /^knowledge\/([\w-]+)\/([\w.-]+)$/, removeBase],
      ['GET', /^knowledge\/([\w-]+)\/([\w.-]+)\/search$/, trySearch],
      ['POST', /^knowledge\/([\w-]+)\/([\w.-]+)\/files$/, addFile, { bytes: LIBRARY_LIMITS.file }],
      ['DELETE', /^knowledge\/([\w-]+)\/([\w.-]+)\/files\/([\w.-]+)$/, removeFile],
      ['POST', /^knowledge\/([\w-]+)\/([\w.-]+)\/websites$/, addSite],
      ['POST', /^knowledge\/([\w-]+)\/([\w.-]+)\/websites\/read$/, readAgain],
      ['DELETE', /^knowledge\/([\w-]+)\/([\w.-]+)\/websites$/, removeSite]
    ]
  },
  {
    id: 'knowledge-base', title: 'Knowledge base', section: 'knowledge', nav: false,
    match: /^knowledge\/([\w-]+)\/([\w.-]+)$/,
    render: async (tools, match) => { const made = await baseBody(tools, match); return { ...made, css: `${FORMS_CSS}\n${ROWS_CSS}\n${made.css}`, script: CONSOLE_SCRIPT }; },
    api: []
  }
];
