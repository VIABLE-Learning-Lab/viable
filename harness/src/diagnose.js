/**
 * Which faulty procedure gives a learner's wrong answer, worked out by code. For a problem that is one piece of
 * arithmetic (two numbers and an operation), each procedure below is applied to the numbers, and one whose result is
 * exactly what the learner wrote is what their answer shows. Matching a learner's words to a list of misconceptions
 * found the right one on 4 turns of 19; this doesn't read their words, only their answer.
 *
 * The idea is as old as BUGGY (Brown & Burton, 1978), and MalruleLib (Chen, Liu & Sonkar, 2026) holds far more
 * procedures than these. It is under a non-commercial license, so none of it is here: these few are the ones every
 * teacher of the topic knows, written from the classroom research on fractions, decimals and signed numbers.
 * It names nothing when no procedure fits, and a slip looks like nothing. How often it names the right one is measured
 * on cases it wasn't written from (docs/scorecard.md): a change here is tried on that set's development half only.
 * No Node built-ins.
 */

const gcd = (a, b) => { let [x, y] = [Math.abs(a), Math.abs(b)]; while (y) [x, y] = [y, x % y]; return x || 1; };
// An exact number: n over d, d above zero.
const num = (n, d = 1) => { if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null; const sign = d < 0 ? -1 : 1; const g = gcd(n, d); return { n: (sign * n) / g, d: (sign * d) / g }; };
const same = (x, y) => Boolean(x && y) && x.n === y.n && x.d === y.d;
const add = (x, y) => num(x.n * y.d + y.n * x.d, x.d * y.d);
const sub = (x, y) => num(x.n * y.d - y.n * x.d, x.d * y.d);
const mul = (x, y) => num(x.n * y.n, x.d * y.d);
const div = (x, y) => (y.n ? num(x.n * y.d, x.d * y.n) : null);
const OPS = { '+': add, '-': sub, '×': mul, '÷': div };
const lcm = (a, b) => (a * b) / gcd(a, b);
const digits = (text) => Number(String(text).replace(/\D/g, '') || '0');

// One number as written: 2 1/3, 3/4, 0.45, -7, (-7). Keeps how it was written, since the procedures work on that.
const OPERAND = String.raw`\(?\s*[-−]?\s*(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d*\.\d+|\d+)\s*\)?`;
function read(text) {
  const raw = String(text).replace(/[()\s]+/g, ' ').trim();
  const negative = /^[-−]/.test(raw);
  const body = raw.replace(/^[-−]\s*/, '');
  const sign = negative ? -1 : 1;
  const minus = negative ? '-' : '';
  let found;
  if ((found = /^(\d+) (\d+) ?\/ ?(\d+)$/.exec(body))) {
    const [w, p, q] = found.slice(1).map(Number);
    return q ? { kind: 'mixed', sign, w, p, q, value: num(sign * (w * q + p), q), text: `${minus}${w} ${p}/${q}` } : null;
  }
  if ((found = /^(\d+) ?\/ ?(\d+)$/.exec(body))) {
    const [p, q] = found.slice(1).map(Number);
    return q ? { kind: 'fraction', sign, w: 0, p, q, value: num(sign * p, q), text: `${minus}${p}/${q}` } : null;
  }
  if ((found = /^(\d*)\.(\d+)$/.exec(body))) return { kind: 'decimal', sign, whole: found[1] || '0', after: found[2], places: found[2].length, value: num(sign * digits(found[1] + found[2]), 10 ** found[2].length), text: `${minus}${found[1] || '0'}.${found[2]}` };
  if ((found = /^(\d+)$/.exec(body))) return { kind: 'whole', sign, w: Number(body), p: 0, q: 1, whole: body, after: '', places: 0, value: num(sign * Number(body)), text: `${minus}${Number(body)}` };
  return null;
}

