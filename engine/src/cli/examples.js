// The example courses as the console offers them, on a host with the repository's files beside it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
// A file an example names by its address that is in this folder too is read from here.
const nearby = (doc) => ({
  ...doc,
  files: (doc.files || []).map((file) => {
    const tail = String(file.url || '').split('/').slice(-2).join('/');
    const { url: _url, ...rest } = file;
    return tail && existsSync(`${DIR}${tail}`) ? { ...rest, path: tail } : existsSync(`${DIR}files/${tail}`) ? { ...rest, path: `files/${tail}` } : file;
  })
});

export function localExamples() {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR).filter((name) => name.endsWith('.json')).sort().flatMap((name) => {
    const doc = JSON.parse(readFileSync(`${DIR}${name}`, 'utf8'));
    return doc.course ? [{ id: name.replace(/\.json$/, ''), title: doc.title || doc.course.title, summary: doc.description || null, read: async () => ({ doc: nearby(doc), dir: DIR }) }] : [];
  });
}
