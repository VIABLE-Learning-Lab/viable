// Agent tests with the Engine's own way of running an agent.
import { runAgentTests as run } from '../../harness/src/testRuns.js';
import { runAgent } from './run.js';

export { agentAt, draftCases, judgeReplies } from '../../harness/src/testRuns.js';

export const runAgentTests = (doc, cases, options = {}) => run(doc, cases, { runAgent, ...options });