/** A problem that is one piece of arithmetic: { a, b, op, correct }, or null for anything else. */
export function readArithmetic(question) {
  // x between two numbers is times; before a minus sign or a letter it is a letter (3x - 4).
  const text = String(question ?? '').replace(/[xX*·]/g, (mark, at, all) => (/\d\s*$/.test(all.slice(0, at)) && /^\s*[(\d.]/.test(all.slice(at + 1)) ? '×' : mark)).replace(/−/g, '-');
  // A root, a power, an absolute value or an equation is more than two numbers and a sign.
  if (/[√|^=²³¹⁰⁴-⁹]/.test(text.replace(/=\s*\??\s*$/, ''))) return null;
  const found = [...text.matchAll(new RegExp(`(${OPERAND})\\s*([+\\-×÷])\\s*(${OPERAND})`, 'g'))];
  if (found.length !== 1) return null;
  // More after it (a third number, a letter, a percent sign) or before it makes it another problem than these two numbers.
  const [before, after] = [text.slice(0, found[0].index + found[0][0].length - found[0][0].trimStart().length), text.slice(found[0].index + found[0][0].length)];
  if (/^\s*(?:[+\-×÷^%]|[a-z]\b)/i.test(after) || /(?:[\d)]\s*[+\-×÷]\s*|[\d.a-z/(]|\bof\s+)$/i.test(before)) return null;
  // Any other number in it (a word problem's, a second part's) means these two aren't the whole problem.
  if (/\d/.test(before) || /\d/.test(after)) return null;
  const [, left, op, right] = found[0];
  const a = read(left);
  const b = read(right);
  if (!a || !b) return null;
  const correct = OPS[op](a.value, b.value);
  return correct ? { a, b, op, correct } : null;
}

// What the learner may be offering as their answer: the numbers they wrote that aren't the problem's own, the last first
// ("2/12 because 1+1 is 2" offers 2/12, and ends on a 2).
function offered(said, problem) {
  const all = [...String(said ?? '').replace(/−/g, '-').matchAll(new RegExp(OPERAND, 'g'))].map((found) => read(found[0])).filter(Boolean);
  const own = all.filter((item) => item.text !== problem.a.text && item.text !== problem.b.text).reverse();
  // Where every number they wrote is one of the problem's own, it is still their answer if it stands alone (7/9 for 1/9 × 7/9)
  // or ends a line of working ("8-3=5"). Two of the problem's numbers side by side is the problem said back.
  return own.length || !(all.length === 1 || /=\s*[^=]+$/.test(String(said).trim())) ? own : all.slice(-1);
}

// A learner's decimal is often a longer one cut short: 7.11 for 64/9. It is that number if rounding or cutting the number to
// as many places gives what they wrote, and the number doesn't already end within those places.
function cutShort(theirs, value) {
  if (theirs.kind !== 'decimal' || !value) return false;
  const scale = 10 ** theirs.places;
  if ((value.n * scale) % value.d === 0) return false;
  const exact = (Math.abs(value.n) * scale) / value.d;
  const wrote = Math.abs(theirs.value.n) * (scale / theirs.value.d);
  return Math.sign(value.n) === Math.sign(theirs.value.n || value.n) && (Math.round(exact) === wrote || Math.floor(exact) === wrote);
}

// A procedure's result as it leaves it: a fraction not yet simplified ({ n, d }), or exactly as written ({ text }).
const raw = (n, d) => (Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? { n, d, raw: true } : null);
const written = (text) => { const item = read(text); return item ? { ...item.value, text: item.text } : null; };
const lowest = (item) => item.kind === 'whole' || item.kind === 'decimal' || gcd(item.p, item.q) === 1;
// Whether what the learner wrote is this result: the same value, and written as the procedure leaves it or in a form of
// their own choosing (simplified, a mixed number, a decimal). Another unsimplified form of the same value is a different sum.
function isResult(theirs, result) {
  if (result.text != null) return theirs.text === result.text;
  if (cutShort(theirs, num(result.n, result.d))) return true;
  if (!same(theirs.value, num(result.n, result.d))) return false;
  if (!result.raw) return true;
  return lowest(theirs) || (theirs.kind === 'fraction' && theirs.sign * theirs.p === result.n && theirs.q === result.d) || theirs.kind === 'mixed';
}

const isFraction = (x) => x.kind === 'fraction' || x.kind === 'mixed';
const fractions = (a, b) => (isFraction(a) || isFraction(b)) && a.kind !== 'decimal' && b.kind !== 'decimal';
const plainFractions = (a, b) => a.kind === 'fraction' && b.kind === 'fraction';
const decimals = (a, b) => (a.kind === 'decimal' || b.kind === 'decimal') && !isFraction(a) && !isFraction(b);
const wholes = (a, b) => a.kind === 'whole' && b.kind === 'whole';
const signed = (a, b) => wholes(a, b) && (a.sign < 0 || b.sign < 0);
const unsigned = (a, b) => wholes(a, b) && a.sign > 0 && b.sign > 0;
// A mixed number or a whole as a top over its bottom, the way it should be changed.
const top = (x) => x.w * x.q + x.p;
const part = (x) => num(x.p, x.q);
const fromText = (text) => (text === '' || text === '-' ? null : num(Number(text)));
const decimalFrom = (wholePart, afterPart) => num(digits(`${wholePart}${afterPart}`), 10 ** String(afterPart).length);
// Two numbers written one above the other with the points lined up: their digits, and how many come after the point.
const columns = (a, b) => { const places = Math.max(a.places, b.places); const width = Math.max(a.whole.length, b.whole.length) + places; const row = (x) => (x.whole + x.after.padEnd(places, '0')).padStart(width, '0'); return { x: [...row(a)].map(Number), y: [...row(b)].map(Number), places }; };
const fromColumns = (row, places) => num(Number(row.join('')), 10 ** places);
const positive = (a, b) => a.sign > 0 && b.sign > 0 && !isFraction(a) && !isFraction(b);
// 10, 100, 0.1, 0.01: how many places it moves the point (2 for 100, -1 for 0.1), or 0 for any other number.
const tenShift = (x) => { const { n, d } = x.value; const power = (k) => (k > 1 && /^10+$/.test(String(k)) ? String(k).length - 1 : 0); return d === 1 ? power(n) : n === 1 ? -power(d) : 0; };
// A number as a decimal that ends: { whole, after }, or null when it doesn't end.
function asDecimal(value) {
  let places = 0;
  while (places <= 8 && (value.n * 10 ** places) % value.d !== 0) places += 1;
  if (places > 8 || value.n < 0) return null;
  const all = String((value.n * 10 ** places) / value.d).padStart(places + 1, '0');
  return { whole: all.slice(0, all.length - places), after: all.slice(all.length - places) };
}

// Each: when it can be meant, what it gives, and what it does in words that finish "it is what you get if you …".
// In order of how often teachers meet them, since the first that fits is the one named.
const PROCEDURES = [
  // Fractions, adding and subtracting.
  { id: 'tops-and-bottoms', does: 'add the tops and add the bottoms', fits: ({ a, b, op }) => plainFractions(a, b) && op === '+' && a.q !== b.q, gives: ({ a, b }) => raw(a.p + b.p, a.q + b.q) },
  { id: 'tops-and-bottoms-subtracted', does: 'subtract the tops and subtract the bottoms', fits: ({ a, b, op }) => plainFractions(a, b) && op === '-' && a.q !== b.q, gives: ({ a, b }) => raw(a.p - b.p, a.q - b.q) },
  { id: 'tops-added-like-bottoms-too', does: 'add the tops and add the bottoms, even though the bottoms are the same', fits: ({ a, b, op }) => plainFractions(a, b) && op === '+' && a.q === b.q, gives: ({ a, b }) => raw(a.p + b.p, a.q + b.q) },
  { id: 'tops-added-bottoms-multiplied', does: 'add the tops and multiply the bottoms', fits: ({ a, b, op }) => plainFractions(a, b) && op === '+' && a.q !== b.q, gives: ({ a, b }) => raw(a.p + b.p, a.q * b.q) },
  { id: 'tops-subtracted-bottoms-multiplied', does: 'subtract the tops and multiply the bottoms', fits: ({ a, b, op }) => plainFractions(a, b) && op === '-' && a.q !== b.q, gives: ({ a, b }) => raw(a.p - b.p, a.q * b.q) },
  { id: 'common-bottom-tops-unchanged', does: 'find a common bottom but leave the tops as they were', fits: ({ a, b, op }) => plainFractions(a, b) && '+-'.includes(op) && a.q !== b.q && lcm(a.q, b.q) !== a.q * b.q, gives: ({ a, b, op }) => raw(op === '+' ? a.p + b.p : a.p - b.p, lcm(a.q, b.q)) },
  { id: 'tops-combined-one-bottom-kept', does: 'add or subtract the tops and keep one of the bottoms', fits: ({ a, b, op }) => plainFractions(a, b) && '+-'.includes(op) && a.q !== b.q, gives: ({ a, b, op }) => [raw(op === '+' ? a.p + b.p : a.p - b.p, a.q), raw(op === '+' ? a.p + b.p : a.p - b.p, b.q)] },
  { id: 'multiplied-instead-of-added', does: 'multiply the fractions instead of adding them', fits: ({ a, b, op }) => plainFractions(a, b) && op === '+', gives: ({ a, b }) => mul(a.value, b.value) },
  // Fractions, multiplying and dividing.
  { id: 'divided-without-turning-over', does: 'multiply straight across instead of turning the second fraction over', fits: ({ a, b, op }) => fractions(a, b) && op === '÷', gives: ({ a, b }) => mul(a.value, b.value) },
  { id: 'turned-the-first-over', does: 'turn the first fraction over instead of the second', fits: ({ a, b, op }) => fractions(a, b) && op === '÷' && a.value.n !== 0, gives: ({ a, b }) => div(b.value, a.value) },
  { id: 'cross-multiplied', does: 'multiply across the corners, which is dividing', fits: ({ a, b, op }) => plainFractions(a, b) && op === '×', gives: ({ a, b }) => div(a.value, b.value) },
  { id: 'multiplied-tops-kept-bottom', does: 'multiply the tops and keep the bottom', fits: ({ a, b, op }) => plainFractions(a, b) && op === '×' && a.q === b.q, gives: ({ a, b }) => raw(a.p * b.p, a.q) },
  { id: 'common-bottom-when-multiplying', does: 'find a common bottom, multiply the tops and keep that bottom', fits: ({ a, b, op }) => plainFractions(a, b) && op === '×', gives: ({ a, b }) => { const bottom = lcm(a.q, b.q); return num((a.p * bottom) / a.q * ((b.p * bottom) / b.q), bottom); } },
  { id: 'added-instead-of-multiplied', does: 'add the fractions instead of multiplying them', fits: ({ a, b, op }) => plainFractions(a, b) && op === '×', gives: ({ a, b }) => add(a.value, b.value) },
  { id: 'whole-times-bottom', does: 'multiply the bottom by the whole number instead of the top', fits: ({ a, b, op }) => op === '×' && ((a.kind === 'whole' && b.kind === 'fraction') || (a.kind === 'fraction' && b.kind === 'whole')), gives: ({ a, b }) => (a.kind === 'whole' ? raw(b.p, a.w * b.q) : raw(a.p, b.w * a.q)) },
  { id: 'whole-times-top-and-bottom', does: 'multiply both the top and the bottom by the whole number', fits: ({ a, b, op }) => op === '×' && ((a.kind === 'whole' && b.kind === 'fraction') || (a.kind === 'fraction' && b.kind === 'whole')), gives: ({ a, b }) => (a.kind === 'whole' ? raw(a.w * b.p, a.w * b.q) : raw(b.w * a.p, b.w * a.q)) },
  { id: 'one-off-the-whole-fraction-kept', does: 'take one off the whole number and write the fraction beside it unchanged', fits: ({ a, b, op }) => op === '-' && a.kind === 'whole' && a.sign > 0 && a.w >= 1 && b.kind === 'fraction' && b.sign > 0 && b.p < b.q, gives: ({ a, b }) => add(num(a.w - 1), part(b)) },
  // Mixed numbers.
  { id: 'whole-added-to-top', does: 'turn a mixed number into a fraction by adding the whole to the top', fits: ({ a, b }) => (a.kind === 'mixed' || b.kind === 'mixed') && a.kind !== 'decimal' && b.kind !== 'decimal', gives: ({ a, b, op }) => OPS[op](a.kind === 'mixed' ? num(a.w + a.p, a.q) : a.value, b.kind === 'mixed' ? num(b.w + b.p, b.q) : b.value) },
  { id: 'whole-times-top', does: 'turn a mixed number into a fraction by multiplying the whole by the top', fits: ({ a, b }) => (a.kind === 'mixed' || b.kind === 'mixed') && a.kind !== 'decimal' && b.kind !== 'decimal', gives: ({ a, b, op }) => OPS[op](a.kind === 'mixed' ? num(a.w * a.p + a.q, a.q) : a.value, b.kind === 'mixed' ? num(b.w * b.p + b.q, b.q) : b.value) },
  { id: 'top-left-out-of-improper', does: 'turn a mixed number into a fraction by multiplying the whole by the bottom and forgetting to add the top', fits: ({ a, b }) => (a.kind === 'mixed' || b.kind === 'mixed') && a.kind !== 'decimal' && b.kind !== 'decimal', gives: ({ a, b, op }) => OPS[op](a.kind === 'mixed' ? num(a.w) : a.value, b.kind === 'mixed' ? num(b.w) : b.value) },
  { id: 'borrowed-ten-into-top', does: 'borrow one from the whole number and add ten to the top, as with whole numbers', fits: ({ a, b, op }) => op === '-' && a.kind === 'mixed' && isFraction(b) && a.q === b.q && a.p < b.p && a.q !== 10 && a.sign > 0 && b.sign > 0, gives: ({ a, b }) => add(num(a.w - 1 - b.w), num(a.p + 10 - b.p, a.q)) },
  { id: 'wholes-only', does: 'work with the whole numbers and leave the fractions out', fits: ({ a, b, op }) => fractions(a, b) && (a.kind === 'mixed' || b.kind === 'mixed') && '+-'.includes(op), gives: ({ a, b, op }) => OPS[op](num(a.w), num(b.w)) },
  { id: 'wholes-then-tops-and-bottoms', does: 'add the wholes, then add the tops and add the bottoms', fits: ({ a, b, op }) => a.kind === 'mixed' && b.kind === 'mixed' && op === '+' && a.q !== b.q, gives: ({ a, b }) => add(num(a.w + b.w), num(a.p + b.p, a.q + b.q)) },
  { id: 'smaller-fraction-from-larger', does: 'subtract the wholes, then take the smaller fraction from the larger whichever way round they are', fits: ({ a, b, op }) => fractions(a, b) && (a.kind === 'mixed' || b.kind === 'mixed') && op === '-' && a.p * b.q < b.p * a.q, gives: ({ a, b }) => add(num(a.w - b.w), sub(part(b), part(a))) },
  { id: 'wholes-multiplied-fractions-multiplied', does: 'multiply the wholes and multiply the fractions separately', fits: ({ a, b, op }) => a.kind === 'mixed' && b.kind === 'mixed' && op === '×', gives: ({ a, b }) => add(num(a.w * b.w), mul(part(a), part(b))) },
  { id: 'whole-times-whole-part-only', does: 'multiply only the whole part of the mixed number', fits: ({ a, b, op }) => op === '×' && ((a.kind === 'whole' && b.kind === 'mixed') || (a.kind === 'mixed' && b.kind === 'whole')), gives: ({ a, b }) => (a.kind === 'whole' ? add(num(a.w * b.w), part(b)) : add(num(a.w * b.w), part(a))) },
  // Decimals.
  { id: 'lined-up-on-the-right', does: 'line the numbers up on the right instead of on the point', fits: ({ a, b, op }) => decimals(a, b) && '+-'.includes(op) && a.places !== b.places, gives: ({ a, b, op }) => { const total = op === '+' ? digits(a.whole + a.after) + digits(b.whole + b.after) : digits(a.whole + a.after) - digits(b.whole + b.after); return [num(total, 10 ** Math.max(a.places, b.places)), num(total, 10 ** Math.min(a.places, b.places))]; } },
  { id: 'smaller-digit-from-larger-decimal', does: 'take the smaller digit from the larger in each column, instead of borrowing', fits: ({ a, b, op }) => decimals(a, b) && op === '-' && positive(a, b), gives: ({ a, b }) => { const { x, y, places } = columns(a, b); return fromColumns(x.map((digit, at) => Math.abs(digit - y[at])), places); } },
  { id: 'after-the-point-as-wholes', does: 'add or subtract the digits after the point as if they were whole numbers', fits: ({ a, b, op }) => decimals(a, b) && '+-'.includes(op) && a.sign > 0 && b.sign > 0, gives: ({ a, b, op }) => { const after = op === '+' ? digits(a.after) + digits(b.after) : Math.abs(digits(a.after) - digits(b.after)); const whole = op === '+' ? digits(a.whole) + digits(b.whole) : digits(a.whole) - digits(b.whole); return whole < 0 ? null : decimalFrom(whole, String(after).padStart(a.places === b.places ? a.places : 1, '0')); } },
  { id: 'zeros-added-for-times-ten', does: 'add a zero on the end to multiply by ten, which leaves a decimal the same', fits: ({ a, b, op }) => op === '×' && ((a.kind === 'decimal' && b.kind === 'whole' && tenShift(b) > 0) || (b.kind === 'decimal' && a.kind === 'whole' && tenShift(a) > 0)), gives: ({ a, b }) => (a.kind === 'decimal' ? written(a.text + '0'.repeat(tenShift(b))) : written(b.text + '0'.repeat(tenShift(a)))) },
  { id: 'point-moved-the-wrong-way', does: 'move the point the wrong way for a ten, a hundred or a tenth', fits: ({ a, b, op }) => (decimals(a, b) || wholes(a, b)) && ((op === '×' && (tenShift(a) || tenShift(b))) || (op === '÷' && tenShift(b))), gives: ({ a, b, op }) => (op === '÷' ? mul(a.value, b.value) : [tenShift(b) ? div(a.value, b.value) : null, tenShift(a) ? div(b.value, a.value) : null]) },
  { id: 'places-not-added', does: 'put the point where it was in one of the numbers instead of counting the places in both', fits: ({ a, b, op }) => decimals(a, b) && op === '×' && a.places > 0 && b.places > 0, gives: ({ a, b }) => [Math.max(a.places, b.places), a.places, b.places].map((places) => num(a.sign * b.sign * digits(a.whole + a.after) * digits(b.whole + b.after), 10 ** places)) },
  { id: 'places-counted-short', does: 'count one decimal place too few in the product', fits: ({ a, b, op }) => decimals(a, b) && op === '×' && a.places + b.places >= 2, gives: ({ a, b }) => num(a.sign * b.sign * digits(a.whole + a.after) * digits(b.whole + b.after), 10 ** (a.places + b.places - 1)) },
  { id: 'point-left-out', does: 'multiply the digits and leave the point out', fits: ({ a, b, op }) => decimals(a, b) && op === '×', gives: ({ a, b }) => num(a.sign * b.sign * digits(a.whole + a.after) * digits(b.whole + b.after)) },
  { id: 'points-left-out-of-a-sum', does: 'add or subtract the digits as whole numbers and leave the points out', fits: ({ a, b, op }) => decimals(a, b) && '+-'.includes(op) && positive(a, b), gives: ({ a, b, op }) => OPS[op](num(digits(a.whole + a.after)), num(digits(b.whole + b.after))) },
  { id: 'whole-and-decimal-parts-multiplied-apart', does: 'multiply the part before the point and the part after it separately', fits: ({ a, b, op }) => op === '×' && ((a.kind === 'decimal' && b.kind === 'whole') || (a.kind === 'whole' && b.kind === 'decimal')) && a.sign > 0 && b.sign > 0, gives: ({ a, b }) => { const [d, k] = a.kind === 'decimal' ? [a, b.w] : [b, a.w]; return decimalFrom(digits(d.whole) * k, String(digits(d.after) * k)); } },
  { id: 'whole-part-only-multiplied', does: 'multiply only the part before the point and copy the part after it', fits: ({ a, b, op }) => op === '×' && ((a.kind === 'decimal' && b.kind === 'whole') || (a.kind === 'whole' && b.kind === 'decimal')) && a.sign > 0 && b.sign > 0, gives: ({ a, b }) => { const [d, k] = a.kind === 'decimal' ? [a, b.w] : [b, a.w]; return decimalFrom(digits(d.whole) * k, d.after); } },
  { id: 'both-points-ignored', does: 'divide the digits as whole numbers, ignoring both points', fits: ({ a, b, op }) => op === '÷' && a.kind === 'decimal' && b.kind === 'decimal', gives: ({ a, b }) => div(num(a.sign * digits(a.whole + a.after)), num(b.sign * digits(b.whole + b.after))) },
  { id: 'zero-after-the-point-left-out', does: 'leave out the zero that holds the place just after the point', fits: ({ a, b, op, correct }) => decimals(a, b) && op === '÷' && /^0+[1-9]/.test(asDecimal(correct)?.after ?? ''), gives: ({ correct }) => { const { whole, after } = asDecimal(correct); return decimalFrom(whole, after.replace(/^0+/, '')); } },
  { id: 'divisor-point-ignored', does: 'divide as if the number you divide by had no point', fits: ({ a, b, op }) => decimals(a, b) && op === '÷' && b.kind === 'decimal', gives: ({ a, b }) => div(a.value, num(b.sign * digits(b.whole + b.after))) },
  { id: 'dividend-point-ignored', does: 'divide the digits and put no point in the answer', fits: ({ a, b, op }) => decimals(a, b) && op === '÷' && a.kind === 'decimal' && b.kind === 'whole', gives: ({ a, b }) => div(num(a.sign * digits(a.whole + a.after)), b.value) },
  { id: 'divided-the-other-way', does: 'divide the larger number by the smaller, whichever comes first', fits: ({ a, b, op }) => op === '÷' && a.sign > 0 && b.sign > 0 && a.value.n * b.value.d < b.value.n * a.value.d, gives: ({ a, b }) => div(b.value, a.value) },
  // Signed numbers.
  { id: 'two-negatives-make-a-positive-in-adding', does: 'say two negatives make a positive when adding them', fits: ({ a, b, op }) => signed(a, b) && op === '+' && a.sign < 0 && b.sign < 0, gives: ({ a, b }) => num(a.w + b.w) },
  { id: 'second-minus-ignored', does: 'treat taking away a negative as taking away', fits: ({ a, b, op }) => signed(a, b) && op === '-' && b.sign < 0, gives: ({ a, b }) => num(a.sign * a.w - b.w) },
  { id: 'sizes-added-across-signs', does: 'add the sizes of the two numbers when their signs differ', fits: ({ a, b, op }) => signed(a, b) && ((op === '+' && a.sign !== b.sign) || (op === '-' && a.sign === b.sign && a.sign < 0)), gives: ({ a, b }) => [num(a.sign * (a.w + b.w)), num(a.w + b.w), num(-(a.w + b.w))] },
  { id: 'sizes-subtracted-when-they-add', does: 'take one size from the other when the two should be added', fits: ({ a, b, op }) => signed(a, b) && ((op === '-' && a.sign !== b.sign) || (op === '+' && a.sign === b.sign)), gives: ({ a, b }) => [num(a.w - b.w), num(b.w - a.w)] },
  { id: 'sign-of-the-first-number', does: 'take the smaller size from the larger and give the answer the sign of the first number', fits: ({ a, b, op }) => signed(a, b) && op === '+' && a.sign !== b.sign && a.w < b.w, gives: ({ a, b }) => num(a.sign * (b.w - a.w)) },
  { id: 'two-minuses-make-a-plus', does: 'treat the two minus signs as making a plus, and add', fits: ({ a, b, op }) => signed(a, b) && op === '-' && a.sign < 0 && b.sign > 0, gives: ({ a, b }) => num(a.w + b.w) },
  { id: 'minus-sign-left-off', does: 'work it out without the minus sign, so the answer comes out positive', fits: ({ a, b, op }) => signed(a, b) && '×÷'.includes(op) && a.sign !== b.sign, gives: ({ correct }) => num(-correct.n, correct.d) },
  { id: 'two-negatives-stay-negative', does: 'keep the answer negative because both numbers are negative', fits: ({ a, b, op }) => signed(a, b) && '×÷'.includes(op) && a.sign < 0 && b.sign < 0, gives: ({ correct }) => num(-correct.n, correct.d) },
  { id: 'smaller-from-larger', does: 'take the smaller number from the larger, whichever comes first', fits: ({ a, b, op }) => unsigned(a, b) && op === '-' && a.w < b.w, gives: ({ a, b }) => num(b.w - a.w) },
  { id: 'right-size-wrong-sign', does: 'get the size right and the sign wrong', fits: ({ a, b, correct }) => wholes(a, b) && (a.sign < 0 || b.sign < 0 || correct.n < 0) && correct.n !== 0, gives: ({ correct }) => num(-correct.n, correct.d) },
  // Whole numbers, column by column.
  { id: 'smaller-digit-from-larger', does: 'take the smaller digit from the larger in each column, instead of borrowing', fits: ({ a, b, op }) => unsigned(a, b) && op === '-' && a.w > b.w && b.w >= 10, gives: ({ a, b }) => { const x = String(a.w); const y = String(b.w).padStart(x.length, '0'); return fromText([...x].map((digit, at) => Math.abs(Number(digit) - Number(y[at]))).join('')); } },
  { id: 'borrowed-without-paying-back', does: 'borrow a ten without taking it off the next column', fits: ({ a, b, op }) => unsigned(a, b) && op === '-' && a.w > b.w && b.w >= 10, gives: ({ a, b }) => { const x = String(a.w); const y = String(b.w).padStart(x.length, '0'); return fromText([...x].map((digit, at) => (Number(digit) < Number(y[at]) ? Number(digit) + 10 - Number(y[at]) : Number(digit) - Number(y[at]))).join('')); } },
  { id: 'zero-where-top-is-smaller', does: 'write 0 in a column where the top digit is smaller, instead of borrowing', fits: ({ a, b, op }) => unsigned(a, b) && op === '-' && a.w > b.w && b.w >= 10, gives: ({ a, b }) => { const { x, y } = columns(a, b); return fromColumns(x.map((digit, at) => Math.max(0, digit - y[at])), 0); } },
  { id: 'bottom-digit-under-a-zero', does: 'write the bottom digit wherever the top digit is 0, and borrow nothing from a 0', fits: ({ a, b, op }) => unsigned(a, b) && op === '-' && a.w > b.w && /\d0/.test(String(a.w)), gives: ({ a, b }) => { const { x, y } = columns(a, b); let owed = 0; const out = []; for (let at = x.length - 1; at >= 0; at -= 1) { if (x[at] === 0 && y[at] > 0) { out.unshift(y[at]); owed = 0; continue; } const upper = x[at] - (x[at] ? owed : 0); owed = upper < y[at] ? 1 : 0; out.unshift(upper + 10 * owed - y[at]); } return fromColumns(out, 0); } },
  { id: 'carried-ten-dropped', does: 'add each column and drop the ten that should be carried', fits: ({ a, b, op }) => unsigned(a, b) && op === '+' && a.w >= 10 && b.w >= 10, gives: ({ a, b }) => { const width = Math.max(String(a.w).length, String(b.w).length); const x = String(a.w).padStart(width, '0'); const y = String(b.w).padStart(width, '0'); return fromText([...x].map((digit, at) => (Number(digit) + Number(y[at])) % 10).join('')); } },
  { id: 'column-sums-written-whole', does: 'write the whole sum of each column instead of carrying', fits: ({ a, b, op }) => unsigned(a, b) && op === '+' && a.w >= 10 && b.w >= 10, gives: ({ a, b }) => { const width = Math.max(String(a.w).length, String(b.w).length); const x = String(a.w).padStart(width, '0'); const y = String(b.w).padStart(width, '0'); return fromText([...x].map((digit, at) => Number(digit) + Number(y[at])).join('')); } },
  { id: 'tens-digit-as-ones', does: 'multiply by each digit of the second number and add, forgetting that one of them is tens', fits: ({ a, b, op }) => unsigned(a, b) && op === '×' && b.w >= 10, gives: ({ a, b }) => num([...String(b.w)].reduce((sum, digit) => sum + a.w * Number(digit), 0)) },
  { id: 'digits-multiplied-in-place', does: 'multiply the tens by the tens and the ones by the ones only', fits: ({ a, b, op }) => unsigned(a, b) && op === '×' && a.w >= 10 && b.w >= 10 && a.w < 100 && b.w < 100, gives: ({ a, b }) => num(Math.floor(a.w / 10) * Math.floor(b.w / 10) * 100 + (a.w % 10) * (b.w % 10)) },
  { id: 'carry-added-before-multiplying', does: 'add the carried digit to the next digit before multiplying it, not after', fits: ({ a, b, op }) => unsigned(a, b) && op === '×' && (a.w < 10) !== (b.w < 10), gives: ({ a, b }) => { const [long, k] = a.w < 10 ? [b.w, a.w] : [a.w, b.w]; let carry = 0; let out = ''; for (const digit of [...String(long)].reverse()) { const product = (Number(digit) + carry) * k; out = `${product % 10}${out}`; carry = Math.floor(product / 10); } return fromText(`${carry || ''}${out}`); } },
  { id: 'carry-not-added-when-multiplying', does: 'multiply each digit and never add the digit that was carried', fits: ({ a, b, op }) => unsigned(a, b) && op === '×' && (a.w < 10) !== (b.w < 10), gives: ({ a, b }) => { const [long, k] = a.w < 10 ? [b.w, a.w] : [a.w, b.w]; const each = [...String(long)].map((digit) => Number(digit) * k); return fromText(each.map((product, at) => (at ? product % 10 : product)).join('')); } },
  { id: 'zero-digit-skipped', does: 'skip a zero digit, as if the number had no zero in it', fits: ({ a, b, op }) => unsigned(a, b) && op === '×' && (/\d0+\d/.test(String(a.w)) || /\d0+\d/.test(String(b.w))), gives: ({ a, b }) => num(Number(String(a.w).replace(/(?<=\d)0+(?=\d)/g, '')) * Number(String(b.w).replace(/(?<=\d)0+(?=\d)/g, ''))) },
  { id: 'zero-left-out-of-quotient', does: 'leave out a zero in the middle of the answer when a digit doesn’t divide', fits: ({ a, b, op, correct }) => unsigned(a, b) && op === '÷' && correct.d === 1 && /\d0+\d/.test(String(correct.n)), gives: ({ correct }) => fromText(String(correct.n).replace(/(?<=\d)0+(?=\d)/g, '')) },
  { id: 'remainder-as-decimal', does: 'write the remainder after a point', fits: ({ a, b, op }) => unsigned(a, b) && op === '÷' && b.w !== 0 && a.w % b.w !== 0, gives: ({ a, b }) => decimalFrom(Math.floor(a.w / b.w), String(a.w % b.w)) },
  { id: 'remainder-only', does: 'give the remainder as the answer', fits: ({ a, b, op }) => unsigned(a, b) && op === '÷' && b.w !== 0 && a.w > b.w && a.w % b.w !== 0, gives: ({ a, b }) => num(a.w % b.w) }
];

/**
 * question: the problem. said: what the learner wrote. Returns { id, does, also? } for the first procedure whose result
 * is their answer (also: others that give it too, each { id, does }: one wrong answer often can't tell two procedures
 * apart), or null: the problem isn't one piece of arithmetic, their answer is right, or no procedure here gives it.
 */
export function diagnose({ question = '', said = '' } = {}) {
  const problem = readArithmetic(question);
  if (!problem) return null;
  const theirs = offered(said, problem);
  // The right answer anywhere in what they wrote means there is nothing to diagnose.
  if (!theirs.length || theirs.some((item) => same(item.value, problem.correct) || cutShort(item, problem.correct))) return null;
  // So is a quotient given with its remainder.
  const { a, b, op } = problem;
  if (op === '÷' && unsigned(a, b) && b.w && [Math.floor(a.w / b.w), a.w % b.w].every((part) => theirs.some((item) => same(item.value, num(part))))) return null;
  const results = PROCEDURES.filter((procedure) => procedure.fits(problem)).map((procedure) => ({ procedure, gives: [procedure.gives(problem)].flat().filter((result) => result && (result.text != null || !same(num(result.n, result.d), problem.correct))) }));
  for (const item of theirs) {
    const fit = results.filter((result) => result.gives.some((given) => isResult(item, given))).map((result) => result.procedure);
    if (fit.length) return { id: fit[0].id, does: fit[0].does, ...(fit.length > 1 ? { also: fit.slice(1).map((procedure) => ({ id: procedure.id, does: procedure.does })) } : {}) };
  }
  return null;
}

/**
 * What a learner who follows a procedure would answer to another problem: the numbers it gives there ([{ n, d }]), or none
 * when the problem isn't one piece of arithmetic or the procedure doesn't apply to it. With diagnose, a name becomes a
 * prediction that the learner's next answer can bear out or not.
 */
export function applyProcedure(id, question) {
  const problem = readArithmetic(question);
  const procedure = PROCEDURES.find((item) => item.id === id);
  if (!problem || !procedure || !procedure.fits(problem)) return [];
  return [procedure.gives(problem)].flat().filter(Boolean).map((result) => num(result.n, result.d)).filter(Boolean);
}

/** How many procedures there are, for whoever describes this. */
export const PROCEDURE_COUNT = PROCEDURES.length;
