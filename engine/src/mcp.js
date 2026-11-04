// The Harness's MCP tools, and the ones that run an agent, over stdio.
import { checkReply } from '../../harness/src/check.js';
import { mcpServer as harnessServer, serveStdio as serveHarness } from '../../harness/src/mcp.js';
import { mcpTools } from '../../harness/src/mcpTools.js';
import { draftCases, runAgentTests } from '../../harness/src/testRuns.js';
import { runAgent } from './run.js';

export { MAX_ARGUMENTS, PROTOCOL_VERSIONS } from '../../harness/src/mcp.js';

export const TOOLS = mcpTools({ checkReply, runAgent, draftCases, runAgentTests: (doc, cases, options) => runAgentTests(doc, cases, { ...options, runAgent }) });
export const mcpServer = (options = {}) => harnessServer({ ...options, tools: TOOLS });
export const serveStdio = (options = {}) => serveHarness({ ...options, tools: TOOLS });
