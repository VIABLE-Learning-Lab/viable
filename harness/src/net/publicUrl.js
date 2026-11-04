// What makes an address one a step or a component may call: public, HTTPS, port 443, no credentials. No Node built-ins.
function failure(message, code) {
  return Object.assign(new Error(message), { status: 400, code });
}

export function publicUrl(value, allowlist) {
  let url;
  try { url = new URL(value); } catch {
    throw failure('Fetch URL needs a complete HTTPS address.', 'invalid_http_url');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // Reject IP literals (including URL-normalized decimal/hex IPv4), local names,
  // credentials and nonstandard ports. Workers also rejects private DNS targets
  // at connection time, avoiding a DNS-check/fetch rebinding race. A host on Node has
  // no such transport, and injects server/publicFetch.js as httpFetch instead.
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !host.includes('.') || host.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host)) {
    throw failure('Use a public HTTPS hostname on port 443, without URL credentials. Local addresses and IP literals are not supported.', 'http_url_not_allowed');
  }
  if (allowlist?.length && !allowlist.some(entry => {
    const allowed = String(entry).toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    return host === allowed || host.endsWith(`.${allowed}`);
  })) throw failure('This URL is outside the operator-configured hostname restrictions.', 'http_host_not_allowed');
  url.hash = '';
  return url;
}
