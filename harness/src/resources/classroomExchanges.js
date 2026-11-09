// Exchanges from 4th and 5th grade math lessons (the NCTE transcripts, anonymized): a student's turn and the teacher's
// reply, rated by experts. Each set checks a judge model against those experts as a calibration set, half pass and half
// fail, with no labels of the person's own. Only the two turns and the rating are kept.
import { caseLimit, spread } from './cases.js';
import { parseCsv } from './csv.js';

const majority = (value) => (String(value).trim() === '' ? null : Number(value));

function calibrationSet({ id, url, file, name, people, rubric, verdict }) {
  return {
    id,
    version: 1,
    as: ['calibration-set'],
    async fetch(get) { get.save(file, await get.text(url)); },
    use({ read }, { limit }) {
      const rated = parseCsv(read(file))
        .map((row) => ({ name: name(row), said: String(row.student_text || '').trim(), reply: String(row.teacher_text || '').trim(), label: verdict(row) }))
        .filter((item) => item.label && item.said && item.reply);
      const count = caseLimit(limit, 30, 200);
      const half = (label, size) => spread(rated.filter((item) => item.label === label), size);
      const picked = [...half('pass', Math.ceil(count / 2)), ...half('fail', Math.floor(count / 2))];
      return {
        people,
        cases: picked.map((item) => ({ name: item.name, messages: [{ role: 'user', content: item.said.slice(0, 4000) }], rubric, reply: item.reply.slice(0, 4000) })),
        labels: Object.fromEntries(picked.map((item) => [item.name, item.label]))
      };
    }
  };
}

// High uptake (2) passes and low (0) fails; mid (1), or no majority among the three raters, leaves no pass or fail to compare.
export const conversationalUptake = calibrationSet({
  id: 'conversational-uptake',
  url: 'https://raw.githubusercontent.com/ddemszky/conversational-uptake/67fb30cf7c3ea6f619487e33d2f99692dca107d0/data/uptake_data.csv',
  file: 'uptake_data.csv',
  name: (row) => `Uptake ${row.obs_id}-${row.exchange_idx}`,
  people: 'the majority of three experts in math instruction',
  rubric: 'Shows that the learner was heard by building on what they just said, for example by acknowledging, repeating or reformulating it.',
  verdict: (row) => ({ 2: 'pass', 0: 'fail' })[majority(row.uptake_majority)] ?? null
});

// Focusing (2) passes and funneling (1) fails; neither (0: no follow-up, or not about math), or no majority, is left out.
export const funnelingFocusing = calibrationSet({
  id: 'funneling-focusing-questions',
  url: 'https://raw.githubusercontent.com/sterlingalic/funneling-focusing/0bcda55da92853c3e26b1d6b2b62f3577094a097/funneling_focusing_data.csv',
  file: 'funneling_focusing_data.csv',
  name: (row) => `Focusing ${row.uidx}`,
  people: 'the majority of three raters',
  rubric: 'Asks a focusing question: it prompts the learner to reflect on their own thinking and treats what they said as something to make sense of, rather than funneling them toward an expected answer.',
  verdict: (row) => ({ 2: 'pass', 1: 'fail' })[majority(row.follow_up_unfiltered_majority)] ?? null
});
