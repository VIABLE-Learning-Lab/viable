// A detector component over HTTP, in plain Node: the harness POSTs { learning_events: { events,
// turns } } to /detect and reads { marks: [{ turn_index, label, evidence }] } back.
//   node server.mjs [port]   (default 8787, on 127.0.0.1 only)
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const ASKS = /\b(?:just tell me(?: the answer)?|give me the answer|tell me the answer|what(?:'s| is) the answer)\b/i;

/** The method itself: one mark per turn whose message asks for the answer. */
export function detect(payload) {
  const turns = Array.isArray(payload?.learning_events?.turns) ? payload.learning_events.turns : [];
  return {
    marks: turns.flatMap((turn, index) => {
      const found = String(turn?.message ?? '').match(ASKS);
      return found ? [{ turn_index: index, label: 'Asked for the answer', evidence: `The learner wrote “${found[0]}”.` }] : [];
    })
  };
}

export function server() {
  return createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/detect') return response.writeHead(404).end();
    let body = '';
    for await (const chunk of request) body += chunk;
    let payload;
    try { payload = JSON.parse(body); } catch { return response.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"Send JSON."}'); }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(detect(payload)));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 8787);
  server().listen(port, '127.0.0.1', () => console.log(`Listening on http://127.0.0.1:${port}/detect`));
}
