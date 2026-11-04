/**
 * The handler (handler.js) on a Node request and response: node:http's, or an Express-style one such
 * as Firebase Functions' and Cloud Functions', whose body is already read (req.rawBody). Any function
 * from a web Request to a Response can be served this way.
 */
import { createServer } from 'node:http';
import { Readable, pipeline } from 'node:stream';

// Whatever the handler leaves unread is discarded, so a caller still sending hears the answer, not a
// reset; the server's request timeout ends a caller who never stops.
const discardBody = (req) => { req.removeAllListeners('data'); req.resume(); };

// A stream of the body, read only as fast as the handler asks.
function bodyStream(req) {
  return new ReadableStream({
    start(controller) {
      req.on('data', (chunk) => {
        controller.enqueue(new Uint8Array(chunk));
        if (controller.desiredSize <= 0) req.pause();
      });
      req.on('end', () => controller.close());
      req.on('error', (error) => controller.error(error));
      req.pause();
    },
    pull() { req.resume(); },
    cancel() { discardBody(req); }
  });
}

// Aborts if the caller leaves before the answer is whole, and never after it, so work done only for
// them can stop. A response's 'close' says this: a request's fires as soon as its body has been read.
function callerLeaves(res) {
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableFinished) controller.abort(); });
  return controller.signal;
}

/**
 * A web Request from a Node request; behind a proxy the first X-Forwarded-Proto says the scheme. Given
 * the response, its signal aborts when the caller leaves.
 */
export function toRequest(req, res = null) {
  const scheme = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket?.encrypted ? 'https' : 'http');
  // Joined, never resolved: a target of //127.0.0.1/x must not replace the Host a browser sent.
  const target = String(req.url || '/');
  const path = target.startsWith('/') ? target : new URL(target, 'http://localhost').pathname;
  let url;
  try { url = new URL(`${scheme}://${req.headers.host || 'localhost'}${path}`); } catch { url = new URL(`${scheme}://invalid.invalid${path}`); }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    for (const each of [].concat(value ?? [])) headers.append(name, each);
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body = !hasBody ? undefined : req.rawBody ?? bodyStream(req);
  return new Request(url, { method: req.method, headers, body, ...(body && !req.rawBody ? { duplex: 'half' } : {}), ...(res ? { signal: callerLeaves(res) } : {}) });
}

/** Sends a web Response on a Node response, streaming its body, and stops reading it if the caller leaves. */
export function sendResponse(res, response) {
  const headers = {};
  for (const [name, value] of response.headers) if (name !== 'set-cookie') headers[name] = value;
  const cookies = response.headers.getSetCookie();
  res.writeHead(response.status, { ...headers, ...(cookies.length ? { 'set-cookie': cookies } : {}) });
  if (!response.body) { res.end(); return Promise.resolve(); }
  return new Promise((resolve) => { pipeline(Readable.fromWeb(response.body), res, () => resolve()); });
}

/** (req, res) => Promise for handler, for node:http's createServer or an Express-style host; address says who called (req.ip on a host behind a proxy). */
export const nodeListener = (handler) => async (req, res) => {
  try {
    const response = await handler(toRequest(req, res), { address: req.ip || req.socket?.remoteAddress || null });
    await sendResponse(res, response);
    if (!req.rawBody && !req.complete) discardBody(req);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'The server failed to answer.', type: 'server_error', code: 'server_error' } })); } else res.end();
  }
};

/** handler on host:port: { server, url }. */
export async function listen(handler, { port = 8080, host = '127.0.0.1' } = {}) {
  const server = createServer(nodeListener(handler));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  return { server, url: `http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}` };
}

/** On SIGINT or SIGTERM, stops taking requests and exits once those under way are answered and kept. A platform's kill ends any that take too long. */
export function stopOnSignal(server) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(() => process.exit(0));
      // A connection whose answer has just gone out stays open for its client, which would hold this up by seconds.
      setInterval(() => server.closeIdleConnections(), 100).unref();
    });
  }
}
