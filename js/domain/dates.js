// Fechas de caducidad como 'YYYY-MM-DD' en hora local (sin zona horaria).

export const DEFAULT_SOON_DAYS = 3;

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function dayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Días desde hoy hasta la fecha (negativo si ya pasó). */
export function daysUntil(iso, now = new Date()) {
  if (!isValidISODate(iso)) return null;
  return dayNumber(iso) - dayNumber(todayISO(now));
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}

/** 'none' | 'expired' | 'soon' | 'ok' */
export function expiryStatus(iso, now = new Date(), soonDays = DEFAULT_SOON_DAYS) {
  const n = daysUntil(iso, now);
  if (n === null) return 'none';
  if (n < 0) return 'expired';
  if (n <= soonDays) return 'soon';
  return 'ok';
}

export function expiryLabel(iso, now = new Date()) {
  const n = daysUntil(iso, now);
  if (n === null) return '';
  if (n < -1) return `Caducó hace ${-n} días`;
  if (n === -1) return 'Caducó ayer';
  if (n === 0) return 'Caduca hoy';
  if (n === 1) return 'Caduca mañana';
  if (n <= 14) return `Caduca en ${n} días`;
  return `Caduca el ${formatDate(iso)}`;
}

const df = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(iso) {
  if (!isValidISODate(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return df.format(new Date(y, m - 1, d));
}
