import { caseLimit, questionCases } from './cases.js';
import { parseCsv } from './csv.js';

const BASE = 'https://raw.githubusercontent.com/uci-edu/FairytaleQAData/a24ddc17364666b7c13a425b9970c87368b03417/data-by-train-split';
// Its test split, whose questions have two annotators' answers, without the one tale whose plot no school would want in a case.
const STORIES = ['enchanted-wreath', 'four-shilling-piece', 'fox-and-wolf', 'golden-goose', 'happy-hunter-skillful-fisher', 'hat-of-huldres', 'how-an-old-man-lost-his-wen', 'how-molo-stole-the-lovely-rose-red', 'jelly-fish-and-monkey', 'lucky-andrew', 'old-hop-giant', 'self-did-it', 'sleeping-beauty-in-the-wood', 'the-dwarfie-stone', 'the-enchanted-deer', 'the-false-prince-and-the-true', 'the-flower-queens-daughter', 'the-miserly-farmer', 'the-sea-king-gift', 'the-wee-bannock', 'three-princesses-in-whiteland', 'whippety-stourie'];
// Room for the passage in a case's message of at most 4,000 characters.
const LONGEST_PASSAGE = 3000;

export default {
  id: 'fairytaleqa',
  version: 1,
  as: ['test-suite'],
  async fetch(get) {
    for (const story of STORIES) {
      get.save(`${story}-questions.csv`, await get.text(`${BASE}/questions/test/${story}-questions.csv`));
      get.save(`${story}-story.csv`, await get.text(`${BASE}/section-stories/test/${story}-story.csv`));
    }
  },
  // Questions about one part of a story, the passage in the learner's message so any agent has it; the
  // answer to another question in the story is the wrong one they offer.
  use({ read }, { limit }) {
    const questions = STORIES.flatMap((story) => {
      const sections = new Map(parseCsv(read(`${story}-story.csv`)).map((row) => [row.section, row.text.trim()]));
      const rows = parseCsv(read(`${story}-questions.csv`)).filter((row) => row['local-or-sum'] === 'local' && row.answer1.trim() && !row.cor_section.includes(','));
      return rows.flatMap((row, index) => {
        const passage = sections.get(row.cor_section);
        if (!passage || passage.length > LONGEST_PASSAGE) return [];
        const answer = row.answer1.trim();
        const wrong = rows.map((other) => other.answer1.trim()).find((other, at) => at > index && other.toLowerCase() !== answer.toLowerCase()) || null;
        return [{ id: `${story} ${row.question_id}`, question: row.question.trim(), answer, wrong, shown: `I'm reading this:\n\n${passage}\n\nThe question is: ${row.question.trim()}` }];
      });
    });
    return { cases: questionCases(questions, { limit: caseLimit(limit), source: 'FairytaleQA', firstStep: 'Points the learner to the part of the passage that answers it, or asks a question that helps them find it.' }) };
  }
};
