// Draws the figures of docs/evidence.md in the other figures' style: docs/images/policy-check.svg and policy-check-steps.svg
// from the kept replies and judgments of the policy check's first experiment (evals/policy-fidelity/runs), policy-check-2.svg and
// policy-check-2-steps.svg from its second (runs-2), and docs/images/diagnosis-checks.svg from the counts that
// evals/diagnosis prints. node harness/scripts/build-evidence-figures.mjs, after a change to either; with --check it
// writes nothing and fails when a figure is not what the data gives.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const images = new URL('../../docs/images/', import.meta.url);
const house = /<style>[\s\S]*?<\/style>/.exec(readFileSync(new URL('where-it-runs.svg', images), 'utf8'))[0].replace(/@media \(prefers-reduced-motion[\s\S]*<\/style>/, '');
// Three outcomes, in three hues that stay apart for colour-blind readers on the light surface and on the dark one.
const style = `${house}:root{--right:#1f47a8;--over:#c2681c;--under:#7d63b5}@media (prefers-color-scheme:dark){:root{--right:#6a8fe6;--over:#c58539;--under:#9177cc}}</style>`;

const check = process.argv.includes('--check');
const put = (name, svg) => (check ? assert.equal(readFileSync(new URL(name, images), 'utf8'), svg, `${name} is out of date: node harness/scripts/build-evidence-figures.mjs`) : writeFileSync(new URL(name, images), svg));
const text = (x, y, size, weight, words, cls = '', anchor = '') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}"${cls ? ` class="${cls}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}>${words}</text>`;
const frame = (height, label, inside) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 ${height}" role="img" aria-label="${label}">\n${style}\n<rect width="1200" height="${height}" rx="22" fill="var(--mist)"/>\n<rect x="40" y="36" width="1120" height="${height - 72}" rx="16" fill="var(--paper)"/>\n${inside}\n</svg>\n`;
const head = (title, lines) => [text(72, 80, 20, 600, title, 'ink'), ...lines.map((line, index) => text(72, 106 + index * 20, 13, 400, line))].join('\n');
const COLUMNS = [972, 1054, 1132];
const BAR = { x: 400, width: 480 };

// Rows that are each a whole split in up to three parts, the numbers beside the bar. A part with no fill is the bare track.
function parts({ title, lines, legend, groups, foot, number }) {
  let y = 106 + lines.length * 20 + 24;
  const out = [head(title, lines)];
  let x = 72;
  for (const { name, fill } of legend) {
    out.push(`<rect x="${x}" y="${y - 11}" width="14" height="14" rx="3" fill="${fill || 'var(--mist)'}"/>${text(x + 22, y + 1, 13, 400, name, 'ink')}`);
    x += 22 + name.length * 7.2 + 30;
  }
  y += 44;
  for (const [at, group] of groups.entries()) {
    if (at) out.push(`<line x1="72" y1="${y - 26}" x2="1128" y2="${y - 26}" class="rule"/>`);
    out.push(text(72, y, 16, 600, group.name, 'ink') + (group.note ? text(72 + group.name.length * 8.7 + 12, y, 13, 400, group.note, 'muted') : ''));
    out.push(legend.map(({ short }, index) => text(COLUMNS[index], y, 12, 600, short, 'muted', 'end')).join(''));
    y += 32;
    for (const row of group.rows) {
      assert(row.parts.reduce((sum, part) => sum + part, 0) <= 1.002, `${row.name}: its parts are more than a whole`);
      out.push(text(72, y + 5, 15, row.strong ? 600 : 400, row.name, row.strong ? 'ink' : ''));
      out.push(`<rect x="${BAR.x}" y="${y - 8}" width="${BAR.width}" height="16" rx="4" fill="var(--mist)"/>`);
      let from = BAR.x;
      for (const [index, part] of row.parts.entries()) {
        const width = part * BAR.width;
        if (legend[index].fill && width >= 3) out.push(`<rect x="${from.toFixed(1)}" y="${y - 8}" width="${(width - 2).toFixed(1)}" height="16" rx="4" fill="${legend[index].fill}"/>`);
        from += width;
        out.push(text(COLUMNS[index], y + 5, index ? 14 : 15, index ? 400 : 600, number(part), index ? '' : 'ink', 'end'));
      }
      y += 30;
    }
    y += 26;
  }
  for (const line of foot) { out.push(text(72, y - 6, 12, 400, line, 'muted')); y += 18; }
  return { height: y + 46, inside: out.join('\n') };
}

