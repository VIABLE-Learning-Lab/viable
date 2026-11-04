/**
 * The questions of a learning page's questions panel: what each type holds, how an answer is graded,
 * and what a page or the AI may see of them. A host keeps question sets; a package carries them.
 *
 * Item types, with what their answer key holds:
 *   single    choices, answer.choice: one choice id
 *   multiple  choices, answer.choices: the correct ids (partial credit: right picks minus wrong ones)
 *   fill      answer.accept: accepted answers (case and spacing ignored; numbers and fractions compared
 *             as numbers, within answer.tolerance)
 *   cloze     a prompt with blanks [[1]], [[2]]…, answer.blanks: accepted answers per blank
 *   order     choices in a correct order, answer.order: their ids (partial credit: items in place)
 *   short     a short answer; answer.accept when it can be checked, else recorded for review
 *   open      a longer answer, recorded for review (and for coding)
 *   code      a program in answer.language, recorded for review
 *   spoken    an answer the learner says aloud (up to max_seconds), kept as a recording with its
 *             length, transcribed and scored in Coding; rubric: what counts as a good answer
 * A short or open item with a model answer may show it once the learner has written their own
 * (show_model), to check against.
 * Each item may name a skill (for mastery and knowledge tracing), points, hints and an explanation.
 * Keys never leave the server: pages get publicItems(), answers are graded by gradeResponse(), and the
 * AI sees a key only where a step names it (context.answer_key, for a VETTING step).
 */
const agentError = (message, status = 400, code = 'agent_error') => Object.assign(new Error(message), { status, code });

export const QUESTION_LIMITS = Object.freeze({ items: 200, prompt: 4000, choice: 500, choices: 12, accept: 20, hints: 5, hint: 1000, explanation: 3000, skill: 80, title: 120, response: 8000, draftSource: 60000, draftCount: 30, draftDocuments: 10, extractCount: 60, spokenMin: 15, spokenMax: 180, spokenDefault: 60, rubric: 2000 });
export const ITEM_TYPES = ['single', 'multiple', 'fill', 'cloze', 'order', 'short', 'open', 'code', 'spoken'];
const line = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const block = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const CHOICE_IDS = 'abcdefghijkl';
const BLANK = /\[\[(\d{1,2})\]\]/g;

