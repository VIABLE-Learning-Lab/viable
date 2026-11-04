// A stdio MCP server for the mcp path of callComponent: its tool "echo" answers as a step component,
// its output the arguments it got and the names of its environment's variables, with one flag. node mcp-server.mjs <mode>: echo, text (the same
// answer as text only), ask (asks the client to sample first, then answers as text), fail (isError),
// slow (never answers the call), crash (exits when called), noise (writes a line that isn't JSON).
import { createInterface } from 'node:readline';

const mode = process.argv[2];
// Without a mode it is being run as a test file (a bare node --test runs everything under test/).
if (!mode) process.exit(0);
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
let call = null;

for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } } });
    continue;
  }
  if (message.method === 'tools/call') {
    call = message;
    if (mode === 'ask') { send({ jsonrpc: '2.0', id: 'sample', method: 'sampling/createMessage', params: { messages: [] } }); continue; }
  } else if (message.id !== 'sample') continue;
  const answer = { output: { received: call.params.arguments, env: Object.keys(process.env).sort(), ...(message.id === 'sample' ? { sampling: message.error?.code } : {}) }, flags: [{ label: 'Echoed', reason: 'The fixture answers with what it got.' }] };
  const said = [{ type: 'text', text: JSON.stringify(answer) }];
  if (mode === 'echo') send({ jsonrpc: '2.0', id: call.id, result: { content: said, structuredContent: answer } });
  if (mode === 'text' || mode === 'ask') send({ jsonrpc: '2.0', id: call.id, result: { content: said } });
  if (mode === 'fail') send({ jsonrpc: '2.0', id: call.id, result: { content: [{ type: 'text', text: 'The fixture refuses.' }], isError: true } });
  if (mode === 'crash') { process.stderr.write('fixture: crashed on purpose\n'); process.exit(3); }
  if (mode === 'noise') process.stdout.write('starting up...\n');
}
