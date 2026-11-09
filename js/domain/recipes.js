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
export function evaluateIngredient(ingredient, inventory, { servings, baseServings, now = new Date() } = {}) {
  const unit = ingredient.unit;
  const required = scaleQuantity(ingredient.quantity, baseServings ?? servings, servings ?? baseServings);
  const usedItems = [];
  const incompatibleItems = [];
  const expiredItems = [];
  let haveMilli = 0;

  for (const item of inventory) {
    const kind = matchKind(ingredient.key, item.key)
      || (ingredient.barcode && item.barcode && ingredient.barcode === item.barcode ? 'barcode' : null);
    if (!kind) continue;
    if (!(Number(item.quantity) > 0)) continue;
    if (expiryStatus(item.expiry, now) === 'expired') { expiredItems.push(item); continue; }
    if (!isUnit(unit) || !areCompatible(item.unit, unit)) { incompatibleItems.push(item); continue; }
    usedItems.push({ item, kind });
    haveMilli += toBaseMilli(item.quantity, item.unit);
  }

  const needMilli = isUnit(unit) ? toBaseMilli(required, unit) : 0;
  const available = isUnit(unit) ? fromBaseMilli(Math.min(haveMilli, needMilli), unit) : 0;
  const missingMilli = Math.max(needMilli - haveMilli, 0);
  const missing = isUnit(unit) ? fromBaseMilli(missingMilli, unit) : required;

  let status;
  if (needMilli > 0 && missingMilli === 0) status = 'available';
  else if (usedItems.length === 0 && incompatibleItems.length > 0) status = 'incomparable';
  else if (haveMilli > 0) status = 'partial';
  else status = 'missing';

  return {
    ingredient, required, unit, status, available, missing,
    totalAvailable: isUnit(unit) ? fromBaseMilli(haveMilli, unit) : 0,
    usedItems, incompatibleItems, expiredItems,
  };
}

/** Evalúa la receta completa. */
export function evaluateRecipe(recipe, inventory, { servings, now = new Date() } = {}) {
  const s = Number(servings) > 0 ? Number(servings) : recipe.servings;
  const results = (recipe.ingredients || []).map((ing) =>
    evaluateIngredient(ing, inventory, { servings: s, baseServings: recipe.servings, now }));
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
  for (const r of evaluation.results) {
    if (r.status === 'partial' || r.status === 'missing') {
      if (r.missing > 0) out.push({ name: r.ingredient.name, key: r.ingredient.key, quantity: r.missing, unit: r.unit });
    } else if (r.status === 'incomparable' && includeIncomparable.includes(r.ingredient.id)) {
      out.push({ name: r.ingredient.name, key: r.ingredient.key, quantity: r.required, unit: r.unit });
    }
  }
  return out;
}

export function unitLabel(u) { return UNITS[u]?.label ?? u; }
