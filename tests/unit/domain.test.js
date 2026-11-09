import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as U from '../../js/domain/units.js';
import * as D from '../../js/domain/dates.js';
import { normalizeKey, matchKind } from '../../js/domain/matching.js';
import { evaluateRecipe, missingForShopping, scaleQuantity } from '../../js/domain/recipes.js';
import * as S from '../../js/domain/shopping.js';
import * as I from '../../js/domain/inventory.js';
import { suggestCategory, CATEGORIES } from '../../js/domain/catalog.js';
import { validateItem, validateRecipe, parseNumber } from '../../js/domain/validation.js';

let seq = 0;
const factory = {
  now: () => '2026-11-09T10:00:00.000Z',
  create: (o) => ({ id: `id${++seq}`, createdAt: factory.now(), updatedAt: factory.now(), ...o }),
};
const NOW = new Date(2026, 10, 9, 12, 0, 0); // 9 nov 2026 local
const inv = (name, quantity, unit, extra = {}) => ({ id: `i-${name}-${unit}-${quantity}`, name, key: normalizeKey(name), quantity, unit, location: 'nevera', category: 'otros', ...extra });
const ing = (name, quantity, unit, extra = {}) => ({ id: `g-${name}`, name, key: normalizeKey(name), quantity, unit, ...extra });

// ───────────── Unidades (escenario 18)
test('conversiones: 1 kg = 1000 g, 1 l = 1000 ml', () => {
  assert.equal(U.convert(1, 'kg', 'g'), 1000);
  assert.equal(U.convert(1, 'l', 'ml'), 1000);
  assert.equal(U.convert(250, 'ml', 'l'), 0.25);
  assert.equal(U.convert(33, 'cl', 'ml'), 330);
});
test('unidades incompatibles no se convierten', () => {
  assert.equal(U.convert(2, 'ud', 'g'), null);
  assert.equal(U.convert(1, 'kg', 'l'), null);
  assert.equal(U.areCompatible('paquete', 'ud'), false);
});
test('sin errores de redondeo en sumas', () => {
  assert.equal(U.sum([{ quantity: 0.1, unit: 'kg' }, { quantity: 0.2, unit: 'kg' }], 'g'), 300);
  assert.equal(U.sum([{ quantity: 0.1, unit: 'l' }, { quantity: 0.2, unit: 'l' }], 'l'), 0.3);
  assert.equal(U.sum([{ quantity: 1, unit: 'ud' }, { quantity: 1, unit: 'g' }], 'g'), null);
});
test('formato legible', () => {
  assert.equal(U.formatSmart(1500, 'g'), '1,5 kg');
  assert.equal(U.formatSmart(0.5, 'l'), '500 ml');
  assert.equal(U.formatSmart(3, 'ud'), '3 ud');
});
test('interpreta cantidades de Open Food Facts', () => {
  assert.deepEqual(U.parseQuantityText('500 g'), { quantity: 500, unit: 'g' });
  assert.deepEqual(U.parseQuantityText('1,5 L'), { quantity: 1.5, unit: 'l' });
  assert.deepEqual(U.parseQuantityText('6 x 125 g'), { quantity: 750, unit: 'g' });
  assert.equal(U.parseQuantityText('1 pack'), null);
});

// ───────────── Fechas
test('estado de caducidad por días locales', () => {
  assert.equal(D.expiryStatus('2026-11-08', NOW), 'expired');
  assert.equal(D.expiryStatus('2026-11-09', NOW), 'soon');
  assert.equal(D.expiryStatus('2026-11-12', NOW), 'soon');
  assert.equal(D.expiryStatus('2026-11-13', NOW), 'ok');
  assert.equal(D.expiryStatus(null, NOW), 'none');
  assert.equal(D.expiryLabel('2026-11-10', NOW), 'Caduca mañana');
  assert.equal(D.expiryLabel('2026-11-06', NOW), 'Caducó hace 3 días');
});
test('validación de fecha', () => {
  assert.equal(D.isValidISODate('2026-02-30'), false);
  assert.equal(D.isValidISODate('2028-02-29'), true);
});

