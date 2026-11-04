/**
 * What the commands an operator or an AI drives (inspect, deploy, verify) share. Their exit codes: 0
 * done, 1 what was asked for failed or found a problem, 2 the command was given wrongly. With --json,
 * stdout holds one JSON document, an error included: { error: { message, next } }.
 */
import { parseArgs } from 'node:util';
import { modelPlan, mapOf } from '../server/models.js';
import { readFileSync } from 'node:fs';

/** An error in how the command was given (exit code 2); next says what to do. */
export const usageError = (message, next = null) => Object.assign(new Error(message), { usage: true, next });
/** A failure the person can act on (exit code 1). */
export const stopped = (message, next = null) => Object.assign(new Error(message), { next });

export async function command(argv, options, work) {
  const json = argv.includes('--json');
  try {
    let parsed;
    try { parsed = parseArgs({ args: argv, allowPositionals: true, options: { ...options, json: { type: 'boolean' } } }); } catch (error) { throw usageError(error.message); }
    await work(parsed.values, parsed.positionals);
  } catch (error) {
    process.exitCode = error.usage ? 2 : 1;
    if (json) console.log(JSON.stringify({ error: { message: error.message, next: error.next ?? null } }, null, 2));
    else console.error(`${error.message}${error.next ? `\n\n${error.next}` : ''}`);
  }
}

// The flags that replace models, for each command that takes them.
export const MODEL_OPTIONS = { map: { type: 'string', multiple: true }, models: { type: 'string' }, model: { type: 'string' }, 'reviewer-model': { type: 'string' }, 'speech-model': { type: 'string' }, 'image-model': { type: 'string' } };

/** The plan (modelPlan) those flags say, or null. */
export function planOf(values) {
  let models = null;
  if (values.models) {
    try { models = JSON.parse(readFileSync(values.models, 'utf8')); } catch (error) { throw usageError(`Couldn't read ${values.models} as JSON: ${error.message}`); }
  }
  try {
    return modelPlan({ models, map: mapOf(values.map), model: values.model, reviewerModel: values['reviewer-model'], speechModel: values['speech-model'], imageModel: values['image-model'] });
  } catch (error) { throw usageError(error.message); }
}

// Color only for a person at a terminal: bold for what to read first, dim for what's beside it.
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (tty ? `\x1b[${code}m${text}\x1b[0m` : String(text));
export const bold = paint(1);
export const dim = paint(2);
export const blue = paint(34);
export const green = paint(32);
export const red = paint(31);
export const yellow = paint(33);
export const RULE = '─'.repeat(Math.min(process.stdout.columns || 78, 78));

/** Rows of cells in aligned columns, indented; the last cell may run on. */
export function columns(rows, indent = '  ') {
  const widths = [];
  for (const row of rows) row.slice(0, -1).forEach((cell, at) => { widths[at] = Math.max(widths[at] || 0, plain(cell).length); });
  return rows.map((row) => indent + row.map((cell, at) => (at === row.length - 1 ? cell : cell + ' '.repeat(widths[at] - plain(cell).length + 2))).join('')).join('\n');
}
const plain = (text) => String(text).replace(/\x1b\[[0-9;]*m/g, '');

/** Text wrapped to the rule's width, indented, for sentences in a report. */
export function wrap(text, indent = '  ', first = indent) {
  const width = RULE.length - indent.length;
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((item, at) => (at ? indent : first) + item).join('\n');
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What a file says, on one line: nothing in it can move the terminal's cursor, hide a line or end a comment.
export const oneLine = (value) => String(value).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ');
/** The same, through every string of a report. */
export const plainStrings = (value) => (typeof value === 'string' ? oneLine(value) : Array.isArray(value) ? value.map(plainStrings) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plainStrings(item)])) : value);
