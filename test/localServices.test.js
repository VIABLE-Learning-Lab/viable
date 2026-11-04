// What a local run has in place of VIABLE's services: a package's own knowledge and agents, speech
// and pictures on the endpoint, memory in a folder, and HTML read as Markdown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAgentFile, runAgent } from '../src/index.js';
import { chunkText, knowledgeFolders, packageKnowledge, searchTerms } from '../src/knowledge.js';
import { htmlToMarkdown } from '../src/markdown.js';
import { memoryFiles } from '../src/memory.js';
import { LOCAL_STEPS, mediaFiles, openAIImages, openAISpeech } from '../src/run.js';
import { STEP_MANIFESTS } from '../src/agents/steps/index.js';
import { zipFile } from './zipFile.js';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const chat = (content = 'ok') => async () => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
const pkg = (parts) => ({ format: 'viable.course-package', version: 1, course: { title: 'Test' }, ...parts });

const scratch = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-harness-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

function folder(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'viable-harness-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'files'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'files', name), text);
  return dir;
}

test('knowledge passages keep their headings, and Chinese is searched by character pairs', async (t) => {
  const chunks = chunkText('# Moon\n\nThe Moon orbits Earth.\n\n## Phases\n\nA new moon is dark.');
  assert.equal(chunks[0].heading, 'Moon');
  assert.match(chunks[0].text, /orbits Earth/);
  assert.deepEqual(searchTerms('月亮的相位'), ['月亮', '亮的', '的相', '相位']);
  assert.deepEqual(searchTerms('How do the phases work?'), ['phases', 'work']);

  const files = {
    'moon.md': '# 月亮\n\n月亮绕着地球转，大约每二十九天半转一圈。\n\n## 相位\n\n新月的时候我们看不见月亮，满月的时候月亮是圆的。',
    'tides.txt': 'Tides rise and fall twice a day because the Moon pulls on the oceans of the Earth.'
  };
  const dir = folder(t, files);
  const search = packageKnowledge(pkg({
    files: [{ ref: 'moon', name: 'moon.md', path: 'files/moon.md', title: '月亮' }, { ref: 'tides', name: 'tides.txt', path: 'files/tides.txt', sha256: sha256(files['tides.txt']) }],
    knowledge_bases: [{ ref: 'sky', name: 'Sky', file_refs: ['moon', 'tides'] }, { ref: 'sea', name: 'Sea', file_refs: ['tides'] }]
  }), { dir });
  const [first] = await search({ knowledgeBaseIds: ['sky'], query: '满月是什么样子？', topK: 3 });
  assert.equal(first.document_id, 'moon');
  assert.equal(first.title, '月亮');
  assert.match(first.text, /满月/);
  const tides = await search({ knowledgeBaseIds: ['sky', 'sea'], query: 'Why do tides rise?', topK: 5 });
  assert.deepEqual(tides.map((item) => [item.document_id, item.knowledge_base_id, item.url, item.match]), [['tides', 'sky', null, 'keyword']], 'a file in two knowledge bases is found once');
  assert.deepEqual(await search({ knowledgeBaseIds: ['sky'], query: 'volcanoes' }), []);
});

