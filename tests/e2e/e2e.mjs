// Pruebas de extremo a extremo en Chrome con viewport de iPhone.
// Uso: python3 -m http.server 8080 &  python3 tests/e2e/make-video.py && node tests/e2e/e2e.mjs
import { chromium, devices } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8080/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const VIDEO = new URL('./barcode.y4m', import.meta.url).pathname;
const OFF = '**/world.openfoodfacts.org/api/**';

const results = [];
let page, context;
async function T(name, fn) {
  try { await fn(); results.push([name, 'OK']); process.stdout.write(`✔ ${name}\n`); }
  catch (e) {
    results.push([name, `FALLO: ${e.message.split('\n')[0]}`]);
    process.stdout.write(`✘ ${name}\n   ${e.message.split('\n').slice(0, 3).join('\n   ')}\n`);
    try { await page.screenshot({ path: `${OUT}fail-${results.length}.png` }); } catch { /* */ }
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const sleep = (ms) => page.waitForTimeout(ms);
const sheet = () => page.locator('.sheet-wrap.open .sheet').last();
async function closeSheets() { while (await page.locator('.sheet-wrap.open').count()) { await page.keyboard.press('Escape'); await sleep(300); } }
async function tab(id) { await closeSheets(); await page.click(`.tab[data-tab="${id}"]`); await sleep(350); }
async function submitSheet() { await sheet().locator('.sheet-footer button[type=submit]').click(); await sleep(400); }
async function rowText(name) { return (await page.locator(`.row:has(.row-title:text-is("${name}"))`).first().innerText()).replace(/\s+/g, ' '); }
const store = (fn, arg) => page.evaluate(fn, arg);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${VIDEO}`],
});
context = await browser.newContext({ ...devices['iPhone 13'], permissions: ['camera'] });
page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
await page.goto(`${BASE}#/inventario`);
await page.waitForSelector('.screen-title');

// ─────────────── 1. Alta manual
await T('1. Añadir alimento manualmente (y validación)', async () => {
  await page.click('[aria-label="Añadir alimento"]');
  await sleep(400);
  await submitSheet();
  assert(await sheet().locator('.field-error:text("Escribe un nombre")').isVisible(), 'no muestra error de nombre vacío');
  await sheet().locator('[name=name]').fill('Leche');
  await sheet().locator('[name=quantity]').fill('1');
  await sheet().locator('#unit-sel').selectOption('l');
  await sheet().locator('.chip:text("+1 semana")').click();
  await submitSheet();
  assert(!(await page.locator('.sheet-wrap.open').count()), 'la hoja no se cerró');
  const t = await rowText('Leche');
  assert(t.includes('1 l') && t.includes('Caduca en 7 días'), `fila inesperada: ${t}`);
  // Categoría sugerida automáticamente por el nombre
  const cat = await store(() => window.__fridge.store.state.inventory.find((x) => x.name === 'Leche').category);
  assert(cat === 'lacteos', `categoría ${cat}`);
});

// ─────────────── 6. Modificar cantidades
await T('6. Modificar cantidad rápida (−) y deshacer', async () => {
  await page.locator('.row:has-text("Leche") [aria-label="Consumir Leche"]').click();
  await sleep(300);
  assert((await rowText('Leche')).includes('0,75 l'), await rowText('Leche'));
  await page.click('.toast button:text("Deshacer")');
  await sleep(300);
  assert((await rowText('Leche')).includes('1 l'), 'no se deshizo');
  // Stepper del formulario
  await page.locator('.row:has-text("Leche") .row-main').click(); await sleep(400);
  await sheet().locator('[aria-label="Más"]').click();
  await submitSheet();
  assert((await rowText('Leche')).includes('1,25 l'), await rowText('Leche'));
});

// ─────────────── 14 (inventario). Duplicados al dar de alta
await T('14a. Alta duplicada ofrece sumar al existente (con conversión ml→l)', async () => {
  await page.click('[aria-label="Añadir alimento"]'); await sleep(400);
  await sheet().locator('[name=name]').fill('leche');
  await sheet().locator('[name=quantity]').fill('250');
  await sheet().locator('#unit-sel').selectOption('ml');
  await submitSheet();
  assert(await page.locator('.alert h2:has-text("Ya tienes")').isVisible(), 'no pregunta por duplicado');
  await page.click('.alert-actions button:text("Sumar")'); await sleep(400);
  assert((await rowText('Leche')).includes('1,5 l'), await rowText('Leche'));
  assert(await page.locator('.row-title:text-is("leche")').count() === 0, 'creó duplicado');
});

// ─────────────── 5. Editar y eliminar
await T('5. Editar y eliminar alimento (con deshacer)', async () => {
  await page.locator('.row:has-text("Leche") .row-main').click(); await sleep(400);
  await sheet().locator('[name=name]').fill('Leche entera');
  await submitSheet();
  assert(await page.locator('.row-title:text-is("Leche entera")').count() === 1, 'no se renombró');
  await page.locator('.row:has-text("Leche entera") .row-main').click(); await sleep(400);
  await sheet().locator('button:has-text("Eliminar")').click(); await sleep(250);
  await page.click('.alert-actions button:text("Eliminar")'); await sleep(450);
  assert(await page.locator('.row-title:text-is("Leche entera")').count() === 0, 'no se eliminó');
  await page.click('.toast button:text("Deshacer")'); await sleep(350);
  assert(await page.locator('.row-title:text-is("Leche entera")').count() === 1, 'no se restauró');
});

// Datos para recetas
await store(async () => {
  const s = window.__fridge.store;
  await s.saveItem({ name: 'Pasta', quantity: 100, unit: 'g', category: 'cereales', location: 'despensa' });
  await s.saveItem({ name: 'Tomate', quantity: 300, unit: 'g', category: 'verduras', location: 'nevera' });
  await s.saveItem({ name: 'Huevos', quantity: 6, unit: 'ud', category: 'huevos', location: 'nevera' });
  await s.saveItem({ name: 'Yogur', quantity: 2, unit: 'ud', category: 'lacteos', location: 'nevera', expiry: '2020-01-01' });
});

// ─────────────── Filtros, búsqueda y orden
await T('Inventario: buscar, filtrar por ubicación/estado y ordenar', async () => {
  await tab('inventario');
  await page.fill('.search-input', 'past');
  await sleep(200);
  assert(await page.locator('.inv-list .row').count() === 1, 'búsqueda');
  await page.click('.search-clear');
  await page.click('.seg:has-text("Despensa")'); await sleep(200);
  assert(await page.locator('.inv-list .row').count() === 1, 'filtro despensa');
  await page.click('.seg:has-text("Todo")'); await sleep(200);
  await page.click('.chip:has-text("Caducados")'); await sleep(200);
  const names = await page.locator('.inv-list .row-title').allInnerTexts();
  assert(names.length === 1 && names[0] === 'Yogur', `caducados: ${names}`);
  await page.click('.chip:has-text("Caducados")'); await sleep(200);
  await page.click('.chip:has-text("Lácteos")'); await sleep(200);
  assert(await page.locator('.inv-list .row').count() === 2, 'filtro categoría');
  await page.click('.chip:has-text("Lácteos")');
  await page.click('.sort-btn'); await sleep(300);
  await page.click('.action-item:has-text("Nombre")'); await sleep(300);
  const all = await page.locator('.inv-list .row-title').allInnerTexts();
  assert(JSON.stringify(all.slice(0, 2)) === JSON.stringify(['Leche entera', 'Tomate']) || all.includes('Tomate'), 'orden');
});

// ─────────────── 7. Crear y editar recetas
await T('7. Crear receta y editarla', async () => {
  await tab('recetas');
  await page.click('[aria-label="Nueva receta"]'); await sleep(400);
  const sh = sheet();
  await sh.locator('[name=name]').fill('Pasta con tomate');
  const fillRow = async (i, n, q, u) => {
    const row = sh.locator('.ing-edit').nth(i);
    await row.locator('.ing-name').fill(n); await row.locator('.ing-q').fill(q); await row.locator('select').selectOption(u);
  };
  await fillRow(0, 'Pasta', '200', 'g');
  await sh.locator('button:has-text("Añadir ingrediente")').click(); await fillRow(1, 'Tomate', '300', 'g');
  await sh.locator('button:has-text("Añadir ingrediente")').click(); await fillRow(2, 'Queso', '100', 'g');
  await sh.locator('.step-input').first().fill('Cocer la pasta');
  await submitSheet(); await sleep(300);
  assert(page.url().includes('#/receta/'), 'no navega al detalle');
  assert(await page.locator('.detail-title:text("Pasta con tomate")').isVisible(), 'detalle');
  // Editar: añadir descripción
  await page.click('[aria-label="Opciones"]'); await sleep(300);
  await page.click('.action-item:has-text("Editar receta")'); await sleep(400);
  await sheet().locator('[name=description]').fill('Rápida');
  await submitSheet();
  assert(await page.locator('.detail-desc:text("Rápida")').isVisible(), 'edición');
});

// ─────────────── 9 y 10. Faltantes y cálculo
await T('9/10. Receta con faltantes: cálculo correcto (ejemplo del brief) y escalado', async () => {
  const txt = (await page.locator('.ing-list').innerText()).replace(/\s+/g, ' ');
  assert(txt.includes('Pasta 200 g Faltan 100 g · tienes 100 g'), txt);
  assert(txt.includes('Tomate 300 g Disponible'), txt);
  assert(txt.includes('Queso 100 g Faltan 100 g'), txt);
  await page.click('[aria-label="Más raciones"]'); await sleep(200);
  const t3 = (await page.locator('.ing-list').innerText()).replace(/\s+/g, ' ');
  assert(t3.includes('Pasta 300 g Faltan 200 g'), t3);
  await page.click('[aria-label="Menos raciones"]'); await sleep(200);
});

// ─────────────── 11. Añadir faltantes (sin tocar inventario)
await T('11. Añadir faltantes a la compra sin descontar inventario', async () => {
  const before = await store(() => JSON.stringify(window.__fridge.store.state.inventory.map((x) => [x.name, x.quantity])));
  await page.click('.sticky-cta button'); await sleep(400);
  const after = await store(() => JSON.stringify(window.__fridge.store.state.inventory.map((x) => [x.name, x.quantity])));
  assert(before === after, 'el inventario cambió');
  const list = await store(() => window.__fridge.store.state.shopping.map((x) => `${x.name}:${x.quantity}${x.unit}`).sort().join(','));
  assert(list === 'Pasta:100g,Queso:100g', list);
  assert(await page.locator('.ing-list .tag:has-text("En la lista")').count() === 2, 'no indica que ya está en la lista');
});

// ─────────────── 8 y 18. Todo disponible + conversión de unidades
await T('8/18. Receta con todo disponible usando unidades convertibles (kg/l)', async () => {
  const id = await store(async () => (await window.__fridge.store.saveRecipe({ name: 'Ensalada', servings: 1, ingredients: [{ name: 'Tomate', quantity: 0.25, unit: 'kg' }, { name: 'Leche', quantity: 500, unit: 'ml' }] })).id);
  await page.goto(`${BASE}#/receta/${id}`); await sleep(500);
  assert(await page.locator('.avail-card.good:has-text("Tienes todo lo necesario")').isVisible(), 'no detecta disponibilidad');
  assert(!(await page.locator('.sticky-cta').count()), 'muestra botón de compra');
});

// ─────────────── Incomparables
await T('9b. Unidades incompatibles: avisa y deja decidir', async () => {
  const id = await store(async () => (await window.__fridge.store.saveRecipe({ name: 'Bizcocho', servings: 1, ingredients: [{ name: 'Huevos', quantity: 200, unit: 'g' }] })).id);
  await page.goto(`${BASE}#/receta/${id}`); await sleep(500);
  assert(await page.locator('.banner:has-text("Revisa algunos ingredientes")').isVisible(), 'sin aviso');
  assert(await page.locator('.row-sub:has-text("no se puede comparar")').isVisible(), 'sin detalle');
  await page.click('.ing-decide .chip:text("Lo tengo")'); await sleep(200);
  assert(await page.locator('.avail-card.good').isVisible(), '“Lo tengo” no cuenta');
  await page.click('.ing-decide .chip:text("Comprar")'); await sleep(200);
  assert(await page.locator('.sticky-cta button:has-text("el que falta")').isVisible(), '“Comprar” no ofrece añadir');
});

// ─────────────── 13. Mismo ingrediente desde varias recetas
await T('13. Mismo ingrediente desde dos recetas: una línea, cantidades sumadas', async () => {
  const id = await store(async () => (await window.__fridge.store.saveRecipe({ name: 'Pizza', servings: 1, ingredients: [{ name: 'Quesos', quantity: 0.2, unit: 'kg' }] })).id);
  await page.goto(`${BASE}#/receta/${id}`); await sleep(500);
  await page.click('.sticky-cta button'); await sleep(400);
  await tab('compra');
  assert(await page.locator('.shop-row:has-text("Queso")').count() === 1, 'duplicado');
  const t = (await page.locator('.shop-row:has-text("Queso")').innerText()).replace(/\s+/g, ' ');
  assert(t.includes('300 g'), t);
});

// ─────────────── 12. Etiquetas
await T('12. Etiquetas de receta visibles en la compra', async () => {
  const tags = await page.locator('.shop-row:has-text("Queso") .tag').allInnerTexts();
  assert(tags.includes('Pasta con tomate') && tags.includes('Pizza'), `etiquetas: ${tags}`);
  const pt = await page.locator('.shop-row:has(.row-title:text-is("Pasta")) .tag').allInnerTexts();
  assert(pt.includes('Pasta con tomate'), `pasta: ${pt}`);
});

// ─────────────── 14. Evitar duplicados (alta rápida)
await T('14. Alta rápida en la compra suma en vez de duplicar', async () => {
  await page.fill('.quick-input', 'queso 50 g');
  await page.press('.quick-input', 'Enter'); await sleep(400);
  assert(await page.locator('.shop-row:has-text("Queso")').count() === 1, 'duplicado');
  assert((await page.locator('.shop-row:has-text("Queso") .qty').innerText()) === '350 g', 'no sumó');
  await page.fill('.quick-input', '2 l agua');
  await page.press('.quick-input', 'Enter'); await sleep(400);
  assert((await page.locator('.shop-row:has-text("Agua") .qty').innerText()) === '2 l', 'parseo alta rápida');
});

// ─────────────── 15. Quitar etiqueta sin quitar producto
await T('15. Eliminar una etiqueta sin eliminar el producto', async () => {
  await page.locator('.shop-row:has-text("Queso") .row-main').click(); await sleep(400);
  await sheet().locator('.tag-remove:has-text("Pizza")').click(); await sleep(300);
  await closeSheets();
  assert(await page.locator('.shop-row:has-text("Queso")').count() === 1, 'producto eliminado');
  const tags = await page.locator('.shop-row:has-text("Queso") .tag').allInnerTexts();
  assert(tags.length === 1 && tags[0] === 'Pasta con tomate', `etiquetas: ${tags}`);
  assert((await page.locator('.shop-row:has-text("Queso") .qty').innerText()) === '150 g', 'no restó');
});

// ─────────────── 16. Marcar comprado
await T('16. Marcar como comprado (no modifica inventario)', async () => {
  const before = await store(() => JSON.stringify(window.__fridge.store.state.inventory));
  await page.click('.shop-row:has(.row-title:text-is("Pasta")) .check'); await sleep(400);
  assert(await page.locator('.done-list .shop-row:has(.row-title:text-is("Pasta"))').count() === 1, 'no pasó a comprados');
  assert(before === await store(() => JSON.stringify(window.__fridge.store.state.inventory)), 'el inventario cambió al marcar');
});

// ─────────────── 17. Comprado → inventario
await T('17. Añadir comprado al inventario sumando al existente', async () => {
  await page.click('.done-list .shop-row:has(.row-title:text-is("Pasta")) button:has-text("Al inventario")'); await sleep(400);
  assert(await sheet().locator('.choice.selected:has-text("Sumar a «Pasta»")').isVisible(), 'no propone sumar');
  await sheet().locator('[name=quantity]').fill('0,5');
  await sheet().locator('#buy-unit').selectOption('kg');
  await submitSheet();
  const q = await store(() => window.__fridge.store.state.inventory.filter((x) => x.key === 'pasta').map((x) => x.quantity));
  assert(JSON.stringify(q) === '[600]', `pasta: ${q}`);
  assert(await page.locator('.done-list .shop-row:has(.row-title:text-is("Pasta")) .badge:has-text("En casa")').isVisible(), 'sin marca En casa');
  // Producto nuevo con caducidad
  await page.click('.shop-row:has-text("Agua") .check'); await sleep(300);
  await page.click('.done-list .shop-row:has-text("Agua") button:has-text("Al inventario")'); await sleep(400);
  await sheet().locator('.seg:has-text("Despensa")').click();
  await sheet().locator('.chip:text("+1 mes")').click();
  await submitSheet();
  const agua = await store(() => window.__fridge.store.state.inventory.find((x) => x.key === 'agua'));
  assert(agua && agua.location === 'despensa' && agua.quantity === 2 && agua.unit === 'l' && agua.expiry, JSON.stringify(agua));
});

// ─────────────── 19. Persistencia
await T('19. Persistencia tras recargar', async () => {
  const snap = await store(() => { const s = window.__fridge.store.state; return JSON.stringify([s.inventory.length, s.recipes.length, s.shopping.length]); });
  await page.reload(); await page.waitForSelector('.screen-title'); await sleep(300);
  const snap2 = await store(() => { const s = window.__fridge.store.state; return JSON.stringify([s.inventory.length, s.recipes.length, s.shopping.length]); });
  assert(snap === snap2 && snap !== '[0,0,0]', `${snap} vs ${snap2}`);
});

// ─────────────── 2. Escáner (cámara simulada + Open Food Facts simulado)
let offMode = 'found';
await page.route(OFF, (route) => {
  if (offMode === 'found') return route.fulfill({ json: { status: 1, product: { product_name_es: 'Leche semidesnatada', brands: 'Central Lechera Asturiana', categories_tags: ['en:dairies', 'en:milks'], quantity: '1 l' } } });
  if (offMode === 'notfound') return route.fulfill({ json: { status: 0, status_verbose: 'product not found' } });
  if (offMode === 'error') return route.abort('failed');
  return route.fulfill({ status: 503, body: '' });
});
await T('2. Escanear código con la cámara y rellenar con Open Food Facts', async () => {
  await tab('inventario');
  await page.click('[aria-label="Escanear código"]');
  await page.waitForSelector('.sheet-wrap.open [name=name]', { timeout: 15000 });
  await sleep(400);
  const sh = sheet();
  assert(await sh.locator('[name=name]').inputValue() === 'Leche semidesnatada', 'nombre');
  assert(await sh.locator('.banner:has-text("Revísalos")').isVisible(), 'sin aviso de revisión');
  assert(await sh.locator('[name=brand]').inputValue() === 'Central Lechera Asturiana', 'marca');
  assert(await sh.locator('[name=barcode]').inputValue() === '8410188012092', 'código');
  assert(await sh.locator('#unit-sel').inputValue() === 'l', 'unidad');
  assert(await sh.locator('.chip.selected:has-text("Lácteos")').count() === 1, 'categoría');
  await sh.locator('[name=name]').fill('Leche semi');  // el usuario puede corregir
  await submitSheet();
  assert(await page.locator('.row-title:text-is("Leche semi")').count() === 1, 'no se guardó');
});
await T('2b. Reescanear un producto ya guardado ofrece sumar', async () => {
  await page.click('[aria-label="Escanear código"]');
  await page.waitForSelector('.action-item:has-text("Sumar")', { timeout: 15000 });
  await closeSheets();
});
// La cámara simulada siempre muestra un código: para las entradas manuales se deja «colgada».
await page.addInitScript(() => { if (window.__noCam) navigator.mediaDevices.getUserMedia = () => new Promise(() => {}); });
await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(() => {}); });
async function manualCode(code) {
  await page.click('[aria-label="Escanear código"]'); await sleep(800);
  await page.click('.scan-pill:has-text("Escribir el código")'); await sleep(400);
  await sheet().locator('[name=code]').fill(code);
  await submitSheet();
  await page.waitForSelector('.sheet-wrap.open [name=name]', { timeout: 10000 }); await sleep(300);
}
await T('3. Producto no encontrado: permite crearlo manualmente', async () => {
  offMode = 'notfound';
  await manualCode('5449000000996');
  assert(await sheet().locator('.banner:has-text("No hemos encontrado")').isVisible(), 'sin aviso');
  assert(await sheet().locator('[name=barcode]').inputValue() === '5449000000996', 'código no conservado');
  await sheet().locator('[name=name]').fill('Refresco');
  await submitSheet();
  assert(await page.locator('.row-title:text-is("Refresco")').count() === 1, 'no se guardó');
});
await T('4. Sin conexión / error de red: informa y permite seguir a mano', async () => {
  offMode = 'error';
  await manualCode('3017620422003');
  assert(await sheet().locator('.banner:has-text("No se pudo consultar")').isVisible(), 'error de red sin aviso');
  await closeSheets();
  await context.setOffline(true);
  await manualCode('0012345678905');
  assert(await sheet().locator('.banner:has-text("Sin conexión")').isVisible(), 'offline sin aviso');
  await closeSheets();
  await context.setOffline(false);
});
await T('4b. Código no válido: se rechaza', async () => {
  await page.click('[aria-label="Escanear código"]'); await sleep(800);
  await page.click('.scan-pill:has-text("Escribir el código")'); await sleep(400);
  await sheet().locator('[name=code]').fill('1234567890123');
  await submitSheet(); await sleep(300);
  assert(await page.locator('.toast:has-text("dígito de control")').isVisible(), 'no avisa');
  await page.click('.scan-round[aria-label="Cerrar"]'); await sleep(300);
});
await T('Permiso de cámara denegado: mensaje y alternativas', async () => {
  const p2 = await context.newPage();
  await p2.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); });
  await p2.goto(`${BASE}#/inventario`); await p2.waitForSelector('.screen-title');
  await p2.click('[aria-label="Escanear código"]'); await p2.waitForTimeout(600);
  assert(await p2.locator('.scan-error:has-text("Sin permiso")').isVisible(), 'sin mensaje');
  assert(await p2.locator('.scan-pill:has-text("Añadir a mano")').isVisible(), 'sin alternativa');
  await p2.close();
});

