// Preloaded by npm test: a test that reaches the internet fails instead of calling a real model.
// Local servers a test starts itself (localhost) still answer.
const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const { hostname } = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return real(input, init);
  throw new Error(`A test reached the network (${hostname}); pass a scripted fetch.`);
};
