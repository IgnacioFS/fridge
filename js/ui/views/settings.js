// Ajustes: aviso de caducidad, copia de seguridad, datos de ejemplo e información.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { openSheet, quantityStepper, toast, confirmDialog, btn, banner } from '../components.js';
import { exportData, importData } from '../../data/backup.js';
import { loadSampleData } from '../../data/sample.js';
import { isStandalone, isIOS } from '../platform.js';
import { APP_VERSION } from '../../version.js';

export function openSettings(ctx) {
  const { store } = ctx;
  const soon = quantityStepper({ value: store.state.settings.soonDays, unit: 'ud', min: 1, max: 30, onChange: (v) => {
    const n = Math.round(v);
    if (n >= 1 && n <= 30) store.setSettings({ soonDays: n });
  } });

  const importInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', 'aria-label': 'Archivo de copia' });
  importInput.addEventListener('change', async () => {
    const f = importInput.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const ok = await confirmDialog({ title: '¿Restaurar la copia?', message: `Se sustituirán todos los datos actuales por los de la copia (${data.inventory?.length ?? 0} alimentos, ${data.recipes?.length ?? 0} recetas).`, confirmLabel: 'Restaurar', destructive: true });
      if (!ok) return;
      await importData(store, data);
      toast('Copia restaurada');
      sheet.close();
    } catch (e) {
      toast(e instanceof SyntaxError ? 'El archivo no es válido' : e.message, { tone: 'danger' });
    } finally { importInput.value = ''; }
  });

  const storageInfo = h('p', { class: 'field-hint' }, 'Comprobando almacenamiento…');
  (async () => {
    let text = store.persistent ? 'Los datos se guardan solo en este dispositivo.' : 'Este navegador no permite guardar datos (¿modo privado?).';
    try {
      if (navigator.storage?.persisted && await navigator.storage.persisted()) text += ' Almacenamiento protegido.';
      else if (isIOS() && !isStandalone()) text += ' Instala la app en la pantalla de inicio para que Safari no los borre.';
    } catch { /* sin soporte */ }
    storageInfo.textContent = text;
  })();

  const content = h('div', { class: 'settings' },
    h('div', { class: 'settings-group' },
      h('h3', null, 'Caducidad'),
      h('div', { class: 'settings-row' }, h('div', null, h('strong', null, 'Avisar con antelación'), h('small', null, 'Días antes de la fecha para marcar «caduca pronto»')), h('div', { class: 'settings-stepper' }, soon))),
    h('div', { class: 'settings-group' },
      h('h3', null, 'Copia de seguridad'),
      storageInfo,
      h('div', { class: 'btn-row' },
        btn('Exportar', { kind: 'tinted', icon: 'download', onClick: doExport }),
        btn('Importar', { kind: 'tinted', icon: 'upload', onClick: () => importInput.click() })),
      importInput),
    h('div', { class: 'settings-group' },
      h('h3', null, 'Datos'),
      btn('Añadir datos de ejemplo', { kind: 'tinted', icon: 'sparkle', cls: 'btn-block', onClick: async () => { await loadSampleData(store); toast('Datos de ejemplo añadidos'); sheet.close(); } }),
      btn('Borrar todos los datos', { kind: 'danger', icon: 'trash', cls: 'btn-block', onClick: async () => {
        const ok = await confirmDialog({ title: '¿Borrar todo?', message: 'Se eliminarán el inventario, las recetas y la lista de la compra. No se puede deshacer. Exporta una copia antes si la necesitas.', confirmLabel: 'Borrar todo', destructive: true });
        if (!ok) return;
        await importData(store, { app: 'fridge', schema: 1, inventory: [], recipes: [], shopping: [], images: [], settings: store.state.settings });
        toast('Datos borrados');
        sheet.close();
      } })),
    h('div', { class: 'settings-group about' },
      h('h3', null, 'Acerca de'),
      h('p', null, `FRIDGE ${APP_VERSION}. Funciona sin conexión. La información de productos escaneados procede de Open Food Facts (base de datos colaborativa, licencia ODbL) y puede contener errores.`)));

  const sheet = openSheet({ title: 'Ajustes', content, cancelLabel: 'Cerrar' });

  async function doExport() {
    try {
      const data = await exportData(store);
      const json = JSON.stringify(data);
      const name = `fridge-copia-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Copia de FRIDGE' }); return; } catch (e) { if (e?.name === 'AbortError') return; }
      }
      const a = h('a', { href: URL.createObjectURL(file), download: name });
      document.body.appendChild(a); a.click(); a.remove();
      toast('Copia descargada');
    } catch (e) {
      console.error(e);
      toast('No se pudo exportar', { tone: 'danger' });
    }
  }
  return sheet;
}

export { banner, icon };
