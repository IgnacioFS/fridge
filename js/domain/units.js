// Unidades y conversiones. Todo el cálculo se hace en milésimas enteras de la
// unidad base para evitar errores de coma flotante.

export const UNITS = {
  g:       { label: 'g',       long: 'gramos',      dim: 'mass',   factor: 1 },
  kg:      { label: 'kg',      long: 'kilos',       dim: 'mass',   factor: 1000 },
  ml:      { label: 'ml',      long: 'mililitros',  dim: 'volume', factor: 1 },
  cl:      { label: 'cl',      long: 'centilitros', dim: 'volume', factor: 10 },
  l:       { label: 'l',       long: 'litros',      dim: 'volume', factor: 1000 },
  ud:      { label: 'ud',      long: 'unidades',    dim: 'count',  factor: 1 },
  paquete: { label: 'paq.',    long: 'paquetes',    dim: 'paquete', factor: 1 },
  lata:    { label: 'lata',    long: 'latas',       dim: 'lata',   factor: 1 },
  bote:    { label: 'bote',    long: 'botes',       dim: 'bote',   factor: 1 },
};

export const UNIT_ORDER = ['ud', 'g', 'kg', 'ml', 'l', 'cl', 'paquete', 'lata', 'bote'];

const SCALE = 1000; // milésimas

export function isUnit(u) { return Object.prototype.hasOwnProperty.call(UNITS, u); }

export function dimensionOf(unit) {
  if (!isUnit(unit)) throw new Error(`Unidad desconocida: ${unit}`);
  return UNITS[unit].dim;
}

export function areCompatible(a, b) {
  return isUnit(a) && isUnit(b) && UNITS[a].dim === UNITS[b].dim;
}

/** Cantidad → milésimas enteras de la unidad base. */
export function toBaseMilli(quantity, unit) {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return 0;
  return Math.round(q * UNITS[unit].factor * SCALE);
}

/** Milésimas de unidad base → cantidad en la unidad indicada (redondeada a 3 decimales). */
export function fromBaseMilli(milli, unit) {
  const value = milli / (UNITS[unit].factor * SCALE);
  return Math.round(value * 1000) / 1000;
}

/** Convierte; devuelve null si las unidades no son compatibles. */
export function convert(quantity, from, to) {
  if (!areCompatible(from, to)) return null;
  return fromBaseMilli(toBaseMilli(quantity, from), to);
}

/** Suma cantidades expresadas en unidades compatibles y devuelve el resultado en `targetUnit`. */
export function sum(entries, targetUnit) {
  let total = 0;
  for (const { quantity, unit } of entries) {
    if (!areCompatible(unit, targetUnit)) return null;
    total += toBaseMilli(quantity, unit);
  }
  return fromBaseMilli(total, targetUnit);
}

/** Elige la unidad más legible para mostrar una cantidad base (1500 g → 1,5 kg). */
export function bestUnit(milli, dim) {
  if (dim === 'mass') return Math.abs(milli) >= 1000 * SCALE ? 'kg' : 'g';
  if (dim === 'volume') return Math.abs(milli) >= 1000 * SCALE ? 'l' : 'ml';
  return Object.keys(UNITS).find((u) => UNITS[u].dim === dim);
}

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

export function formatNumber(n) { return nf.format(n); }

export function formatQuantity(quantity, unit) {
  const label = isUnit(unit) ? UNITS[unit].label : unit;
  return `${formatNumber(quantity)} ${label}`;
}

/** Formatea expresando la cantidad en la unidad más legible de su dimensión. */
export function formatSmart(quantity, unit) {
  if (!isUnit(unit)) return formatQuantity(quantity, unit);
  const dim = UNITS[unit].dim;
  if (dim !== 'mass' && dim !== 'volume') return formatQuantity(quantity, unit);
  const milli = toBaseMilli(quantity, unit);
  const u = bestUnit(milli, dim);
  return formatQuantity(fromBaseMilli(milli, u), u);
}

/** Paso razonable para el stepper de cantidad. */
export function stepFor(unit, quantity = 0) {
  switch (unit) {
    case 'g': return quantity >= 500 ? 100 : 50;
    case 'ml': return quantity >= 500 ? 100 : 50;
    case 'cl': return 10;
    case 'kg': case 'l': return 0.25;
    default: return 1;
  }
}

/** Interpreta texto como «500 g», «1,5 l», «6 x 125 g», «1L». Devuelve {quantity, unit} o null. */
export function parseQuantityText(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(',', '.').trim();
  const multi = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  if (multi) {
    const total = Number(multi[1]) * Number(multi[2]);
    return { quantity: Math.round(total * 1000) / 1000, unit: multi[3] };
  }
  const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|grs|ml|cl|l|lt|litros?)\b/);
  if (!m) return null;
  let unit = m[2];
  if (unit === 'gr' || unit === 'grs') unit = 'g';
  if (unit === 'lt' || unit.startsWith('litro')) unit = 'l';
  return { quantity: Number(m[1]), unit };
}
