// Lista de la compra: fusión sin duplicados y etiquetas por receta.
// Todas las funciones son puras: reciben la lista y devuelven una nueva.
import { areCompatible, convert, toBaseMilli, fromBaseMilli } from './units.js';
import { normalizeKey } from './matching.js';
import { suggestCategory } from './catalog.js';

const round3 = (n) => Math.round(n * 1000) / 1000;

/** Línea pendiente (no comprada) equivalente: misma clave y unidad compatible. */
export function findMergeTarget(list, key, unit) {
  return list.find((x) => !x.checked && x.key === key && areCompatible(x.unit, unit)) || null;
}

/** Línea pendiente con la misma clave pero unidad incompatible (para avisar). */
export function findIncompatibleTwin(list, key, unit) {
  return list.find((x) => !x.checked && x.key === key && !areCompatible(x.unit, unit)) || null;
}

/**
 * Añade un producto manualmente. Si ya existe una línea pendiente compatible, suma.
 * Devuelve { list, item, merged }.
 */
export function addManual(list, { name, quantity, unit, category }, factory) {
  const key = normalizeKey(name);
  const target = findMergeTarget(list, key, unit);
  if (target) {
    const add = convert(quantity, unit, target.unit);
    const updated = { ...target, quantity: round3(target.quantity + add), updatedAt: factory.now() };
    return { list: list.map((x) => (x.id === target.id ? updated : x)), item: updated, merged: true };
  }
  const item = factory.create({
    name: name.trim(), key, quantity: round3(Number(quantity)), unit,
    category: category || suggestCategory(key) || 'otros',
    checked: false, addedToInventory: false, sources: [],
  });
  return { list: [...list, item], item, merged: false };
}

/**
 * Añade los ingredientes que faltan de una receta.
 * - Fusiona con líneas pendientes compatibles.
 * - Si la receta ya aportaba a esa línea, REEMPLAZA su aportación (no suma dos veces).
 * Devuelve { list, added, merged, updated }.
 */
export function addFromRecipe(list, recipe, missing, factory) {
  let out = [...list];
  const stats = { added: 0, merged: 0, updated: 0 };
  for (const m of missing) {
    const key = m.key || normalizeKey(m.name);
    const target = findMergeTarget(out, key, m.unit);
    if (target) {
      const contribution = convert(m.quantity, m.unit, target.unit);
      const prev = target.sources.find((s) => s.recipeId === recipe.id);
      const delta = prev ? contribution - prev.quantity : contribution;
      const sources = prev
        ? target.sources.map((s) => (s.recipeId === recipe.id ? { ...s, recipeName: recipe.name, quantity: round3(contribution) } : s))
        : [...target.sources, { recipeId: recipe.id, recipeName: recipe.name, quantity: round3(contribution) }];
      const updated = { ...target, quantity: round3(Math.max(target.quantity + delta, 0)), sources, updatedAt: factory.now() };
      out = out.map((x) => (x.id === target.id ? updated : x));
      if (prev) stats.updated++; else stats.merged++;
    } else {
      const item = factory.create({
        name: m.name.trim(), key, quantity: round3(m.quantity), unit: m.unit,
        category: m.category || suggestCategory(key) || 'otros',
        checked: false, addedToInventory: false,
        sources: [{ recipeId: recipe.id, recipeName: recipe.name, quantity: round3(m.quantity) }],
      });
      out.push(item);
      stats.added++;
    }
  }
  return { list: out, ...stats };
}

/**
 * Quita la etiqueta de una receta sin eliminar el producto.
 * Resta lo que aportaba; si la línea se quedaría sin cantidad, conserva la cantidad actual.
 */
export function removeSource(item, recipeId, now) {
  const src = item.sources.find((s) => s.recipeId === recipeId);
  if (!src) return item;
  const rest = round3(item.quantity - src.quantity);
  return {
    ...item,
    quantity: rest > 0 ? rest : item.quantity,
    sources: item.sources.filter((s) => s.recipeId !== recipeId),
    updatedAt: now,
  };
}

/** Cantidad que ya está en la lista (pendiente) para una clave, expresada en `unit`. null si no hay. */
export function pendingQuantityFor(list, key, unit) {
  let milli = 0;
  let found = false;
  for (const x of list) {
    if (x.checked || x.key !== key || !areCompatible(x.unit, unit)) continue;
    milli += toBaseMilli(x.quantity, x.unit);
    found = true;
  }
  return found ? fromBaseMilli(milli, unit) : null;
}

export function setChecked(item, checked, now) {
  return { ...item, checked, checkedAt: checked ? now : null, updatedAt: now };
}

/** Agrupa por categoría respetando el orden del catálogo. */
export function groupByCategory(items, categories) {
  const groups = categories.map((c) => ({ category: c, items: [] }));
  const idx = new Map(categories.map((c, i) => [c.id, i]));
  for (const it of items) {
    const i = idx.has(it.category) ? idx.get(it.category) : idx.get('otros');
    groups[i].items.push(it);
  }
  for (const g of groups) g.items.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return groups.filter((g) => g.items.length);
}
