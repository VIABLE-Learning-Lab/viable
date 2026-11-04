/**
 * Runs a VIABLE agent graph on your own machine and model keys: server/runtime.js (VIABLE's engine on
 * an OpenAI-compatible endpoint, a course package's own files and agents), with what needs a disk or
 * a process: folders standing in for an agent file's knowledge bases, components as MCP servers started
 * here when the person running it names them and, when asked for, memory kept in a folder. What only VIABLE's hosted platform has (published
 * agents and knowledge bases elsewhere, transcription) is absent or fails with a clear message. Pass
 * `services` to plug in your own.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { documentComponents } from './components/call.js';
import { knowledgeFolders, packageKnowledge } from './knowledge.js';
import { checkLearner, memoryFiles } from './memory.js';
import { publicFetch } from './server/publicFetch.js';
import { openAIImages as imagesOn, openAISpeech as speechOn, pickAgent, readPackage, runWithServices } from './server/runtime.js';

export { openAICompatible, packageAgents, pickAgent } from './server/runtime.js';

// What each step type does in a local run (the README's table is this list).
export const LOCAL_STEPS = {
  works: ['input', 'llm', 'condition', 'router', 'agent', 'vetting', 'guardrail', 'transform', 'state', 'loop', 'each', 'parallel', 'ask', 'output', 'note', 'http', 'component'],
  partly: {
    knowledge: 'in a course package (or its .viable.zip), and in the folders you map an agent file\'s knowledge bases to: text, Markdown, CSV, JSON and HTML files, and a PDF or Office file through the text copy VIABLE packages with it, by keywords (no websites)',
    subagent: 'in a course package: its own agents',
    speech: 'on your endpoint\'s /audio/speech, saved to audio files',
    image: 'on your endpoint\'s /images/generations and /images/edits, saved to picture files (not kept by number for later turns)',
    memory: 'with a memory folder and a learner\'s pseudonymous ID: one JSON file per learner, recalled by keywords; skipped otherwise'
  },
  skipped: { transcribe: 'skipped: a local run sends no recording' }
};

/**
 * A folder for the audio and pictures a run's Speech and Image steps make: dir, else a new one in the
 * system's temp folder. Returns save(buffer, format, kind = 'speech') → { url: the file's path }.
 */
export function mediaFiles(dir = null) {
  let folder = null;
  return async (buffer, format = 'mp3', kind = 'speech') => {
    folder ||= dir ? mkdir(resolve(dir), { recursive: true }).then(() => resolve(dir)) : mkdtemp(join(tmpdir(), 'viable-harness-'));
    // The format comes from the agent file or the endpoint: never a path.
    const extension = String(format).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'bin';
    const path = join(await folder, `${kind}-${randomUUID().slice(0, 8)}.${extension}`);
    await writeFile(path, new Uint8Array(buffer));
    return { url: path };
  };
}

// The name from when the folder held only audio.
export const audioFiles = mediaFiles;

/** generateSpeech on an endpoint (server/runtime.js), keeping audio in a new temp folder unless save says otherwise. */
export const openAISpeech = (options = {}) => speechOn({ save: mediaFiles(), ...options });
/** generateImage on an endpoint (server/runtime.js), keeping pictures in a new temp folder unless save says otherwise. */
export const openAIImages = (options = {}) => imagesOn({ save: mediaFiles(), ...options });

/**
 * An agent file, a course package or a graph from disk: { doc, dir, zip }. A .viable.zip gives the
 * package.viable.json at its root and its bytes as zip, where the files the package names by path are
 * read; any other file is JSON, and dir the folder it is in.
 */
export async function readAgentFile(path) {
  const { doc, zip } = await readPackage(await readFile(path), path);
  return { doc, dir: zip ? null : dirname(resolve(path)), zip };
}

/**
 * Runs an agent once. doc: an agent file, a course package or a graph. Returns the engine's result
 * (output, steps with VETTING rounds, usage, ...) and which agent ran with which teaching settings.
 * teaching: an activity's teaching settings (null keeps a package activity's; false runs without);
 * section: the learner's section ID, for a section's own help level and note. dir: the folder a
 * package's files named by path are in (zip: the bytes of the .viable.zip they are in instead); fetch
 * also downloads its files named by url. knowledge ({ id: folder }) searches each folder's text files
 * as the knowledge base of that ID: VIABLE's IDs in an agent file, refs in a package (knowledgeFolders).
 * speechModel and imageModel replace every speech and image model; mediaDir (or its older name, audioDir) keeps the
 * audio and pictures (default: a new temp folder); silent: Speech steps pass on without reading aloud.
 * Component steps call http components at public addresses with fetch; componentRuns (default ['http'])
 * is the kinds a document may use, and allowComponents the IDs the person running it has named, which
 * alone may start an MCP server, in dir (default: here), or reach a private address.
 * Fetch URL steps and a package's files named by url refuse private addresses (publicFetch).
 * memoryDir with learner (a pseudonymous ID, never a name) keeps that learner's memory in
 * memoryDir/<learner>.json; without them Memory steps are skipped. models (modelPlan) replaces models
 * by role and name, in place of model, speechModel and imageModel. conversation carries what a kept
 * conversation remembers (server/runtime.js). A service set to null in `services` is turned off.
 */
export async function runAgent(doc, { input = '', history = [], context = null, pictures = undefined, teaching = null, section = null, agent = null, model = null, speechModel = null, imageModel = null, baseUrl, apiKey, fetch, dir = null, zip = null, knowledge = null, mediaDir = null, audioDir = null, memoryDir = null, learner = null, silent = false, models = null, conversation = null, componentRuns = ['http'], allowComponents = [], services = {}, hooks = {} } = {}) {
  pickAgent(doc, agent);
  const isPackage = doc?.format === 'viable.course-package';
  if (memoryDir) checkLearner(learner);
  const folders = knowledge ? await knowledgeFolders(knowledge) : null;
  return runWithServices(doc, {
    input, history, context, pictures, teaching, section, agent, model, speechModel, imageModel, models, conversation, baseUrl, apiKey, fetch, learner, silent, hooks,
    save: mediaFiles(mediaDir ?? audioDir),
    services: {
      ...(isPackage || folders ? { searchKnowledge: packageKnowledge(isPackage ? doc : null, { dir, fetch: publicFetch(fetch), zip, folders }) } : {}),
      ...(memoryDir ? { memory: memoryFiles(memoryDir) } : {}),
      httpFetch: publicFetch(),
      callComponent: documentComponents({ componentRuns, allowComponents, fetch, dir: dir ?? undefined }),
      ...services
    }
  });
}
