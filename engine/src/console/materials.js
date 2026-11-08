/**
 * Materials: what a teacher brings for Ask to read, kept as they gave it, with the words the AI reads from it. Everything goes through what the
 * host passes as `materials`: { accept, hint, add, addLink, list, get, remove, retry, words, link, read, search, forReading, drive }. A host without
 * it shows no such page, and Ask offers no files. No Node built-ins.
 */
import { activityIn } from './activity.js';
import { activitiesOf } from './askCards.js';
import { changeCourse, courseAt } from './course.js';
import { courseHead, dropZone, esc, FORMS_CSS, say, when } from './forms.js';
import { icon } from './icons.js';

const refused = (message, status = 400, code = 'invalid_material') => Object.assign(new Error(message), { status, code });
const FILE_BYTES = 16 * 1048576;
const fileName = (request) => decodeURIComponent(request.headers.get('x-file-name') || 'file').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
const SHOWN_CHARS = 40000;
const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes || 0} bytes`);
const STATE = { ready: 'Ready', reading: 'Reading…', failed: 'Couldn’t be read' };

const addParts = ({ materials }, folder = null) => {
  const into = folder ? `?folder=${encodeURIComponent(folder)}` : '';
  return `<div class="material-add" id="material-add" data-say-box>
${dropZone({ id: 'material-file', label: 'Drop files here', accept: materials.accept, upload: `POST materials${into}`, multiple: true, hint: materials.hint })}
${materials.drive ? '<button class="v-btn is-small" type="button" id="material-drive">Choose from Google Drive</button>' : ''}
<form class="material-link" id="material-link" data-api="POST materials/link${into}" data-busy="Getting it…">
<label class="v-label" for="material-url">Or a Google Doc, Slides or Sheet</label>
<div class="material-link-row"><input class="v-input" id="material-url" name="url" type="url" required placeholder="https://docs.google.com/…" autocomplete="off"><button class="v-btn" type="submit">Add</button></div>
<small class="v-note">Shared as “Anyone with the link can view”. We keep a copy from today, and it doesn’t change when the original does.</small>
</form>
${say()}
</div>`;
};

const folderOptions = ({ loose, folders }, current) => [{ id: loose?.id ?? '', name: 'No folder' }, ...folders].map((folder) => `<option value="${esc(folder.id)}"${folder.id === current ? ' selected' : ''}>${esc(folder.name)}</option>`).join('');

const row = (material, shelves, { showFolder = true } = {}) => `<li class="material${material.status === 'reading' ? ' is-reading' : ''}"${material.status === 'reading' ? ' data-reading' : ''} data-say-box>
<a class="material-name" href="/console/materials/${esc(material.id)}">${material.status === 'reading' ? '<span class="ask-spin" aria-hidden="true"></span>' : icon(material.status === 'failed' ? 'alert' : 'file', 16)}<span>${esc(material.name)}</span></a>
<span class="material-facts">${esc(STATE[material.status])} · ${esc(size(material.size))} · ${when(material.added_at)}</span>
${showFolder ? `<span class="material-move"><label class="sr" for="move-${esc(material.id)}">Folder of ${esc(material.name)}</label><select class="v-input" id="move-${esc(material.id)}" name="folder" data-api="PUT materials/${esc(material.id)}/folder">${folderOptions(shelves, material.folder)}</select></span>` : ''}
${say()}
</li>`;

// Where a teacher's files are: what has no folder yet, each course's, and any they made. The same folders are knowledge bases on the Developer Platform.
const shelf = (shelves, current, count) => {
  const link = (id, name, n, extra = '') => `<li><a href="/console/materials${id ? `?folder=${esc(id)}` : ''}"${current === id ? ' aria-current="true"' : ''}>${icon(extra || 'folder', 15)}<span>${esc(name)}</span>${n == null ? '' : `<small>${n}</small>`}</a></li>`;
  const mine = shelves.folders.filter((folder) => !folder.course);
  const courses = shelves.folders.filter((folder) => folder.course);
  return `<nav class="shelf" aria-label="Folders"><ul>${link('', 'All files', count, 'file')}${shelves.loose ? link(shelves.loose.id, 'No folder', shelves.loose.count, 'inbox') : ''}</ul>
