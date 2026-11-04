/**
 * The handler (handler.js) on AWS Lambda: a function URL's or API Gateway HTTP API's event as a web
 * Request, and the Response back, whole (lambdaHandler) or streamed from a function URL set to
 * RESPONSE_STREAM (lambdaStreamHandler). Any function from a web Request to a Response can be served
 * this way.
 */
const TEXT = /^(text\/|application\/(json|javascript|xml)|image\/svg)/;

/** The web Request an event (payload format 2.0) describes. */
export function eventToRequest(event) {
  const http = event.requestContext?.http || {};
  const method = http.method || 'GET';
  const headers = new Headers();
  for (const [name, value] of Object.entries(event.headers || {})) headers.set(name, value);
  if (event.cookies?.length) headers.set('cookie', event.cookies.join('; '));
  const host = headers.get('host') || event.requestContext?.domainName || 'lambda.invalid';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const body = event.body == null || ['GET', 'HEAD'].includes(method) ? undefined : event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
  return new Request(`https://${host}${event.rawPath || http.path || '/'}${query}`, { method, headers, body });
}

const headersOf = (response) => {
  const headers = {};
  for (const [name, value] of response.headers) if (name !== 'set-cookie') headers[name] = value;
  return { statusCode: response.status, headers, cookies: response.headers.getSetCookie() };
};

const contextOf = (event) => ({ address: event.requestContext?.http?.sourceIp || null });

/** (event) => result, the answer held until it is whole: on API Gateway, or a function URL set to BUFFERED. */
export const lambdaHandler = (handler) => async (event) => {
  const response = await handler(eventToRequest(event), contextOf(event));
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = TEXT.test(response.headers.get('content-type') || '');
  return { ...headersOf(response), body: bytes.toString(text ? 'utf8' : 'base64'), isBase64Encoded: !text };
};

/** A streaming handler for a function URL set to RESPONSE_STREAM; only Lambda's Node runtime has the awslambda it needs. */
export const lambdaStreamHandler = (handler, runtime = globalThis.awslambda) => runtime.streamifyResponse(async (event, stream) => {
  const response = await handler(eventToRequest(event), contextOf(event));
  const out = runtime.HttpResponseStream.from(stream, headersOf(response));
  if (response.body) for await (const chunk of response.body) out.write(chunk);
  out.end();
});
