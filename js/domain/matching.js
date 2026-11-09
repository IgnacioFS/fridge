// Identidad de producto: normalización de nombres y coincidencia ingrediente ↔ inventario.

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'y']);

function singular(word) {
  if (word.length <= 3) return word;
  // «nueces» → «nuez», «peces» → «pez» (vocal + ces); «dulces» → «dulce»
  if (/[aeiou]ces$/.test(word) && word.length > 4) return `${word.slice(0, -3)}z`;
  // «limones» → «limon», «panes» → «pan», «cereales» → «cereal» (vocal + l/n/r/d/j + es)
  // pero «verdes», «carnes», «vinagres» → quitar solo la «s».
  if (/[aeiou][lnrdj]es$/.test(word) && word.length > 4) return word.slice(0, -2);
  if (/us$/.test(word)) return word; // «cuscus», «virus»
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
// Palabras que convierten un producto en otro distinto («leche condensada» no es «leche»).
const TRANSFORMERS = new Set([
  'condensada', 'condensado', 'evaporada', 'coco', 'soja', 'avena', 'almendra', 'arroz', 'polvo',
  'frito', 'frita', 'triturado', 'concentrado', 'salsa', 'zumo', 'caldo', 'sopa', 'helado',
  'galleta', 'chocolate', 'cacao', 'vinagre', 'seco', 'seca', 'deshidratado',
]);

/**
 * Relación entre un ingrediente y un producto del inventario:
 * - 'exact'   misma clave.
 * - 'prefix'  el producto es una variante del ingrediente («leche» ↔ «leche entera»). Cuenta.
 * - 'related' parecido pero dudoso: el producto es más genérico que el ingrediente
 *             («leche» en casa para «leche de coco») o lleva un modificador que lo cambia
 *             («tomate frito» para «tomate»). No cuenta: el usuario decide.
 */
export function matchKind(ingredientKey, itemKey) {
  if (!ingredientKey || !itemKey) return null;
  if (ingredientKey === itemKey) return 'exact';
  const a = tokens(ingredientKey);
  const b = tokens(itemKey);
  if (!a.length || !b.length) return null;
  if (a.join(' ') === b.join(' ')) return 'exact';
  const startsWith = (long, short) => short.every((t, i) => long[i] === t);
  if (a.length < b.length && startsWith(b, a)) {
    return b.slice(a.length).some((t) => TRANSFORMERS.has(t)) ? 'related' : 'prefix';
  }
  if (b.length < a.length && startsWith(a, b)) return 'related';
  return null;
}

export function matches(ingredientKey, itemKey) { const k = matchKind(ingredientKey, itemKey); return k === 'exact' || k === 'prefix'; }

/** Busca la línea equivalente (misma clave) en una lista. */
export function findSameProduct(list, key) {
  return list.filter((x) => x.key === key);
}
