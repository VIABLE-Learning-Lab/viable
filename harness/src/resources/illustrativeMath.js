// Illustrative Mathematics' 6-8 lessons as a knowledge folder, one unit at a time: the CC BY 4.0 edition
// on im.kendallhunt.com, student pages only. Its name and logo aren't under that license.
import { htmlToMarkdown } from '../markdown.js';

const SITE = 'https://im.kendallhunt.com';
const COURSES = { 6: 1, 7: 2, 8: 3 };
const ATTRIBUTION = 'IM 6-8 Math was originally developed by Open Up Resources and authored by Illustrative Mathematics, copyright 2017-2019 by Open Up Resources, licensed under CC BY 4.0. Adaptations and updates are copyright 2019 by Illustrative Mathematics, licensed under CC BY 4.0. https://im.kendallhunt.com';
const invalid = (message) => Object.assign(new Error(message), { code: 'invalid_resource_option', status: 400 });

/** A lesson's student page as Markdown: its lesson, without the site's menus, footer or picture addresses. */
export function lessonMarkdown(html, url) {
  const markdown = htmlToMarkdown(html);
  const start = markdown.search(/^# Lesson/m);
  const end = markdown.search(/^.*IM 6.8 Math was originally developed/m);
  const lesson = markdown.slice(Math.max(start, 0), end > start ? end : undefined).replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => (alt ? `(Picture: ${alt})` : '')).replace(/<\/?p>/g, '').replace(/(\(Picture: [^)\n]*\))\s*(?=\1)/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return `${lesson}\n\nFrom ${url}. ${ATTRIBUTION}\n`;
}

export default {
  id: 'illustrative-mathematics',
  version: 1,
  as: ['knowledge-folder'],
  license: {
    spdx: ['CC-BY-4.0'],
    note: 'Only the IM K-12 Math edition on im.kendallhunt.com is read: CC BY 4.0, with attribution. The v.360 edition is non-commercial and isn\'t read. Illustrative Mathematics\' name and logo aren\'t under the license.',
    source: 'https://illustrativemathematics.org/site-ip-content/'
  },
  fetchOptions: { grade: '6', unit: '1' },
  async fetch(get, { grade, unit }) {
    const course = COURSES[grade];
    if (!course) throw invalid(`--grade takes 6, 7 or 8, not "${grade}".`);
    if (!/^\d{1,2}$/.test(String(unit))) throw invalid(`--unit takes a unit's number, not "${unit}".`);
    const base = `${SITE}/MS/students/${course}/${unit}`;
    const lessons = [...new Set([...(await get.text(`${base}/index.html`)).matchAll(new RegExp(`/MS/students/${course}/${unit}/(\\d+)/index\\.html`, 'g'))].map((match) => match[1]))].sort((a, b) => a - b);
    if (!lessons.length) throw invalid(`Grade ${grade} has no unit ${unit} with lessons at ${base}.`);
    for (const lesson of lessons) {
      const url = `${base}/${lesson}/index.html`;
      get.save(`knowledge/grade-${grade}-unit-${unit}-lesson-${lesson.padStart(2, '0')}.md`, lessonMarkdown(await get.text(url), url));
    }
  },
  use({ folder }) { return { knowledge: `${folder}/knowledge` }; }
};
