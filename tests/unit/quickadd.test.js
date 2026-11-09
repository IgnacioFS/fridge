import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickAdd } from '../../js/ui/views/shopping.js';

test('alta rápida en la compra interpreta cantidad y unidad', () => {
  assert.deepEqual(parseQuickAdd('2 l leche'), { name: 'Leche', quantity: 2, unit: 'l' });
  assert.deepEqual(parseQuickAdd('leche 1,5l'), { name: 'Leche', quantity: 1.5, unit: 'l' });
  assert.deepEqual(parseQuickAdd('6 huevos'), { name: 'Huevos', quantity: 6, unit: 'ud' });
  assert.deepEqual(parseQuickAdd('500 g de queso'), { name: 'Queso', quantity: 500, unit: 'g' });
  assert.deepEqual(parseQuickAdd('2 latas atún'), { name: 'Atún', quantity: 2, unit: 'lata' });
  assert.deepEqual(parseQuickAdd('3 limones'), { name: 'Limones', quantity: 3, unit: 'ud' });
  assert.deepEqual(parseQuickAdd('pan'), { name: 'Pan', quantity: 1, unit: 'ud' });
  assert.equal(parseQuickAdd('   '), null);
});
