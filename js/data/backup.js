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

export function validateBackup(data) {
  if (!data || data.app !== 'fridge') return 'El archivo no es una copia de FRIDGE';
  if (typeof data.schema !== 'number' || data.schema > SCHEMA_VERSION) return 'La copia es de una versión más nueva de la app';
  for (const k of ['inventory', 'recipes', 'shopping']) if (!Array.isArray(data[k])) return 'La copia está incompleta';
  return null;
}

/** Sustituye todos los datos por los de la copia. */
export async function importData(store, data) {
  const err = validateBackup(data);
  if (err) throw new Error(err);
  const r = store.repos;
  await Promise.all([r.inventory.clear(), r.recipes.clear(), r.shopping.clear(), r.images.clear()]);
  await r.inventory.putMany(data.inventory);
  await r.recipes.putMany(data.recipes);
  await r.shopping.putMany(data.shopping);
  for (const img of data.images || []) {
    await r.images.put({ id: img.id, blob: base64ToBlob(img.data, img.type) });
  }
  if (data.settings) await r.meta.put({ id: 'settings', value: data.settings });
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
