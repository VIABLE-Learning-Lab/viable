/**
 * When the AI writes first, without being asked: the moments a learning page watches for, as the
 * activity's teacher set them (speaks_up, utils/teaching.js), and what the AI is told at each. The page
 * sends which moment it was, never the learner's words; the server checks the moment is one the teacher
 * chose and holds to how often (most in a step, gap between two). A move says what is happening, that
 * the AI is writing first, and what to do, which a teacher or researcher can write themselves (say). Each
 * rests on studies, and says what isn't known. No Node built-ins.
 */
import { teachingSettings } from './utils/teaching.js';

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
// What a note on their writing is about: anything worth a look unless the teacher says.
const FOCUS = {
  language: { look: ' for spelling, grammar or punctuation', fix: 'spelling, grammar or punctuation mistakes' },
  ideas: { look: ' in their ideas, argument or structure', fix: 'places where the ideas or structure need work' },
  rubric: { look: ' against what makes it good (the rubric)', fix: 'places that miss what makes it good (the rubric)' }
};
const focusOf = (set) => FOCUS[set?.focus] || { look: '', fix: 'mistakes or gaps' };
// How far a note on their writing goes, from the least: asks how it is going, points to a place, says what to fix.
const ON_WRITING = {
  ask: () => 'In one sentence, ask how the writing is going or what they are working on now. Don’t comment on the text.',
  point: (set) => `Read their draft. Point to the one place most worth another look${focusOf(set).look}, as a question: which sentence or part, not what is wrong or how to fix it. If nothing stands out, say one thing that works and leave them to it.`,
  fix: (set) => `Read their draft. Name the one or two ${focusOf(set).fix} most worth fixing now: where, and what to change, in a few words. Let them make the change: don’t rewrite their sentences, and don’t list everything.`
};

export const SPEAK_UP = {
  quiet: {
    label: 'They have been quiet for a while', says: 'Checking in',
    now: (set) => `The learner hasn’t written, answered or asked anything on this step for ${set?.minutes || 'a few'} minutes, with the page open.`,
    does: () => 'In one or two short sentences, offer one small way in, or ask what they are thinking. Make it easy for them to say they are fine. Don’t give the answer.',
    sources: 'Aleven et al. (2003); D’Mello & Graesser (2012)',
    shows: 'Learners often don’t ask for help when they need it. Confusion helps learning when it is resolved, and turns into frustration when it lasts.'
  },
  alone: {
    label: 'They have worked a while without asking', says: 'Checking in',
    now: (set) => `The learner has been working on this step for ${set?.minutes || 'some'} minutes without writing to you.`,
    does: () => 'In one sentence, ask how it is going, or offer to look at something with them. Don’t start a lesson, and make it easy to say they are fine.',
    sources: 'Aleven et al. (2003)',
    shows: 'Learners who need help often don’t ask for it, even while they keep working.'
  },
  wrong: {
    label: 'Their answer wasn’t right', says: 'About your answer',
    now: (set) => `The learner has just checked an answer and it wasn’t right${set?.after > 1 ? `, for the ${ORDINAL[set.after] || `${set.after}th`} time` : ''}.`,
    does: () => 'Don’t give the right answer or say which choice it is. Ask how they got theirs, or point to the one thing to look at again.',
    sources: 'Shute (2008); Koedinger & Aleven (2007)',
    shows: 'Feedback that says what to look at again helps more than a bare right or wrong. Help that comes too soon can take the thinking away, so waiting for a second try leaves the first to them.'
  },
  right: {
    label: 'Their answer was right', says: 'About your answer',
    now: () => 'The learner has just got an answer right.',
    does: () => 'Say so in a few words, then ask them to say why it works or how they knew. Don’t explain it for them.',
    sources: 'Chi et al. (1994); Bisra et al. (2018)',
    shows: 'Asking learners to explain why something works helps them learn it.'
  },
  writing: {
    label: 'They are writing', says: 'About your writing',
    now: (set) => `The learner is writing, and has added about ${set?.words || 'a hundred'} words since you last looked, then paused.`,
    does: (set) => (ON_WRITING[set?.how] || ON_WRITING.ask)(set),
    sources: 'Graham, Hebert & Harris (2015); Van Beuningen et al. (2012); Kang & Han (2015)',
    shows: 'Feedback on writing improves it. In second-language writing, both pointing to an error and correcting it improve accuracy.'
  },
  handed_in: {
    label: 'They handed in their writing', says: 'On your writing',
    now: () => 'The learner has just handed in their writing.',
    does: (set) => (set?.how === 'ask' ? 'Ask how they feel about it, and what they would change with more time.' : set?.how === 'fix' ? `Say one thing that works, then name the one or two ${focusOf(set).fix} most worth fixing, and what to change. Don’t rewrite it for them.` : `Say one thing that works, and the one thing most worth another look${focusOf(set).look}, as a question. Don’t rewrite any of it for them.`),
    sources: 'Hattie & Timperley (2007); Graham, Hebert & Harris (2015)',
    shows: 'Feedback helps most when it says where the work is going, how it is going and what to do next.'
  }
};

/** What no one has shown yet, for whoever chooses these. */
export const SPEAK_UP_UNKNOWN = 'Most of this comes from tutoring systems with written hints, from human tutors and from feedback on finished drafts. Whether an AI that writes first helps or interrupts, and when, has hardly been tested: the minutes, words and tries are places to start, not findings.';

/** The moments an activity's settings ask for: { quiet, alone, wrong, right, writing, handed_in, most, gap }, each moment only where set, or null. */
export const speaksUpOf = (teaching) => teachingSettings(teaching)?.speaks_up || null;

/** Whether a moment the page sent is one the teacher chose. */
export const speaksUpFor = (teaching, kind) => {
  const set = speaksUpOf(teaching);
  return Boolean(set && Object.hasOwn(SPEAK_UP, kind) && set[kind]);
};

/** What a learner's page needs to watch for: when each moment comes and how often, never what the AI is told then. */
export function speaksUpOnPage(teaching) {
  const set = speaksUpOf(teaching);
  if (!set) return null;
  const watched = {};
  if (set.quiet) watched.quiet = { minutes: set.quiet.minutes };
  if (set.alone) watched.alone = { minutes: set.alone.minutes };
  if (set.wrong) watched.wrong = { after: set.wrong.after };
  if (set.right) watched.right = { every: set.right.every };
  if (set.writing) watched.writing = { words: set.writing.words };
  if (set.handed_in) watched.handed_in = true;
  return { ...watched, most: set.most, gap: set.gap };
}

/** The move for a moment, with the teacher's settings for it: what is happening, that the AI writes first, and what to do. */
export function speakUpMove(kind, set = null) {
  const moment = SPEAK_UP[kind];
  if (!moment) return '';
  const own = set && typeof set === 'object' ? set : null;
  return `${moment.now(own)} You are writing first: they didn’t ask. ${own?.say || moment.does(own)}`;
}

/** What the AI is told for a turn it speaks first, with the turn's other instructions: "Right now: …". teaching: the activity's, for the moment's own settings. */
export const speakUpNote = (kind, teaching = null) => (Object.hasOwn(SPEAK_UP, kind) ? `Right now: ${speakUpMove(kind, speaksUpOf(teaching)?.[kind])}` : '');

/** What stands in for the learner's message on a turn the AI speaks first: the page, not the learner, and in brackets so no one reads it as theirs. */
export const speakUpInput = (kind) => `[Not from the learner: the page says ${SPEAK_UP[kind]?.label.toLowerCase() || 'something happened'}. Write to them first.]`;
