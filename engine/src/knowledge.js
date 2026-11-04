/**
 * Knowledge search on a machine with a disk: server/search.js, with a package's files read from its
 * folder, and an agent file's knowledge bases, named by VIABLE's IDs, searched in local folders
 * (knowledgeFolders).
 */
import { readFile, readdir, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { failure, searchPackage } from './server/search.js';
import { readsAsText } from './utils/textFormats.js';

export { chunkText, rankByKeywords, readsLocally, searchTerms } from './server/search.js';

// A package's paths stay inside its own folder, symbolic links followed: a package can't read the
// rest of the machine into a prompt.
export async function readInFolder(name, dir) {
  const outside = (from, to) => { const inside = relative(from, to); return !inside || inside.startsWith('..') || isAbsolute(inside); };
  const path = resolve(dir, name);
  if (outside(resolve(dir), path)) throw failure('its path is outside the package\'s folder.');
  let real;
  try { real = await realpath(path); } catch { throw failure('there is no such file in the package\'s folder.'); }
  if (outside(await realpath(dir), real)) throw failure('its path is outside the package\'s folder.');
  return new Uint8Array(await readFile(real));
}

/** searchKnowledge for a course package whose files named by path are in dir, or in the bytes of its .viable.zip (zip). */
export const packageKnowledge = (pkg, options = {}) => searchPackage(pkg, { readPath: readInFolder, ...options });

/**
 * Knowledge bases kept in local folders, for an agent file whose steps name VIABLE's knowledge bases
 * by ID (--knowledge <id>=<folder>; { id: folder } in runAgent): each folder's text, Markdown, CSV,
 * JSON and HTML files, subfolders included (hidden files and links left out), become that knowledge
 * base's files, searched as a package's own are. Returns what packageKnowledge's folders takes, and
 * skipped: the files of each folder that aren't read. A folder with no readable file is an error.
 */
export async function knowledgeFolders(folders) {
  const files = [];
  const knowledgeBases = [];
  const dirs = new Map();
  const skipped = {};
  for (const [id, folder] of Object.entries(folders || {})) {
    const root = resolve(folder);
    let entries;
    try { entries = await readdir(root, { recursive: true, withFileTypes: true }); } catch (error) {
      throw failure(`Knowledge base "${id}": couldn't read the folder ${root} (${error.code || error.message}).`, 'knowledge_folder_unreadable');
    }
    const names = entries.filter((entry) => entry.isFile()).map((entry) => relative(root, join(entry.parentPath, entry.name)))
      .filter((name) => !name.split(sep).some((part) => part.startsWith('.'))).sort();
    const refs = [];
    for (const name of names) {
      if (!readsAsText(name)) { (skipped[id] ||= []).push(name); continue; }
      // A file ref of the form id:path; a package's refs have no colon, so none can clash.
      refs.push(`${id}:${name}`);
      files.push({ ref: `${id}:${name}`, name: basename(name), path: name });
    }
    if (!refs.length) throw failure(`Knowledge base "${id}": ${root} has no text, Markdown, CSV, JSON or HTML file${skipped[id] ? ` (PDF and Office files such as ${skipped[id][0]} aren't read: save them as text or Markdown)` : ''}.`, 'knowledge_folder_empty');
    knowledgeBases.push({ ref: id, name: id, file_refs: refs });
    dirs.set(id, root);
  }
  return { files, knowledge_bases: knowledgeBases, dirs, skipped };
}