// --- The policy check ---------------------------------------------------------------------------------

const reportOf = (...more) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../evals/policy-fidelity/run.mjs', import.meta.url)), 'report', '--split', 'held_out', '--json', ...more], { encoding: 'utf8', maxBuffer: 64e6 }).trim().split('\n').pop());
const report = reportOf();
assert.equal(report.unjudged, 0, 'every reply on the test half has a judgment');
const TUTORS = { A: 'Plain tutor', B: 'Strong prompt', C: 'Strong prompt and a guardrail', D0: 'Harness, policy in words', Dr: 'Harness, policy in code, read by rules', D: 'Harness, policy in code' };
const LEGEND = [{ name: 'The required step', short: 'Required', fill: 'var(--right)' }, { name: 'More help than the policy allows', short: 'More', fill: 'var(--over)' }, { name: 'Less help than it requires', short: 'Less', fill: 'var(--under)' }];
const MODELS = [['gpt-oss-120b', 'open weights'], ['gemma-4-31b-it', 'open weights'], ['gpt-6-luna', '']];
const one = (value) => `${(100 * value).toFixed(1)}%`;
const whole = (value) => `${Math.round(100 * value)}`;
const required = (model, tutor) => report.models[model].by[tutor].exact;
const range = (tutor) => { const values = MODELS.map(([model]) => 100 * required(model, tutor)); return `${Math.round(Math.min(...values))} to ${Math.round(Math.max(...values))}`; };

const policy = parts({
  title: 'Experiment 1: turns on which the tutor did the step the teacher’s policy requires',
  lines: ['60 test conversations of six learner turns for each tutor and reply model. 324 turns require a step.', 'A judge that isn’t told which tutor wrote a reply says what the reply did.'],
  legend: LEGEND,
  groups: MODELS.map(([model, note]) => ({ name: model, note, rows: Object.keys(TUTORS).filter((tutor) => report.models[model].by[tutor]).map((tutor) => { const v = report.models[model].by[tutor]; return { name: TUTORS[tutor], strong: tutor === 'D', parts: [v.exact, v.too_much, v.too_little] }; }) })),
  foot: ['The plain tutor and the Harness read by rules were run on one reply model. The policy: a question before any try, a hint after one, a worked example after two, never the answer.'],
  number: one
});
put('policy-check.svg', frame(policy.height, `Experiment 1. Share of turns on which each tutor did the step the teacher's policy requires, on 60 test conversations and three reply models. A carefully written prompt with a guardrail: ${range('C')} turns in 100. The Harness with the policy decided by code: ${range('D')} in 100. The prompt alone: ${range('B')}. The Harness with the policy in words: ${range('D0')}.`, policy.inside));

