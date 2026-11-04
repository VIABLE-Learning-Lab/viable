/**
 * The harness as an MCP server over stdio, for a host that keeps its own harness: newline-delimited
 * JSON-RPC 2.0, with the tools in mcpTools.js and the messages in mcpProtocol.js. Documents arrive as
 * arguments: the server reads and writes no files, and keeps nothing.
 */
import { createInterface } from 'node:readline';
import { runAgent } from './run.js';
import { checkReply } from './check.js';
import { draftCases, runAgentTests } from './testRuns.js';
import { INSTRUCTIONS, mcpTools } from './mcpTools.js';
import { MAX_ARGUMENTS, PROTOCOL_VERSIONS, SERVER_INFO, failure, handleMcpMessage } from './mcpProtocol.js';

export { MAX_ARGUMENTS, PROTOCOL_VERSIONS };
export const TOOLS = mcpTools({ checkReply, runAgent, draftCases, runAgentTests });

/**
 * The server for one connection: a function taking one parsed JSON-RPC message and returning the
 * response, or null for a notification. baseUrl, apiKey and fetch reach the model calls (default:
 * OPENAI_BASE_URL, OPENAI_API_KEY and the global fetch).
 */
export function mcpServer({ baseUrl, apiKey, fetch } = {}) {
  const session = { version: PROTOCOL_VERSIONS[0], views: false };
  return (message) => handleMcpMessage(message, { tools: TOOLS, services: { baseUrl, apiKey, fetch }, instructions: INSTRUCTIONS, session });
}

/** Serves MCP over stdio until input ends: one JSON-RPC message per line in, one per line out. */
export async function serveStdio({ input = process.stdin, output = process.stdout, ...options } = {}) {
  // stdout carries only protocol messages: anything a step logs goes to stderr.
  if (output === process.stdout) console.log = console.info = console.debug = console.error;
  const handle = mcpServer(options);
  const send = (message) => { if (message) output.write(`${JSON.stringify(message)}\n`); };
  const pending = new Set();
  console.error(`viable-harness ${SERVER_INFO.version} MCP server on stdio`);
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    // Each message is handled as it comes, so a ping isn't held up by a running agent.
    const work = (async () => {
      let message;
      try { message = JSON.parse(line); } catch { return send(failure(null, -32700, 'Parse error: each line must be one JSON-RPC message.')); }
      send(await handle(message));
    })();
    pending.add(work);
    work.finally(() => pending.delete(work));
  }
  await Promise.all(pending);
}
