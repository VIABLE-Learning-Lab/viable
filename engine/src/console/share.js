/**
 * Sharing a course: its link and each section's, copied or as a QR code, and a poster to print. The address
 * shown is one a class can reach. No Node built-ins.
 */
import { courseAt } from './course.js';
import { esc, hereOnly, qrSvg, reachOf, withForms } from './forms.js';
import { sectionsOf } from '../server/classList.js';

const FROM_WORDS = {
  link: 'Give each class its own link or QR code: a first visit puts them in that section, and people on your class list keep theirs. Someone who comes by the course’s own link is asked which class they’re in, once.',
  choose: 'Learners choose their section on their first visit, and these links choose it for them.',
  roster: 'Your class list says who is in which section, so the course’s link is enough. These links don’t change anyone’s section.',
  none: 'Your class list says who is in which section, so the course’s link is enough. These links don’t change anyone’s section.'
};

const linkRow = (link, name, poster, qr) => `<li class="link-row"><div class="link-what"><strong>${esc(name)}</strong><code>${esc(link)}</code></div><div class="actions"><button class="v-btn is-small" type="button" data-copy="${esc(link)}">Copy link</button>${poster ? `<a class="v-btn is-small" href="${esc(poster)}">Poster</a>` : ''}</div>${qr ? `<details class="link-qr"><summary>QR code</summary>${qrSvg(link, { label: `QR code for ${name}: ${link}` })}</details>` : ''}</li>`;

async function shareBody({ library, store, origin, addresses }, match) {
  const { doc, meta, code } = await courseAt(library, match[1]);
  const sections = await sectionsOf(store, code);
  const reach = reachOf(origin, addresses);
  const link = `${reach.base}/course/${code}`;
  const from = doc.course.sections_from || 'none';
  const takes = ['link', 'choose'].includes(from);
  return {
    title: `Share · ${doc.course.title}`,
    body: `<nav class="crumbs" aria-label="Where you are"><a href="/console/courses">Courses</a> / <a href="/console/courses/${esc(code)}">${esc(doc.course.title)}</a></nav>
<h1>Share</h1>
${meta.status === 'closed' ? '<p class="notice">This course is closed, so its link doesn’t open it. Open it again in Settings.</p>' : ''}
${hereOnly(reach, addresses)}
<section class="block share" aria-labelledby="link-title">
<div class="share-main">
<h2 id="link-title">The course’s link</h2>
<p class="v-note">Learners open this every time: from a bookmark, your learning platform or the QR code. What they can open changes as activities open; the link doesn’t.</p>
<p class="big-link"><code>${esc(link)}</code></p>
<div class="actions"><button class="v-btn is-small" type="button" data-copy="${esc(link)}">Copy link</button><a class="v-btn is-small" href="/console/courses/${esc(code)}/share/poster">Print a poster</a><a class="v-btn is-small" href="/course/${esc(code)}" target="_blank" rel="noopener">Open</a></div>
<p class="v-note">In a learning platform, add it as a link that opens in a new tab: inside a frame, some browsers forget who a learner is between visits.</p>
</div>
${qrSvg(link, { label: `QR code for ${link}` })}
</section>
<section class="block" aria-labelledby="sections-title">
<h2 id="sections-title">A link for each section</h2>
${sections.length ? `<p class="v-note">${esc(FROM_WORDS[from])}</p>
<ul class="link-rows">${sections.map((section) => linkRow(`${link}?section=${encodeURIComponent(section.key)}`, section.name, takes ? `/console/courses/${code}/share/poster?section=${encodeURIComponent(section.key)}` : null, takes)).join('')}</ul>` : `<p class="v-note">No sections yet. For class periods or groups, add them on <a href="/console/courses/${esc(code)}/people">People</a>: each gets its own link here.</p>`}
</section>`,
    css: SHARE_CSS
  };
}

