// Storage adapters. Both expose the same small async interface so the rest of
// the app (and the unit tests) never touch IndexedDB directly.
//
//   get(store, key) put(store, value) putMany(store, values) delete(store, key)
//   getAll(store) getAllByIndex(store, index, value) clear(store) count(store)

export const DB_NAME = 'battersEye';
export const DB_VERSION = 1;

export const STORES = {
  kv: { keyPath: 'key', indexes: [] },
  sessions: { keyPath: 'id', indexes: ['startedAt', 'kind'] },
  trials: { keyPath: 'id', indexes: ['sessionId', 'module', 't'] },
  staircases: { keyPath: 'key', indexes: [] },
  assessments: { keyPath: 'id', indexes: ['at'] },
  plans: { keyPath: 'id', indexes: [] },
  realResults: { keyPath: 'id', indexes: ['date'] },
};

export const STORE_NAMES = Object.keys(STORES);

function reqP(req) {
  return new Promise((ok, fail) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

function txDone(tx) {
  return new Promise((ok, fail) => {
    tx.oncomplete = () => ok();
    tx.onabort = tx.onerror = () => fail(tx.error);
  });
}

export async function openIndexedDB(name = DB_NAME, idb = globalThis.indexedDB) {
  if (!idb) throw new Error('IndexedDB not available');
  const open = idb.open(name, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    for (const [store, def] of Object.entries(STORES)) {
      if (db.objectStoreNames.contains(store)) continue;
      const os = db.createObjectStore(store, { keyPath: def.keyPath });
      for (const ix of def.indexes) os.createIndex(ix, ix, { unique: false });
    }
  };
  const db = await reqP(open);
  // Ask the browser not to evict our data under storage pressure.
  try { await navigator.storage?.persist?.(); } catch { /* optional */ }

  const run = async (store, mode, fn) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    const value = result instanceof IDBRequest ? await reqP(result) : await result;
    await txDone(tx);
    return value;
  };

  return {
    kind: 'indexeddb',
    get: (s, k) => run(s, 'readonly', (os) => os.get(k)),
    put: (s, v) => run(s, 'readwrite', (os) => os.put(v)),
    putMany: (s, vs) => run(s, 'readwrite', (os) => { for (const v of vs) os.put(v); }),
    delete: (s, k) => run(s, 'readwrite', (os) => os.delete(k)),
    getAll: (s) => run(s, 'readonly', (os) => os.getAll()),
    getAllByIndex: (s, ix, v) => run(s, 'readonly', (os) => os.index(ix).getAll(v)),
    clear: (s) => run(s, 'readwrite', (os) => os.clear()),
    count: (s) => run(s, 'readonly', (os) => os.count()),
    close: () => db.close(),
  };
}

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export function memoryAdapter() {
  const data = Object.fromEntries(STORE_NAMES.map((s) => [s, new Map()]));
  const keyOf = (s, v) => v[STORES[s].keyPath];
  const sorted = (s) => [...data[s].entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map((e) => clone(e[1]));
  return {
    kind: 'memory',
    async get(s, k) { return clone(data[s].get(k)); },
    async put(s, v) { data[s].set(keyOf(s, v), clone(v)); return keyOf(s, v); },
    async putMany(s, vs) { for (const v of vs) data[s].set(keyOf(s, v), clone(v)); },
    async delete(s, k) { data[s].delete(k); },
    async getAll(s) { return sorted(s); },
    async getAllByIndex(s, ix, val) { return sorted(s).filter((v) => v[ix] === val); },
    async clear(s) { data[s].clear(); },
    async count(s) { return data[s].size; },
    close() {},
  };
}

export async function openBestAdapter() {
  try {
    return await openIndexedDB();
  } catch (err) {
    console.warn('IndexedDB unavailable, data will not persist:', err);
    return memoryAdapter();
  }
}