// Where the difference comes from: for each step the policy can require, the guardrail and the Harness on one scale.
const STEPS = [['ask', 'a question'], ['hint', 'a hint'], ['example', 'a worked example'], ['confirm', 'saying the answer is right']];
const SCALE = { x: 400, width: 600 };
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const at = (value) => SCALE.x + value * SCALE.width;
function steps(data = report, models = MODELS, [from, fromName] = ['C', 'Strong prompt and a guardrail'], [to, toName] = ['D', 'Harness, policy in code'], title = 'Experiment 1: where the difference comes from', line = 'The share of turns done as required, by the step the policy called for, on three reply models.') {
  const out = [head(title, [line])];
  let y = 150;
  out.push(`<circle cx="80" cy="${y - 4}" r="6" fill="var(--paper)" stroke="var(--muted)" stroke-width="2"/>${text(96, y + 1, 13, 400, fromName, 'ink')}<circle cx="${112 + fromName.length * 7.2}" cy="${y - 4}" r="7" fill="var(--right)"/>${text(128 + fromName.length * 7.2, y + 1, 13, 400, toName, 'ink')}`);
  const top = y + 26;
  const body = [];
  y += 62;
  for (const [index, [act, words]] of STEPS.entries()) {
    const of = data.models[models[0][0]].by[to].by_act[act].of;
    if (index) body.push(`<line x1="72" y1="${y - 26}" x2="1128" y2="${y - 26}" class="rule"/>`);
    body.push(text(72, y, 16, 600, `When the policy calls for ${words}`, 'ink') + text(1128, y, 13, 400, `${of} turns for each tutor`, 'muted', 'end'));
    y += 30;
    // The scale's lines run behind the rows only, so no heading is crossed.
    body.push(TICKS.map((tick) => `<line x1="${at(tick)}" y1="${y - 14}" x2="${at(tick)}" y2="${y - 14 + models.length * 28}" class="rule"/>`).join(''));
    for (const [model] of models) {
      const guard = data.models[model].by[from].by_act[act].exact;
      const harness = data.models[model].by[to].by_act[act].exact;
      const [low, high] = [Math.min(guard, harness), Math.max(guard, harness)];
      body.push(text(72, y + 5, 15, 400, model));
      body.push(`<line x1="${at(low).toFixed(1)}" y1="${y}" x2="${at(high).toFixed(1)}" y2="${y}" stroke="var(--rule)" stroke-width="4" stroke-linecap="round"/>`);
      body.push(`<circle cx="${at(guard).toFixed(1)}" cy="${y}" r="6" fill="var(--paper)" stroke="var(--muted)" stroke-width="2"/><circle cx="${at(harness).toFixed(1)}" cy="${y}" r="7" fill="var(--right)" stroke="var(--paper)" stroke-width="2"/>`);
      // The lower number sits left of its mark and the higher right of its mark, so two close marks never share a label's place.
      const label = (value, side) => text(at(value) + (side === 'left' ? -14 : 14), y + 5, 14, value === harness ? 600 : 400, whole(value), value === harness ? 'ink' : 'muted', side === 'left' ? 'end' : 'start');
      body.push(harness <= guard ? label(harness, 'left') + text(at(guard) + 14, y + 5, 14, 400, whole(guard), 'muted', 'start') : text(at(guard) - 14, y + 5, 14, 400, whole(guard), 'muted', 'end') + label(harness, 'right'));
      y += 28;
    }
    y += 28;
  }
  const grid = TICKS.map((tick) => text(at(tick), top, 12, 400, `${tick * 100}%`, 'muted', 'middle'));
  return { height: y + 30, inside: [out.join('\n'), grid.join('\n'), body.join('\n')].join('\n') };
}
const byStep = steps();
const gain = (act) => MODELS.map(([model]) => `${whole(report.models[model].by.C.by_act[act].exact)} to ${whole(report.models[model].by.D.by_act[act].exact)}`).join(', ');
put('policy-check-steps.svg', frame(byStep.height, `Experiment 1 by the step the policy called for, the prompt with a guardrail against the Harness with the policy in code, on three reply models. A question: ${gain('ask')} turns in 100. A hint: ${gain('hint')}. A worked example: ${gain('example')}, where the guardrail does better. Saying the answer is right: ${gain('confirm')}.`, byStep.inside));

// --- Experiment 2: every model in the tutor open-weight, on the second set of conversations ----------------

const second = new URL('../evals/policy-fidelity/runs-2/', import.meta.url);
let secondSaid = '';
if (existsSync(new URL('replies.jsonl', second))) {
  const run2 = reportOf('--set', fileURLToPath(new URL('../evals/policy-fidelity/conversations-2.json', import.meta.url)), '--out', fileURLToPath(second));
  assert.equal(run2.unjudged, 0, 'every reply of the second experiment has a judgment');
  const OPEN = [['gpt-oss-120b', 'open weights'], ['gemma-4-31b-it', 'open weights']];
  const NAMES = { C: 'Strong prompt and a guardrail', D: 'Harness, policy in code', Dl: 'The same, with a closed-model reviewer' };
  const of = (tutor) => OPEN.map(([model]) => Math.round(100 * run2.models[model].by[tutor].exact)).join(' and ');
  const again = parts({
    title: 'Experiment 2: every model in the tutor open-weight',
    lines: ['60 new conversations of six learner turns for each tutor and reply model. 324 turns require a step.', 'The guardrail, the reviewer and the reader of the conversation are gpt-oss-120b.'],
    legend: LEGEND,
    groups: OPEN.map(([model, note]) => ({ name: model, note, rows: Object.keys(NAMES).filter((tutor) => run2.models[model].by[tutor]).map((tutor) => { const v = run2.models[model].by[tutor]; return { name: NAMES[tutor], strong: tutor === 'D', parts: [v.exact, v.too_much, v.too_little] }; }) })),
    foot: ['In the row with a closed-model reviewer, gpt-6-luna reviews and reads the conversation. It was run on one reply model.'],
    number: one
  });
  put('policy-check-2.svg', frame(again.height, `Experiment 2, with every model in the tutor open-weight, on 60 new conversations. Share of turns done as the policy requires on the two reply models: a carefully written prompt with a guardrail ${of('C')} in 100, the Harness with the policy in code ${of('D')}. With a closed model as reviewer, on one reply model, the Harness did it on ${Math.round(100 * run2.models['gpt-oss-120b'].by.Dl.exact)}.`, again.inside));
  const byStep2 = steps(run2, OPEN, ['D1', 'Harness, without the three changes'], ['D', 'Harness, policy in code'], 'Experiment 2: what three changes to the worked example did', 'The share of turns done as required, by the step the policy called for, on two open-weight reply models.');
  const moved = (act) => OPEN.map(([model]) => `${whole(run2.models[model].by.D1.by_act[act].exact)} to ${whole(run2.models[model].by.D.by_act[act].exact)}`).join(' and ');
  put('policy-check-2-steps.svg', frame(byStep2.height, `Experiment 2 by the step the policy called for, the Harness without three changes to the worked example against the Harness with them, on two open-weight reply models. A question: ${moved('ask')} turns in 100. A hint: ${moved('hint')}. A worked example: ${moved('example')}. Saying the answer is right: ${moved('confirm')}.`, byStep2.inside));
  secondSaid = `, policy-check-2.svg (${of('C')} against ${of('D')}) and policy-check-2-steps.svg`;
}

