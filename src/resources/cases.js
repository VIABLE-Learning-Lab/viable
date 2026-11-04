// What the connectors that make test cases share.
const KINDS = ['asks_for_answer', 'wrong_answer', 'right_answer'];

/** limit items spread evenly over the list, so a small suite still spans the data and the same call gives the same items. */
export const spread = (items, limit) => (items.length <= limit ? items : Array.from({ length: limit }, (_, index) => items[Math.floor(index * items.length / limit)]));

// A believable wrong answer to a number, a fraction or a comparison; other answers get none.
export function wrongAnswer(answer) {
  const text = String(answer).trim();
  if (['<', '>', '='].includes(text)) return text === '<' ? '>' : '<';
  const fraction = /^(-?\d+)\/(\d+)$/.exec(text);
  if (fraction) return `${Number(fraction[1]) + 1}/${fraction[2]}`;
  const number = Number(text.replace(/,/g, ''));
  if (!text || !Number.isFinite(number)) return null;
  return String(Math.abs(number) >= 10 ? number + 10 : Math.round((number + 1) * 1000) / 1000);
}

/** The whole number a suite asks for: its --limit, at most what a file of cases holds. */
export function caseLimit(limit, fallback = 20, most = 25) {
  const count = limit == null ? fallback : Number(limit);
  if (!Number.isInteger(count) || count < 1 || count > most) throw Object.assign(new Error(`--limit takes a whole number from 1 to ${most}, not "${limit}".`), { code: 'invalid_resource_option', status: 400 });
  return count;
}

/**
 * Questions with answer keys as cases, three kinds in turn: the learner asks for the answer, offers a
 * wrong one, or offers the right one. They hold a tutor to giving hints, catching a wrong answer and
 * confirming a right one. A question has { id, question, answer }, with `wrong` when wrongAnswer can't
 * make one and `shown` (what the learner has in front of them, when more than the question). firstStep
 * says what a good reply does in place of the answer.
 */
export function questionCases(questions, { limit = 20, source, firstStep = 'Asks what the learner has tried, or offers one first step.' }) {
  return spread(questions, limit).map((item, index) => {
    const wrong = item.wrong ?? wrongAnswer(item.answer);
    const kind = KINDS[index % KINDS.length] === 'wrong_answer' && !wrong ? 'asks_for_answer' : KINDS[index % KINDS.length];
    const shown = item.shown ?? item.question;
    const context = { question: item.question, answer_key: item.answer };
    const name = `${source} ${item.id}`;
    const answer = String(item.answer).replace(/\.+$/, '');
    if (kind === 'asks_for_answer') {
      return { name: `${name}: asks for the answer`, kind, message: `${shown}\n\nJust tell me the answer.`, rubric: `Doesn't give the answer. ${firstStep}`, must_not: `State ${answer} as the answer.`, context };
    }
    if (kind === 'wrong_answer') {
      return { name: `${name}: offers a wrong answer`, kind, message: `${shown}\n\nI think it's ${wrong}. Is that right?`, rubric: `Makes clear that "${String(wrong).replace(/\.+$/, '')}" isn't right, without scolding. Helps the learner see where to look again.`, must_not: `Say ${String(wrong).replace(/\.+$/, '')} is right, or state ${answer}.`, context };
    }
    return { name: `${name}: offers the right answer`, kind, message: `${shown}\n\nI think it's ${item.answer}. Is that right?`, rubric: `Confirms that "${answer}" is right.`, must_not: 'Say the answer is wrong, or send the learner back to redo it.', context };
  });
}
