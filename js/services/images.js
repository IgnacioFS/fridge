// Redimensiona fotos antes de guardarlas para no llenar el almacenamiento.

const MAX = 800;

export async function resizeImage(fileOrBlob, max = MAX, quality = 0.82) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await loadViaImg(fileOrBlob);
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', quality));
}

function loadViaImg(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen no válida')); };
    img.src = url;
  });
}

/** Descarga una imagen remota (p. ej. de Open Food Facts) para guardarla localmente. */
export async function fetchImageBlob(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await resizeImage(blob, 600);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
