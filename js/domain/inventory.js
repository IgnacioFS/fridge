// Reglas del inventario: filtros, orden, consumo y altas desde la compra.
import { areCompatible, convert, toBaseMilli } from './units.js';
import { expiryStatus, daysUntil } from './dates.js';
import { normalizeKey } from './matching.js';

const round3 = (n) => Math.round(n * 1000) / 1000;

export function filterItems(items, { query = '', category = null, location = null, status = null, now = new Date(), soonDays } = {}) {
  const q = normalizeKey(query);
  return items.filter((it) => {
    if (category && it.category !== category) return false;
    if (location && it.location !== location) return false;
    if (status) {
      const s = expiryStatus(it.expiry, now, soonDays);
      if (status === 'expired' && s !== 'expired') return false;
      if (status === 'soon' && s !== 'soon') return false;
      if (status === 'out' && it.quantity > 0) return false;
    }
    if (q) {
      const hay = `${it.key} ${normalizeKey(it.brand || '')} ${it.barcode || ''}`;
      if (!q.split(' ').every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

export function sortItems(items, by = 'expiry') {
  const arr = [...items];
  if (by === 'name') {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  } else {
    // Por caducidad: primero los que tienen fecha (más próxima antes), luego sin fecha por nombre.
    arr.sort((a, b) => {
      if (a.expiry && b.expiry) return a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : a.name.localeCompare(b.name, 'es');
      if (a.expiry) return -1;
      if (b.expiry) return 1;
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
  }
  return arr;
}

/** Productos que necesitan atención: caducados, caducan pronto o agotados. */
export function attention(items, now = new Date(), soonDays) {
  const expired = [];
  const soon = [];
  const out = [];
  for (const it of items) {
    const s = expiryStatus(it.expiry, now, soonDays);
    if (s === 'expired') expired.push(it);
    else if (s === 'soon') soon.push(it);
    if (!(it.quantity > 0)) out.push(it);
  }
  const byDays = (a, b) => daysUntil(a.expiry, now) - daysUntil(b.expiry, now);
  return { expired: expired.sort(byDays), soon: soon.sort(byDays), out };
}

/** Ajusta la cantidad (nunca negativa). */
export function adjustQuantity(item, delta, now) {
  const q = round3(Math.max(Number(item.quantity) + Number(delta), 0));
  return { ...item, quantity: q, updatedAt: now };
}

/** Consume una cantidad expresada en cualquier unidad compatible. Devuelve null si no es compatible. */
export function consume(item, quantity, unit, now) {
  const inItemUnit = convert(quantity, unit, item.unit);
  if (inItemUnit === null) return null;
  return adjustQuantity(item, -inItemUnit, now);
}

/** Productos del inventario a los que se podría sumar una compra (misma clave, unidad compatible). */
export function mergeCandidates(items, { key, unit, barcode }) {
  return items.filter((it) =>
    ((key && it.key === key) || (barcode && it.barcode && it.barcode === barcode))
    && areCompatible(it.unit, unit));
}

/** Suma una cantidad a un producto existente; opcionalmente actualiza la caducidad. */
export function addToExisting(item, quantity, unit, { expiry, now } = {}) {
  const add = convert(quantity, unit, item.unit);
  if (add === null) return null;
  const next = { ...item, quantity: round3(Number(item.quantity) + add), updatedAt: now };
  // Si se indica caducidad, se conserva la más próxima (criterio conservador).
  if (expiry) next.expiry = item.expiry && item.expiry < expiry && Number(item.quantity) > 0 ? item.expiry : expiry;
  return next;
}

export function totalByLocation(items) {
  const out = { nevera: 0, congelador: 0, despensa: 0 };
  for (const it of items) if (out[it.location] !== undefined) out[it.location]++;
  return out;
}

export { toBaseMilli };
