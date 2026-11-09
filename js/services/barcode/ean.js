// Decodificador EAN-13 / EAN-8 / UPC-A a partir de líneas de luminancia.
// Sin dependencias. Se usa como alternativa a BarcodeDetector (no disponible en Safari iOS).

// Anchos de módulo (espacio, barra, espacio, barra) para el juego L.
// El juego R tiene los mismos anchos empezando por barra; el G es L invertido.
const L = [
  [3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2],
  [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2],
];
const G = L.map((p) => [...p].reverse());
// Paridad de los 6 dígitos izquierdos (1 = G) → primer dígito del EAN-13.
const FIRST = [0x00, 0x0b, 0x0d, 0x0e, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a];

const MAX_DIGIT_ERR = 0.48; // error medio por módulo admitido

export function checksumOK(code) {
  if (!/^\d+$/.test(code) || (code.length !== 13 && code.length !== 8)) return false;
  const d = code.split('').map(Number);
  const n = d.length;
  let sum = 0;
  for (let i = 0; i < n - 1; i++) {
    const fromRight = n - 1 - i; // posición desde el dígito de control
    sum += d[i] * (fromRight % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === d[n - 1];
}

/** Umbraliza una línea y devuelve longitudes de rachas que empiezan por espacio (claro). */
function runsFromRow(row, mode) {
  const n = row.length;
  let min = 255, max = 0;
  for (let i = 0; i < n; i++) { const v = row[i]; if (v < min) min = v; if (v > max) max = v; }
  if (max - min < 40) return null; // sin contraste
  if (mode === 'edges') return runsFromEdges(row, min, max);
  const bin = new Uint8Array(n); // 1 = barra (oscuro)
  if (mode === 'global') {
    const t = (min + max) / 2;
    for (let i = 0; i < n; i++) bin[i] = row[i] < t ? 1 : 0;
  } else {
    // Umbral local con media móvil: tolera iluminación desigual.
    const w = Math.max(8, Math.round(n / 12));
    const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + row[i];
    const floor = min + (max - min) * 0.18;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - w), b = Math.min(n, i + w + 1);
      const mean = (pre[b] - pre[a]) / (b - a);
      bin[i] = row[i] < Math.min(mean - 2, max - (max - min) * 0.25) && row[i] < Math.max(mean, floor + 1) ? 1 : 0;
    }
  }
  const runs = [];
  let cur = 0, len = 0;
  for (let i = 0; i < n; i++) {
    if (bin[i] === cur) len++;
    else { runs.push(len); cur = bin[i]; len = 1; }
  }
  runs.push(len);
  return runs; // runs[0] = espacio inicial (puede ser 0), runs[1] barra...
}

/**
 * Rachas a partir de bordes: picos de la derivada con posición subpíxel.
 * Resiste mucho mejor el desenfoque que un umbral, porque el centro del borde
 * no se mueve aunque las barras finas no lleguen a negro.
 */
function runsFromEdges(row, min, max) {
  const n = row.length;
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) s[i] = (row[Math.max(i - 1, 0)] + 2 * row[i] + row[Math.min(i + 1, n - 1)]) / 4;
  const d = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) d[i] = (s[i + 1] - s[i - 1]) / 2;
  const thr = (max - min) * 0.07;
  const edges = []; // {pos, sign}  sign -1 = claro→oscuro (empieza barra)
  for (let i = 2; i < n - 2; i++) {
    const a = Math.abs(d[i]);
    if (a < thr || a < Math.abs(d[i - 1]) || a <= Math.abs(d[i + 1])) continue;
    const den = d[i - 1] - 2 * d[i] + d[i + 1];
    const off = den !== 0 ? Math.max(-0.5, Math.min(0.5, (d[i - 1] - d[i + 1]) / (2 * den))) : 0;
    const e = { pos: i + off, sign: d[i] < 0 ? -1 : 1, mag: a };
    const last = edges[edges.length - 1];
    if (last && last.sign === e.sign) { if (e.mag > last.mag) edges[edges.length - 1] = e; continue; }
    edges.push(e);
  }
  while (edges.length && edges[0].sign !== -1) edges.shift();
  if (edges.length < 10) return null;
  const runs = [edges[0].pos];
  for (let k = 1; k < edges.length; k++) runs.push(edges[k].pos - edges[k - 1].pos);
  runs.push(n - edges[edges.length - 1].pos);
  return runs;
}

function matchDigit(widths, patterns) {
  const total = widths[0] + widths[1] + widths[2] + widths[3];
  const unit = total / 7;
  let best = -1, bestErr = Infinity;
  for (let d = 0; d < 10; d++) {
    const p = patterns[d];
    let err = 0;
    for (let k = 0; k < 4; k++) err += Math.abs(widths[k] / unit - p[k]);
    if (err < bestErr) { bestErr = err; best = d; }
  }
  return bestErr / 4 <= MAX_DIGIT_ERR ? { digit: best, err: bestErr } : null;
}

function guardOK(widths, module) {
  return widths.every((w) => w > module * 0.4 && w < module * 1.9);
}

