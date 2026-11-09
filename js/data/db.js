// IndexedDB mínima con promesas. Una base de datos, un almacén por colección.

export const DB_NAME = 'fridge';
export const DB_VERSION = 1;
export const STORES = ['inventory', 'recipes', 'shopping', 'images', 'meta'];

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openDB(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no disponible')); return; }
    const open = indexedDB.open(name, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      // Migraciones por versión: añadir aquí `if (oldVersion < 2) {...}` en el futuro.
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña'));
  });
}

/** Repositorio sobre un almacén de IndexedDB. */
export class IDBRepository {
  constructor(db, store) { this.db = db; this.store = store; }
  tx(mode) { return this.db.transaction(this.store, mode).objectStore(this.store); }
  getAll() { return req(this.tx('readonly').getAll()); }
  get(id) { return req(this.tx('readonly').get(id)); }
  put(obj) { return req(this.tx('readwrite').put(obj)).then(() => obj); }
  delete(id) { return req(this.tx('readwrite').delete(id)); }
  clear() { return req(this.tx('readwrite').clear()); }
  /** Escribe varios objetos en una sola transacción (todo o nada). */
  putMany(objs) {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(this.store, 'readwrite');
      const s = t.objectStore(this.store);
      for (const o of objs) s.put(o);
      t.oncomplete = () => resolve(objs);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transacción abortada'));
    });
  }
}

/** Repositorio en memoria (pruebas y modo de emergencia si IndexedDB falla). */
export class MemoryRepository {
  constructor() { this.map = new Map(); }
  async getAll() { return [...this.map.values()].map((o) => structuredClone(o)); }
  async get(id) { const o = this.map.get(id); return o ? structuredClone(o) : undefined; }
  async put(obj) { this.map.set(obj.id, structuredClone(obj)); return obj; }
  async delete(id) { this.map.delete(id); }
  async clear() { this.map.clear(); }
  async putMany(objs) { for (const o of objs) this.map.set(o.id, structuredClone(o)); return objs; }
}

export async function createRepositories({ memory = false } = {}) {
  if (!memory) {
    try {
      const db = await openDB();
      return { persistent: true, ...Object.fromEntries(STORES.map((s) => [s, new IDBRepository(db, s)])) };
    } catch (e) {
      console.error('IndexedDB no disponible, se usa memoria', e);
    }
  }
  return { persistent: false, ...Object.fromEntries(STORES.map((s) => [s, new MemoryRepository()])) };
}
