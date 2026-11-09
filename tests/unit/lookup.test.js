import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProductLookup, OpenFoodFactsProvider, LookupError, mapOFFCategory, parseOFFResponse } from '../../js/services/productLookup.js';

const okFetch = (json, status = 200) => async () => ({ ok: status < 400, status, json: async () => json });

test('mapea categorías de Open Food Facts', () => {
  assert.equal(mapOFFCategory(['en:plant-based-foods', 'en:cereals-and-potatoes', 'en:pastas', 'en:dry-pastas']), 'cereales');
  assert.equal(mapOFFCategory(['en:dairies', 'en:milks', 'en:whole-milks']), 'lacteos');
  assert.equal(mapOFFCategory(['en:beverages', 'en:waters']), 'bebidas');
  assert.equal(mapOFFCategory(['en:frozen-foods', 'en:frozen-vegetables']), 'congelados');
  assert.equal(mapOFFCategory(['en:snacks']), null);
});

test('interpreta un producto encontrado (escenario 2)', () => {
  const r = parseOFFResponse({ status: 1, product: { product_name_es: 'Leche entera', brands: 'Pascual, Calidad Pascual', categories_tags: ['en:dairies', 'en:milks'], quantity: '1 l', image_front_small_url: 'https://x/img.jpg' } }, '8410188012092');
  assert.deepEqual(r, { barcode: '8410188012092', name: 'Leche entera', brand: 'Pascual', category: 'lacteos', imageUrl: 'https://x/img.jpg', quantity: 1, unit: 'l', source: 'Open Food Facts' });
});

test('producto no encontrado (escenario 3)', async () => {
  const lk = new ProductLookup({ providers: [new OpenFoodFactsProvider({ fetchImpl: okFetch({ status: 0, status_verbose: 'product not found' }) })] });
  assert.deepEqual(await lk.lookup('8410188012092'), { result: null, code: '8410188012092' });
  const lk404 = new ProductLookup({ providers: [new OpenFoodFactsProvider({ fetchImpl: okFetch({}, 404) })] });
  assert.equal((await lk404.lookup('8410188012092')).result, null);
});

test('sin conexión / error de red (escenario 4)', async () => {
  const lk = new ProductLookup({ providers: [new OpenFoodFactsProvider({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } })] });
  await assert.rejects(lk.lookup('8410188012092'), (e) => e instanceof LookupError && (e.kind === 'network' || e.kind === 'offline'));
  const slow = new OpenFoodFactsProvider({ timeoutMs: 20, fetchImpl: (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))) });
  await assert.rejects(new ProductLookup({ providers: [slow] }).lookup('8410188012092'), (e) => e.kind === 'timeout');
  const srv = new ProductLookup({ providers: [new OpenFoodFactsProvider({ fetchImpl: okFetch({}, 503) })] });
  await assert.rejects(srv.lookup('8410188012092'), (e) => e.kind === 'server');
});

test('valida el código y usa primero los datos locales', async () => {
  const lk = new ProductLookup({ providers: [], localSource: () => [{ barcode: '8410188012092', name: 'Mi leche', unit: 'l', category: 'lacteos' }] });
  await assert.rejects(lk.lookup('123'), (e) => e.kind === 'invalid');
  await assert.rejects(lk.lookup('8410188012093'), (e) => e.kind === 'invalid');
  const r = await lk.lookup('8410188012092');
  assert.equal(r.result.name, 'Mi leche'); assert.equal(r.result.source, 'local');
  // UPC-A de 12 dígitos se normaliza a EAN-13
  assert.equal((await new ProductLookup({ providers: [] }).lookup('012345678905')).code, '0012345678905');
});
