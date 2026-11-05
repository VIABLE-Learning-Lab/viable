/**
 * Whether a learner has already written a question's answer, worked out by code, so a review can know it
 * without a model reading their words. Only a yes or no leaves here, so nothing they type reaches the
 * reviewer. It says yes when it is sure: a number equal to the key's (5/6, 10/12, "five sixths") or the
 * key's own short words. A long answer in a sentence, or several options listed, says no. No Node built-ins.
 */

// Learners' turns looked at, the latest last.
const TURNS = 6;
const SHORT_KEY = { words: 6, chars: 60 };
const VULGAR = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
const ONES = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const PARTS = { half: 2, halves: 2, third: 3, thirds: 3, fourth: 4, fourths: 4, quarter: 4, quarters: 4, fifth: 5, fifths: 5, sixth: 6, sixths: 6, seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10, eleventh: 11, elevenths: 11, twelfth: 12, twelfths: 12 };
const ones = Object.keys(ONES).join('|');
const parts = Object.keys(PARTS).join('|');
const WORD_FRACTION = new RegExp(`\\b(?:(${ones})\\s+and\\s+)?(${ones})[\\s-]+(${parts})\\b`, 'gi');
const NUMBER = /(?<![\d./])(?:(\d+)\s+(\d+)\s*\/\s*(\d+)|(\d+)\s*\/\s*(\d+)|\d*\.\d+|\d+)(?![\d/])/g;
// Working that ends in the answer, rather than a list of options to choose from.
const WORKING = /[=+×*÷]|\b(?:so|then|get|got|gives?|equals?)\b/i;
const OPTIONS = /\d\s*\??\s*\b(?:or|maybe)\b\s*(?:is\s+it\s+)?\d/i;
const DENIED = /\b(?:not|isn['’]?t|aren['’]?t|never)\s+(?:the\s+answer\s+|equal\s+to\s+|equals?\s+)?$/i;
// "question 4" names a place, not an answer.
const LABEL = /\b(?:question|problem|number|no|step|part|page|exercise|item|q)\.?\s*#?\s*$/i;
const OPTION_LINE = /^\s*([A-Z])\)\s*(.*)$/;
const TOO_COMMON = new Set(['yes', 'no', 'true', 'false', 'none', 'all', 'both']);

const clean = (text) => String(text ?? '')
  .replace(/\\frac\s*\{\s*(\d+)\s*\}\s*\{\s*(\d+)\s*\}/g, '$1/$2')
  .replace(/[⁄∕]/g, '/')
  .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (mark) => ` ${VULGAR[mark]}`)
  .replace(/(\d),(\d{3})\b/g, '$1$2')
  .replace(WORD_FRACTION, (_, whole, top, part) => `${whole ? `${ONES[whole.toLowerCase()]} ` : ''}${ONES[top.toLowerCase()]}/${PARTS[part.toLowerCase()]}`);

/** The numbers in a text, in order: { text, value, at, end }, with spaces out of text. */
function numbersIn(text) {
  return [...text.matchAll(NUMBER)].map((found) => {
    const [whole, mixed, top, bottom, onlyTop, onlyBottom] = found;
    const value = mixed != null ? Number(mixed) + Number(top) / Number(bottom) : onlyTop != null ? Number(onlyTop) / Number(onlyBottom) : Number(whole);
    return { text: whole.replace(/\s+/g, ' ').replace(/\s*\/\s*/, '/'), value, at: found.index, end: found.index + whole.length };
  }).filter((item) => Number.isFinite(item.value));
}

