// Goals and tracking: a teacher's goal becomes test cases a person reads, run against each version of the AI.
import { DRAFT_KINDS, draftMessages, readDrafts } from '../testCases.js';

export default {
  id: 'goals',
  label: 'Set goals and track them',
  summary: 'Turns a teacher\'s goal into test cases for a person to read, to run against each version of the AI with viable-harness test.',
  build({ teaching = null, goal = null, section = null, count = 8 }) {
    const settings = goal ? { ...teaching, goal } : teaching;
    const { messages, kinds } = draftMessages(settings, { count, section });
    return { expects: 'json', messages, kinds, kinds_mean: Object.fromEntries(kinds.map((kind) => [kind, DRAFT_KINDS[kind]])), count };
  },
  check(output, turn) {
    const drafted = readDrafts(JSON.stringify(output), { count: turn.count, kinds: turn.kinds });
    return [...drafted.rejected.map((item) => `A case can't be used: ${item.reason}`), ...drafted.missing.map((kind) => `No case covers ${kind}.`)];
  }
};
