/* Offline-first storage: one IndexedDB database, a ledger document and a file store. */
const DB_NAME = 'team-ledger-4';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('data'); r.result.createObjectStore('files'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
export async function idb(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, mode), st = tx.objectStore(store); let out;
    const r = fn(st); if (r) r.onsuccess = () => { out = r.result; };
    tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  });
}
export const fileGet = id => idb('files', 'readonly', s => s.get(id));
export const filePut = (id, v) => idb('files', 'readwrite', s => s.put(v, id));
export const fileDel = id => idb('files', 'readwrite', s => s.delete(id));
export const filesClear = () => idb('files', 'readwrite', s => s.clear());
export async function fileAll() { const keys = await idb('files', 'readonly', s => s.getAllKeys()); const out = {}; for (const k of keys || []) out[k] = await fileGet(k); return out; }
export const docGet = key => idb('data', 'readonly', s => s.get(key));
export const docPut = (key, v) => idb('data', 'readwrite', s => s.put(v, key));
