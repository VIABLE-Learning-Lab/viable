/**
 * Detectors on What to look at: someone else's method that reads what learners did and marks moments for the teacher
 * (docs/components.md). It sends learners' words to that someone, so nothing runs until a person asks, the page says what
 * goes where first, and marks stay here. Only one reached over https: this page can't start a program. No Node built-ins.
 */
import { callOut, checkManifest, overHttp } from '../../../harness/src/components/contract.js';
import { publicUrl } from '../agents/http.js';
import { showCode } from '../server/classList.js';
import { learnerRecords } from '../server/learner.js';
import { courseAt } from './course.js';
import { dropZone, esc, plural, say, when } from './forms.js';

const refused = (message, status = 400, code = 'invalid_detector') => Object.assign(new Error(message), { status, code });
const MOST = { detectors: 8, records: 300, atOnce: 4, manifestBytes: 64 * 1024 };
const held = (code) => `courses/${code}/detectors/`;
const slugOf = (id) => id.replace('/', '--');
const keyOf = (code, slug) => `${held(code)}${slug}`;
const marksKey = (code, slug) => `courses/${code}/marks/${slug}`;
const WORDS = { learning_events: 'each learner’s events and their messages with the AI', conversation: 'each learner’s conversation', learner_message: 'each learner’s messages' };

/** What a person is told before anything goes. */
const goesWhere = (manifest) => `This sends ${manifest.receives.map((name) => WORDS[name] || name).join(', ')}, with no names or codes, to ${manifest.sends_to.join(', ')}. Have an agreement with whoever runs it.`;

export async function detectorsPart({ store }, code, people) {
  const nameOf = (learnerCode) => { const person = people.find((item) => item.code === learnerCode); return { who: person?.name || showCode(learnerCode), id: person?.id }; };
  const list = await Promise.all((await store.list(held(code))).map((key) => store.get(key)));
  const rows = await Promise.all(list.filter(Boolean).map(async (manifest) => {
    const slug = slugOf(manifest.id);
    const run = await store.get(marksKey(code, slug));
    const api = `courses/${esc(code)}/detectors/${esc(slug)}`;
    return `<li class="detector" id="d-${esc(slug)}" data-say-box>
<div class="detector-head"><div><strong>${esc(manifest.label)}</strong><p class="v-note">${esc(manifest.summary)}</p><p class="v-note">${esc(goesWhere(manifest))}</p></div>
<div class="actions"><button class="v-btn is-small" type="button" data-api="POST ${api}/run" data-busy="Reading this class…" data-confirm="${esc(goesWhere(manifest))}" data-yes="Send and read">${run ? 'Read again' : 'Read this class'}</button><button class="v-btn is-small" type="button" data-api="DELETE ${api}">Remove</button></div></div>
${run ? `<p class="v-note">Read ${when(run.at)}: ${esc(plural(run.read, 'record'))}${run.failed ? `, ${run.failed} it couldn’t read` : ''}. It marks these, and it can be wrong.</p>${run.marks.length ? `<ul class="moments">${run.marks.map((mark) => {
      const { who, id } = nameOf(mark.learner);
      return `<li><strong>${id ? `<a href="/console/courses/${esc(code)}/progress/${esc(id)}">${esc(who)}</a>` : esc(who)}</strong><p>${esc(mark.label)}${mark.activity ? ` · ${esc(mark.activity)}` : ''}</p><p class="v-note">${esc(mark.evidence)}</p></li>`;
    }).join('')}</ul>` : '<p class="v-note">It marked nothing.</p>'}` : ''}
${say()}
</li>`;
  }));
  return `<section class="block" aria-labelledby="detectors-title" id="detectors" data-say-box>
<h2 id="detectors-title">From detectors</h2>
<p class="v-note">A detector is someone else’s method that reads what learners did and marks moments for you. Nothing runs until you ask.</p>
${rows.length ? `<ul class="detectors">${rows.join('')}</ul>` : ''}
${rows.length < MOST.detectors ? dropZone({ id: 'detector-file', label: 'Drop its manifest here', accept: '.json', upload: `POST courses/${code}/detectors` }) : ''}
${say()}
</section>`;
}

export const DETECTORS_CSS = `.detectors{display:grid;gap:14px;margin:12px 0;padding:0;list-style:none}
.detector{display:grid;gap:8px;padding:14px;border:1px solid var(--public-rule);border-radius:var(--radius)}
.detector-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}
.detector strong{color:var(--public-ink);font-weight:600}
@media (max-width:640px){.detector-head{grid-template-columns:minmax(0,1fr)}}`;

const needStore = (store) => { if (!store) throw refused('This server has no store, so it can’t keep a detector.', 409, 'no_store'); };

async function add({ library, store }, match, bytes) {
  needStore(store);
  const { code } = await courseAt(library, match[1]);
  let manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw refused('That isn’t a manifest: it should be a JSON file.'); }
  try { checkManifest(manifest, 'detector'); } catch (error) { throw refused(error.message); }
  if (manifest.runs.kind !== 'http') throw refused('Here a detector has to be reached over https: this page can’t start a program.');
  if ((await store.list(held(code))).length >= MOST.detectors) throw refused(`A course keeps at most ${MOST.detectors} detectors.`);
  await store.put(keyOf(code, slugOf(manifest.id)), manifest);
  return { said: `Added ${manifest.label}. Nothing has been sent.` };
}

async function remove({ library, store }, match) {
  needStore(store);
  const { code } = await courseAt(library, match[1]);
  await store.delete(keyOf(code, match[2]));
  await store.delete(marksKey(code, match[2]));
  return { said: 'Removed, with its marks.' };
}

async function run({ library, store, outward }, match) {
  needStore(store);
  const { code } = await courseAt(library, match[1]);
  const manifest = await store.get(keyOf(code, match[2]));
  if (!manifest) throw refused('That detector isn’t here anymore.', 404, 'detector_not_found');
  const { records: all } = await learnerRecords(store, code);
  const list = all.filter((record) => record.turns?.length).slice(0, MOST.records);
  const marks = [];
  let failed = 0;
  let next = 0;
  const transport = (sent, sending, call) => overHttp(sent, sending, { ...call, fetch: outward, checkEntry: (url) => publicUrl(url.href) });
  await Promise.all(Array.from({ length: MOST.atOnce }, async () => {
    while (next < list.length) {
      const record = list[next];
      next += 1;
      // Its events and turns: the learner's code stays here, and marks are joined back to them on this page.
      try {
        const answer = await callOut(manifest, { learning_events: { events: record.events ?? [], turns: record.turns ?? [] } }, transport);
        for (const mark of answer.marks) marks.push({ learner: record.user, activity: record.activity ?? null, turn_index: mark.turn_index, label: mark.label, evidence: mark.evidence });
      } catch { failed += 1; }
    }
  }));
  await store.put(marksKey(code, match[2]), { at: new Date().toISOString(), read: list.length, failed, marks });
  return { said: failed === list.length && failed ? `${manifest.label} couldn’t be reached. Nothing was marked.` : `${plural(marks.length, 'mark')} from ${plural(list.length, 'record')}.` };
}

export const detectorRoutes = [
  ['POST', /^courses\/([\w-]+)\/detectors$/, add, { bytes: MOST.manifestBytes }],
  ['DELETE', /^courses\/([\w-]+)\/detectors\/([\w-]+)$/, remove],
  ['POST', /^courses\/([\w-]+)\/detectors\/([\w-]+)\/run$/, run]
];
