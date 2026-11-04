import { caseLimit, questionCases } from './cases.js';

const TEST = 'https://raw.githubusercontent.com/openai/grade-school-math/3101c7d5072418e28b9008a6636bde82a006892c/grade_school_math/data/test.jsonl';

export default {
  id: 'gsm8k',
  version: 1,
  as: ['test-suite'],
  async fetch(get) { get.save('test.jsonl', await get.text(TEST)); },
  use({ read }, { limit }) {
    const questions = read('test.jsonl').split('\n').filter(Boolean).map((line, index) => {
      const { question, answer } = JSON.parse(line);
      return { id: index + 1, question, answer: answer.split('####')[1].trim().replace(/,/g, '') };
    });
    return { cases: questionCases(questions, { limit: caseLimit(limit), source: 'GSM8K' }) };
  }
};
