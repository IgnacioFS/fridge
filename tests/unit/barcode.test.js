import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeRow, decodeImage, encodeModules, checksumOK } from '../../js/services/barcode/ean.js';

// Generador pseudoaleatorio determinista.
function rng(seed) { let s = seed; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); }

/** Renderiza una fila: escala no entera, desenfoque, ruido, gradiente de luz y márgenes. */
function render(code, { scale = 2.7, blur = 1, noise = 12, gradient = 60, margin = 40, total, seed = 1, reverse = false } = {}) {
  let mods = encodeModules(code);
  if (reverse) mods = [...mods].reverse();
  const width = total || Math.ceil(mods.length * scale + margin * 2);
  const raw = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    // Muestreo con antialiasing: cobertura del módulo en el píxel.
    let dark = 0;
    for (let sub = 0; sub < 4; sub++) {
      const m = Math.floor((x + sub / 4 - margin) / scale);
      if (m >= 0 && m < mods.length && mods[m]) dark += 0.25;
    }
    raw[x] = 230 - dark * 190;
  }
  const out = new Uint8Array(width);
  const r = rng(seed);
  for (let x = 0; x < width; x++) {
    let acc = 0, n = 0;
    for (let k = -blur; k <= blur; k++) { const i = x + k; if (i >= 0 && i < width) { acc += raw[i]; n++; } }
    const light = -gradient / 2 + gradient * (x / width);
    out[x] = Math.max(0, Math.min(255, Math.round(acc / n + light + (r() - 0.5) * noise)));
  }
  return out;
}

const CODES13 = ['8410188012092', '8480000590640', '5449000000996', '3017620422003', '0012345678905', '8437009143056'];
const CODES8 = ['96385074', '40170725', '55123457'];

test('checksum', () => {
  assert.ok(checksumOK('8410188012092'));
  assert.ok(!checksumOK('8410188012093'));
  assert.ok(checksumOK('96385074'));
});

test('EAN-13 en condiciones normales y en ambos sentidos', () => {
  for (const c of CODES13) {
    assert.equal(decodeRow(render(c)), c, c);
    assert.equal(decodeRow(render(c, { reverse: true, seed: 7 })), c, `${c} invertido`);
  }
});

test('EAN-8', () => {
  for (const c of CODES8) assert.equal(decodeRow(render(c, { scale: 3.3 })), c, c);
});

test('robusto a escala, desenfoque, ruido e iluminación', () => {
  // Desenfoque hasta ~1,4 módulos, ruido fuerte y luz muy desigual.
  const cases = [
    { scale: 1.6, blur: 0, noise: 6 }, { scale: 2.2, blur: 1, noise: 20 }, { scale: 2.7, blur: 1, noise: 30 },
    { scale: 4.4, blur: 2, noise: 25 }, { scale: 3, blur: 1, gradient: 120 },
    { scale: 5.5, blur: 2, noise: 30, gradient: 80 }, { scale: 6, blur: 3, noise: 20, gradient: 100 },
  ];
  let ok = 0, total = 0;
  for (const c of CODES13) for (const [i, opt] of cases.entries()) for (let seed = 1; seed <= 5; seed++) {
    total++;
    if (decodeRow(render(c, { ...opt, seed: seed * 7 + i })) === c) ok++;
  }
  assert.ok(ok / total >= 0.95, `${ok}/${total}`);
});

test('nunca devuelve un código erróneo (rechaza ruido)', () => {
  const r = rng(42);
  for (let k = 0; k < 300; k++) {
    const row = new Uint8Array(400).map(() => Math.round(r() * 255));
    const res = decodeRow(row);
    assert.ok(res === null || checksumOK(res));
  }
  // Fila con contraste pero sin código
  assert.equal(decodeRow(new Uint8Array(300).map((_, i) => (Math.floor(i / 7) % 2 ? 30 : 220))), null);
});

test('imagen completa, también girada 90°', () => {
  const code = CODES13[0];
  const row = render(code, { scale: 3, total: 400 });
  const w = 400, h = 240;
  const img = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) img.set(row, y * w);
  assert.equal(decodeImage(img, w, h), code);
  // Girada: las barras son horizontales, se leen por columnas.
  const rot = new Uint8Array(h * w);
  const W = h, H = w;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rot[y * W + x] = row[y];
  assert.equal(decodeImage(rot, W, H), code);
});
