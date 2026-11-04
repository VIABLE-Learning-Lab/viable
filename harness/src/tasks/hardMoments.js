// Coordinating on hard moments: the teacher chooses a strategy from the learning sciences for when learners
// struggle; it joins what the AI is told, and turns flagged in records become a pack for a conversation about
// productive and unproductive struggle.
import { teacherNote, teachingContext } from '../utils/teaching.js';
import { measured } from './evidence.js';

export const STRATEGIES = {
  attempt_first: { label: 'Try first', text: 'When a learner is stuck, ask them to try something first, even if unsure, and build on what they do. Struggle before help is part of the plan.', source: 'Kapur (2008, 2016): productive failure' },
  keep_the_work: { label: 'Keep the work with the learner', text: 'Give the smallest hint that lets the learner take the next step themselves. Never take the step for them.', source: 'Bastani et al. (2025): safeguards against over-reliance' },
  explain_why: { label: 'Ask them to explain', text: 'When a learner gets something right or wrong, ask them to say why. Their explanation is what you respond to.', source: 'Chi et al. (1994): self-explanation' },
  change_approach: { label: 'Change approach when it repeats', text: 'When the same difficulty comes back, stop repeating the hint: use a picture, a simpler case or a worked example of a similar problem, then hand it back.', source: 'Beck & Gong (2013): wheel-spinning' }
};

export default {
  id: 'hard-moments',
  label: 'Coordinate on hard moments',
  summary: 'Adds the strategy a teacher chose for when learners struggle to what the AI is told, and gathers flagged moments for a conversation about productive and unproductive struggle.',
  build({ teaching = null, section = null, strategy = 'keep_the_work', records = [] }) {
    const chosen = STRATEGIES[strategy];
    if (!chosen) throw Object.assign(new Error(`No strategy "${strategy}". Strategies: ${Object.keys(STRATEGIES).join(', ')}.`), { status: 400, code: 'invalid_task' });
    const taught = teachingContext(teaching, section);
    const moments = measured(records).flatMap((learner) => {
      const spinning = learner.measures.skills.filter((skill) => skill.wheel_spinning).map((skill) => skill.skill);
      const flagged = learner.turns.filter((turn) => turn?.flag === 'struggling').map((turn) => ({ at: turn.started_at, ...(turn.message ? { message: turn.message } : {}), ...(turn.reply ? { reply: turn.reply } : {}) }));
      return spinning.length || flagged.length ? [{ learner: learner.user, skills: spinning, turns: flagged }] : [];
    });
    return {
      strategy: { id: strategy, ...chosen },
      strategies: STRATEGIES,
      // For the teacher's eyes, with learners' codes: not for a model.
      moments,
      instructions: [taught ? teacherNote(taught.text) : null, `When the learner struggles: ${chosen.text} How far to go still comes first.`].filter(Boolean).join('\n\n')
    };
  }
};
