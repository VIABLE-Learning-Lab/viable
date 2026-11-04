/**
 * What a server keeps between requests, wherever it runs: { get(key), put(key, value), delete(key),
 * list(prefix) }, with JSON values and keys such as conversations/<id>. get answers null for a key
 * that isn't there; list answers the keys under a prefix, sorted. memoryStore lasts until the process
 * stops; fileStore.js keeps it in a folder, and each cloud's scaffold (deploy/) has its own.
 */
export const memoryStore = () => {
  const items = new Map();
  return {
    get: async (key) => (items.has(key) ? JSON.parse(items.get(key)) : null),
    put: async (key, value) => { items.set(key, JSON.stringify(value)); },
    delete: async (key) => { items.delete(key); },
    list: async (prefix = '') => [...items.keys()].filter((key) => key.startsWith(prefix)).sort()
  };
};
