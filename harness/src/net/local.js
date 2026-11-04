/**
 * What "this computer" means to a server with no token. Such a server answers only here, so a name that
 * isn't local (DNS rebinding), a proxy that says it is one, and another site's post all get nothing. A
 * proxy that says nothing and sets Host to 127.0.0.1 looks like this computer, which is why nothing a
 * person must not see is granted by this alone: the teacher's page and the panel take a token, and only a
 * try-out on this machine keeps a local grant. No Node built-ins.
 */
const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOOPBACK = /^(?:127\.|::1$|::ffff:127\.)/;
const FORWARDED = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'true-client-ip', 'cf-connecting-ip'];
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Whether a name is this computer's own. */
export const isLocalName = (name) => LOCAL_NAMES.has(name) || name.endsWith('.localhost');

/** Whether a request's name and socket are this computer's, and no proxy says it passed it on. */
export const isLocalRequest = (request, url, context = {}) => LOCAL_NAMES.has(url.hostname) && (!context.address || LOOPBACK.test(context.address)) && !FORWARDED.some((name) => request.headers.has(name));

/** Why a server with no token refuses this request, or null. allowedOrigin: the one other origin the operator named. */
export function refusedWithoutToken(request, url, context = {}, allowedOrigin = null) {
  if (!isLocalRequest(request, url, context)) return 'This server has no token, so it answers only on the computer it runs on. Give it a token to reach it from anywhere else.';
  if (READS.has(request.method)) return null;
  const origin = request.headers.get('origin');
  if (allowedOrigin && origin === allowedOrigin) return null;
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return 'This server has no token, so it takes a post only from its own pages or a program on this computer.';
  return null;
}
