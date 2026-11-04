// Adapting a teaching plan from tutoring data: the class's evidence, against the teacher's goal, becomes a summary
// and suggested changes the teacher decides on.
import { suggestChanges } from '../suggest.js';
import { teachingContext } from '../utils/teaching.js';
import { classEvidence, measured, namesALearner } from './evidence.js';

const SYSTEM = `You help a teacher plan what comes next from what happened while an AI tutored their class. Use only the evidence you are given. Say what the records show, never what learners learned or felt. Treat misconceptions as reasoning to build on, and report strengths as well as struggles. Name no learner. The teacher decides everything: suggest, don't instruct.

Answer with JSON only: {"summary": "two or three sentences", "strengths": [{"what": "...", "evidence": "the numbers it rests on"}], "struggles": [{"what": "...", "evidence": "..."}], "next_lesson": "one focus for the next lesson", "changes": [{"change": "a change to how the AI helps", "why": "...", "evidence": "..."}]}`;

export default {
  id: 'adapt-plan',
  label: 'Adapt a plan from tutoring data',
  summary: 'Summarizes a class\'s evidence against the teacher\'s goal, and suggests changes with the evidence beside each, for the teacher to decide.',
  build({ teaching = null, records = [], runs = [] }) {
    const taught = teachingContext(teaching);
    const evidence = classEvidence(records);
    const suggestions = suggestChanges({ teaching, runs, records }).map(({ change, why }) => ({ change, why }));
    return {
      expects: 'json',
      evidence,
      suggestions,
      learners: measured(records).map((learner) => learner.user),
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: [`What the teacher set:\n${taught?.text ?? '(nothing yet)'}`, `The evidence, as counts ("a few" means fewer than three learners):\n${JSON.stringify(evidence, null, 2)}`, `Changes the Harness's rules already suggest, for you to weigh:\n${JSON.stringify(suggestions, null, 2)}`].join('\n\n') }
      ]
    };
  },
  check(output, turn) {
    const problems = [];
    if (!output || typeof output !== 'object') return ['The answer isn\'t the JSON asked for.'];
    for (const list of ['strengths', 'struggles', 'changes']) {
      for (const item of output[list] ?? []) if (!String(item?.evidence ?? '').trim()) problems.push(`Something in ${list} has no evidence beside it.`);
    }
    if (namesALearner(JSON.stringify(output), turn.learners ?? [])) problems.push('It names a learner.');
    return problems;
  }
};
