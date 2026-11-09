// Pruebas de integración del Store con repositorios en memoria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepositories } from '../../js/data/db.js';
import { Store, ValidationError } from '../../js/data/store.js';
import { evaluateRecipe, missingForShopping } from '../../js/domain/recipes.js';

async function mk() {
  const repos = await createRepositories({ memory: true });
  const s = new Store(repos, { clock: () => new Date(2026, 10, 9, 12) });
  await s.load();
  return { s, repos };
}

test('alta, edición, consumo y borrado con deshacer', async () => {
  const { s } = await mk();
  const it = await s.saveItem({ name: 'Leche', quantity: '1', unit: 'l', category: 'lacteos', location: 'nevera' });
  await s.saveItem({ ...it, quantity: 2 }, it.id);
  assert.equal(s.getItem(it.id).quantity, 2);
  await s.adjustItem(it.id, -0.25);
  assert.equal(s.getItem(it.id).quantity, 1.75);
  await s.adjustItem(it.id, -10);
  assert.equal(s.getItem(it.id).quantity, 0);
  const undo = await s.deleteItem(it.id);
  assert.equal(s.state.inventory.length, 0);
  await undo();
  assert.equal(s.state.inventory.length, 1);
  await assert.rejects(s.saveItem({ name: '', quantity: 1, unit: 'g', category: 'otros', location: 'nevera' }), ValidationError);
});

test('flujo completo receta → compra → inventario, sin tocar el inventario antes de confirmar', async () => {
  const { s } = await mk();
  await s.saveItem({ name: 'Pasta', quantity: 100, unit: 'g', category: 'cereales', location: 'despensa' });
  await s.saveItem({ name: 'Tomate', quantity: 300, unit: 'g', category: 'verduras', location: 'nevera' });
  const recipe = await s.saveRecipe({
    name: 'Pasta con tomate', servings: 2,
    ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }, { name: 'Tomate', quantity: 300, unit: 'g' }, { name: 'Queso', quantity: 100, unit: 'g' }],
    steps: ['Cocer', 'Mezclar'],
  });
  const ev = evaluateRecipe(recipe, s.state.inventory, { now: s.now() });
  const invBefore = JSON.stringify(s.state.inventory);
  await s.addMissingToShopping(recipe, missingForShopping(ev));
  assert.equal(JSON.stringify(s.state.inventory), invBefore, 'añadir a la compra no descuenta inventario');
  assert.deepEqual(s.state.shopping.map((x) => [x.name, x.quantity, x.sources[0].recipeName]).sort(),
    [['Pasta', 100, 'Pasta con tomate'], ['Queso', 100, 'Pasta con tomate']]);

  // Marcar como comprado no cambia el inventario.
  const pastaLine = s.state.shopping.find((x) => x.key === 'pasta');
  await s.toggleShopping(pastaLine.id, true);
  assert.equal(JSON.stringify(s.state.inventory), invBefore);

  // Confirmar: sumar al existente.
  const pastaInv = s.state.inventory.find((x) => x.key === 'pasta');
  await s.purchaseToInventory(pastaLine.id, { quantity: 0.5, unit: 'kg', mode: 'merge', targetId: pastaInv.id });
  assert.equal(s.getItem(pastaInv.id).quantity, 600);
  assert.equal(s.state.inventory.length, 2, 'sin duplicados');
  assert.equal(s.getShopping(pastaLine.id).addedToInventory, true);

  // Queso: nuevo producto.
  const quesoLine = s.state.shopping.find((x) => x.key === 'queso');
  await s.purchaseToInventory(quesoLine.id, { quantity: 150, unit: 'g', mode: 'new', location: 'nevera', expiry: '2026-11-30' });
  assert.equal(s.state.inventory.length, 3);
  assert.equal(evaluateRecipe(recipe, s.state.inventory, { now: s.now() }).canCook, true);
});

test('renombrar receta actualiza sus etiquetas; quitar etiqueta mantiene el producto', async () => {
  const { s } = await mk();
  const r1 = await s.saveRecipe({ name: 'Pizza', servings: 1, ingredients: [{ name: 'Queso', quantity: 100, unit: 'g' }] });
  const r2 = await s.saveRecipe({ name: 'Lasaña', servings: 1, ingredients: [{ name: 'Queso', quantity: 200, unit: 'g' }] });
  await s.addMissingToShopping(r1, [{ name: 'Queso', key: 'queso', quantity: 100, unit: 'g' }]);
  await s.addMissingToShopping(r2, [{ name: 'Queso', key: 'queso', quantity: 200, unit: 'g' }]);
  assert.equal(s.state.shopping.length, 1);
  assert.equal(s.state.shopping[0].quantity, 300);
  await s.saveRecipe({ ...r1, name: 'Pizza margarita' }, r1.id);
  assert.ok(s.state.shopping[0].sources.some((x) => x.recipeName === 'Pizza margarita'));
  await s.removeShoppingSource(s.state.shopping[0].id, r1.id);
  assert.equal(s.state.shopping.length, 1);
  assert.equal(s.state.shopping[0].quantity, 200);
});

test('persistencia: los datos sobreviven a un nuevo Store sobre el mismo almacenamiento', async () => {
  const { s, repos } = await mk();
  await s.saveItem({ name: 'Huevos', quantity: 12, unit: 'ud', category: 'huevos', location: 'nevera' });
  await s.addShopping({ name: 'Pan', quantity: 1, unit: 'ud' });
  await s.setSettings({ soonDays: 5 });
  const s2 = new Store(repos);
  await s2.load();
  assert.equal(s2.state.inventory[0].name, 'Huevos');
  assert.equal(s2.state.shopping[0].name, 'Pan');
  assert.equal(s2.state.settings.soonDays, 5);
});
