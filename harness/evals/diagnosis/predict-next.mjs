#!/usr/bin/env node
/**
 * MalruleLib's own task, done by code: from one wrong answer, say what the same learner will answer on the next problem.
 * Its pairs each hold a problem with the wrong answer one of its procedures gives, and a second problem with that
 * procedure's answer. Code names the procedure behind the first (src/diagnose.js), applies it to the second, and the
 * prediction is right when it is exactly their answer. A model can be asked the same question, for comparison.
 *
 *   node evals/diagnosis/predict-next.mjs malrulelib/data/experiment_pairs.csv
 *   OPENAI_BASE_URL=... OPENAI_API_KEY=... node evals/diagnosis/predict-next.mjs malrulelib/data/experiment_pairs.csv --models an-open-weight-model --sample 200
 *
 * MalruleLib's license allows evaluating models whose weights are public, and no others.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { applyProcedure, diagnose, readArithmetic } from '../../src/diagnose.js';
import { openAICompatible } from '../../src/index.js';
import { parseCsv } from '../../src/resources/csv.js';

const args = process.argv.slice(2);
const flag = (name, otherwise = null) => { const at = args.indexOf(`--${name}`); return at < 0 ? otherwise : args[at + 1]; };
if (!args[0]) { console.error('Give the path to MalruleLib\'s data/experiment_pairs.csv.'); process.exit(2); }

// A number as they or a model write it: 13, -4, 1.40, 7/9, 2 1/3, "(13, 30)" for 13/30. places: how far a decimal was carried.
function numberOf(text) {
  const said = String(text ?? '').replace(/[$,]/g, (mark) => (mark === ',' ? ',' : '')).trim();
  const pair = /^\(?\s*(-?\d+)\s*[,/]\s*(\d+)\s*\)?$/.exec(said);
  if (pair) return { value: Number(pair[1]) / Number(pair[2]), places: null };
  const mixed = /^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(said);
  if (mixed) return { value: (mixed[1] ? -1 : 1) * (Number(mixed[2]) + Number(mixed[3]) / Number(mixed[4])), places: null };
  return /^-?\d*\.?\d+$/.test(said) ? { value: Number(said), places: (/\.(\d+)$/.exec(said)?.[1] ?? '').length || null } : null;
}
const agree = (value, theirs) => Boolean(theirs) && (Math.abs(value - theirs.value) < 1e-9 || (theirs.places !== null && Math.abs(value - theirs.value) <= 0.5 * 10 ** -theirs.places + 1e-9));
const valueOf = (number) => number.n / number.d;

// The pairs code can take: both problems are one piece of arithmetic, read to the same right answers as theirs.
const pairs = parseCsv(readFileSync(args[0], 'utf8')).filter((pair) => {
  const [source, target] = [readArithmetic(pair.source_problem), readArithmetic(pair.target_problem)];
  return source && target && agree(valueOf(source.correct), numberOf(pair.source_correct_answer)) && agree(valueOf(target.correct), numberOf(pair.target_correct_answer)) && numberOf(pair.target_malrule_answer);
});
const kinds = [...new Set(pairs.map((pair) => pair.experiment_type))];
const percent = (part, whole) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : '—');
const table = (name, results) => kinds.map((kind) => {
  const of = results.filter((result) => result.kind === kind);
  return `| ${name} | ${kind.replace('_', ' ')} | ${of.length} | ${percent(of.filter((result) => result.outcome === 'right').length, of.length)} | ${percent(of.filter((result) => result.outcome === 'wrong').length, of.length)} | ${percent(of.filter((result) => result.outcome === 'none').length, of.length)} |`;
}).join('\n');

console.log(`${pairs.length} pairs in scope, of ${parseCsv(readFileSync(args[0], 'utf8')).length}.\n`);
console.log('| | Pairs | | The next answer predicted exactly | Another answer predicted | No prediction |\n| --- | --- | ---: | ---: | ---: | ---: |');
console.log(table('Code', pairs.map((pair) => {
  const found = diagnose({ question: pair.source_problem, said: String(pair.source_malrule_answer) });
  const predicted = found ? applyProcedure(found.id, pair.target_problem) : [];
  const theirs = numberOf(pair.target_malrule_answer);
  return { kind: pair.experiment_type, outcome: !predicted.length ? 'none' : predicted.some((number) => agree(valueOf(number), theirs)) ? 'right' : 'wrong' };
})));

const models = String(flag('models', '')).split(',').filter(Boolean);
if (models.length) {
  const apiKey = process.env.OPENAI_API_KEY_FILE ? readFileSync(process.env.OPENAI_API_KEY_FILE, 'utf8').trim() : process.env.OPENAI_API_KEY;
  const call = openAICompatible({ apiKey });
  const out = flag('out');
  const size = Number(flag('sample', 200));
  // The same pairs each time: every k-th of each kind, in the file's order.
  const sample = kinds.flatMap((kind) => { const of = pairs.filter((pair) => pair.experiment_type === kind); const step = Math.max(1, Math.floor(of.length / (size / kinds.length))); return of.filter((_, index) => index % step === 0).slice(0, size / kinds.length); });
  const kept = out && existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
  for (const model of models) {
    const said = new Map(kept.filter((row) => row.model === model).map((row) => [row.pair, row.answer]));
    const todo = sample.filter((pair) => !said.has(pair.pair_id));
    let next = 0;
    await Promise.all(Array.from({ length: Number(flag('parallel', 4)) }, async () => {
      while (next < todo.length) {
        const pair = todo[next]; next += 1;
        const request = { model, temperature: 0, maxTokens: 4000, messages: [{ role: 'user', content: `A student makes the same kind of mistake each time.\n\nThe student was given: ${pair.source_problem}\nThe student answered: ${pair.source_malrule_answer}\n\nNow the same student is given: ${pair.target_problem}\nWork out what the student will answer, making the same kind of mistake.\nAnswer with JSON only: {"answer": "the student's answer, as a number or a fraction"}` }] };
        try {
          const answer = await call(null, request).catch(async (error) => { if (error?.status !== 429) throw error; await new Promise((resolve) => setTimeout(resolve, 45000)); return call(null, request); });
          const text = /"answer"\s*:\s*"?([^"}]*)"?/.exec(String(answer.content))?.[1]?.trim() ?? '';
          said.set(pair.pair_id, text);
          if (out) appendFileSync(out, `${JSON.stringify({ model, pair: pair.pair_id, answer: text })}\n`);
        } catch (error) {
          console.error(`${model} ${pair.pair_id}: ${String(error?.message || error).slice(0, 140)}`);
        }
      }
    }));
    const asked = (pair) => { const theirs = numberOf(pair.target_malrule_answer); const given = numberOf(said.get(pair.pair_id)); return !given ? 'none' : agree(given.value, theirs) || agree(theirs.value, given) ? 'right' : 'wrong'; };
    console.log(table(`${model}, asked`, sample.map((pair) => ({ kind: pair.experiment_type, outcome: asked(pair) }))));
    // Code where it has a prediction, the model where it has none: what a tutor gets when both are there.
    console.log(table(`Code, then ${model}`, sample.map((pair) => {
      const found = diagnose({ question: pair.source_problem, said: String(pair.source_malrule_answer) });
      const predicted = found ? applyProcedure(found.id, pair.target_problem) : [];
      return { kind: pair.experiment_type, outcome: !predicted.length ? asked(pair) : predicted.some((number) => agree(valueOf(number), numberOf(pair.target_malrule_answer))) ? 'right' : 'wrong' };
    })));
  }
  console.log(table('Code, on the same sample', sample.map((pair) => {
    const found = diagnose({ question: pair.source_problem, said: String(pair.source_malrule_answer) });
    const predicted = found ? applyProcedure(found.id, pair.target_problem) : [];
    return { kind: pair.experiment_type, outcome: !predicted.length ? 'none' : predicted.some((number) => agree(valueOf(number), numberOf(pair.target_malrule_answer))) ? 'right' : 'wrong' };
  })));
}
