// The harness's store (get, put, delete, list, with JSON values) in one D1 table, made on first use.
export function d1Store(db) {
  let ready = false;
  const table = async () => {
    if (!ready) {
      await db.prepare('CREATE TABLE IF NOT EXISTS viable_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
      ready = true;
    }
    return db;
  };
  return {
    async get(key) {
      const row = await (await table()).prepare('SELECT value FROM viable_store WHERE key = ?').bind(key).first();
      return row ? JSON.parse(row.value) : null;
    },
    async put(key, value) {
      await (await table()).prepare('INSERT INTO viable_store (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2').bind(key, JSON.stringify(value)).run();
    },
    async delete(key) {
      await (await table()).prepare('DELETE FROM viable_store WHERE key = ?').bind(key).run();
    },
    async list(prefix = '') {
      // substr, not LIKE: a key's own % or _ would be a wildcard.
      const { results } = await (await table()).prepare('SELECT key FROM viable_store WHERE substr(key, 1, ?1) = ?2 ORDER BY key').bind(prefix.length, prefix).all();
      return results.map((row) => row.key);
    }
  };
}
