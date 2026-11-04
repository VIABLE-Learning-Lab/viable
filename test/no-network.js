// Preloaded by npm test: a test that reaches the internet fails instead of calling a real model.
// Local servers a test starts itself (localhost) still answer.
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';

// Nor does a test ask a real name server: a name is public, unless it says otherwise.
dns.lookup = async (name, options) => {
  const address = name === 'localhost' ? '127.0.0.1' : name.startsWith('private-') ? '10.0.0.8' : '93.184.216.34';
  return options?.all ? [{ address, family: 4 }] : { address, family: 4 };
};
syncBuiltinESMExports();

const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const { hostname } = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return real(input, init);
  throw new Error(`A test reached the network (${hostname}); pass a scripted fetch.`);
};
