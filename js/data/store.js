// Store: estado en memoria + acciones. Única puerta de la UI hacia los datos.
import { normalizeKey } from '../domain/matching.js';
import { validateItem, validateRecipe, validateShopping } from '../domain/validation.js';
import * as Inv from '../domain/inventory.js';
import * as Shop from '../domain/shopping.js';
import { defaultLocationFor, suggestCategory } from '../domain/catalog.js';
import { DEFAULT_SOON_DAYS } from '../domain/dates.js';

export const SCHEMA_VERSION = 1;

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class ValidationError extends Error {
  constructor(errors) { super('Revisa los campos marcados'); this.errors = errors; }
}

export class Store extends EventTarget {
  constructor(repos, { clock = () => new Date() } = {}) {
    super();
    this.repos = repos;
    this.clock = clock;
    this.state = { inventory: [], recipes: [], shopping: [], settings: { soonDays: DEFAULT_SOON_DAYS }, loaded: false };
    this.imageURLs = new Map();
    this.factory = {
      now: () => this.clock().toISOString(),
      create: (o) => { const t = this.clock().toISOString(); return { id: uuid(), createdAt: t, updatedAt: t, ...o }; },
    };
  }

  get persistent() { return this.repos.persistent; }
  now() { return this.clock(); }

  async load() {
    const [inventory, recipes, shopping, meta] = await Promise.all([
      this.repos.inventory.getAll(), this.repos.recipes.getAll(), this.repos.shopping.getAll(), this.repos.meta.getAll(),
    ]);
    const settings = meta.find((m) => m.id === 'settings');
    this.state = {
      inventory, recipes, shopping,
      settings: { soonDays: DEFAULT_SOON_DAYS, ...(settings?.value || {}) },
      loaded: true,
    };
    if (!meta.find((m) => m.id === 'schema')) await this.repos.meta.put({ id: 'schema', value: SCHEMA_VERSION });
    this.emit('load');
  }

  emit(reason) { this.dispatchEvent(new CustomEvent('change', { detail: { reason } })); }

  replaceIn(coll, obj) {
    const list = this.state[coll];
    const i = list.findIndex((x) => x.id === obj.id);
    this.state[coll] = i >= 0 ? list.map((x) => (x.id === obj.id ? obj : x)) : [...list, obj];
  }

  // ───────────────────────── Inventario
  getItem(id) { return this.state.inventory.find((x) => x.id === id); }

  async saveItem(input, id = null) {
    const r = validateItem(input);
    if (!r.ok) throw new ValidationError(r.errors);
    const prev = id ? this.getItem(id) : null;
    const obj = prev ? { ...prev, ...r.value, updatedAt: this.factory.now() } : this.factory.create(r.value);
    if (prev && prev.imageId && prev.imageId !== obj.imageId) await this.deleteImage(prev.imageId);
    await this.repos.inventory.put(obj);
    this.replaceIn('inventory', obj);
    this.emit('inventory');
    return obj;
  }

  /** Elimina y devuelve una función para deshacer. */
  async deleteItem(id) {
    const prev = this.getItem(id);
    if (!prev) return () => {};
    await this.repos.inventory.delete(id);
    this.state.inventory = this.state.inventory.filter((x) => x.id !== id);
    this.emit('inventory');
    return async () => { await this.repos.inventory.put(prev); this.replaceIn('inventory', prev); this.emit('inventory'); };
  }

  async adjustItem(id, delta) {
    const prev = this.getItem(id);
    if (!prev) return null;
    const next = Inv.adjustQuantity(prev, delta, this.factory.now());
    await this.repos.inventory.put(next);
    this.replaceIn('inventory', next);
    this.emit('inventory');
    return next;
  }

  async setItemQuantity(id, quantity) {
    const prev = this.getItem(id);
    if (!prev) return null;
    return this.adjustItem(id, Number(quantity) - Number(prev.quantity));
  }

  // ───────────────────────── Recetas
  getRecipe(id) { return this.state.recipes.find((x) => x.id === id); }

