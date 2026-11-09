// Regresiones de los fallos detectados en la revisión independiente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKey, matchKind } from '../../js/domain/matching.js';
import { evaluateRecipe, missingForShopping } from '../../js/domain/recipes.js';
import * as S from '../../js/domain/shopping.js';
import { addToExisting } from '../../js/domain/inventory.js';
import { parseQuantityText } from '../../js/domain/units.js';
import { createRepositories } from '../../js/data/db.js';
import { Store } from '../../js/data/store.js';
import { importData } from '../../js/data/backup.js';

let n = 0;
const factory = { now: () => 'now', create: (o) => ({ id: `x${++n}`, ...o }) };
const inv = (name, quantity, unit, extra = {}) => ({ id: `i${++n}`, name, key: normalizeKey(name), quantity, unit, ...extra });
const ing = (name, quantity, unit) => ({ id: `g${++n}`, name, key: normalizeKey(name), quantity, unit });
async function mk() { const s = new Store(await createRepositories({ memory: true })); await s.load(); return s; }

test('#5 plurales con singular en -e y -ce', () => {
  assert.equal(normalizeKey('Judías verdes'), normalizeKey('Judía verde'));
  assert.equal(normalizeKey('Carnes'), 'carne');
  assert.equal(normalizeKey('Vinagres'), 'vinagre');
  assert.equal(normalizeKey('Dulces'), 'dulce');
  assert.equal(normalizeKey('Cuscús'), 'cuscus');
  assert.equal(normalizeKey('Limones'), 'limon');
  assert.equal(normalizeKey('Nueces'), 'nuez');
});

test('#6 parecidos dudosos no cuentan como disponibles', () => {
  assert.equal(matchKind('leche de coco', 'leche'), 'related');
  assert.equal(matchKind('leche', 'leche condensada'), 'related');
  assert.equal(matchKind('leche', 'leche entera'), 'prefix');
  const r = { id: 'r', name: 'Curry', servings: 1, ingredients: [ing('Leche de coco', 400, 'ml')] };
  const ev = evaluateRecipe(r, [inv('Leche', 1, 'l')]);
  assert.equal(ev.results[0].status, 'incomparable');
  assert.equal(ev.results[0].relatedItems.length, 1);
  assert.equal(ev.canCook, false);
});

test('#7 un mismo producto no cubre dos ingredientes', () => {
  const r = { id: 'r', name: 'X', servings: 1, ingredients: [ing('Tomate', 500, 'g'), ing('Tomate pera', 500, 'g')] };
  const ev = evaluateRecipe(r, [inv('Tomate pera', 500, 'g')]);
  assert.equal(ev.results[1].status, 'available');
  assert.equal(ev.results[0].status, 'missing');
  assert.equal(ev.canCook, false);
  const ev2 = evaluateRecipe(r, [inv('Tomate pera', 800, 'g')]);
  assert.equal(ev2.results[0].status, 'partial');
  assert.equal(ev2.results[0].missing, 200);
});

test('#8 ingredientes repetidos en una receta se suman', () => {
  const r = { id: 'r', name: 'Sofrito', servings: 1, ingredients: [ing('Ajo', 2, 'ud'), ing('Ajos', 1, 'ud')] };
  const miss = missingForShopping(evaluateRecipe(r, []));
  assert.deepEqual(miss.map((m) => [m.key, m.quantity]), [['ajo', 3]]);
  const { list } = S.addFromRecipe([], r, miss, factory);
  assert.equal(list.length, 1); assert.equal(list[0].quantity, 3);
});

test('#9 cambiar la unidad de una línea convierte sus etiquetas', async () => {
  const s = await mk();
  const r = await s.saveRecipe({ name: 'Pan', servings: 1, ingredients: [{ name: 'Harina', quantity: 500, unit: 'g' }] });
  await s.addMissingToShopping(r, [{ name: 'Harina', key: 'harina', quantity: 500, unit: 'g' }]);
  const line = s.state.shopping[0];
  await s.updateShopping(line.id, { quantity: 0.5, unit: 'kg' });
  assert.equal(s.state.shopping[0].sources[0].quantity, 0.5);
  await s.addMissingToShopping(r, [{ name: 'Harina', key: 'harina', quantity: 500, unit: 'g' }]);
  assert.equal(s.state.shopping[0].quantity, 0.5);
});