${courses.length ? `<p class="shelf-head">Courses</p><ul>${courses.map((folder) => link(folder.id, folder.name, folder.count, 'course')).join('')}</ul>` : ''}
${mine.length ? `<p class="shelf-head">Your folders</p><ul>${mine.map((folder) => link(folder.id, folder.name, folder.count)).join('')}</ul>` : ''}
<details class="shelf-new" id="new-folder"><summary>New folder</summary><form class="shelf-form" id="new-folder-form" data-api="POST materials/folders" data-say-box><label class="sr" for="new-folder-name">The folder’s name</label><input class="v-input" id="new-folder-name" name="name" required maxlength="120" placeholder="e.g. Grade 7 science" autocomplete="off"><button class="v-btn is-small" type="submit">Make it</button>${say()}</form></details></nav>`;
};

async function listBody(here) {
  const folder = here.url?.searchParams.get('folder') || null;
  const shelves = await here.materials.folders();
  const all = await here.materials.list();
  const list = folder ? all.filter((item) => item.folder === folder) : all;
  const current = folder ? [shelves.loose, ...shelves.folders].find((item) => item?.id === folder) : null;
  if (folder && !current) throw refused('That folder isn’t here anymore.', 404, 'folder_not_found');
  const own = current && current.id !== shelves.loose?.id && !current.course;
  const placed = current?.course ? `<p class="v-note">What goes with this course. Only an AI you give it to can search it, on the course’s <a href="/console/courses/${esc(current.course)}/materials">Materials</a> tab.</p>` : '';
  return {
    title: current ? `${current.name} · Materials` : 'Materials',
    body: `<h1>${current ? esc(current.id === shelves.loose?.id ? 'No folder' : current.name) : 'Materials'}</h1>
${current ? placed : '<p class="v-lead">What you bring for Ask to read: the file as you gave it, and the words the AI takes from it. Learners see one only if you make it the reading in an activity, and the AI beside them knows one only if you give it to that course’s AI.</p>'}
<div class="materials-page">
${shelf(shelves, folder || '', all.length)}
<div class="materials-main">
<section>${addParts(here, folder)}</section>
<section class="block" aria-labelledby="materials-title">
<h2 id="materials-title" class="sr">The files</h2>
${list.length ? `<ul class="materials">${list.map((item) => row(item, shelves)).join('')}</ul>` : `<p class="v-empty">${current ? 'Nothing here yet. Drop a file above, or move one here from All files.' : 'Nothing here yet. Add a file above, or use + in Ask.'}</p>`}
</section>
${own ? `<section class="block folder-do" aria-label="This folder" data-say-box>
<form class="folder-rename" id="rename-folder" data-api="PUT materials/folders/${esc(current.id)}"><label class="v-label" for="folder-name">Its name</label><div class="material-link-row"><input class="v-input" id="folder-name" name="name" required maxlength="120" value="${esc(current.name)}"><button class="v-btn" type="submit">Rename</button></div>${say()}</form>
<button class="v-btn is-small danger" type="button" data-api="DELETE materials/folders/${esc(current.id)}" data-confirm="Delete the folder “${esc(current.name)}”? Its ${esc(String(current.count))} file${current.count === 1 ? '' : 's'} move to No folder, and nothing is lost." data-yes="Delete the folder">Delete the folder</button>${say()}
</section>` : ''}
</div>
</div>`,
    css: `${FORMS_CSS}\n${CSS}`,
    script: POLL
  };
}

// A course's own files, on the course: added here they are in its folder, and an activity's AI searches them when it is told to.
async function courseBody(here, match) {
  const { code, doc, meta } = await courseAt(here.library, match[1]);
  const held = await here.materials.folders();
  const folder = held.folders.find((item) => item.course === code) || null;
  const list = folder ? await here.materials.list({ folder: folder.id }) : [];
  const withAi = activitiesOf(doc).filter((activity) => activity.agent_ref);
  const readsIt = (agent) => (agent?.graph?.nodes || []).some((node) => node.type === 'knowledge' && node.config?.knowledge_bases?.includes(folder?.id));
  const agents = doc.agents || [];
  return {
    title: `Materials · ${doc.course.title}`,
    body: `${courseHead({ title: doc.course.title, code, origin: here.origin, addresses: here.addresses, tabs: here.tabs, current: 'Materials', closed: meta.status === 'closed' })}