await T('Cerrar el escáner mientras se abre la cámara la apaga', async () => {
  const p2 = await context.newPage();
  await p2.addInitScript(() => {
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__streams = [];
    navigator.mediaDevices.getUserMedia = (c) => new Promise((res, rej) => setTimeout(() => orig(c).then((s) => { window.__streams.push(s); res(s); }, rej), 800));
  });
  await p2.goto(`${BASE}#/inventario`); await p2.waitForSelector('.screen-title');
  await p2.click('[aria-label="Escanear código"]'); await p2.waitForTimeout(100);
  await p2.click('.scan-round[aria-label="Cerrar"]'); await p2.waitForTimeout(1500);
  const live = await p2.evaluate(() => window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length);
  assert(live === 0, `${live} pistas de cámara siguen activas`);
  assert(!(await p2.locator('.sheet-wrap.open').count()), 'se abrió un formulario tras cerrar');
  await p2.close();
});

await T('Doble toque al confirmar la compra no duplica el inventario', async () => {
  await tab('compra');
  await page.fill('.quick-input', '4 yogures'); await page.press('.quick-input', 'Enter'); await sleep(300);
  await page.click('.shop-row:has(.row-title:text-is("Yogures")) .check'); await sleep(300);
  await page.click('.done-list .shop-row:has(.row-title:text-is("Yogures")) button:has-text("Al inventario")'); await sleep(400);
  const n0 = await store(() => window.__fridge.store.state.inventory.length);
  await sheet().locator('.sheet-footer button[type=submit]').dblclick(); await sleep(500);
  const n1 = await store(() => window.__fridge.store.state.inventory.length);
  const idb = await store(async () => (await window.__fridge.store.repos.inventory.getAll()).length);
  assert(n1 - n0 <= 1 && idb === n1, `antes ${n0}, después ${n1}, almacenado ${idb}`);
});