/** Intenta decodificar a partir de la racha `s` (índice de una barra) en `runs`. */
function tryAt(runs, s, kind) {
  const half = kind === 13 ? 6 : 4;
  const needed = 3 + half * 4 + 5 + half * 4 + 3;
  if (s + needed > runs.length) return null;
  const totalModules = kind === 13 ? 95 : 67;
  let width = 0;
  for (let k = 0; k < needed; k++) width += runs[s + k];
  const module = width / totalModules;
  // Zona de silencio antes del inicio (al menos 3 módulos o borde de la línea).
  if (s > 1 && runs[s - 1] < module * 2.5) return null;
  if (!guardOK([runs[s], runs[s + 1], runs[s + 2]], module)) return null;

  let i = s + 3;
  const left = [];
  let parity = 0;
  for (let k = 0; k < half; k++) {
    const w = [runs[i], runs[i + 1], runs[i + 2], runs[i + 3]];
    const l = matchDigit(w, L);
    const g = kind === 13 ? matchDigit(w, G) : null;
    let pick;
    if (l && (!g || l.err <= g.err)) pick = { d: l.digit, g: 0 };
    else if (g) pick = { d: g.digit, g: 1 };
    else return null;
    left.push(pick.d);
    parity = (parity << 1) | pick.g;
    i += 4;
  }
  if (!guardOK([runs[i], runs[i + 1], runs[i + 2], runs[i + 3], runs[i + 4]], module)) return null;
  i += 5;
  const right = [];
  for (let k = 0; k < half; k++) {
    const m = matchDigit([runs[i], runs[i + 1], runs[i + 2], runs[i + 3]], L);
    if (!m) return null;
    right.push(m.digit);
    i += 4;
  }
  if (!guardOK([runs[i], runs[i + 1], runs[i + 2]], module)) return null;

  let code;
  if (kind === 13) {
    const first = FIRST.indexOf(parity);
    if (first < 0) return null;
    code = `${first}${left.join('')}${right.join('')}`;
  } else {
    if (parity !== 0) return null;
    code = `${left.join('')}${right.join('')}`;
  }
  return checksumOK(code) ? code : null;
}

function scanRuns(runs) {
  // Las barras están en índices impares (runs[0] es espacio).
  for (let s = 1; s < runs.length; s += 2) {
    const c13 = tryAt(runs, s, 13);
    if (c13) return c13;
  }
  for (let s = 1; s < runs.length; s += 2) {
    const c8 = tryAt(runs, s, 8);
    if (c8) return c8;
  }
  return null;
}

/** Decodifica una línea de luminancia (array de 0–255). Prueba ambos sentidos y dos umbrales. */
export function decodeRow(row) {
  for (const mode of ['edges', 'global', 'local']) {
    const runs = runsFromRow(row, mode);
    if (!runs) continue;
    const fwd = scanRuns(runs);
    if (fwd) return fwd;
    const rev = [...runs].reverse();
    if (rev.length % 2 === 0) rev.unshift(0); // mantener índice 0 = espacio
    const back = scanRuns(rev);
    if (back) return back;
  }
  return null;
}

/**
 * Decodifica una imagen en escala de grises (Uint8Array, ancho × alto).
 * Recorre varias filas y columnas (códigos girados). Devuelve el código si al menos
 * dos líneas coinciden, o una si `minVotes` = 1.
 */
export function decodeImage(gray, width, height, { lines = 13, minVotes = 2 } = {}) {
  const votes = new Map();
  const vote = (code) => {
    if (!code) return null;
    const v = (votes.get(code) || 0) + 1;
    votes.set(code, v);
    return v >= minVotes ? code : null;
  };
  const row = new Uint8Array(width);
  for (let k = 0; k < lines; k++) {
    const y = Math.round(height * (0.2 + 0.6 * (k / Math.max(lines - 1, 1))));
    row.set(gray.subarray(y * width, y * width + width));
    const hit = vote(decodeRow(row));
    if (hit) return hit;
  }
  const col = new Uint8Array(height);
  for (let k = 0; k < lines; k++) {
    const x = Math.round(width * (0.2 + 0.6 * (k / Math.max(lines - 1, 1))));
    for (let y = 0; y < height; y++) col[y] = gray[y * width + x];
    const hit = vote(decodeRow(col));
    if (hit) return hit;
  }
  return null;
}

// ── Codificador (para pruebas y para generar vídeos sintéticos) ──

/** Devuelve el patrón de módulos (1 = barra) de un EAN-13 o EAN-8 válido. */
export function encodeModules(code) {
  if (!checksumOK(code)) throw new Error('Código no válido');
  const bits = [];
  const put = (widths, startBar) => {
    let bar = startBar;
    for (const w of widths) { for (let i = 0; i < w; i++) bits.push(bar ? 1 : 0); bar = !bar; }
  };
  const d = code.split('').map(Number);
  put([1, 1, 1], true);
  if (code.length === 13) {
    const par = FIRST[d[0]];
    for (let k = 0; k < 6; k++) put(((par >> (5 - k)) & 1 ? G : L)[d[k + 1]], false);
    put([1, 1, 1, 1, 1], false);
    for (let k = 0; k < 6; k++) put(L[d[k + 7]], true);
  } else {
    for (let k = 0; k < 4; k++) put(L[d[k]], false);
    put([1, 1, 1, 1, 1], false);
    for (let k = 0; k < 4; k++) put(L[d[k + 4]], true);
  }
  put([1, 1, 1], true);
  return bits;
}
