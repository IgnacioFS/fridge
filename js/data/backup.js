// Exportación / importación en JSON versionado. Las imágenes se incluyen en base64.
import { SCHEMA_VERSION } from './store.js';

export async function exportData(store) {
  const images = await store.repos.images.getAll();
  const enc = [];
  for (const img of images) {
    if (!img.blob) continue;
    enc.push({ id: img.id, type: img.blob.type, data: await blobToBase64(img.blob) });
  }
  return {
    app: 'fridge',
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    inventory: store.state.inventory,
    recipes: store.state.recipes,
    shopping: store.state.shopping,
    settings: store.state.settings,
    images: enc,
  };
}

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const ok = (o) => isObj(o) && typeof o.id === 'string' && o.id && typeof o.name === 'string';

export function validateBackup(data) {
  if (!isObj(data) || data.app !== 'fridge') return 'El archivo no es una copia de FRIDGE';
  if (typeof data.schema !== 'number' || data.schema > SCHEMA_VERSION) return 'La copia es de una versión más nueva de la app';
  for (const k of ['inventory', 'recipes', 'shopping']) if (!Array.isArray(data[k])) return 'La copia está incompleta';
  const bad = 'La copia está dañada: no se ha cambiado nada';
  if (!data.inventory.every((x) => ok(x) && Number.isFinite(x.quantity) && typeof x.unit === 'string')) return bad;
  if (!data.shopping.every((x) => ok(x) && Number.isFinite(x.quantity) && typeof x.unit === 'string' && Array.isArray(x.sources ?? []))) return bad;
  if (!data.recipes.every((x) => ok(x) && Array.isArray(x.ingredients) && x.ingredients.every((g) => isObj(g) && typeof g.name === 'string'))) return bad;
  if (data.images && (!Array.isArray(data.images) || !data.images.every((i) => isObj(i) && typeof i.id === 'string' && typeof i.data === 'string'))) return bad;
  return null;
}

/** Sustituye todos los datos por los de la copia. */
export async function importData(store, data) {
  const err = validateBackup(data);
  if (err) throw new Error(err);
  // Se prepara todo antes de tocar nada; después, una única transacción (todo o nada).
  const images = (data.images || []).map((img) => ({ id: img.id, blob: base64ToBlob(img.data, img.type) }));
  const sources = (x) => ({ ...x, sources: x.sources || [] });
  await store.serial(() => store.repos.replaceAll({
    inventory: data.inventory, recipes: data.recipes, shopping: data.shopping.map(sources), images,
    meta: [{ id: 'schema', value: SCHEMA_VERSION }, ...(data.settings ? [{ id: 'settings', value: data.settings }] : [])],
  }));
  store.imageURLs.forEach((u) => URL.revokeObjectURL(u));
  store.imageURLs.clear();
  await store.load();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'image/jpeg' });
}