const SHARE_CSS = `.share{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,240px);gap:clamp(20px,4vw,40px);align-items:start}
.share-main{display:grid;gap:12px}
.share .qr{width:100%;height:auto;border-radius:var(--radius-sm)}
.big-link{margin:0}
.big-link code{display:inline-block;padding:8px 12px;border-radius:var(--radius-sm);background:var(--field-mist);color:var(--public-ink);font-size:1rem;overflow-wrap:anywhere}
.link-rows{margin:12px 0 0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.link-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 14px;align-items:center;padding:12px 0;border-bottom:1px solid var(--public-rule)}
.link-what{display:grid;gap:2px;min-width:0}
.link-what strong{color:var(--public-ink);font-weight:600}
.link-what code{font-size:.875rem;overflow-wrap:anywhere}
.link-qr{grid-column:1/-1}
.link-qr summary{color:var(--ink-blue);font-size:.875rem;cursor:pointer}
.link-qr .qr{display:block;width:200px;height:auto;margin-top:8px;border-radius:var(--radius-sm)}
@media (max-width:640px){.share{grid-template-columns:minmax(0,1fr)}.share .qr{max-width:260px}.link-row{grid-template-columns:minmax(0,1fr)}}`;

// What a learner needs at the door, by how the course asks. The server's own way of knowing them says nothing here.
const SAY_ON_POSTER = (doc, signIn) => {
  const course = doc.course;
  if (signIn) return '';
  if (course.identify === 'code') return 'Have your personal code ready.';
  if (course.identify === 'ask') return course.identify_ask === 'name' || !course.identify_ask ? 'You’ll be asked your name the first time.' : 'You’ll be asked your student ID the first time.';
  return '';
};

async function posterBody({ library, store, origin, addresses, signIn, url }, match) {
  const { doc, code } = await courseAt(library, match[1]);
  const sections = await sectionsOf(store, code);
  const section = sections.find((item) => item.key === url.searchParams.get('section')) || null;
  const reach = reachOf(origin, addresses);
  const link = `${reach.base}/course/${code}${section ? `?section=${encodeURIComponent(section.key)}` : ''}`;
  const line = SAY_ON_POSTER(doc, signIn);
  return {
    title: `Poster · ${doc.course.title}`,
    body: `<div class="no-print"><nav class="crumbs" aria-label="Where you are"><a href="/console/courses">Courses</a> / <a href="/console/courses/${esc(code)}">${esc(doc.course.title)}</a> / <a href="/console/courses/${esc(code)}/share">Share</a></nav>
${hereOnly(reach, addresses)}
<div class="actions poster-do"><button class="v-btn is-primary" type="button" data-print>Print</button></div></div>
<article class="poster" aria-label="The poster">
<h1>${esc(doc.course.title)}</h1>
${section ? `<p class="poster-section">${esc(section.name)}</p>` : ''}
<p class="poster-say">Scan this with your phone or tablet.</p>
${qrSvg(link, { label: `QR code for ${link}` })}
<p class="poster-link">Or go to <strong>${esc(link.replace(/^https?:\/\//, ''))}</strong></p>
${line ? `<p class="poster-say">${esc(line)}</p>` : ''}
</article>`,
    css: `.poster-do{margin-top:14px}.poster{display:grid;justify-items:center;gap:14px;margin-top:24px;padding:clamp(20px,5vw,48px);border:1px solid var(--public-rule);border-radius:var(--radius);background:var(--surface);text-align:center}.poster h1{font-size:clamp(2rem,6vw,3.4rem);line-height:1.1}.poster-section{margin:0;color:var(--public-ink);font-size:1.5rem}.poster-say{margin:0;color:var(--public-text);font-size:1.25rem}.poster .qr{width:min(100%,380px);height:auto}.poster-link{margin:0;color:var(--public-text);font-size:1.125rem;overflow-wrap:anywhere}.poster-link strong{color:var(--public-ink)}
@media print{@page{margin:14mm}.side,.no-print{display:none!important}.console{display:block}.page{max-width:none;padding:0}.poster{margin:0;border:0;min-height:90vh;align-content:center}.poster .qr{width:120mm}}`
  };
}

export const sharePages = [
  { id: 'course-share', title: 'Share', section: 'courses', nav: false, match: /^courses\/([\w-]+)\/share$/, render: withForms(shareBody), api: [] },
  { id: 'course-poster', title: 'Poster', section: 'courses', nav: false, match: /^courses\/([\w-]+)\/share\/poster$/, render: withForms(posterBody), api: [] }
];