  async saveRecipe(input, id = null) {
    const r = validateRecipe(input);
    if (!r.ok) throw new ValidationError(r.errors);
    const value = { ...r.value, ingredients: r.value.ingredients.map((g) => ({ ...g, id: g.id || uuid() })) };
    const prev = id ? this.getRecipe(id) : null;
    const obj = prev ? { ...prev, ...value, updatedAt: this.factory.now() } : this.factory.create(value);
    if (prev && prev.imageId && prev.imageId !== obj.imageId) await this.deleteImage(prev.imageId);
    await this.repos.recipes.put(obj);
    this.replaceIn('recipes', obj);
    // Si cambió el nombre, actualizar etiquetas de la compra.
    if (prev && prev.name !== obj.name) {
      const touched = [];
      for (const s of this.state.shopping) {
        if (s.sources?.some((x) => x.recipeId === obj.id)) {
          const n = { ...s, sources: s.sources.map((x) => (x.recipeId === obj.id ? { ...x, recipeName: obj.name } : x)) };
          touched.push(n);
        }
      }
      if (touched.length) { await this.repos.shopping.putMany(touched); touched.forEach((t) => this.replaceIn('shopping', t)); }
    }
    this.emit('recipes');
    return obj;
  }

  async deleteRecipe(id) {
    const prev = this.getRecipe(id);
    if (!prev) return () => {};
    await this.repos.recipes.delete(id);
    this.state.recipes = this.state.recipes.filter((x) => x.id !== id);
    this.emit('recipes');
    // Las etiquetas de la compra se conservan con el nombre de la receta (histórico).
    return async () => { await this.repos.recipes.put(prev); this.replaceIn('recipes', prev); this.emit('recipes'); };
  }

  // ───────────────────────── Compra
  getShopping(id) { return this.state.shopping.find((x) => x.id === id); }

  async addShopping(input) {
    const r = validateShopping(input);
    if (!r.ok) throw new ValidationError(r.errors);
    const { list, item, merged } = Shop.addManual(this.state.shopping, r.value, this.factory);
    await this.repos.shopping.put(item);
    this.state.shopping = list;
    this.emit('shopping');
    return { item, merged };
  }

  async updateShopping(id, input) {
    const prev = this.getShopping(id);
    if (!prev) return null;
    const r = validateShopping({ ...prev, ...input });
    if (!r.ok) throw new ValidationError(r.errors);
    const next = { ...prev, ...r.value, category: r.value.category || prev.category, updatedAt: this.factory.now() };
    await this.repos.shopping.put(next);
    this.replaceIn('shopping', next);
    this.emit('shopping');
    return next;
  }

  async deleteShopping(id) {
    const prev = this.getShopping(id);
    if (!prev) return () => {};
    await this.repos.shopping.delete(id);
    this.state.shopping = this.state.shopping.filter((x) => x.id !== id);
    this.emit('shopping');
    return async () => { await this.repos.shopping.put(prev); this.replaceIn('shopping', prev); this.emit('shopping'); };
  }

  async toggleShopping(id, checked) {
    const prev = this.getShopping(id);
    if (!prev) return null;
    const next = Shop.setChecked(prev, checked ?? !prev.checked, this.factory.now());
    await this.repos.shopping.put(next);
    this.replaceIn('shopping', next);
    this.emit('shopping');
    return next;
  }

  async removeShoppingSource(id, recipeId) {
    const prev = this.getShopping(id);
    if (!prev) return null;
    const next = Shop.removeSource(prev, recipeId, this.factory.now());
    await this.repos.shopping.put(next);
    this.replaceIn('shopping', next);
    this.emit('shopping');
    return next;
  }

  /** Añade los ingredientes faltantes de una receta. NO toca el inventario. */
  async addMissingToShopping(recipe, missing) {
    const before = new Map(this.state.shopping.map((x) => [x.id, x]));
    const res = Shop.addFromRecipe(this.state.shopping, recipe, missing, this.factory);
    const changed = res.list.filter((x) => before.get(x.id) !== x);
    await this.repos.shopping.putMany(changed);
    this.state.shopping = res.list;
    this.emit('shopping');
    return res;
  }

