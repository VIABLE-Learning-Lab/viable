/**
 * What Ask reaches the web through, when its host gives it: web.read(url) gives { url, title, text, document } (document: not a web page, so it could be a teacher's own class list), and web.search(words, trace)
 * gives { text, sources }, with web.searches() saying whether it may. A server on its own reads pages over its outward fetch, which keeps to
 * public addresses, and has no search. No Node built-ins.
 */
import { fetchAgentUrl } from '../agents/http.js';
import { toMarkdown } from '../markdown.js';

const refused = (message) => Object.assign(new Error(message), { status: 422, code: 'page_unreadable' });

export const NO_WORDS = 'That page has no words a program can read: it may need a browser to show them. Paste the words, or add the file.';

/** Why a page that answered can't be read, in words a teacher can act on. */
export function pageRefusal(status) {
  if ([401, 403, 407, 429].includes(status)) return refused('That site doesn’t let a program read it. Paste the words, or add the file.');
  if ([404, 410].includes(status)) return refused('There’s nothing at that address now. Check the link.');
  return refused(`That site answered with an error (${status}). Try again later, or paste the words.`);
}

/** The reader's own errors name its parts: a teacher hears what to do instead. */
export const plainly = (error) => (/http/.test(String(error?.code || '')) ? refused(error.code === 'http_content_type_not_supported' ? 'That link is a file this can’t read from the web. Add the file instead.' : 'That page couldn’t be opened. Check the address, or paste the words.') : error);

export const webOver = (outward) => ({
  async read(url) {
    const page = await fetchAgentUrl({ url, method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' } }, { httpFetch: outward, toMarkdown, knowledge: true, timeoutMs: 20000 }).catch((error) => { throw plainly(error); });
    if (!page.ok) throw pageRefusal(page.status);
    const text = String(typeof page.data === 'string' ? page.data : page.data?.markdown ?? JSON.stringify(page.data)).trim();
    if (!text) throw refused(NO_WORDS);
    return { url: page.url, title: page.data?.title || '', text, document: typeof page.data?.markdown !== 'string' };
  }
});