// ───────────── Claves y coincidencias
test('normaliza nombres a claves', () => {
  assert.equal(normalizeKey('Tomates'), 'tomate');
  assert.equal(normalizeKey('  Limones '), 'limon');
  assert.equal(normalizeKey('Huevos'), 'huevo');
  assert.equal(normalizeKey('Champiñones'), 'champinon');
  assert.equal(normalizeKey('Nueces'), 'nuez');
  assert.equal(normalizeKey('Pan'), 'pan');
  assert.equal(normalizeKey('Cereales'), 'cereal');
});
test('coincidencias ingrediente ↔ inventario', () => {
  assert.equal(matchKind('leche', 'leche entera'), 'prefix');
  assert.equal(matchKind('tomate', 'tomate'), 'exact');
  assert.equal(matchKind('tomate', 'tomate frito'), 'prefix');
  assert.equal(matchKind('pan', 'pan rallado'), 'prefix');
  assert.equal(matchKind('pan', 'panceta'), null);
  assert.equal(matchKind('queso', 'requeson'), null);
});
test('sugerencia de categoría por palabras completas', () => {
  assert.equal(suggestCategory(normalizeKey('Leche entera')), 'lacteos');
  assert.equal(suggestCategory(normalizeKey('Aguacates')), 'frutas');
  assert.equal(suggestCategory(normalizeKey('Agua mineral')), 'bebidas');
  assert.equal(suggestCategory(normalizeKey('Atún en lata')), 'conservas');
  assert.equal(suggestCategory(normalizeKey('Cosa rara')), null);
});

// ───────────── Recetas (escenarios 8, 9, 10)
const pasta = {
  id: 'r1', name: 'Pasta con tomate', servings: 2,
  ingredients: [ing('Pasta', 200, 'g'), ing('Tomate', 300, 'g'), ing('Queso', 100, 'g')],
};
test('ejemplo del brief: pasta con tomate', () => {
  const ev = evaluateRecipe(pasta, [inv('Pasta', 100, 'g'), inv('Tomate', 300, 'g')], { now: NOW });
  const [p, t, q] = ev.results;
  assert.equal(p.status, 'partial'); assert.equal(p.missing, 100);
  assert.equal(t.status, 'available'); assert.equal(t.missing, 0);
  assert.equal(q.status, 'missing'); assert.equal(q.missing, 100);
  assert.equal(ev.canCook, false);
  assert.deepEqual(missingForShopping(ev).map((m) => [m.name, m.quantity, m.unit]), [['Pasta', 100, 'g'], ['Queso', 100, 'g']]);
});
test('receta con todo disponible, sumando productos y convirtiendo unidades', () => {
  const ev = evaluateRecipe(pasta, [
    inv('Pasta', 0.1, 'kg'), inv('Pasta integral', 150, 'g'), inv('Tomate', 0.3, 'kg'), inv('Queso rallado', 120, 'g'),
  ], { now: NOW });
  assert.equal(ev.canCook, true);
  assert.equal(ev.results[0].usedItems.length, 2);
});
test('escalado por raciones', () => {
  assert.equal(scaleQuantity(200, 2, 3), 300);
  assert.equal(scaleQuantity(1, 3, 1), 0.333);
  const ev = evaluateRecipe(pasta, [inv('Pasta', 200, 'g'), inv('Tomate', 300, 'g'), inv('Queso', 100, 'g')], { servings: 4, now: NOW });
  assert.equal(ev.results[0].required, 400);
  assert.equal(ev.results[0].missing, 200);
});
test('unidades incompatibles: no se comparan y se avisa', () => {
  const r = { id: 'r2', name: 'Tortilla', servings: 2, ingredients: [ing('Huevos', 200, 'g')] };
  const ev = evaluateRecipe(r, [inv('Huevos', 6, 'ud')], { now: NOW });
  assert.equal(ev.results[0].status, 'incomparable');
  assert.equal(missingForShopping(ev).length, 0);
  assert.equal(missingForShopping(ev, { includeIncomparable: ['g-Huevos'] })[0].quantity, 200);
});
test('los caducados no cuentan como disponibles', () => {
  const ev = evaluateRecipe(pasta, [inv('Queso', 500, 'g', { expiry: '2026-11-01' })], { now: NOW });
  assert.equal(ev.results[2].status, 'missing');
  assert.equal(ev.results[2].expiredItems.length, 1);
});
test('ingredientes opcionales no bloquean', () => {
  const r = { id: 'r3', name: 'X', servings: 1, ingredients: [ing('Sal', 1, 'g', { optional: true }), ing('Arroz', 100, 'g')] };
  assert.equal(evaluateRecipe(r, [inv('Arroz', 1, 'kg')], { now: NOW }).canCook, true);
});