<section class="block"><p class="v-note course-materials-note">What goes with this course, kept in its own folder. It is the same folder under Materials, and on the VIABLE Developer Platform as a knowledge base.</p>
<div class="material-add" id="material-add" data-say-box>${dropZone({ id: 'material-file', label: 'Drop files here', accept: here.materials.accept, upload: `POST courses/${esc(code)}/materials`, multiple: true, hint: here.materials.hint })}${say()}</div></section>
<section class="block" aria-labelledby="course-files">
<h2 id="course-files">The files</h2>
${list.length ? `<ul class="materials">${list.map((item) => row(item, held, { showFolder: false })).join('')}</ul>` : '<p class="v-empty">Nothing here yet. Drop a file above, or move one in from Materials.</p>'}
</section>
${list.length && withAi.length ? `<section class="block" aria-labelledby="course-ai" data-say-box>
<h2 id="course-ai">The AI beside learners</h2>
<p class="v-note">It knows these only where you say so. It can tell learners what it finds, so leave out answer keys and tests. A checked reply stays checked.</p>
<ul class="material-uses">${withAi.map((activity) => { const on = readsIt(agents.find((agent) => agent.ref === activity.agent_ref)); return `<li><span>${esc(activity.title)}</span><button class="v-btn is-small${on ? '' : ' is-primary'}" type="button" data-api="POST courses/${esc(code)}/materials/use" data-body='${esc(JSON.stringify({ activity: activity.key, on: !on }))}'>${on ? 'Stop searching these' : 'Search these'}</button></li>`; }).join('')}</ul>${say()}
</section>` : ''}`,
    css: `${FORMS_CSS}\n${CSS}`,
    script: POLL
  };
}

async function oneBody(here, match) {
  const material = await here.materials.get(match[1]);
  const words = material.status === 'ready' ? await here.materials.words(material.id) : null;
  const shelves = await here.materials.folders();
  const shelfName = [...shelves.folders, ...(shelves.loose ? [{ ...shelves.loose, name: 'No folder' }] : [])].find((item) => item.id === material.folder)?.name || 'Its folder';
  return {
    title: material.name,
    body: `<nav class="crumbs" aria-label="Where you are"><a href="/console/materials">Materials</a>${material.folder ? ` / <a href="/console/materials?folder=${esc(material.folder)}">${esc(shelfName)}</a>` : ''}</nav>
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