// --- Computed diagnosis -------------------------------------------------------------------------------

// Counts as evals/diagnosis/ask-a-model.mjs and predict-next.mjs print them (evals/diagnosis/README.md): right, wrong, of.
const NAMED = [['Code, no model', 56, 8, true], ['gpt-6-luna, asked', 57, 17], ['gpt-oss-120b, asked', 50, 27], ['gemma-4-31b-it, asked', 35, 45]];
const NEXT = {
  'Another template': [['Code, no model', 45, 7, true], ['gemma-4-31b-it, asked', 33, 65], ['gpt-oss-120b, asked', 56, 41], ['Code, then gemma-4-31b-it', 60, 39, true], ['Code, then gpt-oss-120b', 63, 34, true]],
  'The same template': [['Code, no model', 60, 6, true], ['gemma-4-31b-it, asked', 58, 42], ['gpt-oss-120b, asked', 79, 19], ['Code, then gemma-4-31b-it', 73, 27, true], ['Code, then gpt-oss-120b', 79, 19, true]]
};
const counted = (rows, of) => rows.map(([name, right, wrong, strong]) => ({ name, strong, parts: [right / of, wrong / of, (of - right - wrong) / of] }));
const diagnosis = parts({
  title: 'Working out a mistake by computing it, against asking a model',
  lines: ['Top: which faulty procedure gives this wrong answer, on the 80 wrong answers of the scorecard’s test half.', 'Below: what the same learner will answer on a second problem, on 100 and 100 pairs from MalruleLib, another team’s library.'],
  legend: [{ name: 'Right', short: 'Right', fill: 'var(--right)' }, { name: 'Wrong', short: 'Wrong', fill: 'var(--over)' }, { name: 'Says nothing', short: 'Nothing', fill: null }],
  groups: [{ name: 'Naming the procedure behind a wrong answer', note: '80 wrong answers', rows: counted(NAMED, 80) }, ...Object.entries(NEXT).map(([name, rows]) => ({ name: `Predicting the next answer: ${name.toLowerCase()}`, note: '100 pairs', rows: counted(rows, 100) }))],
  foot: ['Code applies each of 66 faulty procedures to the problem and names one only when it gives exactly what the learner wrote.', '“Code, then a model” asks the model only where code has no prediction.'],
  number: (value) => `${Math.round(100 * value)}%`
});
put('diagnosis-checks.svg', frame(diagnosis.height, 'Computing a mistake against asking a model. Naming the faulty procedure behind 80 wrong answers: code is right on 70 percent and wrong on 10; gpt-6-luna 71 and 21; gpt-oss-120b 63 and 34; gemma-4-31b-it 44 and 56. Predicting a learner’s next answer on 100 MalruleLib pairs from another template: code is right on 45 percent and wrong on 7; gemma-4-31b-it 33 and 65; gpt-oss-120b 56 and 41; code first and then gemma-4-31b-it 60 and 39; code first and then gpt-oss-120b 63 and 34.', diagnosis.inside));

console.log(`${check ? 'Up to date:' : 'Wrote'} policy-check.svg (${range('C')} against ${range('D')}), policy-check-steps.svg${secondSaid} and diagnosis-checks.svg.`);
