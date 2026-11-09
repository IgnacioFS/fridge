// Consulta de productos por código de barras. Proveedores intercambiables.
import { parseQuantityText } from '../domain/units.js';
import { checksumOK } from './barcode/ean.js';

export class LookupError extends Error {
  /** kind: 'offline' | 'timeout' | 'network' | 'server' | 'invalid' */
  constructor(kind, message) { super(message); this.kind = kind; }
}

// Categorías de Open Food Facts → categorías de FRIDGE (se busca la primera coincidencia).
const OFF_CATEGORY_RULES = [
  ['congelados', ['frozen']],
  ['huevos', ['eggs']],
  ['lacteos', ['dairies', 'milks', 'cheeses', 'yogurts', 'butters', 'creams', 'fermented-milk']],
  ['pescados', ['fishes', 'seafood', 'fish-and-seafood']],
  ['conservas', ['canned', 'preserves', 'canned-foods', 'tomato-sauces', 'pickles']],
  ['carnes', ['meats', 'poultries', 'hams', 'sausages', 'charcuteries', 'prepared-meats']],
  ['bebidas', ['beverages', 'waters', 'juices', 'sodas', 'wines', 'beers', 'coffees', 'teas']],
  ['panaderia', ['breads', 'pastries', 'viennoiseries', 'biscuits', 'cakes']],
  ['cereales', ['pastas', 'rices', 'cereals', 'breakfast-cereals', 'legumes', 'flours', 'cereals-and-potatoes']],
  ['frutas', ['fruits', 'fresh-fruits']],
  ['verduras', ['vegetables', 'fresh-vegetables']],
];

export function mapOFFCategory(tags = []) {
  const clean = tags.map((t) => String(t).replace(/^[a-z]{2}:/, ''));
  // Recorre de lo más específico (final) a lo más general.
  for (const tag of [...clean].reverse()) {
    for (const [cat, keys] of OFF_CATEGORY_RULES) {
      if (keys.some((k) => tag === k || tag.endsWith(`-${k}`) || tag.startsWith(`${k}-`))) return cat;
    }
  }
  return null;
}

/** Convierte la respuesta de OFF en un borrador de producto (o null si no existe). */
export function parseOFFResponse(json, code) {
  if (!json || json.status !== 1 || !json.product) return null;
  const p = json.product;
  const name = (p.product_name_es || p.product_name || p.generic_name_es || p.generic_name || '').trim();
  const brand = (p.brands || '').split(',')[0].trim();
  const qty = parseQuantityText(p.quantity);
  return {
    barcode: code,
    name: name || null,
    brand: brand || null,
    category: mapOFFCategory(p.categories_tags || []),
    imageUrl: p.image_front_small_url || p.image_front_url || p.image_url || null,
    quantity: qty?.quantity ?? null,
    unit: qty?.unit ?? null,
    source: 'Open Food Facts',
  };
}

export class OpenFoodFactsProvider {
  constructor({ fetchImpl = (...a) => fetch(...a), timeoutMs = 9000 } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.name = 'Open Food Facts';
  }

  async lookup(code) {
    const fields = 'product_name,product_name_es,generic_name,generic_name_es,brands,categories_tags,quantity,image_front_small_url,image_front_url,image_url';
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}&lc=es`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    } catch (e) {
      if (e?.name === 'AbortError') throw new LookupError('timeout', 'La consulta ha tardado demasiado');
      throw new LookupError(isOffline() ? 'offline' : 'network', 'No se pudo conectar con Open Food Facts');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) return null; // producto inexistente
    if (!res.ok) throw new LookupError('server', `Open Food Facts respondió con error ${res.status}`);
    let json;
    try { json = await res.json(); } catch { throw new LookupError('server', 'Respuesta no válida de Open Food Facts'); }
    return parseOFFResponse(json, code);
  }
}

function isOffline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }

/**
 * Busca primero en datos locales (productos ya registrados con ese código) y luego en
 * los proveedores remotos, en orden. Nunca lanza por «no encontrado»: devuelve null.
 */
export class ProductLookup {
  constructor({ providers = [new OpenFoodFactsProvider()], localSource = () => [] } = {}) {
    this.providers = providers;
    this.localSource = localSource;
  }

  async lookup(rawCode) {
    const code = String(rawCode || '').replace(/\D/g, '');
    if (!(code.length === 8 || code.length === 13 || code.length === 12)) throw new LookupError('invalid', 'El código debe tener 8, 12 o 13 dígitos');
    const normalized = code.length === 12 ? `0${code}` : code; // UPC-A → EAN-13
    if (!checksumOK(normalized)) throw new LookupError('invalid', 'El código no es válido (dígito de control incorrecto)');

    const local = this.localSource().find((x) => x.barcode === normalized);
    if (local) {
      return { result: { barcode: normalized, name: local.name, brand: local.brand, category: local.category, imageId: local.imageId, quantity: null, unit: local.unit, source: 'local' }, code: normalized };
    }
    if (isOffline()) throw new LookupError('offline', 'Sin conexión a Internet');
    let lastError = null;
    for (const p of this.providers) {
      try {
        const r = await p.lookup(normalized);
        if (r) return { result: r, code: normalized };
      } catch (e) { lastError = e; }
    }
    if (lastError) throw lastError;
    return { result: null, code: normalized };
  }
}
