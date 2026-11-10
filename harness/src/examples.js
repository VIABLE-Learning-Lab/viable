/**
 * A problem like the learner's, with other numbers, for a worked example. A model left to pick one sometimes picks numbers
 * that give the learner's own answer, and then the example gives it away. Code picks instead: the same operation and the
 * same shape (the kind of each number, its length, whether the bottoms match, whether a column needs regrouping, whether a
 * division comes out even), none of the learner's numbers, and never their answer. Only for a problem that is one piece of
 * arithmetic (diagnose.js); for any other it returns null and the model chooses, as before. No Node built-ins.
 */
import { readArithmetic } from './diagnose.js';

const gcd = (a, b) => { let [x, y] = [Math.abs(a), Math.abs(b)]; while (y) [x, y] = [y, x % y]; return x || 1; };
// The same draws for the same problem, so a learner who asks twice sees one example and a test can repeat it.
function drawer(text) {
  let seed = 2166136261;
  for (const char of String(text)) seed = Math.imul(seed ^ char.codePointAt(0), 16777619) >>> 0;
  // The high bits: the low ones of a generator like this repeat after a few draws.
  return (low, high) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return low + ((seed >>> 12) % (high - low + 1)); };
}

// What has to stay the same for the example to teach the same thing.
function shapeOf({ a, b, op }) {
  const digitsOf = (x) => (x.kind === 'whole' ? String(x.w).length : x.kind === 'decimal' ? `${x.whole.length}.${x.places}` : x.kind === 'mixed' ? 'm' : 'f');
  const value = (x) => x.value.n / x.value.d;
  const shape = [a.kind, b.kind, a.sign, b.sign, digitsOf(a), digitsOf(b), Math.sign(value(a) - value(b))];
  const fraction = (x) => x.kind === 'fraction' || x.kind === 'mixed';
  if (fraction(a) && fraction(b)) shape.push(a.q === b.q ? 'same' : a.q % b.q === 0 || b.q % a.q === 0 ? 'multiple' : 'unlike', a.p < a.q, b.p < b.q);
  if (a.kind === 'whole' && b.kind === 'whole') {
    const [x, y] = [String(a.w), String(b.w)].map((text) => [...text].reverse().map(Number));
    if (op === '+') shape.push(x.some((digit, at) => digit + (y[at] ?? 0) > 9));
    if (op === '-') shape.push(x.some((digit, at) => digit < (y[at] ?? 0)), /0/.test(String(a.w)));
    if (op === '÷') shape.push(b.w !== 0 && a.w % b.w === 0);
    if (op === '×') shape.push(/0/.test(String(a.w)), /0/.test(String(b.w)));
  }
  return shape.join('|');
}

// One number of the same kind and length, drawn afresh. top: the largest bottom to use, so the example is no harder than theirs.
function another(x, draw, top) {
  const sign = x.sign < 0 ? '-' : '';
  const whole = (length, zero = false) => Array.from({ length }, (_, at) => (at === 0 && !zero ? draw(1, 9) : draw(0, 9))).join('');
  if (x.kind === 'whole') return `${sign}${String(x.w).length === 1 ? draw(2, 9) : whole(String(x.w).length)}`;
  if (x.kind === 'decimal') return `${sign}${x.whole === '0' ? '0' : whole(x.whole.length)}.${Array.from({ length: x.places }, (_, at) => (at === x.places - 1 ? draw(1, 9) : draw(0, 9))).join('')}`;
  const q = draw(2, top);
  const p = x.p < x.q ? draw(1, q - 1) : draw(q + 1, 2 * q);
  return gcd(p, q) === 1 ? `${sign}${x.kind === 'mixed' ? `${draw(1, 9)} ` : ''}${p}/${q}` : null;
}

/**
 * question: the learner's problem. Returns { text, answer } for a problem of the same shape with other numbers, where
 * answer is its right answer as { n, d }, or null when the problem isn't one piece of arithmetic or no such problem turned up.
 */
export function similarProblem(question) {
  const problem = readArithmetic(question);
  if (!problem) return null;
  const { a, b, op, correct } = problem;
  const shape = shapeOf(problem);
  const draw = drawer(`${a.text}${op}${b.text}`);
  const same = (x, y) => x.n === y.n && x.d === y.d;
  const top = Math.max(5, a.q ?? 1, b.q ?? 1) + 2;
  for (let tries = 0; tries < 4000; tries += 1) {
    const [left, right] = [another(a, draw, top), another(b, draw, top)];
    if (!left || !right) continue;
    const text = `${left} ${op} ${right.startsWith('-') ? `(${right})` : right}`;
    const made = readArithmetic(text);
    if (!made || shapeOf(made) !== shape) continue;
    // None of their numbers, and not their answer: an example that ends on it would be the answer.
    if ([made.a, made.b].some((x) => [a.value, b.value, correct].some((y) => same(x.value, y))) || same(made.correct, correct) || [a, b].some((y) => same(made.correct, y.value))) continue;
    if (made.correct.n < 0 !== correct.n < 0 || (made.correct.d === 1) !== (correct.d === 1)) continue;
    return { text, answer: made.correct };
  }
  return null;
}
