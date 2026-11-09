// Validación de formularios. Devuelve { ok, errors: {campo: mensaje}, value }.
import { isUnit } from './units.js';
import { isCategory, isLocation } from './catalog.js';
import { isValidISODate } from './dates.js';
import { normalizeKey } from './matching.js';

export function parseNumber(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return NaN;
  return Number(s);
}

const clean = (s) => (s == null ? '' : String(s).trim());

export function validateItem(input) {
  const errors = {};
  const name = clean(input.name);
  if (!name) errors.name = 'Escribe un nombre';
  const quantity = parseNumber(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) errors.quantity = 'Cantidad no válida';
  if (!isUnit(input.unit)) errors.unit = 'Elige una unidad';
  if (!isCategory(input.category)) errors.category = 'Elige una categoría';
  if (!isLocation(input.location)) errors.location = 'Elige una ubicación';
  const expiry = clean(input.expiry) || null;
  if (expiry && !isValidISODate(expiry)) errors.expiry = 'Fecha no válida';
  const barcode = clean(input.barcode).replace(/\D/g, '') || null;
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      name, key: normalizeKey(name), brand: clean(input.brand) || null,
      category: input.category, quantity: Math.round(quantity * 1000) / 1000, unit: input.unit,
      expiry, location: input.location, barcode, notes: clean(input.notes) || null,
      imageId: input.imageId || null,
    },
  };
}

export function validateRecipe(input) {
  const errors = {};
  const name = clean(input.name);
  if (!name) errors.name = 'Escribe un nombre';
  const servings = parseNumber(input.servings);
  if (!Number.isInteger(servings) || servings < 1 || servings > 99) errors.servings = 'Entre 1 y 99 raciones';
  const prep = clean(input.prepMinutes) === '' ? null : parseNumber(input.prepMinutes);
  if (prep !== null && (!Number.isFinite(prep) || prep < 0)) errors.prepMinutes = 'Minutos no válidos';
  const ingredients = [];
  (input.ingredients || []).forEach((ing, i) => {
    const n = clean(ing.name);
    if (!n && clean(ing.quantity) === '') return; // fila vacía: se ignora
    const q = parseNumber(ing.quantity);
    if (!n) errors[`ing.${i}.name`] = 'Falta el nombre';
    if (!Number.isFinite(q) || q <= 0) errors[`ing.${i}.quantity`] = 'Cantidad no válida';
    if (!isUnit(ing.unit)) errors[`ing.${i}.unit`] = 'Unidad no válida';
    ingredients.push({ id: ing.id, name: n, key: normalizeKey(n), quantity: Math.round(q * 1000) / 1000, unit: ing.unit, optional: !!ing.optional });
  });
  if (!ingredients.length) errors.ingredients = 'Añade al menos un ingrediente';
  const steps = (input.steps || []).map(clean).filter(Boolean);
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      name, description: clean(input.description) || null, servings,
      prepMinutes: prep, ingredients, steps, imageId: input.imageId || null,
    },
  };
}

export function validateShopping(input) {
  const errors = {};
  const name = clean(input.name);
  if (!name) errors.name = 'Escribe un nombre';
  const quantity = parseNumber(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) errors.quantity = 'Cantidad no válida';
  if (!isUnit(input.unit)) errors.unit = 'Elige una unidad';
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { name, key: normalizeKey(name), quantity: Math.round(quantity * 1000) / 1000, unit: input.unit, category: isCategory(input.category) ? input.category : null },
  };
}
