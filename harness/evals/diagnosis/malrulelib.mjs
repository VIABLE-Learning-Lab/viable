#!/usr/bin/env node
/**
 * Computed diagnosis against wrong answers that someone else's library generated: MalruleLib (Chen, Liu & Sonkar, 2026,
 * arXiv 2601.03217), 4,991 problems each worked by one of its faulty procedures. It is under a non-commercial, share-alike
 * license, so none of it is in this repository: clone it beside this one and give the path to its data.
 *
 *   git clone https://github.com/sonkar-lab/malrulelib && git -C malrulelib checkout 8ddedfb
 *   node evals/diagnosis/malrulelib.mjs malrulelib/data/raw_data.csv [--rules]
 *
 * No model is called. Nothing needs matching by hand: it asks how many of the problems are in scope, how many of their wrong
 * answers get a name, and whether one of their procedures gets one name of ours (and one of ours, one of theirs).
 */
import { readFileSync } from 'node:fs';
import { diagnose, readArithmetic } from '../../src/diagnose.js';
import { parseCsv } from '../../src/resources/csv.js';

const file = process.argv[2];
if (!file) { console.error('Give the path to MalruleLib\'s data/raw_data.csv.'); process.exit(2); }
const rows = parseCsv(readFileSync(file, 'utf8')).filter((row) => String(row.answers_differ).toLowerCase() === 'true');
// Their key as a number: 13, 1.1 (rounded), "(13, 30)" for 13/30.
const keyOf = (text) => { const pair = /^\(?\s*(-?\d+)\s*[,/]\s*(\d+)\s*\)?$/.exec(String(text).trim()); return pair ? { value: Number(pair[1]) / Number(pair[2]), places: null } : { value: Number(String(text).replace(/^\$/, '')), places: (/\.(\d+)$/.exec(String(text).trim())?.[1] ?? '').length }; };
const agrees = (ours, key) => Number.isFinite(key.value) && (Math.abs(ours - key.value) < 1e-9 || (key.places !== null && Math.abs(ours - key.value) <= 0.5 * 10 ** -key.places + 1e-9));

const count = { problems: rows.length, read: 0, read_wrongly: 0, named: 0 };
const theirs = new Map();
const ours = new Map();
const add = (map, key, other) => { const inner = map.get(key) ?? map.set(key, new Map()).get(key); inner.set(other, (inner.get(other) || 0) + 1); };
for (const row of rows) {
  const problem = readArithmetic(row.problem_text);
  if (!problem) continue;
  if (!agrees(problem.correct.n / problem.correct.d, keyOf(row.correct_answer))) { count.read_wrongly += 1; continue; }
  count.read += 1;
  const id = diagnose({ question: row.problem_text, said: String(row.malrule_answer) })?.id ?? null;
  if (id) { count.named += 1; add(ours, id, row.malrule_id); }
  add(theirs, row.malrule_id, id);
}
const named = (inner) => [...inner].filter(([id]) => id);
const top = (pairs) => Math.max(0, ...pairs.map(([, n]) => n));
const one = [...theirs.values()].reduce((sum, inner) => sum + top(named(inner)), 0);
const back = [...ours.values()].reduce((sum, inner) => sum + top([...inner]), 0);
const percent = (part, whole) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : '—');
console.log(`Problems with a wrong answer: ${count.problems}`);
console.log(`Read as one piece of two-number arithmetic, with the same right answer as theirs: ${count.read} (${percent(count.read, count.problems)}); read with a different right answer: ${count.read_wrongly}`);
console.log(`Their faulty procedures among those: ${theirs.size}, of which ${[...theirs.values()].filter((inner) => named(inner).length).length} have at least one answer named`);
console.log(`Wrong answers named: ${count.named} of ${count.read} (${percent(count.named, count.read)})`);
console.log(`Of those named, carrying the name most often given to their procedure: ${one} (${percent(one, count.named)}); coming from the procedure of theirs that name most often meets: ${back} (${percent(back, count.named)})`);
if (process.argv.includes('--rules')) for (const [id, inner] of [...theirs].sort()) console.log(`${id}: ${[...inner].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name ?? 'not named'} ×${n}`).join(', ')}`);
