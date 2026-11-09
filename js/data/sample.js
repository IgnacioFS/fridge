// Datos de ejemplo para probar la app (opcional, a petición del usuario).
import { addDays, todayISO } from '../domain/dates.js';

export async function loadSampleData(store) {
  const t = todayISO(store.now());
  const items = [
    { name: 'Leche entera', brand: 'Pascual', category: 'lacteos', quantity: 1.5, unit: 'l', location: 'nevera', expiry: addDays(t, 5) },
    { name: 'Huevos', category: 'huevos', quantity: 6, unit: 'ud', location: 'nevera', expiry: addDays(t, 12) },
    { name: 'Tomates', category: 'verduras', quantity: 300, unit: 'g', location: 'nevera', expiry: addDays(t, 2) },
    { name: 'Queso rallado', category: 'lacteos', quantity: 0, unit: 'g', location: 'nevera', expiry: addDays(t, 20) },
    { name: 'Yogur natural', category: 'lacteos', quantity: 2, unit: 'ud', location: 'nevera', expiry: addDays(t, -1) },
    { name: 'Pasta', brand: 'Gallo', category: 'cereales', quantity: 100, unit: 'g', location: 'despensa', expiry: addDays(t, 200) },
    { name: 'Arroz', category: 'cereales', quantity: 1, unit: 'kg', location: 'despensa' },
    { name: 'Aceite de oliva', category: 'otros', quantity: 750, unit: 'ml', location: 'despensa' },
    { name: 'Cebolla', category: 'verduras', quantity: 3, unit: 'ud', location: 'despensa' },
    { name: 'Pechuga de pollo', category: 'carnes', quantity: 500, unit: 'g', location: 'congelador', expiry: addDays(t, 60) },
    { name: 'Guisantes', category: 'congelados', quantity: 400, unit: 'g', location: 'congelador', expiry: addDays(t, 120) },
  ];
  for (const it of items) await store.saveItem(it);

  const recipes = [
    { name: 'Pasta con tomate', description: 'Clásico rápido para cualquier día.', servings: 2, prepMinutes: 20,
      ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }, { name: 'Tomate', quantity: 300, unit: 'g' }, { name: 'Queso', quantity: 100, unit: 'g' }, { name: 'Aceite de oliva', quantity: 15, unit: 'ml' }],
      steps: ['Cuece la pasta en agua con sal según el paquete.', 'Sofríe el tomate troceado con el aceite 10 minutos.', 'Mezcla la pasta con la salsa y sirve con el queso.'] },
    { name: 'Tortilla de patatas', servings: 4, prepMinutes: 40,
      ingredients: [{ name: 'Huevos', quantity: 6, unit: 'ud' }, { name: 'Patatas', quantity: 700, unit: 'g' }, { name: 'Cebolla', quantity: 1, unit: 'ud' }, { name: 'Aceite de oliva', quantity: 200, unit: 'ml' }],
      steps: ['Pela y corta las patatas y la cebolla.', 'Pocha a fuego medio en abundante aceite.', 'Escurre, mezcla con el huevo batido y cuaja por ambos lados.'] },
    { name: 'Arroz con pollo', servings: 2, prepMinutes: 35,
      ingredients: [{ name: 'Arroz', quantity: 200, unit: 'g' }, { name: 'Pechuga de pollo', quantity: 300, unit: 'g' }, { name: 'Cebolla', quantity: 1, unit: 'ud' }, { name: 'Guisantes', quantity: 100, unit: 'g' }],
      steps: ['Dora el pollo troceado.', 'Añade la cebolla picada y luego el arroz.', 'Cubre con el doble de agua y cuece 18 minutos con los guisantes.'] },
  ];
  for (const r of recipes) await store.saveRecipe(r);
  await store.addShopping({ name: 'Pan', quantity: 1, unit: 'ud', category: 'panaderia' });
}
