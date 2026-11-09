// Comparación receta ↔ inventario.
import { areCompatible, toBaseMilli, fromBaseMilli, UNITS, isUnit } from './units.js';
import { matchKind } from './matching.js';
import { expiryStatus } from './dates.js';

/** Cantidad escalada según raciones (en milésimas para no perder precisión). */
export function scaleQuantity(quantity, baseServings, servings) {
  const b = Number(baseServings) > 0 ? Number(baseServings) : 1;
  const s = Number(servings) > 0 ? Number(servings) : b;
  return Math.round((Number(quantity) * s / b) * 1000) / 1000;
}

/**
 * Evalúa un ingrediente frente al inventario.
 * Devuelve {
 *   ingredient, required, unit,
 *   status: 'available' | 'partial' | 'missing' | 'incomparable',
 *   available, missing,          // en la unidad del ingrediente
 *   usedItems: [...],            // productos compatibles que cuentan
 *   incompatibleItems: [...],    // productos que coinciden pero con unidad incompatible
 *   expiredItems: [...],         // coinciden pero están caducados (no cuentan)
 * }
 */
export function evaluateIngredient(ingredient, inventory, { servings, baseServings, now = new Date(), consumed = null } = {}) {
  const unit = ingredient.unit;
  const required = scaleQuantity(ingredient.quantity, baseServings ?? servings, servings ?? baseServings);
  const needMilli = isUnit(unit) ? toBaseMilli(required, unit) : 0;
  const usedItems = [];
  const incompatibleItems = [];
  const relatedItems = [];
  const expiredItems = [];
  let haveMilli = 0;

  for (const item of inventory) {
    const kind = matchKind(ingredient.key, item.key)
      || (ingredient.barcode && item.barcode && ingredient.barcode === item.barcode ? 'barcode' : null);
    if (!kind) continue;
    if (!(Number(item.quantity) > 0)) continue;
    if (expiryStatus(item.expiry, now) === 'expired') { expiredItems.push(item); continue; }
    if (kind === 'related') { relatedItems.push(item); continue; }
    if (!isUnit(unit) || !areCompatible(item.unit, unit)) { incompatibleItems.push(item); continue; }
    // Lo que ya han usado otros ingredientes de la misma receta no está disponible.
    const total = toBaseMilli(item.quantity, item.unit);
    const left = total - (consumed?.get(item.id) || 0);
    if (left <= 0) continue;
    const take = Math.min(left, Math.max(needMilli - haveMilli, 0));
    if (consumed && take > 0) consumed.set(item.id, (consumed.get(item.id) || 0) + take);
    usedItems.push({ item, kind });
    haveMilli += left;
  }

  const available = isUnit(unit) ? fromBaseMilli(Math.min(haveMilli, needMilli), unit) : 0;
  const missingMilli = Math.max(needMilli - haveMilli, 0);
  const missing = isUnit(unit) ? fromBaseMilli(missingMilli, unit) : required;

  let status;
  if (needMilli > 0 && missingMilli === 0) status = 'available';
  else if (usedItems.length === 0 && (incompatibleItems.length > 0 || relatedItems.length > 0)) status = 'incomparable';
  else if (haveMilli > 0) status = 'partial';
  else status = 'missing';

  return {
    ingredient, required, unit, status, available, missing,
    totalAvailable: isUnit(unit) ? fromBaseMilli(haveMilli, unit) : 0,
    usedItems, incompatibleItems, relatedItems, expiredItems,
  };
}

/** Evalúa la receta completa. */
export function evaluateRecipe(recipe, inventory, { servings, now = new Date() } = {}) {
  const s = Number(servings) > 0 ? Number(servings) : recipe.servings;
  // Se reparte el inventario: los ingredientes más específicos («tomate pera») eligen antes que
  // los genéricos («tomate»), y un mismo producto no se cuenta dos veces.
  const consumed = new Map();
  const ings = recipe.ingredients || [];
  const order = ings.map((g, i) => i).sort((x, y) => (ings[y].key || '').split(' ').length - (ings[x].key || '').split(' ').length || x - y);
  const results = new Array(ings.length);
  for (const i of order) results[i] = evaluateIngredient(ings[i], inventory, { servings: s, baseServings: recipe.servings, now, consumed });
  const counted = results.filter((r) => !r.ingredient.optional);
  const ready = counted.filter((r) => r.status === 'available').length;
  const missingList = counted.filter((r) => r.status === 'partial' || r.status === 'missing');
  const incomparable = counted.filter((r) => r.status === 'incomparable');
  return {
    servings: s,
    results,
    total: counted.length,
    ready,
    canCook: counted.length > 0 && ready === counted.length,
    missingCount: missingList.length,
    incomparableCount: incomparable.length,
    score: counted.length ? ready / counted.length : 0,
  };
}

/** Lo que falta, listo para añadir a la compra. */
export function missingForShopping(evaluation, { includeIncomparable = [] } = {}) {
  const out = [];
  const push = (r, quantity) => {
    // Dos ingredientes iguales en la misma receta («ajo» y «ajos») se suman en una línea.
    const same = out.find((o) => o.key === r.ingredient.key && areCompatible(o.unit, r.unit));
    if (same) same.quantity = fromBaseMilli(toBaseMilli(same.quantity, same.unit) + toBaseMilli(quantity, r.unit), same.unit);
    else out.push({ name: r.ingredient.name, key: r.ingredient.key, quantity, unit: r.unit });
  };
  for (const r of evaluation.results) {
    if (r.status === 'partial' || r.status === 'missing') {
      if (r.missing > 0) push(r, r.missing);
    } else if (r.status === 'incomparable' && includeIncomparable.includes(r.ingredient.id)) {
      push(r, r.required);
    }
  }
  return out;
}

export function unitLabel(u) { return UNITS[u]?.label ?? u; }
