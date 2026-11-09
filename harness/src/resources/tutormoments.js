import { caseLimit, spread } from './cases.js';

// A pinned revision, so the same suite is the same cases.
const REVISION = '3bb0c104d65e29facffca7ba864ef10fa22d0e78';
const MOMENTS = `https://huggingface.co/datasets/allenai/tutormoments-preview/resolve/${REVISION}/moments.jsonl`;
const NEEDS = {
  scaffolding: {
    rubric: 'The learner is stuck in a way they can’t get past alone: the reply scaffolds, with a smaller step, a hint, part of a worked example or a guiding question, and leaves the next step to them.',
    must_not: 'Give the answer, or do the rest of the work. Nor only tell them to try again or explain more, which leaves them where they are.'
  },
  rigor: {
    rubric: 'The learner can go further on their own: the reply pushes for rigor, asking them to explain, justify, check or extend what they did.',
    must_not: 'Do the next step for them, give the answer, or hand them a hint they don’t need.'
  }
};

// TutorMoments: each moment is the conversation up to where the tutor's next move matters, and the move teachers marked.
// Its sessions are spoken and long (a median of 225 short turns): a speaker's turns in a row are one message, so the
// twelve a case holds reach further back. A moment cut on the tutor's own words is left out (35 of the 520), since a
// case ends on the learner and moving the cut would change what the teachers marked.
const sentences = (text, most) => { const clean = String(text || '').trim().replace(/\s+/g, ' '); if (clean.length <= most) return clean.replace(/\.+$/, ''); const cut = clean.slice(0, most); const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! ')); return (end > most / 2 ? cut.slice(0, end) : cut.replace(/\s+\S*$/, '')).replace(/\.+$/, ''); };
export default {
  id: 'tutormoments',
  version: 2,
  as: ['test-suite'],
  async fetch(get) { get.save('moments.jsonl', await get.text(MOMENTS)); },
  use({ read }, { limit }) {
    const rows = read('moments.jsonl').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const cases = rows.flatMap((row) => {
      const dimension = row.rubric?.gold || row.dimension;
      const need = NEEDS[dimension];
      const turns = (row.context || []).filter((turn) => String(turn?.text || '').trim());
      if (!need || !turns.length || turns.at(-1).role === 'tutor') return [];
      const merged = [];
      for (const turn of turns) {
        const role = turn.role === 'tutor' ? 'assistant' : 'user';
        const text = String(turn.text).trim();
        if (merged.at(-1)?.role === role) merged.at(-1).content = `${merged.at(-1).content}\n${text}`.slice(-4000);
        else merged.push({ role, content: text.slice(0, 4000) });
      }
      const messages = merged.slice(-12);
      while (messages.length && messages[0].role !== 'user') messages.shift();
      if (!messages.length) return [];
      const hint = sentences(row.rubric?.hint, 600);
      const [conversation] = String(row.id).split(':').at(-1).split('_');
      const span = String(row.id).split('__hum_').at(-1).split('_');
      return [{
        name: `TutorMoments ${conversation.slice(0, 8)}${span.length === 2 ? ` (turns ${span[0]}–${span[1]})` : ''}: ${dimension === 'rigor' ? 'push for rigor' : 'scaffold'}`,
        kind: dimension,
        messages,
        rubric: `${need.rubric}${hint ? ` The teacher who marked this moment saw: ${hint}.` : ''}`,
        must_not: need.must_not,
        context: { moment: row.id, needs: dimension }
      }];
    });
    // As many of each as the limit allows, so a short run still asks both questions.
    const count = caseLimit(limit);
    const half = (dimension, n) => spread(cases.filter((item) => item.kind === dimension), n);
    return { cases: [...half('scaffolding', Math.ceil(count / 2)), ...half('rigor', Math.floor(count / 2))] };
  }
};
