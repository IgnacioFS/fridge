import { chromium, devices } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const base = process.env.BASE || 'http://localhost:8080/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: process.env.DARK ? 'dark' : 'light', isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(base);
await page.waitForSelector('.screen-title');
await page.screenshot({ path: 'tests/e2e/out/01-home-empty.png' });
await page.click('text=Probar con datos de ejemplo');
await page.waitForTimeout(600);
await page.screenshot({ path: 'tests/e2e/out/02-home.png', fullPage: true });
for (const [i, t] of ['inventario', 'recetas', 'compra'].entries()) {
  await page.click(`.tab[data-tab="${t}"]`); await page.waitForTimeout(400);
  await page.screenshot({ path: `tests/e2e/out/0${3 + i}-${t}.png`, fullPage: true });
}
await page.click('.tab[data-tab="recetas"]'); await page.waitForTimeout(300);
await page.click('.recipe-card:has-text("Pasta con tomate")'); await page.waitForTimeout(400);
await page.screenshot({ path: 'tests/e2e/out/06-recipe.png', fullPage: true });
console.log(errors.join('\n') || 'sin errores');
await browser.close();