  async clearPurchased() {
    const gone = this.state.shopping.filter((x) => x.checked);
    for (const g of gone) await this.repos.shopping.delete(g.id);
    this.state.shopping = this.state.shopping.filter((x) => !x.checked);
    this.emit('shopping');
    return async () => { await this.repos.shopping.putMany(gone); this.state.shopping = [...this.state.shopping, ...gone]; this.emit('shopping'); };
  }

  /**
   * Registra en el inventario un producto comprado (solo tras confirmación del usuario).
   * opts: { quantity, unit, location, expiry, mode: 'merge'|'new', targetId }
   */
  async purchaseToInventory(shoppingId, opts) {
    const s = this.getShopping(shoppingId);
    if (!s) throw new Error('El producto ya no está en la lista');
    let saved;
    if (opts.mode === 'merge' && opts.targetId) {
      const target = this.getItem(opts.targetId);
      if (!target) throw new Error('El producto del inventario ya no existe');
      const qty = Number(String(opts.quantity).replace(',', '.'));
      if (!(qty > 0)) throw new ValidationError({ quantity: 'Cantidad no válida' });
      const next = Inv.addToExisting(target, qty, opts.unit, { expiry: opts.expiry || null, now: this.factory.now() });
      if (!next) throw new ValidationError({ unit: 'Unidad incompatible con el producto elegido' });
      await this.repos.inventory.put(next);
      this.replaceIn('inventory', next);
      saved = next;
    } else {
      saved = await this.saveItem({
        name: s.name, category: s.category, quantity: opts.quantity, unit: opts.unit,
        location: opts.location || defaultLocationFor(s.category), expiry: opts.expiry || null,
      });
    }
    const next = { ...s, checked: true, checkedAt: s.checkedAt || this.factory.now(), addedToInventory: true, updatedAt: this.factory.now() };
    await this.repos.shopping.put(next);
    this.replaceIn('shopping', next);
    this.emit('shopping');
    this.emit('inventory');
    return saved;
  }

  /** Añade a la compra un producto agotado del inventario. */
  async restock(item) {
    return this.addShopping({ name: item.name, quantity: 1, unit: ['g', 'kg', 'ml', 'l', 'cl'].includes(item.unit) ? 'ud' : item.unit, category: item.category });
  }

  // ───────────────────────── Ajustes
  async setSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
    await this.repos.meta.put({ id: 'settings', value: this.state.settings });
    this.emit('settings');
  }

  // ───────────────────────── Imágenes
  async saveImage(blob) {
    const id = uuid();
    await this.repos.images.put({ id, blob, createdAt: this.factory.now() });
    return id;
  }

  async deleteImage(id) {
    if (!id) return;
    await this.repos.images.delete(id);
    const url = this.imageURLs.get(id);
    if (url) { URL.revokeObjectURL(url); this.imageURLs.delete(id); }
  }

  async imageURL(id) {
    if (!id) return null;
    if (this.imageURLs.has(id)) return this.imageURLs.get(id);
    const rec = await this.repos.images.get(id);
    if (!rec?.blob) return null;
    const url = URL.createObjectURL(rec.blob);
    this.imageURLs.set(id, url);
    return url;
  }

  // ───────────────────────── Sugerencias
  suggestionsFor(name) {
    const key = normalizeKey(name);
    return { key, category: suggestCategory(key) };
  }

  /** Nombres conocidos para autocompletar (inventario, recetas y compra). */
  knownNames() {
    const set = new Map();
    const add = (n) => { const k = normalizeKey(n); if (k && !set.has(k)) set.set(k, n); };
    this.state.inventory.forEach((x) => add(x.name));
    this.state.shopping.forEach((x) => add(x.name));
    this.state.recipes.forEach((r) => r.ingredients.forEach((g) => add(g.name)));
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }
}
