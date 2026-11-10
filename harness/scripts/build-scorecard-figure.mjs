// Draws docs/images/scorecard.svg from a run of the scorecard, in the other figures' style (their palette and font).
// node harness/scripts/build-scorecard-figure.mjs, after a change to what the scorecard measures.
import { readFileSync, writeFileSync } from 'node:fs';
import { runScorecard } from '../src/scorecard.js';

const images = new URL('../../docs/images/', import.meta.url);
const style = /<style>[\s\S]*?<\/style>/.exec(readFileSync(new URL('where-it-runs.svg', images), 'utf8'))[0].replace(/@media \(prefers-reduced-motion[\s\S]*<\/style>/, '</style>');
// What the rules read and review found before they were changed from the development halves (docs/scorecard.md).
const BEFORE = { moments: 76, review: 42 };
const SHORT = {
  'words-stay-out': 'A learner’s words never enter what the model is told',
  'limit-always-in': 'The teacher’s limit is in every turn',
  'records-hold-no-words': 'A record holds no one’s words unless asked',
  'no-identity-upstream': 'Nothing naming a learner goes to the model’s endpoint',
  'tools-off-removed': 'A tool switched off is removed, not only forbidden',
  'key-only-to-reviewer': 'An answer key reaches only the reviewer',
  'stated-answer-stopped': 'A reply that states the key is stopped by code',
  'example-holds-no-answer': 'A worked example code chooses never holds the answer'
};

const scored = await runScorecard();
const checks = scored.guarantees.reduce((sum, entry) => sum + entry.checks, 0);
const failed = scored.guarantees.reduce((sum, entry) => sum + entry.failed, 0);
const moments = scored.moments.find((row) => row.split === 'held_out' && row.language === 'en');
const review = scored.review.find((row) => row.split === 'held_out');
const percent = (right, of) => Math.round((100 * right) / of);
const text = (x, y, size, weight, words, cls = '', anchor = '') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}"${cls ? ` class="${cls}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}>${words}</text>`;
const tick = (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="var(--sage)"/><path d="M${x - 4} ${y} l3 3 l5 -6" fill="none" stroke="var(--pass)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
// A measure: what it was before and what it is now, each a bar on the same track.
const bars = (y, title, was, now, of, note) => {
  const width = 440;
  const bar = (at, right, fill, label) => `<rect x="664" y="${at}" width="${width}" height="12" rx="6" fill="var(--mist)"/><rect x="664" y="${at}" width="${Math.round((width * right) / of)}" height="12" rx="6" fill="${fill}"/>${text(1132, at + 11, 14, 600, `${percent(right, of)}%`, label, 'end')}`;
  return [text(664, y, 16, 600, title, 'ink'), text(664, y + 30, 12, 600, 'Before', 'muted'), bar(y + 38, was, 'var(--muted)', 'muted'), text(664, y + 78, 12, 600, 'Now', 'ink'), bar(y + 86, now, 'var(--blue)', 'ink'), text(664, y + 122, 13, 400, note)].join('\n');
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 500" role="img" aria-label="The VIABLE Harness scorecard. ${['', '', '', '', '', '', 'Six', 'Seven', 'Eight', 'Nine'][scored.guarantees.length] ?? scored.guarantees.length} guarantees hold on ${checks.toLocaleString('en-US')} checks. On held-out cases the rules read ${percent(moments.right, moments.of)} percent of ${moments.of} English messages as labelled, up from ${percent(BEFORE.moments, moments.of)} percent, and review finds ${percent(review.found.right, review.found.of)} percent of ${review.found.of} planted problems, up from ${percent(BEFORE.review, review.found.of)} percent, with ${review.extra} false alarms.">
${style}
<rect width="1200" height="500" rx="22" fill="var(--mist)"/>
<rect x="40" y="36" width="580" height="428" rx="16" fill="var(--paper)"/>
${text(64, 76, 20, 600, 'Guarantees', 'pass')}
${text(596, 76, 14, 600, `${checks.toLocaleString('en-US')} checks, ${failed} failed`, 'ink', 'end')}
${text(64, 100, 13, 400, 'Each has to hold on every case, with a line added that tries to pass for an instruction.')}
${scored.guarantees.map((entry, index) => `${tick(76, 136 + index * 38)}${text(98, 141 + index * 38, 15, 400, SHORT[entry.id], 'ink')}${text(596, 141 + index * 38, 13, 600, entry.checks.toLocaleString('en-US'), 'muted', 'end')}${index ? `<line x1="64" y1="${117 + index * 38}" x2="596" y2="${117 + index * 38}" class="rule"/>` : ''}`).join('\n')}
${text(64, 444, 12, 400, 'What the code does. What a model then does with its instructions is for VETTING and agent tests.', 'muted')}
<rect x="640" y="36" width="520" height="428" rx="16" fill="var(--paper)"/>
${text(664, 76, 20, 600, 'Measured, on the test half', 'ink')}
${text(664, 100, 13, 400, 'Written apart from the code, and split before any result was read.')}
${bars(134, 'Reading the moment, by rules', BEFORE.moments, moments.right, moments.of, `${moments.right} of ${moments.of} English messages read as labelled`)}
<line x1="664" y1="272" x2="1136" y2="272" class="rule"/>
${bars(298, 'What review finds of what was planted', BEFORE.review, review.found.right, review.found.of, `${review.found.right} of ${review.found.of} problems in ${review.projects} projects, and ${review.extra} false alarms`)}
${text(664, 446, 12, 400, 'Invented cases, with labels no person has checked yet. Nothing here is about learning.', 'muted')}
</svg>
`;
writeFileSync(new URL('scorecard.svg', images), svg);
console.log(`Wrote docs/images/scorecard.svg: ${checks} checks, ${percent(moments.right, moments.of)}% and ${percent(review.found.right, review.found.of)}%.`);