const plain = (text) => String(text ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const isClose = (a, b) => Math.abs(a - b) < 1e-9;

// One answer the key accepts, as a number or as a few words. A long answer can't be matched by code.
function formOf(answer) {
  const text = clean(answer).trim();
  const numbers = numbersIn(text);
  const words = plain(text.replace(NUMBER, ' ')).split(' ').filter(Boolean);
  if (numbers.length === 1 && words.length <= 2) return { kind: 'number', ...numbers[0] };
  const said = plain(text);
  return said && said.length <= SHORT_KEY.chars && said.split(' ').length <= SHORT_KEY.words ? { kind: 'words', text: said } : null;
}

// What a key accepts: a plain key, or the words a question panel writes (questions.js keyText). Answers that
// only count together (several choices, an order, blanks) are left to the page's own marking.
function acceptedIn(answer) {
  const lines = String(answer ?? '').split('\n').map((line) => line.trim()).filter((line) => line && !/^explanation:/i.test(line));
  if (lines.some((line) => /^(?:correct answers|correct order|blank \d+):/i.test(line))) return [];
  return lines.flatMap((line) => {
    if (/^a model answer:/i.test(line)) return [line.replace(/^a model answer:\s*/i, '')];
    const value = line.replace(/^(?:correct answer|accepted answers?):\s*/i, '');
    return value.length <= SHORT_KEY.chars ? value.split(/\s*(?:\||;|\bor\b)\s*/i) : [value];
  }).map(formOf).filter(Boolean);
}

// A question as the learner sees it can list its choices: the choices aren't what it asks.
function askedOf(question) {
  const lines = clean(question).split('\n');
  const choices = lines.map((line) => OPTION_LINE.exec(line)).filter(Boolean).map((found) => ({ letter: found[1].toLowerCase(), text: plain(found[2]) }));
  return { stem: lines.filter((line) => !OPTION_LINE.test(line)).join('\n'), choices };
}

// Choosing by letter: "b", "option b", "it's b".
const namesChoice = (form, message, choices) => {
  const letter = choices.find((choice) => choice.text === (form.kind === 'number' ? plain(form.text) : form.text))?.letter;
  if (!letter) return false;
  const said = plain(message);
  return said === letter || new RegExp(`^(?:its?|it s|i (?:think|pick|picked|choose|chose|got)(?: its?| it s)?)\\s+${letter}$|\\b(?:option|choice)\\s+${letter}\\b`).test(said);
};

function hasNumber(form, message, stem) {
  const text = clean(message);
  const asked = numbersIn(stem);
  const keyIsAsked = asked.some((item) => item.text === form.text);
  // Numbers the question already holds aren't the learner's answer, unless they wrote the key's own form of it.
  const all = numbersIn(text);
  const own = all.filter((item) => (item.text === form.text && !keyIsAsked) || !asked.some((other) => other.text === item.text || isClose(other.value, item.value)));
  if (!own.length || OPTIONS.test(text) || (own.length > 1 && !WORKING.test(text))) return false;
  const last = own.at(-1);
  // The question's own numbers after it make this an aside before asking ("5/6 of us hate this. what's 1/2 + 1/3").
  if (all.at(-1) !== last) return false;
  const before = text.slice(0, last.at);
  return (last.text === form.text || isClose(last.value, form.value)) && !DENIED.test(before) && !LABEL.test(before);
}

function hasWords(form, message, stem) {
  const said = plain(message);
  if (form.text.length < 3 || TOO_COMMON.has(form.text)) return said === form.text;
  if (plain(stem).includes(form.text)) return false;
  // Words in a script without spaces have no edges to look for.
  const edge = /^[\p{Script=Latin}\p{N} ]+$/u.test(form.text) ? (char) => !char || char === ' ' : () => true;
  for (let at = said.indexOf(form.text); at >= 0; at = said.indexOf(form.text, at + 1)) {
    const before = said.slice(0, at);
    const after = said.slice(at + form.text.length);
    if (edge(before.at(-1)) && edge(after[0]) && !/\bor $/.test(before) && !/^ or\b/.test(after) && !DENIED.test(before)) return true;
  }
  return false;
}

/** A conversation's learner turns as text, oldest first. messages: [{ role, content }]. */
export function learnerWords(messages = []) {
  const textOf = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.filter((part) => ['text', 'input_text'].includes(part?.type)).map((part) => part.text).join(' ') : '');
  return (Array.isArray(messages) ? messages : []).filter((message) => message?.role === 'user').map((message) => textOf(message.content)).filter((text) => text.trim());
}

/**
 * answer: the answer key, with accepted answers split by "or", ";", "|" or a new line, or as a question panel
 * writes it. question: its text, with any choices as "A) ..." lines.
 * said: the learner's turns, oldest first. { reached }: they have written it. { now }: in their latest turn.
 */
export function answerReached({ answer, question = '', said = [] }) {
  const forms = acceptedIn(answer);
  if (!forms.length) return { reached: false, now: false, checkable: false };
  const { stem, choices } = askedOf(question);
  const turns = said.slice(-TURNS);
  const has = (message) => forms.some((form) => (form.kind === 'number' ? hasNumber : hasWords)(form, message, stem) || namesChoice(form, message, choices));
  return { reached: turns.some(has), now: turns.length > 0 && has(turns.at(-1)), checkable: true };
}

/**
 * For VETTING's items ([{ question: { text }, answerKey: { correctAnswer } }]) and the learner's turns: { now,
 * items: [their numbers from 1] } when they have written one; { now: false, items: [], none: true } when code could
 * check every one and they have written none, so a reply can't be confirming what they said; null when it can't tell.
 * checked: the page already marked the answer to the first item right, as it does for a question panel.
 */
export function reachedAmong(items, said, { checked = false } = {}) {
  const found = (Array.isArray(items) ? items : []).map((item, index) => ({ number: index + 1, ...answerReached({ answer: item?.answerKey?.correctAnswer, question: item?.question?.text, said }) }));
  const has = found.filter((item) => item.reached || (checked && item.number === 1));
  if (has.length) return { now: has.some((item) => item.now), items: has.map((item) => item.number) };
  return found.length && found.every((item) => item.checkable) ? { now: false, items: [], none: true } : null;
}
