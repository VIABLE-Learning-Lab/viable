#!/usr/bin/env node
/**
 * The same question put to code and to a model: which faulty procedure gives this wrong answer? Code applies each procedure
 * and sees which fits (src/diagnose.js). The model is shown the problem, the learner's answer and the same list of
 * procedures, and picks one or none. Both are scored against the scorecard's labels (scorecard/wrong-answers.json).
 *
 *   OPENAI_BASE_URL=... OPENAI_API_KEY=... node evals/diagnosis/ask-a-model.mjs --models a-model,another [--split held_out] [--kept file.jsonl]
 *
 * --kept names the file of answers already given: they are read from it, and new ones are added to it. With no key set, nothing
 * is asked and the table is printed from that file alone (--out is the same flag, under its first name).
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { diagnose } from '../../src/diagnose.js';
import { openAICompatible } from '../../src/index.js';
import { share } from '../../src/scorecard.js';

const args = process.argv.slice(2);
const flag = (name, otherwise = null) => { const at = args.indexOf(`--${name}`); return at < 0 ? otherwise : args[at + 1]; };
const split = flag('split', 'held_out');
const models = String(flag('models', '')).split(',').filter(Boolean);
const out = flag('kept') ?? flag('out');
const apiKey = process.env.OPENAI_API_KEY_FILE ? readFileSync(process.env.OPENAI_API_KEY_FILE, 'utf8').trim() : process.env.OPENAI_API_KEY;
const call = openAICompatible({ apiKey });

const procedures = [...readFileSync(new URL('../../src/diagnose.js', import.meta.url), 'utf8').matchAll(/\{ id: '([^']+)', does: '([^']+)'/g)].map((found) => ({ id: found[1], does: found[2] }));
const cases = JSON.parse(readFileSync(new URL('../../scorecard/wrong-answers.json', import.meta.url), 'utf8')).cases.filter((item) => item.split === split);
const ASK = (item) => `A learner answered an arithmetic problem wrongly. Decide which faulty procedure they followed.

Problem: ${item.problem}
What the learner wrote: ${item.said}

Faulty procedures, each finishing "their answer is what you get if you ...":
${procedures.map((procedure, index) => `${index + 1}. ${procedure.does}`).join('\n')}

Work the problem by a procedure before you choose it: choose it only if it gives exactly the learner's answer. If none does, or the answer looks like a one-off slip, answer 0.
Answer with JSON only: {"procedure": a number from 0 to ${procedures.length}}`;

// As the scorecard scores it: the name is the labelled one, or it is something else (any name for a slip or for a procedure
// the list doesn't hold counts as something else).
function score(named) {
  const right = cases.filter((item) => Array.isArray(item.expect) && item.expect.includes(named.get(item.id))).length;
  const other = cases.filter((item) => named.get(item.id) && !(Array.isArray(item.expect) && item.expect.includes(named.get(item.id)))).length;
  const slips = cases.filter((item) => item.expect === 'slip');
  return { right: share(right, cases.length), other: share(other, cases.length), slips: `${slips.filter((item) => named.get(item.id)).length} of ${slips.length}` };
}
const row = (name, s) => `| ${name} | ${s.right.percent}% (${s.right.right} of ${s.right.of}; ${s.right.low} to ${s.right.high}) | ${s.other.percent}% (${s.other.right} of ${s.other.of}; ${s.other.low} to ${s.other.high}) | ${s.slips} |`;

console.log(`| On the ${split === 'held_out' ? 'held-out' : 'development'} half | Named as labelled | Named as something else | Slips given a procedure |\n| --- | --- | --- | --- |`);
const byCode = new Map(cases.map((item) => [item.id, diagnose({ question: item.problem, said: item.said })?.id ?? null]));
console.log(row('Code', score(byCode)));
// Code and a model answer the same cases, so their difference is taken case by case, with a 95% interval from drawing the
// cases again (seeded, so it repeats).
const labelled = (item, name) => Array.isArray(item.expect) && item.expect.includes(name);
function paired(named, test) {
  const gaps = cases.map((item) => Number(test(item, byCode.get(item.id))) - Number(test(item, named.get(item.id))));
  const mean = (values) => (100 * values.reduce((sum, value) => sum + value, 0)) / values.length;
  let seed = 20261110;
  const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const drawn = Array.from({ length: 4000 }, () => mean(gaps.map(() => gaps[Math.floor(random() * gaps.length)]))).sort((a, b) => a - b);
  return `${mean(gaps).toFixed(1)} (${drawn[100].toFixed(1)} to ${drawn[3899].toFixed(1)})`;
}
const differences = [];
const notes = [];
const kept = out && existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
for (const model of models) {
  const named = new Map(kept.filter((item) => item.model === model && item.split === split).map((item) => [item.id, item.named]));
  let tokens = 0;
  // With no key, only what was kept is scored: nothing is asked.
  const todo = apiKey ? cases.filter((item) => !named.has(item.id)) : [];
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < todo.length) {
      const item = todo[next]; next += 1;
      try {
        const request = { model, temperature: 0, maxTokens: 4000, messages: [{ role: 'user', content: ASK(item) }] };
        // An endpoint that says "slow down" is asked again, a few times.
        const answer = await call(null, request).catch(async (error) => { if (error?.status !== 429) throw error; await new Promise((resolve) => setTimeout(resolve, 30000)); return call(null, request); });
        tokens += answer.usage.total;
        const number = Number(/"procedure"\s*:\s*(\d+)/.exec(String(answer.content))?.[1]);
        if (!Number.isInteger(number)) continue;
        named.set(item.id, procedures[number - 1]?.id ?? null);
        if (out) appendFileSync(out, `${JSON.stringify({ model, split, id: item.id, named: named.get(item.id) })}\n`);
      } catch (error) {
        console.error(`${model} ${item.id}: ${String(error?.message || error).slice(0, 160)}`);
      }
    }
  }));
  const answered = cases.filter((item) => named.has(item.id)).length;
  console.log(row(`${model}, asked`, score(named)));
  if (answered < cases.length) notes.push(`${model}: ${cases.length - answered} unanswered, counted as no name.`);
  differences.push(`| Code against ${model} | ${paired(named, labelled)} | ${paired(named, (item, name) => Boolean(name) && !labelled(item, name))} |`);
  if (tokens) console.error(`${model}: ${tokens} tokens`);
}
if (notes.length) console.log(`\n${notes.join('\n')}`);
if (differences.length) console.log(`\n| Points of difference on the same answers (95% interval) | Named as labelled | Named as something else |\n| --- | --- | --- |\n${differences.join('\n')}`);
