/**
 * Suggestions for a graph that runs but is harder to read or change than it needs to be: numbered
 * copies a list would hold, copied steps one step could do for every item, a && b || c used as a
 * choice, and expressions whose code (quoted text aside) is long enough to name in parts. Never errors: validate returns them beside
 * valid: true, and the editor shows the same ones (agentWorkspace.ts in the portal).
 */

import { parseExpression, templateExpressions } from './expression.js';

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
// "image_prompt_2" → ["image_prompt", 2]; "imageTwo" → ["image", 2]; "image" → ["image", 1].
function numbered(name) {
  const digits = /^(.*?[A-Za-z])_?(\d{1,2})$/.exec(name);
  if (digits) return [digits[1], Number(digits[2])];
  const word = /^(.*?[a-z])(One|Two|Three|Four|Five|Six)$/.exec(name) || /^(.*?)_(one|two|three|four|five|six)$/.exec(name);
  if (word) return [word[1], NUMBER_WORDS[word[2].toLowerCase()]];
  return [name, 1];
}

// Names that are copies of one another: at least two sharing a stem, one numbered 2 or more.
function copies(names) {
  const groups = new Map();
  for (const name of names) {
    const [stem, n] = numbered(name);
    if (!groups.has(stem)) groups.set(stem, []);
    groups.get(stem).push({ name, n });
  }
  return [...groups.values()].filter((group) => group.length > 1 && group.some((item) => item.n > 1)).map((group) => group.map((item) => item.name));
}

const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
const BOOLEAN_OPS = new Set(['==', '!=', '===', '!==', '<', '>', '<=', '>=', '&&', '||']);
const yieldsBoolean = (node) => (node.kind === 'binary' && BOOLEAN_OPS.has(node.op)) || (node.kind === 'unary' && node.op === '!') || (node.kind === 'literal' && typeof node.value === 'boolean') || (node.kind === 'group' && yieldsBoolean(node.expr));

// a && b || c where b is a value, not a test: it means "b if a, else c", but gives c when b is empty.
function choiceIdioms(node, found = { count: 0 }) {
  if (!node || typeof node !== 'object') return found;
  if (node.kind === 'binary' && node.op === '||' && node.left.kind === 'binary' && node.left.op === '&&' && !yieldsBoolean(node.left.right)) found.count += 1;
  for (const child of [node.operand, node.left, node.right, node.expr, node.object, node.index, node.test, node.then, node.otherwise, ...(node.args || []), ...(node.items || []), ...(node.entries || []).map((entry) => entry[1])]) choiceIdioms(child, found);
  return found;
}

// How long an expression's code is, quoted text not counted: a long message is not a long calculation.
const codeLength = (expr) => expr.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '""').length;

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out));
  return out;
}

export function suggestGraph(graph) {
  const suggestions = [];
  const nodes = (Array.isArray(graph?.nodes) ? graph.nodes : []).filter((node) => node && typeof node.id === 'string');
  for (const node of nodes) {
    const cfg = node.config || {};
    const fields = node.type === 'llm' && Array.isArray(cfg.outputs) ? cfg.outputs.map((o) => o?.name).filter((name) => typeof name === 'string')
      : node.type === 'transform' && cfg.output && typeof cfg.output === 'object' && !Array.isArray(cfg.output) ? Object.keys(cfg.output)
        : node.type === 'state' && Array.isArray(cfg.assignments) ? cfg.assignments.map((a) => a?.name).filter((name) => typeof name === 'string') : [];
    for (const group of copies(fields)) {
      const message = node.type === 'llm'
        ? `"${node.id}" returns ${list(group)}. One list output holds any number of them (each item with its own fields), and later steps go through it with a picture step's items or a For each step.`
        : `"${node.id}" keeps ${list(group)}. One list holds any number of them, read with where(), pluck() and count().`;
      suggestions.push({ code: 'numbered_copies', node: node.id, message });
    }
    let choices = 0;
    let longest = 0;
    for (const text of strings(cfg)) {
      for (const { expr } of templateExpressions(text)) {
        longest = Math.max(longest, codeLength(expr));
        try { choices += choiceIdioms(parseExpression(expr)).count; } catch { /* run errors say what's wrong */ }
      }
    }
    for (const key of ['expr', 'while']) {
      if (typeof cfg[key] !== 'string') continue;
      longest = Math.max(longest, codeLength(cfg[key]));
      try { choices += choiceIdioms(parseExpression(cfg[key])).count; } catch { /* as above */ }
    }
    if (choices) suggestions.push({ code: 'and_or_choice', node: node.id, message: `"${node.id}" chooses a value with "a && b || c" ${choices === 1 ? 'once' : `${choices} times`}, which gives c whenever b is empty, 0 or false. Write "a ? b : c" (or if(a, b, c)) instead.` });
    if (longest > 400) suggestions.push({ code: 'long_expression', node: node.id, message: `"${node.id}" has a ${longest}-character expression. Work it out in parts as Transform fields, each reading the ones above it by name.` });
  }
  for (const type of ['image', 'llm', 'condition', 'transform', 'state']) {
    for (const group of copies(nodes.filter((node) => node.type === type).map((node) => node.id))) {
      const how = type === 'image' ? 'One picture step with items draws every picture' : 'One For each step runs the same steps for every item';
      suggestions.push({ code: 'copied_steps', node: group[0], message: `${list(group.map((id) => `"${id}"`))} look like copies of one ${type} step. ${how}, so adding one more needs no new step.` });
    }
  }
  return suggestions.slice(0, 30);
}