const CSS = `.materials-page{display:grid;grid-template-columns:minmax(180px,220px) minmax(0,1fr);gap:clamp(20px,3vw,36px);margin-top:clamp(20px,3vw,32px);align-items:start}
.materials-main{min-width:0}
.shelf{position:sticky;top:20px;display:grid;gap:6px;font-size:.9375rem}
.shelf ul{display:grid;gap:1px;margin:0;padding:0;list-style:none}
.shelf a{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:7px 8px;border-radius:var(--radius-sm);color:var(--public-text);text-decoration:none}
.shelf a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shelf a:hover{background:var(--field-mist);color:var(--public-ink)}
.shelf a[aria-current=true]{background:var(--field-mist);color:var(--public-ink);font-weight:600}
.shelf small{color:var(--muted);font-size:.8125rem;font-weight:400;font-variant-numeric:tabular-nums}
.shelf .v-icon{color:var(--muted)}
.shelf-head{margin:10px 0 2px;padding:0 8px;color:var(--muted);font-size:.8125rem}
.shelf-new{margin-top:6px;padding:0 8px}
.shelf-new summary{color:var(--ink-blue);font-size:.875rem;cursor:pointer}
.shelf-form{display:grid;gap:8px;margin-top:8px;justify-items:start}
.shelf-form .v-input{width:100%;min-height:36px;padding:5px 10px;font-size:.875rem}
.folder-do{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:14px;max-width:720px}
.folder-rename{display:grid;gap:6px;flex:1 1 280px}
.danger{border-color:var(--pencil-red);color:var(--pencil-red)}
.material-uses{display:grid;margin:10px 0 0;padding:0;list-style:none;max-width:720px;border-top:1px solid var(--public-rule)}
.material-uses li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--public-rule)}
.course-materials-note{margin-bottom:14px;max-width:62ch}
.material-move{display:block;grid-column:2;grid-row:1/3;width:164px}
.material-move .v-input,.material-move .v-menu-button{min-height:34px;padding:4px 10px;font-size:.875rem}
.material .say{grid-column:1/-1}
@media (max-width:760px){.materials-page{grid-template-columns:minmax(0,1fr)}.shelf{position:static}.material{grid-template-columns:minmax(0,1fr)}.material-move{grid-column:1;grid-row:auto;width:auto}}
.material-add{display:grid;gap:14px}
.material-link{display:grid;gap:6px}
.material-link-row{display:flex;gap:8px}
.material-link-row .v-input{flex:1;min-width:0}
.materials{display:grid;max-width:720px;margin:0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.material{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px 16px;padding:10px 0;border-bottom:1px solid var(--public-rule)}
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
      ['POST', /^materials$/, async ({ materials, request, url }, _match, bytes) => {
        if (!bytes?.length) throw refused('That file is empty.');
        return materials.add({ name: fileName(request), bytes, folder: url?.searchParams.get('folder') || null });
      }, { bytes: FILE_BYTES }],
      ['POST', /^materials\/link$/, async ({ materials, url }, _match, body) => materials.addLink(String(body?.url ?? '').trim(), { folder: url?.searchParams.get('folder') || null })],
      ['POST', /^materials\/folders$/, async ({ materials }, _match, body) => { const made = await materials.makeFolder(body?.name); return { go: `/console/materials?folder=${made.id}` }; }],
      ['PUT', /^materials\/folders\/([\w-]+)$/, async ({ materials }, match, body) => { await materials.renameFolder(match[1], body?.name); return { said: 'Renamed.' }; }],
      ['DELETE', /^materials\/folders\/([\w-]+)$/, async ({ materials }, match) => { await materials.removeFolder(match[1]); return { go: '/console/materials' }; }],
      ['PUT', /^materials\/([\w-]+)\/folder$/, async ({ materials }, match, body) => { await materials.move(match[1], body?.folder || null); return { said: 'Moved.' }; }],
      ['GET', /^materials\/([\w-]+)$/, async ({ materials }, match) => materials.get(match[1])],
      ['DELETE', /^materials\/([\w-]+)$/, async ({ materials }, match) => { await materials.remove(match[1]); return { go: '/console/materials' }; }],
      ['POST', /^materials\/([\w-]+)\/retry$/, async ({ materials }, match) => { await materials.retry(match[1]); return {}; }],
      // The original opens from where files are kept, never from these pages' own address, so nothing in it runs here.
      ['GET', /^materials\/([\w-]+)\/file$/, async ({ materials }, match) => new Response(null, { status: 302, headers: { location: await materials.link(match[1]), 'cache-control': 'no-store' } })]
    ]
  },
  { id: 'material', title: 'A material', section: 'materials', nav: false, match: /^materials\/([\w-]+)$/, render: oneBody, api: [] },
  {
    id: 'course-materials', title: 'Materials', section: 'courses', nav: false, courseTab: 'Materials', tabPath: '/materials', match: /^courses\/([\w-]+)\/materials$/,
    render: courseBody,
    api: [
      ['POST', /^courses\/([\w-]+)\/materials$/, async ({ library, materials, request }, match, bytes) => {
        if (!bytes?.length) throw refused('That file is empty.');
        const { code, doc } = await courseAt(library, match[1]);
        const folder = await materials.courseFolder(doc.course.title, code);
        return materials.add({ name: fileName(request), bytes, folder: folder.id });
      }, { bytes: FILE_BYTES }],
      // Whether an activity's AI searches the course's folder: a tutor that does, or the one the project started with.
      ['POST', /^courses\/([\w-]+)\/materials\/use$/, async (here, match, body) => {
        const { code, doc } = await courseAt(here.library, match[1]);
        const { activity } = activityIn(doc, String(body?.activity ?? ''));
        const quick = /^quick/i.test((doc.agents || []).find((agent) => agent.ref === activity.agent_ref)?.name || '');
        const folder = await here.materials.courseFolder(doc.course.title, code);
        const tutor = body?.on === true ? await here.materials.tutorFor(doc.course.title, code, (await here.materials.list({ folder: folder.id })).filter((item) => item.status === 'ready').map((item) => item.id), { quick }) : null;
        const back = tutor ? null : (doc.agents || []).find((agent) => agent.name === (quick ? 'Quick tutor' : 'Tutor'));
        await changeCourse(here.library, code, null, (draft) => { const held = activityIn(draft, String(body.activity)).activity; held.agent_ref = (tutor || back)?.ref ?? held.agent_ref; }, tutor ? 'The AI searches the course’s materials' : 'The AI stopped searching the course’s materials');
        return { said: tutor ? 'It searches these now. It takes a moment before they can be found.' : 'It doesn’t search them anymore.' };
      }]
    ]
  }
];