test('#10 reañadir una receta tras bajar la cantidad no deja la línea a 0', () => {
  const r = { id: 'R', name: 'R' };
  let { list } = S.addFromRecipe([], r, [{ name: 'Queso', key: 'queso', quantity: 500, unit: 'g' }], factory);
  list = [{ ...list[0], quantity: 100 }];
  ({ list } = S.addFromRecipe(list, r, [{ name: 'Queso', key: 'queso', quantity: 300, unit: 'g' }], factory));
  assert.equal(list[0].quantity, 300);
});

test('#11 sumar a un producto agotado no hereda su caducidad', () => {
  const it = inv('Leche', 0, 'l', { expiry: '2026-10-01' });
  assert.equal(addToExisting(it, 1, 'l', { now: 'n' }).expiry, null);
  assert.equal(addToExisting(it, 1, 'l', { now: 'n', expiry: '2026-12-01' }).expiry, '2026-12-01');
  const conStock = inv('Leche', 1, 'l', { expiry: '2026-11-15' });
  assert.equal(addToExisting(conStock, 1, 'l', { now: 'n' }).expiry, '2026-11-15');
});

test('#16 separador de miles español', () => {
  assert.deepEqual(parseQuantityText('1.000 g'), { quantity: 1000, unit: 'g' });
  assert.deepEqual(parseQuantityText('1,5 l'), { quantity: 1.5, unit: 'l' });
});

test('#18 desmarcar permite volver a pasar al inventario', () => {
  const it = { id: 'a', checked: true, addedToInventory: true };
  assert.equal(S.setChecked(it, false, 'n').addedToInventory, false);
});

test('#1 dobles pulsaciones simultáneas no crean duplicados fantasma', async () => {
  const s = await mk();
  await Promise.all([s.addShopping({ name: 'Leche', quantity: 1, unit: 'l' }), s.addShopping({ name: 'Leche', quantity: 1, unit: 'l' })]);
  assert.equal(s.state.shopping.length, 1);
  assert.equal(s.state.shopping[0].quantity, 2);
  assert.equal((await s.repos.shopping.getAll()).length, 1, 'almacenamiento sin fantasmas');
  const r = await s.saveRecipe({ name: 'X', servings: 1, ingredients: [{ name: 'Pan', quantity: 1, unit: 'ud' }] });
  const miss = [{ name: 'Pan', key: 'pan', quantity: 1, unit: 'ud' }];
  await Promise.all([s.addMissingToShopping(r, miss), s.addMissingToShopping(r, miss)]);
  assert.equal((await s.repos.shopping.getAll()).length, 2);
  assert.equal(s.state.shopping.find((x) => x.key === 'pan').quantity, 1);
});

test('#2 confirmar una compra dos veces no la suma dos veces', async () => {
  const s = await mk();
  const { item } = await s.addShopping({ name: 'Yogur', quantity: 4, unit: 'ud' });
  const go = () => s.purchaseToInventory(item.id, { quantity: 4, unit: 'ud', mode: 'new', location: 'nevera' });
  const res = await Promise.allSettled([go(), go()]);
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(s.state.inventory.length, 1);
  assert.equal((await s.repos.inventory.getAll()).length, 1);
});

test('#3 una copia dañada no borra nada', async () => {
  const s = await mk();
  await s.saveItem({ name: 'Arroz', quantity: 1, unit: 'kg', category: 'cereales', location: 'despensa' });
  await assert.rejects(importData(s, { app: 'fridge', schema: 1, inventory: [{ name: 'X' }], recipes: [], shopping: [] }));
  assert.equal((await s.repos.inventory.getAll()).length, 1);
  assert.equal(s.state.inventory.length, 1);
});