/** One item as stored: its type's fields, bounded; an error names the item when it can't be used. */
export function normalizeItem(input, index, used = new Set()) {
  const where = `Question ${index + 1}`;
  if (!input || typeof input !== 'object' || !ITEM_TYPES.includes(input.type)) throw agentError(`${where}: choose a type (${ITEM_TYPES.join(', ')}).`, 400, 'invalid_question');
  let id = ITEM_ID.test(String(input.id || '')) ? String(input.id) : `q${index + 1}`;
  while (used.has(id)) id = `${id}-${index + 1}`;
  used.add(id);
  const prompt = block(input.prompt, QUESTION_LIMITS.prompt);
  if (!prompt) throw agentError(`${where}: write the question.`, 400, 'invalid_question');
  const item = { id, type: input.type, prompt };
  const answer = input.answer && typeof input.answer === 'object' ? input.answer : {};
  const list = (value, max) => (Array.isArray(value) ? value : []).map((entry) => line(entry, max)).filter(Boolean);
  if (['single', 'multiple', 'order'].includes(input.type)) {
    const choices = (Array.isArray(input.choices) ? input.choices : []).slice(0, QUESTION_LIMITS.choices).map((choice, i) => ({ id: /^[a-z0-9]{1,8}$/.test(String(choice?.id || '')) ? String(choice.id) : CHOICE_IDS[i], text: line(typeof choice === 'string' ? choice : choice?.text, QUESTION_LIMITS.choice) })).filter((choice) => choice.text);
    if (choices.length < 2) throw agentError(`${where}: give at least two choices.`, 400, 'invalid_question');
    const ids = new Set(choices.map((choice) => choice.id));
    if (ids.size !== choices.length) throw agentError(`${where}: each choice needs its own id.`, 400, 'invalid_question');
    item.choices = choices;
    if (input.type === 'single') {
      if (!ids.has(answer.choice)) throw agentError(`${where}: mark the correct choice.`, 400, 'invalid_question');
      item.answer = { choice: answer.choice };
    } else if (input.type === 'multiple') {
      const correct = [...new Set((Array.isArray(answer.choices) ? answer.choices : []).filter((value) => ids.has(value)))];
      if (!correct.length) throw agentError(`${where}: mark at least one correct choice.`, 400, 'invalid_question');
      item.answer = { choices: correct };
    } else {
      const order = Array.isArray(answer.order) && answer.order.length === choices.length && answer.order.every((value) => ids.has(value)) && new Set(answer.order).size === choices.length ? answer.order : choices.map((choice) => choice.id);
      item.answer = { order };
    }
  } else if (input.type === 'fill') {
    const accept = list(answer.accept, QUESTION_LIMITS.choice).slice(0, QUESTION_LIMITS.accept);
    if (!accept.length) throw agentError(`${where}: give at least one accepted answer.`, 400, 'invalid_question');
    item.answer = { accept, ...(Number.isFinite(Number(answer.tolerance)) && Number(answer.tolerance) > 0 ? { tolerance: Number(answer.tolerance) } : {}), ...(answer.case === true ? { case: true } : {}) };
  } else if (input.type === 'cloze') {
    const count = Math.max(0, ...[...prompt.matchAll(BLANK)].map((match) => Number(match[1])));
    if (!count) throw agentError(`${where}: mark blanks in the text as [[1]], [[2]]…`, 400, 'invalid_question');
    const blanks = Array.from({ length: count }, (_, i) => list(Array.isArray(answer.blanks) ? answer.blanks[i] : [], QUESTION_LIMITS.choice).slice(0, QUESTION_LIMITS.accept));
    if (blanks.some((accepted) => !accepted.length)) throw agentError(`${where}: give an accepted answer for every blank.`, 400, 'invalid_question');
    item.answer = { blanks, ...(answer.case === true ? { case: true } : {}) };
  } else if (input.type === 'short') {
    const accept = list(answer.accept, QUESTION_LIMITS.choice).slice(0, QUESTION_LIMITS.accept);
    item.answer = accept.length ? { accept, ...(answer.case === true ? { case: true } : {}) } : { model: block(answer.model, QUESTION_LIMITS.explanation) || null };
  } else if (input.type === 'open') {
    item.answer = { model: block(answer.model, QUESTION_LIMITS.explanation) || null };
  } else if (input.type === 'spoken') {
    const seconds = Number.parseInt(input.max_seconds, 10);
    item.max_seconds = Number.isFinite(seconds) ? Math.min(QUESTION_LIMITS.spokenMax, Math.max(QUESTION_LIMITS.spokenMin, seconds)) : QUESTION_LIMITS.spokenDefault;
    const rubric = block(input.rubric, QUESTION_LIMITS.rubric);
    if (rubric) item.rubric = rubric;
    item.answer = { model: block(answer.model, QUESTION_LIMITS.explanation) || null };
  } else {
    item.language = line(input.language, 40) || 'python';
    item.starter = block(input.starter, QUESTION_LIMITS.prompt) || '';
    item.answer = { model: block(answer.model, QUESTION_LIMITS.explanation) || null };
  }
  const skill = line(input.skill, QUESTION_LIMITS.skill);
  if (skill) item.skill = skill;
  const points = Number(input.points);
  item.points = Number.isFinite(points) && points > 0 ? Math.min(points, 100) : 1;
  const hints = list(input.hints, QUESTION_LIMITS.hint).slice(0, QUESTION_LIMITS.hints);
  if (hints.length) item.hints = hints;
  const explanation = block(input.explanation, QUESTION_LIMITS.explanation);
  if (explanation) item.explanation = explanation;
  // A model answer to check against, shown once the learner has written theirs.
  if (['short', 'open'].includes(item.type) && item.answer.model && input.show_model === true) item.show_model = true;
  return item;
}

export function normalizeItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length > QUESTION_LIMITS.items) throw agentError(`A set holds at most ${QUESTION_LIMITS.items} questions.`, 400, 'invalid_question');
  const used = new Set();
  return list.map((item, i) => normalizeItem(item, i, used));
}