test('a package’s files are checked, stay in its folder, and are text', async (t) => {
  const dir = folder(t, { 'a.md': 'A guide with enough words in it to be a passage of its own.' });
  const fails = (parts, pattern, code = 'knowledge_file_unreadable') => assert.rejects(packageKnowledge(pkg(parts), { dir })({ knowledgeBaseIds: ['kb'], query: 'guide' }), (error) => error.code === code && pattern.test(error.message));
  const kb = [{ ref: 'kb', name: 'KB', file_refs: ['a'] }];
  await fails({ files: [{ ref: 'a', name: 'a.md', path: 'files/a.md', sha256: '0'.repeat(64) }], knowledge_bases: kb }, /sha256 differs/);
  await fails({ files: [{ ref: 'a', name: 'a.md', path: 'files/a.md', bytes: 3 }], knowledge_bases: kb }, /bytes, not the 3 the package says/);
  await fails({ files: [{ ref: 'a', name: 'a.md', path: '../a.md' }], knowledge_bases: kb }, /outside the package's folder/);
  // A link inside the folder to a file outside it is outside too, even with no checksum to catch it.
  const secret = folder(t, { 'secret.md': 'Something private elsewhere on the machine.' });
  symlinkSync(join(secret, 'files', 'secret.md'), join(dir, 'files', 'link.md'));
  await fails({ files: [{ ref: 'a', name: 'link.md', path: 'files/link.md' }], knowledge_bases: kb }, /outside the package's folder/);
  await fails({ files: [{ ref: 'a', name: 'gone.md', path: 'files/gone.md' }], knowledge_bases: kb }, /no such file/);
  await fails({ files: [{ ref: 'a', name: 'a.pdf', path: 'files/a.pdf' }], knowledge_bases: kb }, /not "a\.pdf"\. Run the agent on VIABLE/, 'knowledge_unavailable');
  await fails({ files: [], knowledge_bases: [{ ref: 'kb', name: 'KB', websites: [{ url: 'https://example.org' }] }] }, /no snapshot of them/, 'knowledge_unavailable');
  await fails({ files: [], knowledge_bases: [{ ref: 'other', name: 'KB' }] }, /no knowledge base "kb" \(it has: other\)/);
  const download = async () => new Response('not found', { status: 404 });
  await assert.rejects(packageKnowledge(pkg({ files: [{ ref: 'a', name: 'a.md', url: 'https://example.org/a.md' }], knowledge_bases: kb }), { fetch: download })({ knowledgeBaseIds: ['kb'], query: 'guide' }), /couldn't read "a\.md" \(https:\/\/example\.org\/a\.md\): The file address answered with status 404/);
});

test('a caller’s searchKnowledge still wins over the package’s', async () => {
  const doc = pkg({ knowledge_bases: [{ ref: 'kb', name: 'KB', file_refs: [] }], agents: [{ ref: 'a', name: 'A', graph: { entry: 's', nodes: [{ id: 's', type: 'knowledge', config: { knowledge_base_refs: ['kb'] }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{s.context}}' } }] } }] });
  const asked = [];
  const searchKnowledge = async (request) => { asked.push(request); return [{ text: 'From your own index.', title: 'Mine', document_id: 'd1', chunk_id: 'c1' }]; };
  const result = await runAgent(doc, { input: 'hi', services: { searchKnowledge } });
  assert.equal(result.output.text, '[1] Mine\nFrom your own index.');
  assert.deepEqual(asked[0].knowledgeBaseIds, ['kb'], 'the graph names the package’s knowledge bases by ref');
  await assert.rejects(runAgent(doc, { input: 'hi', services: { searchKnowledge: null } }), { code: 'knowledge_unavailable' });
});

test('an agent file’s knowledge bases are searched in the folders mapped to them', async (t) => {
  const dir = folder(t, { 'tides.md': '# Tides\n\nTides rise and fall twice a day because the Moon pulls on the oceans.', 'notes.pdf': '%PDF-1.4' });
  mkdirSync(join(dir, 'files', 'unit-2'));
  writeFileSync(join(dir, 'files', 'unit-2', 'moon.txt'), 'The Moon orbits Earth about every 27 days, and its phases repeat every 29 and a half.');
  writeFileSync(join(dir, 'files', '.draft.md'), 'A hidden draft about tides that nobody published.');
  // A link inside the folder to a file elsewhere on the machine is left out.
  const secret = folder(t, { 'secret.md': 'Private notes about the tides elsewhere on the machine.' });
  symlinkSync(join(secret, 'files', 'secret.md'), join(dir, 'files', 'link.md'));
  const listed = await knowledgeFolders({ kb_123: join(dir, 'files') });
  assert.deepEqual(listed.files.map((file) => file.path), ['tides.md', join('unit-2', 'moon.txt')]);
  assert.deepEqual(listed.skipped, { kb_123: ['notes.pdf'] });

  // As VIABLE exports it: the Knowledge step names the knowledge base by its ID.
  const agent = { format: 'viable.agent', format_version: 1, name: 'Sea', graph: { entry: 's', nodes: [{ id: 's', type: 'knowledge', config: { knowledge_bases: ['kb_123'] }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{s.context}}' } }] } };
  const result = await runAgent(agent, { input: 'Why do tides rise?', knowledge: { kb_123: join(dir, 'files') } });
  assert.match(result.output.text, /^\[1\] tides\.md\n.*Moon pulls on the oceans/s);
  assert.ok(!/hidden draft|Private notes/.test(result.output.text));
  const moon = await runAgent(agent, { input: 'How often do the phases of the Moon repeat?', knowledge: { kb_123: join(dir, 'files') } });
  assert.match(moon.output.text, /^\[1\] moon\.txt\n/, 'subfolders are read too');

  await assert.rejects(runAgent(agent, { input: 'tides' }), (error) => error.code === 'knowledge_unavailable' && /--knowledge <id>=<folder>/.test(error.message));
  await assert.rejects(runAgent(agent, { input: 'tides', knowledge: { kb_999: join(dir, 'files') } }), (error) => /no knowledge base "kb_123" \(it has: kb_999\)\. Map it to a folder of its files with --knowledge kb_123=<folder>/.test(error.message));
  const pdfs = folder(t, { 'only.pdf': '%PDF-1.4' });
  await assert.rejects(knowledgeFolders({ kb_123: join(pdfs, 'files') }), (error) => error.code === 'knowledge_folder_empty' && /only\.pdf aren't read/.test(error.message));
  await assert.rejects(knowledgeFolders({ kb_123: join(dir, 'missing') }), { code: 'knowledge_folder_unreadable' });

  // A package's knowledge base of the same ref is replaced by the folder (its PDF can't be read locally).
  const doc = pkg({ files: [{ ref: 'f', name: 'tides.pdf', path: 'files/tides.pdf' }], knowledge_bases: [{ ref: 'sea', name: 'Sea', file_refs: ['f'] }], agents: [{ ref: 'a', name: 'A', graph: { entry: 's', nodes: [{ id: 's', type: 'knowledge', config: { knowledge_base_refs: ['sea'] }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{s.context}}' } }] } }] });
  await assert.rejects(runAgent(doc, { input: 'tides', dir }), (error) => error.code === 'knowledge_unavailable' && /--knowledge sea=<folder>/.test(error.message));
  assert.match((await runAgent(doc, { input: 'Why do tides rise?', dir, knowledge: { sea: join(dir, 'files') } })).output.text, /^\[1\] tides\.md/);
});

test('a course downloaded as a .viable.zip runs with its files read from the archive', async (t) => {
  const dir = scratch(t);
  const guides = fileURLToPath(new URL('./fixtures/library/', import.meta.url));
  const library = JSON.parse(readFileSync(new URL('../examples/library-research-help.json', import.meta.url), 'utf8'));
  // As VIABLE writes one: package.viable.json at the root, the files under files/, named by path.
  library.files = library.files.map(({ url: _url, ...file }, i) => ({ ...file, path: `files/file-${i + 1}-${file.name}` }));
  const entries = [{ name: 'package.viable.json', data: JSON.stringify(library) }, ...library.files.map((file, i) => ({ name: file.path, data: readFileSync(join(guides, file.name)), store: i === 0 }))];
  const course = join(dir, 'library.viable.zip');
  writeFileSync(course, zipFile(entries));

  const { doc, zip } = await readAgentFile(course);
  assert.equal(doc.format, 'viable.course-package');
  const asked = [];
  const fetch = async (_url, init) => { asked.push(JSON.parse(init.body)); return chat('Who wrote it? [1]')(); };
  const result = await runAgent(doc, { input: 'Is this website trustworthy?', zip, fetch });
  assert.equal(result.steps.find((step) => step.nodeId === 'search').status, 'completed');
  assert.match(asked[0].messages[0].content, /\[1\] Evaluating sources\n/, 'a passage from a file in the archive reaches the model');

  const outside = { ...library, files: library.files.map((file, i) => (i === 2 ? { ...file, path: '../evaluating-sources.md' } : file)) };
  writeFileSync(course, zipFile([{ name: 'package.viable.json', data: JSON.stringify(outside) }, ...entries.slice(1), { name: '../evaluating-sources.md', data: 'outside' }]));
  const climbing = await readAgentFile(course);
  await assert.rejects(runAgent(climbing.doc, { input: 'Is this website trustworthy?', zip: climbing.zip, fetch }), /outside the package's archive/);

  writeFileSync(course, zipFile([{ name: 'package.viable.json', data: ' '.repeat(2 * 1024 * 1024 + 1) }]));
  await assert.rejects(readAgentFile(course), /package\.viable\.json is larger than 2 MB/);
  writeFileSync(course, zipFile([{ name: 'course/package.viable.json', data: '{}' }]));
  await assert.rejects(readAgentFile(course), /has no package\.viable\.json at its root/);
  writeFileSync(course, Buffer.from('PK\x03\x04 cut short'));
  await assert.rejects(readAgentFile(course), /isn't a whole zip file/);
});

test('a PDF in a course package is searched through the text VIABLE read from it', async (t) => {
  const dir = scratch(t);
  // As VIABLE's course page downloads it with its files: the PDF, and its text at text_path.
  const text = '### Page 1\n\n# Moon phases\n\nThe Moon has phases because we see more or less of its sunlit half.\n\n### Page 2\n\nA full moon rises at sunset, opposite the Sun.';
  const file = { ref: 'file-1', name: 'moon-phases.pdf', type: 'application/pdf', path: 'files/file-1-moon-phases.pdf', text_path: 'files/file-1-moon-phases.pdf.md', text_sha256: sha256(text), title: 'Moon phases' };
  const doc = pkg({ files: [file], knowledge_bases: [{ ref: 'kb-1', name: 'Moon', file_refs: ['file-1'], websites: [] }], agents: [{ ref: 'agent-1', name: 'Tutor', graph: { entry: 's', nodes: [{ id: 's', type: 'knowledge', config: { knowledge_base_refs: ['kb-1'] }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{s.context}}' } }] } }] });
  const course = join(dir, 'moon.viable.zip');
  writeFileSync(course, zipFile([{ name: 'package.viable.json', data: JSON.stringify(doc) }, { name: file.path, data: '%PDF-1.4 not text', store: true }, { name: file.text_path, data: text }]));
  const { zip } = await readAgentFile(course);
  const result = await runAgent(doc, { input: 'When does a full moon rise?', zip });
  assert.match(result.output.text, /^\[1\] Moon phases\n.*full moon rises at sunset/s);

  const changed = { ...doc, files: [{ ...file, text_sha256: sha256('something else') }] };
  await assert.rejects(runAgent(changed, { input: 'full moon', zip }), /"moon-phases\.pdf"'s text isn't the file the package names/);
  const without = { ...doc, files: [{ ...file, text_path: undefined }] };
  await assert.rejects(runAgent(without, { input: 'full moon', zip }), { code: 'knowledge_unavailable' });
});

test('a website in a package is searched from its snapshot, and cited at the page’s address', async (t) => {
  const dir = scratch(t);
  const text = '# Hours\n\nThe main library opens at nine on weekdays, and at noon on Saturdays.';
  const page = { url: 'https://guides.example.org/hours', title: 'Library hours', path: 'files/page-1.md', sha256: sha256(text) };
  const site = { kind: 'crawl', url: 'https://guides.example.org/', snapshot: [page] };
  const doc = pkg({ files: [], knowledge_bases: [{ ref: 'kb-1', name: 'Guides', websites: [site] }], agents: [{ ref: 'agent-1', name: 'Desk', graph: { entry: 's', nodes: [{ id: 's', type: 'knowledge', config: { knowledge_base_refs: ['kb-1'] }, next: 'o' }, { id: 'o', type: 'output', config: { text: '{{s.context}}' } }] } }] });
  const course = join(dir, 'help.viable.zip');
  writeFileSync(course, zipFile([{ name: 'package.viable.json', data: JSON.stringify(doc) }, { name: page.path, data: text }]));
  const { zip } = await readAgentFile(course);
  const result = await runAgent(doc, { input: 'When does the library open on Saturdays?', zip });
  assert.match(result.output.text, /noon on Saturdays/);
  assert.match(JSON.stringify(result.output.citations || result.output), /guides\.example\.org\/hours/);
  const changed = { ...doc, knowledge_bases: [{ ...doc.knowledge_bases[0], websites: [{ ...site, snapshot: [{ ...page, sha256: sha256('another') }] }] }] };
  await assert.rejects(runAgent(changed, { input: 'Saturdays', zip }), /isn't the file the package names/);
});

test('a package’s agent calls another of its agents, within the run’s budgets', async () => {
  const reply = (id, text) => ({ id, type: 'output', config: { text } });
  const doc = pkg({
    agents: [
      { ref: 'tutor', name: 'Tutor', graph: { entry: 'ask', nodes: [{ id: 'ask', type: 'subagent', config: { slug: 'hint-writer', input: 'Hint for: {{input}}' }, next: 'out' }, reply('out', 'Tutor: {{ask.text}}')] } },
      { ref: 'hints', name: 'Hint writer', graph: { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'm' }, next: 'out' }, reply('out', '{{write.content}}')] } },
      { ref: 'loop', name: 'Loop', graph: { entry: 'again', nodes: [{ id: 'again', type: 'subagent', config: { slug: 'loop' }, next: 'out' }, reply('out', 'x')] } },
      { ref: 'away', name: 'Away', graph: { entry: 'call', nodes: [{ id: 'call', type: 'subagent', config: { slug: 'published-elsewhere' }, next: 'out' }, reply('out', 'x')] } }
    ]
  });
  const calls = [];
  const fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return chat('Look at the denominators.')(); };
  const result = await runAgent(doc, { input: '1/2 + 1/3', fetch });
  assert.equal(result.output.text, 'Tutor: Look at the denominators.', 'found by its name as a slug');
  assert.equal(calls[0].messages.at(-1).content, 'Hint for: 1/2 + 1/3');
  assert.equal(result.modelCalls, 1, 'the sub-agent’s model calls count toward the run');
  await assert.rejects(runAgent(doc, { agent: 'loop', input: 'hi', fetch }), { code: 'subagent_cycle' });
  await assert.rejects(runAgent(doc, { agent: 'away', input: 'hi', fetch }), (error) => error.code === 'subagent_unavailable' && /isn't one of this package's agents \(tutor, hints, loop, away\)/.test(error.message));
  const twice = { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'm' }, next: 'again' }, { id: 'again', type: 'llm', config: { model: 'm' }, next: 'out' }, reply('out', '{{again.content}}')] };
  const tight = { ...doc, agents: doc.agents.map((item) => (item.ref === 'tutor' ? { ...item, graph: { ...item.graph, run_limits: { max_model_calls: 1 } } } : item.ref === 'hints' ? { ...item, graph: twice } : item)) };
  await assert.rejects(runAgent(tight, { input: 'hi', fetch }), { code: 'agent_budget_exceeded' });
});

test('speech goes to /audio/speech with a voice the model has, and fails or passes on clearly', async () => {
  const saved = [];
  const save = async (buffer, format) => { saved.push([buffer.byteLength, format]); return { url: `/tmp/speech.${format}` }; };
  const asked = [];
  const fetch = async (url, init) => { asked.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } }); };
  const speak = openAISpeech({ baseUrl: 'http://localhost:8880/v1/', apiKey: 'k', model: 'tts-1', fetch, save });
  const result = await speak({}, { model: 'kokoro', input: 'Hola', voice: 'em_alex', response_format: 'wav' }, { store: true });
  assert.equal(asked[0].url, 'http://localhost:8880/v1/audio/speech');
  assert.equal(asked[0].headers.authorization, 'Bearer k');
  assert.deepEqual(asked[0].body, { model: 'tts-1', input: 'Hola', voice: 'onyx', response_format: 'wav' });
  assert.deepEqual([result.asset, result.requestPayload, saved], [{ url: '/tmp/speech.wav' }, { voice: 'onyx', response_format: 'wav' }, [[3, 'wav']]]);
  await openAISpeech({ fetch, save })({}, { model: 'kokoro', input: 'Hi' });
  assert.equal(asked[1].body.voice, 'af_heart', 'a Kokoro model keeps Kokoro voices');
  const refusing = async () => new Response(JSON.stringify({ error: { message: 'Unknown model' } }), { status: 400, headers: { 'content-type': 'application/json' } });
  await assert.rejects(openAISpeech({ baseUrl: 'http://127.0.0.1:1/v1', fetch: refusing })({}, { model: 'kokoro', input: 'Hi' }), /speech endpoint \(http:\/\/127\.0\.0\.1:1\/v1\/audio\/speech, model kokoro\) answered 400: Unknown model/);

  const graph = { entry: 's', nodes: [{ id: 's', type: 'speech', config: { model: 'kokoro', text: 'Hello there.' }, next: 'out' }, { id: 'out', type: 'output', config: { text: 'done', attachments: '{{s.url}}' } }] };
  await assert.rejects(runAgent(graph, { input: 'hi', services: { generateSpeech: null } }), (error) => error.code === 'needs_viable' && /Speech steps/.test(error.message));
  const silent = await runAgent(graph, { input: 'hi', silent: true, fetch: async () => assert.fail('nothing is read aloud') });
  assert.equal(silent.outputs.s.skipped, 'Replies aren’t read aloud here.');
});

test('HTML reads as Markdown, and a Fetch URL step reads an HTML page locally', async () => {
  const page = `<!DOCTYPE html><html><head><title>Moon &amp; tides</title><script>var a = "<p>no</p>";</script></head><body>
    <header><nav><a href="/">Home</a></nav></header>
    <main><h1>Moon  phases</h1><p>The Moon <a href="orbit">orbits</a> Earth.<br>Every 29.5 days.</p>
    <ul><li>New moon</li><li>Full moon<ol><li>Bright</li></ol></li></ul><img src="/moon.png" alt="The Moon"></main>
    <footer>© Example</footer></body></html>`;
  const markdown = '# Moon phases\n\nThe Moon [orbits](https://example.org/sky/orbit) Earth.\nEvery 29.5 days.\n\n- New moon\n- Full moon\n  1. Bright\n\n![The Moon](https://example.org/moon.png)';
  assert.equal(htmlToMarkdown(page, { base: 'https://example.org/sky/', selector: 'main' }), markdown);
  assert.doesNotMatch(htmlToMarkdown(page), /Home|no|Example/, 'scripts, navigation and the page’s footer are left out');

  const graph = { entry: 'get', nodes: [{ id: 'get', type: 'http', config: { url: 'https://example.org/sky/', method: 'GET' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{get.data.markdown}}' } }] };
  const httpFetch = async () => new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const result = await runAgent(graph, { input: 'hi', services: { httpFetch } });
  assert.equal(result.output.text, markdown);
  assert.equal(result.outputs.get.data.title, 'Moon & tides');
  assert.deepEqual(result.outputs.get.data.links.map((link) => link.url), ['https://example.org/', 'https://example.org/sky/orbit']);
  assert.deepEqual(result.outputs.get.data.images, [{ url: 'https://example.org/moon.png', alt: 'The Moon' }]);
  await assert.rejects(runAgent(graph, { input: 'hi', services: { httpFetch, toMarkdown: null } }), { code: 'http_markdown_unavailable' });
});

test('an Agent step in a package searches its knowledge bases and calls its other agents', async (t) => {
  const dir = folder(t, { 'tides.md': '# Tides\n\nTides rise and fall twice a day because the Moon pulls on the oceans.' });
  const doc = pkg({
    files: [{ ref: 'tides', name: 'tides.md', path: 'files/tides.md' }],
    knowledge_bases: [{ ref: 'sea', name: 'Sea', file_refs: ['tides'] }],
    agents: [
      { ref: 'guide', name: 'Guide', graph: { entry: 'think', nodes: [{ id: 'think', type: 'agent', config: { model: 'm', tools: { knowledge_base_refs: ['sea'], agents: ['checker'] } }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{think.content}}' } }] } },
      { ref: 'checker', name: 'Checker', graph: { entry: 'out', nodes: [{ id: 'out', type: 'output', config: { text: 'Checked: {{input}}' } }] } }
    ]
  });
  const replies = ['{"tool": "search_knowledge", "arguments": {"query": "why do tides rise"}}', '{"tool": "call_agent", "arguments": {"agent": "checker", "input": "twice a day"}}', '{"final": "Twice a day, because of the Moon [1]."}'];
  const asked = [];
  const fetch = async (url, init) => { asked.push(JSON.parse(init.body)); return chat(replies.shift())(); };
  const result = await runAgent(doc, { input: 'Why do tides rise?', fetch, dir });
  assert.equal(result.output.text, 'Twice a day, because of the Moon [1].');
  assert.deepEqual(result.output.citations.map((item) => item.title), ['tides.md']);
  const results = asked.slice(1).map((body) => body.messages.at(-1).content).join('\n');
  assert.match(results, /\[1\] tides\.md › Tides \(document tides\)\n# Tides/);
  assert.match(results, /Checked: twice a day/);
});

test('every step type is accounted for in a local run', () => {
  const listed = [...LOCAL_STEPS.works, ...Object.keys(LOCAL_STEPS.partly), ...Object.keys(LOCAL_STEPS.skipped)];
  assert.deepEqual([...listed].sort(), STEP_MANIFESTS.map((manifest) => manifest.type).sort());
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pictureAnswer = (data, init = {}) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' }, ...init });

test('pictures go to /images/generations or /images/edits and are saved as files', async (t) => {
  const dir = scratch(t);
  const asked = [];
  const fetch = async (url, init = {}) => {
    asked.push({ url, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null });
    if (url === 'https://files.example.org/fox.webp') return new Response(PNG, { headers: { 'content-type': 'image/webp' } });
    if (url.endsWith('/images/edits')) return pictureAnswer({ data: [{ url: 'https://files.example.org/fox.webp' }] });
    return pictureAnswer({ data: [{ b64_json: Buffer.from(PNG).toString('base64') }, { b64_json: Buffer.from(PNG).toString('base64') }], output_format: 'png' });
  };
  const draw = openAIImages({ baseUrl: 'http://localhost:8000/v1/', apiKey: 'k', model: 'gpt-image-1', fetch, save: mediaFiles(dir) });

  const made = await draw({}, { model: 'viable-image', prompt: 'A fox in the snow', operation: 'generate', n: 2, size: '1024x1024', response_format: 'url' });
  assert.equal(asked[0].url, 'http://localhost:8000/v1/images/generations');
  assert.equal(asked[0].headers.authorization, 'Bearer k');
  assert.deepEqual(asked[0].body, { model: 'gpt-image-1', prompt: 'A fox in the snow', n: 2, size: '1024x1024' }, 'operation and response_format are VIABLE’s, not the endpoint’s');
  assert.equal(made.publicData.data.length, 2);
  for (const { url } of made.publicData.data) {
    assert.ok(url.startsWith(dir) && /image-[0-9a-f]{8}\.png$/.test(url), url);
    assert.deepEqual(new Uint8Array(readFileSync(url)), PNG);
  }
  assert.deepEqual([made.cost, made.resolution, made.imageCount], [0, { resolvedModel: 'gpt-image-1', provider: 'openai-compatible' }, 2]);

  const edited = await draw({}, { model: 'm', prompt: 'Make it night', operation: 'edit', images: [{ image_url: 'https://example.org/fox.png' }], response_format: 'url' });
  assert.equal(asked[1].url, 'http://localhost:8000/v1/images/edits');
  assert.deepEqual(asked[1].body.images, [{ image_url: 'https://example.org/fox.png' }]);
  assert.equal(asked[2].url, 'https://files.example.org/fox.webp', 'a picture returned by address is downloaded');
  assert.equal(asked[2].headers.authorization, undefined, 'without the API key');
  assert.match(edited.publicData.data[0].url, /image-[0-9a-f]{8}\.webp$/);

  const sneaky = await mediaFiles(dir)(PNG, '../../escape', 'image');
  assert.ok(sneaky.url.startsWith(dir) && sneaky.url.endsWith('.escape'), 'a format never makes a path');
});

test('an image endpoint’s refusals and failures say so, and the Image step reads them', async (t) => {
  const answers = [
    pictureAnswer({ error: { message: 'Your request was rejected as a result of our safety system.', code: 'moderation_blocked' } }, { status: 400 }),
    pictureAnswer({ error: { message: 'Overloaded' } }, { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '1' } }),
    pictureAnswer({ data: [] })
  ];
  const draw = openAIImages({ baseUrl: 'http://127.0.0.1:1/v1', fetch: async () => answers.shift(), save: async () => assert.fail('nothing is saved') });
  await assert.rejects(draw({}, { model: 'm', prompt: 'p' }), (error) => error.imageFailureReason === 'safety' && error.imageRetryable === false && error.status === 400 && /image endpoint \(http:\/\/127\.0\.0\.1:1\/v1\/images\/generations, model m\) answered 400: Your request was rejected/.test(error.message));
  await assert.rejects(draw({}, { model: 'm', prompt: 'p' }), (error) => error.imageRetryable === true && error.retryAfterMs === 1000 && /answered 503: Overloaded/.test(error.message));
  await assert.rejects(draw({}, { model: 'm', prompt: 'p' }), (error) => error.status === 502 && /answered 200: no pictures in the answer/.test(error.message));

  const graph = (config) => ({ entry: 'draw', nodes: [{ id: 'draw', type: 'image', config: { model: 'gpt-image-1', prompt: 'A fox', ...config }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{draw.status}}', attachments: '{{draw.urls}}' } }] });
  const refusing = async () => pictureAnswer({ error: { message: 'Blocked.', code: 'content_policy_violation' } }, { status: 400 });
  const kept = await runAgent(graph({ on_error: 'continue' }), { input: 'hi', fetch: refusing, mediaDir: scratch(t) });
  assert.deepEqual([kept.output.text, kept.outputs.draw.pictures[0].status], ['failed', 'blocked']);
  await assert.rejects(runAgent(graph({}), { input: 'hi', fetch: refusing }), /answered 400: Blocked\./);
  await assert.rejects(runAgent(graph({}), { input: 'hi', services: { generateImage: null } }), (error) => error.code === 'needs_viable' && /Image steps/.test(error.message));
});

test('memory lasts between runs in one file per learner, and the learner’s ID never reaches a model', async (t) => {
  const dir = join(scratch(t), 'memory');
  const learner = 's-0412';
  const agent = { entry: 'think', nodes: [{ id: 'think', type: 'agent', config: { model: 'm', tools: { memory: true } }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{think.content}}' } }] };
  const replies = ['{"tool": "save_memory", "arguments": {"fact": "Prefers worked examples with pictures"}}', '{"final": "Noted."}'];
  const sent = [];
  const fetch = async (url, init) => { sent.push(init.body); return chat(replies.shift())(); };
  const first = await runAgent(agent, { input: 'I like seeing an example first.', fetch, memoryDir: dir, learner });
  assert.equal(first.output.text, 'Noted.');
  assert.deepEqual(readdirSync(dir), [`${learner}.json`]);
  const [fact] = JSON.parse(readFileSync(join(dir, `${learner}.json`), 'utf8'));
  assert.deepEqual(Object.keys(fact), ['id', 'content', 'created_at'], 'a fact and when; nothing else about the learner or the run');
  assert.equal(fact.content, 'Prefers worked examples with pictures');

  const recall = { entry: 'recall', nodes: [{ id: 'recall', type: 'memory', config: { mode: 'recall', query: '{{input}}' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{recall.text}}' } }] };
  const later = await runAgent(recall, { input: 'show me an example', memoryDir: dir, learner, fetch: async () => assert.fail('recall calls no model') });
  assert.equal(later.output.text, '- Prefers worked examples with pictures');
  assert.ok(!sent.some((body) => body.includes(learner)), 'the learner’s ID is never in a model call');

  const other = await runAgent(recall, { input: 'example', memoryDir: dir, learner: 's-0413' });
  assert.equal(other.output.text, '', 'each learner has their own memory');
  const off = await runAgent(recall, { input: 'example', memoryDir: dir, learner, services: { memory: null } });
  assert.equal(off.outputs.recall.skipped, true, 'null turns it off');
  for (const id of [null, 'Jane Doe', 'jane@example.org', '../s-0412', '.hidden']) {
    await assert.rejects(runAgent(recall, { input: 'x', memoryDir: dir, learner: id }), { code: 'invalid_learner' });
  }
});

test('a memory folder keeps the newest facts once, recalls by keywords, forgets, and never overwrites a file it can’t read', async (t) => {
  const dir = scratch(t);
  const memory = memoryFiles(dir);
  await Promise.all([memory.save('s-1', ['Goal: pass the fractions quiz']), memory.save('s-1', ['Finds number lines helpful', 'goal: pass the fractions quiz '])]);
  assert.deepEqual((await memory.list('s-1')).map((item) => item.content), ['Finds number lines helpful', 'Goal: pass the fractions quiz'], 'newest first, both saved at once, the same fact once');
  assert.equal((await memoryFiles(dir).recall('s-1', 'number lines', 1))[0].content, 'Finds number lines helpful', 'another run reads the same folder');
  const [goal] = (await memory.list('s-1')).slice(-1);
  await memory.remove('s-1', [goal.id]);
  assert.deepEqual((await memory.list('s-1')).map((item) => item.content), ['Finds number lines helpful']);
  await memory.save('s-1', Array.from({ length: 205 }, (_, i) => `Fact ${i}`));
  const all = await memory.list('s-1');
  assert.deepEqual([all.length, all[0].content, all.at(-1).content], [200, 'Fact 204', 'Fact 5'], 'the newest 200');
  assert.ok(!existsSync(join(dir, 's-2.json')) && (await memory.list('s-2')).length === 0, 'nothing is written until a fact is saved');

  writeFileSync(join(dir, 's-3.json'), '{ not json');
  await assert.rejects(memory.save('s-3', ['x']), { code: 'memory_file_unreadable' });
  assert.equal(readFileSync(join(dir, 's-3.json'), 'utf8'), '{ not json');
});
