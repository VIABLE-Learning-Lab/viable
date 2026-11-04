import { caseLimit, spread } from './cases.js';

const TEST = 'https://raw.githubusercontent.com/eth-nlped/mathdial/b06c020a0a1f57a87577fec33e657b63e7eb476e/data/test.jsonl';

export default {
  id: 'mathdial',
  version: 1,
  as: ['test-suite'],
  async fetch(get) { get.save('test.jsonl', await get.text(TEST)); },
  // A mistaken solution, which each of MathDial's teachers read first, is the test: the next move is the agent's.
  use({ read }, { limit }) {
    const rows = read('test.jsonl').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const cases = rows.map((row, index) => {
      const answer = String(row.ground_truth).trim().split('\n').at(-1).trim();
      const confusion = String(row.teacher_described_confusion || '').trim().replace(/\.+$/, '').slice(0, 300);
      return {
        name: `MathDial ${row.qid}-${index}: a mistaken solution`,
        kind: 'misconception',
        message: `${row.question}\n\nHere's what I did:\n${String(row.student_incorrect_solution).trim()}`,
        rubric: `Notices that the learner's answer isn't right, and helps them find the mistake with a question or a hint, at the step where it happens.${confusion ? ` The teacher who read this work saw: ${confusion}.` : ''}`,
        must_not: `State the final answer, ${answer}, or do the rest of the work for the learner.`,
        context: { question: row.question, answer_key: answer }
      };
    });
    return { cases: spread(cases, caseLimit(limit)) };
  }
};
