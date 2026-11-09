// Formulario de alimento (alta y edición). Se usa desde inventario, escáner y compra.
import { h, replace } from '../dom.js';
import { icon, LOCATION_ICON } from '../icons.js';
import {
  openSheet, field, textInput, unitSelect, segmented, quantityStepper, expiryPicker, showErrors,
  toast, banner, thumb, btn, confirmDialog, datalist,
} from '../components.js';
import { CATEGORIES, LOCATIONS, category as catOf, defaultLocationFor, location as locOf } from '../../domain/catalog.js';
import { normalizeKey } from '../../domain/matching.js';
import { mergeCandidates } from '../../domain/inventory.js';
import { formatQuantity } from '../../domain/units.js';
import { ValidationError } from '../../data/store.js';
import { resizeImage, fetchImageBlob } from '../../services/images.js';

/**
 * opts: { item?: InventoryItem (edición), draft?: datos parciales (escáner), notice?: {text, tone, ic} }
 */
export function openItemForm(ctx, { item = null, draft = null, notice = null, onSaved = null } = {}) {
  const { store } = ctx;
  const editing = !!item;
  const base = item || {
    name: '', brand: '', category: 'otros', quantity: 1, unit: 'ud', expiry: '', location: 'nevera', barcode: '', notes: '', imageId: null,
    ...Object.fromEntries(Object.entries(draft || {}).filter(([, v]) => v !== null && v !== undefined)),
  };
  if (!editing && draft?.category && !draft.location) base.location = defaultLocationFor(draft.category);
  let categoryTouched = editing || !!draft?.category;
  let imageId = base.imageId || null;
  let newImageBlob = null;
  const remoteImageUrl = !editing && draft?.imageUrl ? draft.imageUrl : null;

  // ── Campos
  const listId = 'names-list';
  const name = textInput({ name: 'name', value: base.name, placeholder: 'Ej. Leche entera', list: listId, enterkeyhint: 'next', autocapitalize: 'sentences' });
  const stepper = quantityStepper({ value: Number(base.quantity) || 0, unit: base.unit });
  const unit = unitSelect({ value: base.unit, onChange: (u) => stepper.setUnit(u) });
  const loc = segmented({
    name: 'location', value: base.location, ariaLabel: 'Ubicación',
    options: LOCATIONS.map((l) => ({ value: l.id, label: l.label, icon: LOCATION_ICON[l.id] })),
  });
  const expiry = expiryPicker({ value: base.expiry || '' });

  const catHidden = h('input', { type: 'hidden', name: 'category', value: base.category });
  const catGrid = h('div', { class: 'chip-grid', role: 'radiogroup', 'aria-label': 'Categoría' });
  const renderCats = () => {
    replace(catGrid, ...CATEGORIES.map((c) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': c.id === catHidden.value ? 'true' : 'false',
      class: ['chip', c.id === catHidden.value && 'selected'],
      onClick: () => { catHidden.value = c.id; categoryTouched = true; renderCats(); if (!editing) loc.setValue(defaultLocationFor(c.id)); },
    }, h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, c.emoji), c.label)));
  };
  renderCats();
  if (!categoryTouched && base.name) {
    const { category } = store.suggestionsFor(base.name);
    if (category) { catHidden.value = category; renderCats(); if (!editing && !draft?.location) loc.setValue(defaultLocationFor(category)); }
  }

  name.addEventListener('input', () => {
    if (categoryTouched) return;
    const { category } = store.suggestionsFor(name.value);
    if (category && category !== catHidden.value) {
      catHidden.value = category; renderCats();
      if (!editing) loc.setValue(defaultLocationFor(category));
    }
  });

  const brand = textInput({ name: 'brand', value: base.brand || '', placeholder: 'Opcional' });
  const barcode = textInput({ name: 'barcode', value: base.barcode || '', placeholder: 'Opcional', inputmode: 'numeric' });
  const notes = h('textarea', { class: 'input', name: 'notes', rows: 2, placeholder: 'Opcional' }, base.notes || '');

  // Foto
  const photoThumb = h('div');
  const renderThumb = () => {
    const t = newImageBlob
      ? h('div', { class: 'thumb has-img', style: { width: '64px', height: '64px' } }, h('img', { src: URL.createObjectURL(newImageBlob), alt: '' }))
      : remoteImageUrl && !imageId
        ? h('div', { class: 'thumb has-img', style: { width: '64px', height: '64px' } }, h('img', { src: remoteImageUrl, alt: '', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }))
        : thumb(store, { imageId, emoji: catOf(catHidden.value).emoji, size: 64 });
    replace(photoThumb, t);
  };
  renderThumb();
  const fileInput = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Elegir foto' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try { newImageBlob = await resizeImage(f); renderThumb(); removePhoto.hidden = false; } catch { toast('No se pudo leer la imagen', { tone: 'danger' }); }
  });
  const removePhoto = btn('Quitar', { kind: 'plain', onClick: () => { newImageBlob = null; imageId = null; renderThumb(); removePhoto.hidden = true; } });
  removePhoto.hidden = !(imageId || newImageBlob);
  const photo = h('div', { class: 'photo-picker' }, photoThumb,
    h('label', { class: 'btn btn-tinted btn-small' }, icon('camera', { size: 17 }), h('span', null, imageId ? 'Cambiar foto' : 'Añadir foto'), fileInput),
    removePhoto);

  const openDetails = editing ? !!(base.brand || base.barcode || base.notes || base.imageId) : !!draft;
  const form = h('form', { class: 'form', novalidate: true, onSubmit: (e) => { e.preventDefault(); save(); } },
    datalist(listId, store.knownNames()),
    notice ? banner(notice.text, { tone: notice.tone || 'info', ic: notice.ic || 'info' }) : null,
    field({ label: 'Nombre', input: name }),
    h('div', { class: 'field-row' },
      field({ label: 'Cantidad', input: stepper }),
      h('div', { class: 'field narrow' }, h('label', { class: 'field-label', for: 'unit-sel' }, 'Unidad'), Object.assign(unit, { id: 'unit-sel' }))),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Ubicación'), loc),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Caducidad o consumo preferente'), expiry),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Categoría'), catHidden, catGrid),
    h('details', { class: 'more', open: openDetails },
      h('summary', null, 'Más detalles', icon('chevronDown', { size: 16 })),
      h('div', { class: 'form' },
        field({ label: 'Marca', input: brand }),
        field({ label: 'Código de barras', input: barcode }),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Foto'), photo),
        field({ label: 'Notas', input: notes }))),
    h('div', { class: 'sheet-footer' },
      btn(editing ? 'Guardar cambios' : 'Añadir al inventario', { kind: 'primary', cls: 'btn-block', type: 'submit' }),
      editing ? h('div', { class: 'btn-row' },
        btn('A la compra', { kind: 'tinted', icon: 'cart', onClick: async () => { const r = await store.restock(item); toast(r.merged ? `Ya estaba en la lista: «${r.item.name}»` : `«${item.name}» añadido a la compra`); } }),
        btn('Eliminar', { kind: 'danger', icon: 'trash', onClick: remove })) : null));

  const sheet = openSheet({ title: editing ? 'Editar alimento' : 'Nuevo alimento', content: form, primary: { label: 'Guardar', onClick: () => save() }, full: true });
  if (!editing && !base.name) setTimeout(() => name.focus(), 350);

  let saving = false;
  async function save() {
    if (saving) return;
    const input = {
      name: name.value, brand: brand.value, category: catHidden.value, quantity: stepper.input.value, unit: unit.value,
      expiry: expiry.getValue(), location: loc.getValue(), barcode: barcode.value, notes: notes.value, imageId,
    };
    saving = true; sheet.setBusy(true);
    try {
      // Duplicados: al dar de alta, ofrecer sumar a un producto compatible en la misma ubicación.
      if (!editing) {
        const key = normalizeKey(input.name);
        const candidates = mergeCandidates(store.state.inventory, { key, unit: input.unit, barcode: input.barcode })
          .filter((c) => c.location === input.location);
        if (key && candidates.length) {
          const c = candidates[0];
          const merge = await confirmDialog({
            title: `Ya tienes «${c.name}»`,
            message: `${formatQuantity(c.quantity, c.unit)} en ${locOf(c.location).label}. ¿Sumar la cantidad a ese producto?`,
            confirmLabel: 'Sumar', cancelLabel: 'Crear otro',
          });
          if (merge) {
            const r = await store.mergeIntoItem(c.id, { quantity: input.quantity, unit: input.unit, expiry: input.expiry });
            toast(`«${c.name}»: ahora ${formatQuantity(r.quantity, r.unit)}`);
            sheet.close(); onSaved?.(r);
            return;
          }
        }
      }
      if (newImageBlob) input.imageId = await store.saveImage(newImageBlob);
      else if (remoteImageUrl && !imageId) {
        const blob = await fetchImageBlob(remoteImageUrl);
        if (blob) input.imageId = await store.saveImage(blob);
      }
      const saved = await store.saveItem(input, editing ? item.id : null);
      toast(editing ? 'Cambios guardados' : `«${saved.name}» añadido`);
      sheet.close();
      onSaved?.(saved);
    } catch (e) {
      if (e instanceof ValidationError) showErrors(form, e.errors);
      else { console.error(e); toast('No se pudo guardar. Inténtalo de nuevo.', { tone: 'danger' }); }
    } finally {
      saving = false; if (!sheet.closed) sheet.setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirmDialog({ title: `¿Eliminar «${item.name}»?`, message: 'Se quitará del inventario.', confirmLabel: 'Eliminar', destructive: true });
    if (!ok) return;
    const undo = await store.deleteItem(item.id);
    sheet.close();
    toast(`«${item.name}» eliminado`, { action: 'Deshacer', onAction: undo });
  }
  return sheet;
}
