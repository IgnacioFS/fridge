// Identidad de producto: normalización de nombres y coincidencia ingrediente ↔ inventario.

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'y']);

function singular(word) {
  if (word.length <= 3) return word;
  // «tomates» → «tomate», «limones» → «limon», «nueces» → «nuez», «huevos» → «huevo»
  if (word.endsWith('ces') && word.length > 4) return `${word.slice(0, -3)}z`;
  if (/[^aeiou]es$/.test(word) && !/(ces|ses)$/.test(word) && word.length > 4) {
    const base = word.slice(0, -2);
    // «limones», «panes», «melones» → base termina en consonante válida
    if (/[lnrdj]$/.test(base)) return base;
  }
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Normaliza un nombre a una clave comparable. */
export function normalizeKey(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ');
}

function tokens(key) { return key.split(' ').filter((t) => t && !STOP.has(t)); }

/**
 * ¿El ingrediente (clave) corresponde a este producto del inventario?
 * - Clave idéntica → 'exact'.
 * - Las palabras del ingrediente aparecen al principio del nombre del producto → 'prefix'
 *   («leche» ↔ «leche entera», «tomate» ↔ «tomate pera»).
 * - Las palabras del producto aparecen al principio del ingrediente → 'prefix'
 *   («queso» en inventario cubre «queso rallado» en receta, pero no al revés con otras palabras).
 */
export function matchKind(ingredientKey, itemKey) {
  if (!ingredientKey || !itemKey) return null;
  if (ingredientKey === itemKey) return 'exact';
  const a = tokens(ingredientKey);
  const b = tokens(itemKey);
  if (!a.length || !b.length) return null;
  const startsWith = (long, short) => short.every((t, i) => long[i] === t);
  if (a.length < b.length && startsWith(b, a)) return 'prefix';
  if (b.length < a.length && startsWith(a, b)) return 'prefix';
  return null;
}

export function matches(ingredientKey, itemKey) { return matchKind(ingredientKey, itemKey) !== null; }

/** Busca la línea equivalente (misma clave) en una lista. */
export function findSameProduct(list, key) {
  return list.filter((x) => x.key === key);
}
