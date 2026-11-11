// Draws docs/images/scorecard.svg from a run of the scorecard, in the other figures' style (their palette and font).
// node harness/scripts/build-scorecard-figure.mjs, after a change to what the scorecard measures.
import { readFileSync, writeFileSync } from 'node:fs';
import { runScorecard } from '../src/scorecard.js';

const images = new URL('../../docs/images/', import.meta.url);
const style = /<style>[\s\S]*?<\/style>/.exec(readFileSync(new URL('where-it-runs.svg', images), 'utf8'))[0].replace(/@media \(prefers-reduced-motion[\s\S]*<\/style>/, '</style>');
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
const diagnosis = scored.diagnosis.find((row) => row.split === 'held_out');
const policy = scored.policy.find((row) => row.split === 'held_out');
const percent = (right, of) => Math.round((100 * right) / of);
const text = (x, y, size, weight, words, cls = '', anchor = '') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}"${cls ? ` class="${cls}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}>${words}</text>`;
const tick = (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="var(--sage)"/><path d="M${x - 4} ${y} l3 3 l5 -6" fill="none" stroke="var(--pass)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
// A measure on the test half: its name, the share as a bar and a number, and the count below.
const measure = (y, title, right, of, note) => [text(664, y, 15, 600, title, 'ink'), text(1132, y, 15, 600, `${percent(right, of)}%`, 'ink', 'end'), `<rect x="664" y="${y + 10}" width="468" height="10" rx="5" fill="var(--mist)"/><rect x="664" y="${y + 10}" width="${Math.round((468 * right) / of)}" height="10" rx="5" fill="var(--blue)"/>`, text(664, y + 36, 12, 400, note)].join('\n');
const MEASURES = [
  ['Reading the moment, by rules', moments.right, moments.of, `${moments.right} of ${moments.of} English messages read as labelled`],
  ['What review finds of what was planted', review.found.right, review.found.of, `${review.found.right} of ${review.found.of} problems in ${review.projects} projects, and ${review.extra} false alarms`],
  ['The procedure behind a wrong answer, by code', diagnosis.right.right, diagnosis.right.of, `${diagnosis.right.right} of ${diagnosis.right.of} wrong answers named as labelled, ${diagnosis.other.right} named as something else`],
  ['The step a turn requires, by rules', policy.act.right, policy.act.of, `${policy.act.right} of ${policy.act.of} turns in ${policy.conversations} conversations`],
  ['A right answer seen', policy.seen.right, policy.seen.of, `${policy.seen.right} of ${policy.seen.of} turns, and on ${policy.mistaken} of ${policy.others} turns where there is none`]
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 540" role="img" aria-label="The VIABLE Harness scorecard. ${['', '', '', '', '', '', 'Six', 'Seven', 'Eight', 'Nine'][scored.guarantees.length] ?? scored.guarantees.length} guarantees hold on ${checks.toLocaleString('en-US')} checks. On the test half of each set, the rules read ${percent(moments.right, moments.of)} percent of ${moments.of} English messages as labelled, review finds ${percent(review.found.right, review.found.of)} percent of ${review.found.of} planted problems with ${review.extra} false alarms, code names the procedure behind ${percent(diagnosis.right.right, diagnosis.right.of)} percent of ${diagnosis.right.of} wrong answers, and rules decide the step a turn requires on ${percent(policy.act.right, policy.act.of)} percent of ${policy.act.of} turns.">
${style}
<rect width="1200" height="540" rx="22" fill="var(--mist)"/>
<rect x="40" y="36" width="580" height="468" rx="16" fill="var(--paper)"/>
${text(64, 76, 20, 600, 'Guarantees', 'pass')}
${text(596, 76, 14, 600, `${checks.toLocaleString('en-US')} checks, ${failed} failed`, 'ink', 'end')}
${text(64, 100, 13, 400, 'Each has to hold on every case, with a line added that tries to pass for an instruction.')}
${scored.guarantees.map((entry, index) => `${tick(76, 138 + index * 43)}${text(98, 143 + index * 43, 15, 400, SHORT[entry.id], 'ink')}${text(596, 143 + index * 43, 13, 600, entry.checks.toLocaleString('en-US'), 'muted', 'end')}${index ? `<line x1="64" y1="${116 + index * 43}" x2="596" y2="${116 + index * 43}" class="rule"/>` : ''}`).join('\n')}
${text(64, 484, 12, 400, 'What the code does. What a model then does with its instructions is for VETTING and agent tests.', 'muted')}
<rect x="640" y="36" width="520" height="468" rx="16" fill="var(--paper)"/>
${text(664, 76, 20, 600, 'Measured, on the test half', 'ink')}
${text(664, 100, 13, 400, 'Written apart from the code, and split before any result was read.')}
${MEASURES.map(([title, right, of, note], index) => `${index ? `<line x1="664" y1="${116 + index * 66}" x2="1136" y2="${116 + index * 66}" class="rule"/>` : ''}${measure(140 + index * 66, title, right, of, note)}`).join('\n')}
${text(664, 484, 12, 400, 'Invented cases, labelled by a model. Nothing here is about learning.', 'muted')}
</svg>
`;
writeFileSync(new URL('scorecard.svg', images), svg);
console.log(`Wrote docs/images/scorecard.svg: ${checks} checks, ${percent(moments.right, moments.of)}% and ${percent(review.found.right, review.found.of)}%.`);