// ───────────── Compra (escenarios 11–15)
test('añadir faltantes con etiqueta de receta', () => {
  const { list } = S.addFromRecipe([], pasta, [{ name: 'Pasta', key: 'pasta', quantity: 100, unit: 'g' }, { name: 'Queso', key: 'queso', quantity: 100, unit: 'g' }], factory);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].sources, [{ recipeId: 'r1', recipeName: 'Pasta con tomate', quantity: 100 }]);
});
test('mismo ingrediente desde varias recetas: una línea, cantidades sumadas, etiquetas conservadas', () => {
  const carbonara = { id: 'r9', name: 'Carbonara' };
  let { list } = S.addFromRecipe([], pasta, [{ name: 'Queso', key: 'queso', quantity: 100, unit: 'g' }], factory);
  ({ list } = S.addFromRecipe(list, carbonara, [{ name: 'Queso', key: 'queso', quantity: 0.05, unit: 'kg' }], factory));
  assert.equal(list.length, 1);
  assert.equal(list[0].quantity, 150);
  assert.deepEqual(list[0].sources.map((s) => s.recipeName), ['Pasta con tomate', 'Carbonara']);
});
test('volver a añadir la misma receta no duplica cantidades', () => {
  let { list } = S.addFromRecipe([], pasta, [{ name: 'Queso', key: 'queso', quantity: 100, unit: 'g' }], factory);
  const r = S.addFromRecipe(list, pasta, [{ name: 'Queso', key: 'queso', quantity: 100, unit: 'g' }], factory);
  assert.equal(r.list.length, 1); assert.equal(r.list[0].quantity, 100); assert.equal(r.updated, 1);
});
test('fusión con un producto manual existente', () => {
  let { list } = S.addManual([], { name: 'queso', quantity: 200, unit: 'g' }, factory);
  ({ list } = S.addFromRecipe(list, pasta, [{ name: 'Queso', key: 'queso', quantity: 100, unit: 'g' }], factory));
  assert.equal(list.length, 1); assert.equal(list[0].quantity, 300);
  const again = S.addManual(list, { name: 'Quesos', quantity: 1, unit: 'kg' }, factory);
  assert.equal(again.merged, true); assert.equal(again.list[0].quantity, 1300);
});
test('unidades incompatibles en la compra: líneas separadas', () => {
  let { list } = S.addManual([], { name: 'Huevos', quantity: 12, unit: 'ud' }, factory);
  ({ list } = S.addManual(list, { name: 'Huevos', quantity: 200, unit: 'g' }, factory));
  assert.equal(list.length, 2);
  assert.ok(S.findIncompatibleTwin(list.slice(0, 1), 'huevo', 'g'));
});
test('no se fusiona con líneas ya compradas', () => {
  let { list } = S.addManual([], { name: 'Leche', quantity: 1, unit: 'l' }, factory);
  list = [S.setChecked(list[0], true, factory.now())];
  ({ list } = S.addManual(list, { name: 'Leche', quantity: 1, unit: 'l' }, factory));
  assert.equal(list.length, 2);
});
test('quitar una etiqueta sin eliminar el producto', () => {
  const carbonara = { id: 'r9', name: 'Carbonara' };
  let { list } = S.addFromRecipe([], pasta, [{ name: 'Queso', key: 'queso', quantity: 100, unit: 'g' }], factory);
  ({ list } = S.addFromRecipe(list, carbonara, [{ name: 'Queso', key: 'queso', quantity: 50, unit: 'g' }], factory));
  let item = S.removeSource(list[0], 'r1', factory.now());
  assert.equal(item.quantity, 50);
  assert.deepEqual(item.sources.map((s) => s.recipeId), ['r9']);
  item = S.removeSource(item, 'r9', factory.now());
  assert.equal(item.quantity, 50, 'si se queda sin cantidad, conserva la actual');
  assert.equal(item.sources.length, 0);
});
test('cantidad ya pendiente en la lista', () => {
  const { list } = S.addManual([], { name: 'Leche', quantity: 1, unit: 'l' }, factory);
  assert.equal(S.pendingQuantityFor(list, 'leche', 'ml'), 1000);
  assert.equal(S.pendingQuantityFor(list, 'pan', 'ud'), null);
});
test('agrupado por categoría', () => {
  const groups = S.groupByCategory([{ name: 'B', category: 'lacteos' }, { name: 'A', category: 'frutas' }, { name: 'Z', category: 'raro' }], CATEGORIES);
  assert.deepEqual(groups.map((g) => g.category.id), ['frutas', 'lacteos', 'otros']);
});