// An order item's choices are stored in the correct order; pages get them shuffled (the same way for
// everyone, from the item's id), never as stored.
function shuffled(item) {
  let seed = [...item.id].reduce((hash, ch) => Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const list = [...item.choices];
  for (let i = list.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list.every((choice, i) => choice.id === item.answer.order[i]) ? [...list.slice(1), list[0]] : list;
}

/** What a page may show of an item: everything but its key, hints and explanation (they come one at a time, or with feedback), and its scoring notes. */
export function publicItem(item) {
  const { answer: _answer, explanation: _explanation, hints, rubric: _rubric, ...rest } = item;
  return { ...rest, ...(item.type === 'order' ? { choices: shuffled(item) } : {}), hints: hints ? hints.length : 0, gradable: gradable(item), ...(item.type === 'cloze' ? { blanks: item.answer.blanks.length } : {}) };
}
export const gradable = (item) => !['open', 'code', 'spoken'].includes(item.type) && !(item.type === 'short' && !item.answer.accept);

// --- Grading ---------------------------------------------------------------------------------------

const normal = (value, keepCase) => { const text = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim(); return keepCase ? text : text.toLowerCase(); };
// A number as written: 0.75, 3/4, 1 1/2, 75%, with commas or spaces as thousands separators.
function asNumber(value) {
  const text = String(value ?? '').trim().replace(/(?<=\d)[ ,](?=\d{3}\b)/g, '');
  let m = /^(-?\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (m) return Number(m[1]) + Math.sign(Number(m[1]) || 1) * Number(m[2]) / Number(m[3]);
  m = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(text);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
  m = /^(-?\d+(?:\.\d+)?)%$/.exec(text);
  if (m) return Number(m[1]) / 100;
  return /^-?\d+(?:\.\d+)?(?:e-?\d+)?$/i.test(text) ? Number(text) : null;
}
const accepts = (accepted, response, { tolerance = 0, keepCase = false } = {}) => {
  const given = normal(response, keepCase);
  if (!given) return false;
  const number = asNumber(given);
  return accepted.some((answer) => {
    if (normal(answer, keepCase) === given) return true;
    const target = asNumber(answer);
    return number != null && target != null && Math.abs(number - target) <= Math.max(tolerance, 1e-9 * Math.max(1, Math.abs(target)));
  });
};

/**
 * A learner's response graded against the key: correct (true, false, or null when it isn't graded
 * automatically), a score from 0 to 1 (partial credit where the type allows), and the response as
 * recorded. response: a choice id (single), ids (multiple, order), text (fill, short, open, code), or
 * a list of texts (cloze).
 */
export function gradeResponse(item, response) {
  const ids = new Set((item.choices || []).map((choice) => choice.id));
  if (item.type === 'single') {
    const pick = ids.has(response) ? response : null;
    return { correct: pick === item.answer.choice, score: pick === item.answer.choice ? 1 : 0, response: pick };
  }
  if (item.type === 'multiple') {
    const picks = [...new Set((Array.isArray(response) ? response : []).filter((value) => ids.has(value)))];
    const right = picks.filter((value) => item.answer.choices.includes(value)).length;
    const wrong = picks.length - right;
    const correct = right === item.answer.choices.length && wrong === 0;
    return { correct, score: correct ? 1 : Math.max(0, (right - wrong) / item.answer.choices.length), response: picks };
  }
  if (item.type === 'order') {
    const order = Array.isArray(response) && response.length === item.answer.order.length && new Set(response).size === response.length && response.every((value) => ids.has(value)) ? response : null;
    if (!order) return { correct: false, score: 0, response: null };
    const inPlace = order.filter((value, i) => value === item.answer.order[i]).length;
    return { correct: inPlace === order.length, score: inPlace / order.length, response: order };
  }
  if (item.type === 'cloze') {
    const given = (Array.isArray(response) ? response : []).slice(0, item.answer.blanks.length).map((value) => String(value ?? '').slice(0, QUESTION_LIMITS.choice));
    const right = item.answer.blanks.filter((accepted, i) => accepts(accepted, given[i], { keepCase: item.answer.case })).length;
    return { correct: right === item.answer.blanks.length, score: right / item.answer.blanks.length, response: given };
  }
  // A spoken answer is its recording (stored by the page runtime), scored later in Coding.
  if (item.type === 'spoken') return { correct: null, score: null, response: '' };
  const text = String(response ?? '').slice(0, QUESTION_LIMITS.response);
  if (!gradable(item)) return { correct: null, score: null, response: text };
  const correct = accepts(item.answer.accept, text, { tolerance: item.answer.tolerance || 0, keepCase: item.answer.case });
  return { correct, score: correct ? 1 : 0, response: text };
}

/** The key in words, for a VETTING step that checks replies against it (context.answer_key). */
export function keyText(item) {
  const choice = (id) => item.choices?.find((entry) => entry.id === id)?.text || id;
  const parts = [];
  if (item.type === 'single') parts.push(`Correct answer: ${choice(item.answer.choice)}`);
  else if (item.type === 'multiple') parts.push(`Correct answers: ${item.answer.choices.map(choice).join('; ')}`);
  else if (item.type === 'order') parts.push(`Correct order: ${item.answer.order.map(choice).join(' → ')}`);
  else if (item.type === 'cloze') parts.push(item.answer.blanks.map((accepted, i) => `Blank ${i + 1}: ${accepted.join(' or ')}`).join('; '));
  else if (item.answer.accept) parts.push(`Accepted answers: ${item.answer.accept.join('; ')}`);
  else if (item.answer.model) parts.push(`A model answer: ${item.answer.model}`);
  if (item.explanation) parts.push(`Explanation: ${item.explanation}`);
  return parts.join('\n');
}

/** The question in words, as the learner sees it (no key), for what the AI is shown. */
export function questionText(item) {
  const lines = [item.prompt];
  if (item.choices) lines.push(item.choices.map((choice, i) => `${String.fromCharCode(65 + i)}) ${choice.text}`).join('\n'));
  if (item.type === 'spoken') lines.push('(The learner answers this aloud.)');
  return lines.join('\n');
}
