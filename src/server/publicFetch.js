/**
 * Fetch for a host on Node: a name that resolves to a private address is refused, when it is looked up
 * and again as the connection is made, so an answer that changes in between (a very short TTL, on purpose)
 * doesn't get through. A Worker's own transport refuses those when it connects, so this never reaches one:
 * a Node host injects it as the engine's httpFetch, and the engine and its steps stay free of Node built-ins.
 */
import { lookup as resolveName } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable, pipeline } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

/** Whether an address a name resolves to is private, or otherwise not on the public internet. */
export function isPrivateAddress(address) {
  const value = String(address).toLowerCase();
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
  const v4 = isIP(value) === 4 ? value : /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value)?.[1] ?? (mapped ? [...mapped[1].padStart(4, '0').match(/../g), ...mapped[2].padStart(4, '0').match(/../g)].map((part) => Number.parseInt(part, 16)).join('.') : null);
  if (v4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  // Loopback, unique local, link local, multicast, and the prefixes that carry an IPv4 address inside (NAT64, 6to4).
  return value.startsWith('::') || /^f[cd]/.test(value) || /^fe[89a-f]/.test(value) || /^ff/.test(value) || value.startsWith('64:ff9b:') || value.startsWith('2002:');
}

const UNPACK = { gzip: createGunzip, 'x-gzip': createGunzip, deflate: createInflate, br: createBrotliDecompress };

const refused = (hostname) => Object.assign(new Error(`${hostname} resolves to a private address, which this server doesn't fetch.`), { status: 422, code: 'http_url_not_allowed' });

/**
 * What fetch does for these steps over a connection of its own, whose address is checked as it is made.
 * It never follows a redirect: a caller looks each hop up itself, as Fetch URL does. It asks for no
 * compression, and unpacks what a site compresses anyway.
 */
export const pinnedFetch = ({ resolve = resolveName, isPrivate = isPrivateAddress } = {}) => async (target, init) => {
  const prepared = new Request(target, init);
  const url = new URL(prepared.url);
  const headers = Object.fromEntries(prepared.headers);
  delete headers['accept-encoding'];
  const body = prepared.body ? Buffer.from(await prepared.arrayBuffer()) : null;
  const lookup = (hostname, options, done) => resolve(hostname, options, (error, address, family) => {
    if (error) return done(error);
    const answers = Array.isArray(address) ? address : [{ address }];
    return answers.some((answer) => isPrivate(answer.address)) ? done(refused(hostname)) : done(null, address, family);
  });
  return new Promise((settle, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, { method: prepared.method, headers: { accept: '*/*', 'user-agent': 'viable-harness', ...headers }, lookup, signal: prepared.signal, agent: false }, (reply) => {
      // A site chooses what it sends here, and a status or header a Response can't hold mustn't end the server.
      try {
        const answer = new Headers();
        for (let index = 0; index < reply.rawHeaders.length; index += 2) answer.append(reply.rawHeaders[index], reply.rawHeaders[index + 1]);
        const empty = prepared.method === 'HEAD' || [204, 205, 304].includes(reply.statusCode);
        const unpack = empty ? null : UNPACK[String(reply.headers['content-encoding']).toLowerCase()];
        const body = empty ? null : Readable.toWeb(unpack ? pipeline(reply, unpack(), () => {}) : reply);
        if (unpack) { answer.delete('content-encoding'); answer.delete('content-length'); }
        const response = new Response(body, { status: reply.statusCode, statusText: reply.statusMessage, headers: answer });
        if (empty) reply.resume();
        settle(response);
      } catch (error) {
        reply.destroy();
        reject(error);
      }
    });
    request.on('error', reject);
    // Node drops a 101 without a word to anyone, which would leave a run waiting for ever.
    request.on('close', () => reject(new Error(`${url.hostname} closed the connection without an answer.`)));
    request.end(body ?? undefined);
  });
};

/** fetch (default: pinnedFetch) that first looks the name up, and refuses it if any answer is private. */
export const publicFetch = (fetch = pinnedFetch(), { lookup = dnsLookup } = {}) => async (target, init) => {
  const { hostname } = new URL(target);
  const found = await lookup(hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true });
  if (found.some((entry) => isPrivateAddress(entry.address))) throw refused(hostname);
  return fetch(target, init);
};
