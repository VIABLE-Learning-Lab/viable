// What Works Clearinghouse practice guides as a knowledge folder: each guide's recommendations with
// their evidence ratings, from its page. The guides' full text is in PDFs, which a local run doesn't read.
import { decodeEntities as decodeHTML } from '../markdown.js';

const SITE = 'https://ies.ed.gov';
const LIST = `${SITE}/ncee/wwc/practiceguides`;
const plain = (html) => decodeHTML(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** A guide's page as Markdown, or null when it lists no recommendations. */
export function guideMarkdown(html, url) {
  const title = plain(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').replace(/^WWC\s*\|\s*/, '');
  // An attribute's text is escaped twice on these pages.
  const summary = plain(decodeHTML(/<meta name="description" content="([^"]*)"/i.exec(html)?.[1] || ''));
  const released = plain(/Released:\s*([^<]*)/i.exec(html)?.[1] || '');
  const recommendations = [...html.matchAll(/<div id="pgr(\d+)" class="pgr[\s\S]*?(?=<div id="pgr\d+DetailContainer")/g)].map(([block, number]) => ({
    number,
    evidence: /alt="([^"]*Evidence[^"]*)"/i.exec(block)?.[1] || null,
    text: plain(/<div class="pgrText">([\s\S]*?)<\/div>/.exec(block)?.[1] || ''),
    more: new RegExp(`<div id="pgr${number}Detail"[\\s\\S]*?<a href="([^"]*)"`).exec(html)?.[1] || null
  })).filter((item) => item.text);
  if (!recommendations.length) return null;
  return [
    `# ${title}`, '',
    `A What Works Clearinghouse practice guide${released ? `, released ${released}` : ''}: ${url}. A U.S. government work, in the public domain.`, '',
    ...(summary ? [summary, ''] : []),
    ...recommendations.flatMap((item) => [
      `## Recommendation ${item.number}${item.evidence ? ` (${item.evidence})` : ''}`, '',
      item.text, '',
      ...(item.more ? [`More in the guide: ${new URL(item.more, SITE).href}`, ''] : [])
    ])
  ].join('\n');
}

export default {
  id: 'wwc-practice-guides',
  version: 1,
  as: ['knowledge-folder'],
  async fetch(get) {
    const numbers = [...new Set([...(await get.text(LIST)).matchAll(/PracticeGuide\/(\d+)/gi)].map((match) => match[1]))];
    if (!numbers.length) throw Object.assign(new Error(`${LIST} lists no guides: its page may have changed.`), { code: 'resource_unreadable', status: 502 });
    for (const number of numbers) {
      const url = `${SITE}/ncee/wwc/PracticeGuide/${number}`;
      const markdown = guideMarkdown(await get.text(url), url);
      // Named by its title: a citation shows the file's name.
      if (markdown) get.save(`knowledge/${markdown.split('\n')[0].slice(2).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)}.md`, markdown);
    }
  },
  use({ folder }) { return { knowledge: `${folder}/knowledge` }; }
};
