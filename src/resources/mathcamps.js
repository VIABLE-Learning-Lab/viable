import { caseLimit, questionCases } from './cases.js';

const PROBLEMS = 'https://raw.githubusercontent.com/gpoesia/mathcamps/46593eb08001e0aa084a0a839195ce0a4615a45b/problems/v1/mathcamps.json';

export default {
  id: 'mathcamps',
  version: 1,
  as: ['test-suite'],
  async fetch(get) { get.save('mathcamps.json', await get.text(PROBLEMS)); },
  // --standard picks an activity's standard, or a stretch of them by the start of its code (6.EE).
  use({ read }, { limit, standard = null }) {
    const originals = JSON.parse(read('mathcamps.json')).filter((item) => item.type === 'original-problem');
    const asked = String(standard ?? '').trim().toUpperCase();
    const fitting = asked ? originals.filter((item) => item.standard.toUpperCase() === asked || item.standard.toUpperCase().startsWith(`${asked}.`)) : originals;
    if (!fitting.length) {
      const codes = [...new Set(originals.map((item) => item.standard))].sort();
      throw Object.assign(new Error(`MathCAMPS has no problem for standard "${standard}". It has: ${codes.join(', ')}.`), { code: 'invalid_resource_option', status: 400 });
    }
    const questions = fitting.map((item) => ({ id: item.id, question: item.statement, answer: String(item.answer).trim() }));
    return { cases: questionCases(questions, { limit: caseLimit(limit), source: 'MathCAMPS' }) };
  }
};
