// A reply to a learner: what this moment needs from what the teacher set and the open resources (brief.js).
import { turnBrief } from '../brief.js';
import { teacherNote, teachingContext } from '../utils/teaching.js';

export default {
  id: 'tutoring',
  label: 'A reply to a learner',
  summary: 'Reads the moment and gives the model the teacher\'s goal and limit, the teaching move for it, and only what this message calls for.',
  async build({ teaching = null, message = '', history = [], section = null, picker = null, extra = [], whole = false }) {
    if (whole || teaching?.turn_brief === false) {
      const taught = teachingContext(teaching, section);
      return { instructions: taught ? teacherNote(taught.text) : null };
    }
    const brief = await turnBrief(teaching, { message, history, section, picker, extra });
    if (!brief) return {};
    const pick = (items) => items.map(({ id, description, from }) => ({ id, description, ...(from ? { from } : {}) }));
    return {
      instructions: teacherNote(brief.text),
      moment: brief.moment,
      move: brief.move,
      by: brief.by,
      tries: brief.tries,
      flag: brief.flag,
      chosen: { misconceptions: pick(brief.misconceptions), components: pick(brief.components), prior: pick(brief.prior), guidance: brief.guidance.map(({ text, component, source }) => ({ text, ...(component ? { component } : {}), ...(source ? { source } : {}) })) },
      usage: brief.usage,
      ...(brief.picker_error ? { picker_error: brief.picker_error } : {})
    };
  }
};