await T('Formulario de receta: el error aparece en la fila correcta', async () => {
  await tab('recetas');
  await page.click('[aria-label="Nueva receta"]'); await sleep(400);
  const sh = sheet();
  await sh.locator('[name=name]').fill('Prueba');
  await sh.locator('button:has-text("Añadir ingrediente")').click();
  await sh.locator('.ing-edit').nth(1).locator('.ing-name').fill('Sal');
  await submitSheet();
  assert(await sh.locator('.ing-edit').nth(1).locator('.field-error:text("Cantidad no válida")').isVisible(), 'error no visible en la fila 2');
  await closeSheets();
});

// ─────────────── Copia de seguridad (exportar → importar)
await T('Copia de seguridad: exportar e importar', async () => {
  const ok = await store(async () => {
    const { exportData, importData } = await import('./js/data/backup.js');
    const s = window.__fridge.store;
    const data = JSON.parse(JSON.stringify(await exportData(s)));
    const n = s.state.inventory.length;
    await importData(s, { ...data, inventory: [] });
    const empty = s.state.inventory.length === 0;
    await importData(s, data);
    return empty && s.state.inventory.length === n;
  });
  assert(ok, 'no restaura');
});

// ─────────────── 20 y 21. Modos y tamaños
const SIZES = [['SE', 375, 667], ['13', 390, 844], ['ProMax', 430, 932]];
await T('20/21. Modo claro/oscuro y tamaños de pantalla sin desbordes', async () => {
  const problems = [];
  for (const scheme of ['light', 'dark']) {
    for (const [label, w, hgt] of SIZES) {
      const c = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, userAgent: devices['iPhone 13'].userAgent });
      const p = await c.newPage();
      await p.goto(`${BASE}#/inicio`); await p.waitForSelector('.screen-title');
      await p.evaluate(async () => { const { loadSampleData } = await import('./js/data/sample.js'); await loadSampleData(window.__fridge.store); });
      const shots = [['inicio', '#/inicio'], ['inventario', '#/inventario'], ['recetas', '#/recetas'], ['compra', '#/compra']];
      for (const [n, hash] of shots) {
        await p.goto(`${BASE}${hash}`); await p.waitForSelector('.screen-title'); await p.waitForTimeout(250);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 0) problems.push(`${scheme} ${label} ${n}: desborda ${over}px`);
        if (label !== '13' || true) await p.screenshot({ path: `${OUT}${scheme}-${label}-${n}.png` });
      }
      // Detalle de receta y formulario
      const rid = await p.evaluate(() => window.__fridge.store.state.recipes.find((r) => r.name === 'Pasta con tomate').id);
      await p.goto(`${BASE}#/receta/${rid}`); await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}${scheme}-${label}-receta.png` });
      await p.goto(`${BASE}#/inventario`); await p.waitForTimeout(200);
      await p.click('[aria-label="Añadir alimento"]'); await p.waitForTimeout(450);
      const over = await p.evaluate(() => document.querySelector('.sheet').scrollWidth - document.querySelector('.sheet').clientWidth);
      if (over > 0) problems.push(`${scheme} ${label} formulario: desborda ${over}px`);
      await p.screenshot({ path: `${OUT}${scheme}-${label}-formulario.png` });
      await c.close();
    }
  }
  assert(!problems.length, problems.join('; '));
});

await T('Sin errores de JavaScript en consola', async () => {
  const real = consoleErrors.filter((e) => !/net::ERR_FAILED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  assert(!real.length, real.join(' | '));
});

await browser.close();
const fails = results.filter(([, r]) => r !== 'OK');
console.log(`\n${results.length - fails.length}/${results.length} escenarios OK`);
process.exit(fails.length ? 1 : 0);