// ───────────── Inventario (escenarios 5, 6, 17)
test('filtros y búsqueda', () => {
  const items = [inv('Leche entera', 1, 'l', { brand: 'Pascual', category: 'lacteos' }), inv('Pollo', 500, 'g', { location: 'congelador', category: 'carnes' })];
  assert.equal(I.filterItems(items, { query: 'pascual' }).length, 1);
  assert.equal(I.filterItems(items, { query: 'LECHE' }).length, 1);
  assert.equal(I.filterItems(items, { location: 'congelador' })[0].name, 'Pollo');
  assert.equal(I.filterItems(items, { category: 'lacteos' }).length, 1);
});
test('orden por caducidad y nombre', () => {
  const items = [inv('B', 1, 'ud'), inv('A', 1, 'ud', { expiry: '2026-12-01' }), inv('C', 1, 'ud', { expiry: '2026-11-10' })];
  assert.deepEqual(I.sortItems(items, 'expiry').map((x) => x.name), ['C', 'A', 'B']);
  assert.deepEqual(I.sortItems(items, 'name').map((x) => x.name), ['A', 'B', 'C']);
});
test('consumo con unidades compatibles y nunca negativo', () => {
  const leche = inv('Leche', 1, 'l');
  assert.equal(I.consume(leche, 250, 'ml', 'now').quantity, 0.75);
  assert.equal(I.consume(leche, 5, 'l', 'now').quantity, 0);
  assert.equal(I.consume(leche, 1, 'ud', 'now'), null);
});
test('sumar compra a producto existente', () => {
  const items = [inv('Leche', 1, 'l', { expiry: '2026-11-20' }), inv('Leche', 6, 'ud')];
  const c = I.mergeCandidates(items, { key: 'leche', unit: 'ml' });
  assert.equal(c.length, 1);
  const next = I.addToExisting(c[0], 500, 'ml', { expiry: '2026-12-01', now: 'now' });
  assert.equal(next.quantity, 1.5);
  assert.equal(next.expiry, '2026-11-20', 'mantiene la caducidad más próxima');
});
test('atención: caducados, pronto y agotados', () => {
  const a = I.attention([inv('A', 1, 'ud', { expiry: '2026-11-01' }), inv('B', 0, 'ud', { expiry: '2026-11-10' }), inv('C', 1, 'ud')], NOW);
  assert.equal(a.expired.length, 1); assert.equal(a.soon.length, 1); assert.equal(a.out.length, 1);
});

// ───────────── Validación (escenarios 1, 7)
test('formulario de alimento: opcionales no obligatorios, coma decimal', () => {
  const r = validateItem({ name: ' Yogur ', quantity: '1,5', unit: 'kg', category: 'lacteos', location: 'nevera' });
  assert.equal(r.ok, true); assert.equal(r.value.quantity, 1.5); assert.equal(r.value.brand, null);
  const bad = validateItem({ name: '', quantity: '-1', unit: 'x', category: 'lacteos', location: 'nevera', expiry: '2026-13-01' });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['expiry', 'name', 'quantity', 'unit']);
});
test('formulario de receta: ignora filas vacías', () => {
  const r = validateRecipe({ name: 'Tostada', servings: '1', ingredients: [{ name: 'Pan', quantity: '2', unit: 'ud' }, { name: '', quantity: '', unit: 'g' }], steps: ['Tostar', ''] });
  assert.equal(r.ok, true); assert.equal(r.value.ingredients.length, 1); assert.equal(r.value.steps.length, 1);
  assert.equal(validateRecipe({ name: 'X', servings: 1, ingredients: [] }).ok, false);
  assert.ok(Number.isNaN(parseNumber('')));
});
