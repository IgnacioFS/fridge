// Lista de la compra: alta rápida, agrupada por categorías, pendientes/comprados y paso al inventario.
import { h, haptic, replace } from '../dom.js';
import { icon, LOCATION_ICON } from '../icons.js';
import {
  emptyState, toast, openSheet, field, textInput, unitSelect, quantityStepper, showErrors, btn, confirmDialog,
  segmented, expiryPicker, iconButton, banner, datalist,
} from '../components.js';
import { CATEGORIES, LOCATIONS, category as catOf, defaultLocationFor, location as locOf } from '../../domain/catalog.js';
import { groupByCategory, findIncompatibleTwin } from '../../domain/shopping.js';
import { mergeCandidates } from '../../domain/inventory.js';
import { formatQuantity, isUnit } from '../../domain/units.js';
import { normalizeKey } from '../../domain/matching.js';
import { parseNumber } from '../../domain/validation.js';
import { ValidationError } from '../../data/store.js';
import { pressKey } from '../components.js';

/** «2 l leche», «leche 2l», «6 huevos», «pan» → {name, quantity, unit} */
export function parseQuickAdd(text) {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const unitRe = '(kg|g|gr|ml|cl|l|ud|uds|unidades?|paquetes?|paq|latas?|botes?)';
  const norm = (u) => {
    if (!u) return 'ud';
    u = u.toLowerCase();
    if (u === 'gr') return 'g';
    if (u.startsWith('ud') || u.startsWith('unidad')) return 'ud';
    if (u.startsWith('paq')) return 'paquete';
    if (u.startsWith('lata')) return 'lata';
    if (u.startsWith('bote')) return 'bote';
    return isUnit(u) ? u : 'ud';
  };
  let m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*${unitRe}?\\s+(?:de\\s+)?(.+)$`, 'i'));
  if (m) return { name: cap(m[3]), quantity: parseNumber(m[1]), unit: norm(m[2]) };
  m = t.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*${unitRe}?$`, 'i'));
  if (m) return { name: cap(m[1]), quantity: parseNumber(m[2]), unit: norm(m[3]) };
  return { name: cap(t), quantity: 1, unit: 'ud' };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function ShoppingView(ctx) {
  const { store } = ctx;
  const listEl = h('div');
  const countEl = h('span', { class: 'screen-subtitle' });
  const quick = textInput({ placeholder: 'Añadir: «2 l leche», «pan»…', enterkeyhint: 'done', 'aria-label': 'Añadir producto', class: 'input quick-input', list: 'shop-names' });
  const names = h('span');
  let adding = false;
  const quickForm = h('form', { class: 'quick-add', onSubmit: async (e) => {
    e.preventDefault();
    const p = parseQuickAdd(quick.value);
    if (!p || adding) return;
    adding = true;
    try {
      const twin = findIncompatibleTwin(store.state.shopping, normalizeKey(p.name), p.unit);
      const { item, merged } = await store.addShopping(p);
      quick.value = '';
      haptic();
      if (merged) toast(`Sumado a «${item.name}»: ${formatQuantity(item.quantity, item.unit)}`);
      else if (twin) toast(`«${item.name}» ya estaba en ${twin.unit}; no se puede sumar a ${item.unit}`);
    } catch (err) {
      if (err instanceof ValidationError) toast(Object.values(err.errors)[0], { tone: 'danger' });
    } finally { adding = false; }
  } }, names, quick, h('button', { type: 'submit', class: 'icon-btn accent', 'aria-label': 'Añadir' }, icon('plus', { size: 20, stroke: 2.2 })));

  const el = h('div', { class: 'view-shopping' },
    h('header', { class: 'screen-header' },
      h('div', { class: 'titles' }, countEl, h('h1', { class: 'screen-title' }, 'Compra')),
      h('div', { class: 'screen-actions' }, iconButton('edit', { label: 'Añadir con detalle', onClick: () => openShoppingForm(ctx) }))),
    quickForm, listEl);

  function render() {
    replace(names, datalist('shop-names', store.knownNames()));
    const all = store.state.shopping;
    const pending = all.filter((x) => !x.checked);
    const done = all.filter((x) => x.checked).sort((a, b) => (b.checkedAt || '').localeCompare(a.checkedAt || ''));
    countEl.textContent = pending.length ? `${pending.length} ${pending.length === 1 ? 'pendiente' : 'pendientes'}` : all.length ? 'Todo comprado' : '';
    if (!all.length) {
      replace(listEl, emptyState({ icon: 'cart', title: 'La lista está vacía', text: 'Escribe arriba lo que necesitas o añade lo que falta desde una receta.', secondary: { label: 'Ver recetas', onClick: () => ctx.navigate('#/recetas') } }));
      return;
    }
    const groups = groupByCategory(pending, CATEGORIES);
    const notInInv = done.filter((x) => !x.addedToInventory);
    replace(listEl, 
      ...groups.map((g) => h('section', null,
        h('h2', { class: 'group-label' }, h('span', { 'aria-hidden': 'true' }, g.category.emoji), g.category.label, h('span', { class: 'group-count' }, g.items.length)),
        h('div', { class: 'list' }, g.items.map((it) => shopRow(ctx, it))))),
      !pending.length ? h('div', { class: 'all-done' }, icon('check', { size: 22, stroke: 2.4 }), h('span', null, '¡Todo comprado!')) : null,
      done.length ? h('section', { class: 'done-section' },
        h('div', { class: 'section-header' }, h('h2', null, 'Comprados'),
          h('button', { type: 'button', class: 'link', onClick: async () => {
            const msg = notInInv.length ? `${notInInv.length} ${notInInv.length === 1 ? 'no se ha añadido' : 'no se han añadido'} al inventario.` : 'Se quitarán de la lista.';
            const ok = await confirmDialog({ title: '¿Vaciar comprados?', message: msg, confirmLabel: 'Vaciar', destructive: true });
            if (!ok) return;
            const undo = await store.clearPurchased();
            toast('Comprados eliminados', { action: 'Deshacer', onAction: undo });
          } }, 'Vaciar')),
        notInInv.length > 1 ? banner(`${notInInv.length} productos comprados aún no están en el inventario.`, { tone: 'info', ic: 'box', action: { label: 'Revisar', onClick: () => reviewPurchases(ctx, notInInv.map((x) => x.id)) } }) : null,
        h('div', { class: 'list done-list' }, done.map((it) => shopRow(ctx, it)))) : null);
  }

  render();
  return { el, update: render, onShow: render };
}

function shopRow(ctx, it) {
  const { store } = ctx;
  const check = h('button', {
    type: 'button', class: ['check', it.checked && 'on'], role: 'checkbox', 'aria-checked': it.checked ? 'true' : 'false', 'aria-label': `${it.checked ? 'Desmarcar' : 'Marcar'} ${it.name}`,
    onClick: async () => {
      haptic();
      const next = await store.toggleShopping(it.id);
      if (next?.checked && !next.addedToInventory) {
        toast(`«${it.name}» comprado`, { action: 'Al inventario', onAction: () => openPurchaseSheet(ctx, it.id), duration: 5000 });
      }
    },
  }, it.checked ? icon('check', { size: 15, stroke: 3 }) : null);

  const tags = it.sources?.length ? h('span', { class: 'row-tags' }, it.sources.map((s) => h('span', { class: 'tag', title: s.recipeName }, icon('book', { size: 11 }), s.recipeName))) : null;
  const trail = it.checked
    ? (it.addedToInventory
      ? h('span', { class: 'badge badge-ok' }, icon('box', { size: 13 }), 'En casa')
      : h('button', { type: 'button', class: 'btn btn-secondary btn-small', onClick: (e) => { e.stopPropagation(); openPurchaseSheet(ctx, it.id); } }, 'Al inventario'))
    : h('span', { class: 'qty' }, formatQuantity(it.quantity, it.unit));

  return h('div', { class: ['row', 'no-thumb', 'shop-row', it.checked && 'checked'], dataset: { id: it.id } },
    check,
    h('div', { class: 'row-main', role: 'button', tabindex: '0', onClick: () => openShoppingForm(ctx, store.getShopping(it.id)), onKeydown: pressKey },
      h('span', { class: 'row-title' }, it.name),
      it.checked ? h('span', { class: 'row-sub' }, formatQuantity(it.quantity, it.unit)) : null,
      tags),
    h('div', { class: 'row-trail' }, trail));
}

/** Alta/edición con detalle: cantidad, unidad, categoría y etiquetas de recetas. */
export function openShoppingForm(ctx, item = null) {
  const { store } = ctx;
  const editing = !!item;
  const name = textInput({ name: 'name', value: item?.name || '', placeholder: 'Producto', list: 'shop-names-2' });
  const stepper = quantityStepper({ value: item?.quantity ?? 1, unit: item?.unit || 'ud' });
  const unit = unitSelect({ value: item?.unit || 'ud', onChange: (u) => stepper.setUnit(u) });
  unit.id = 'shop-unit';
  const cat = h('select', { class: 'input select', name: 'category', id: 'shop-cat' },
    h('option', { value: '' }, 'Automática'),
    CATEGORIES.map((c) => h('option', { value: c.id, selected: item?.category === c.id }, `${c.emoji} ${c.label}`)));
  const tagsWrap = h('div', { class: 'chips' });
  const renderTags = () => {
    const cur = store.getShopping(item?.id);
    const sources = cur?.sources || [];
    replace(tagsWrap, ...(sources.length ? sources.map((s) => h('button', {
      type: 'button', class: 'tag-remove', 'aria-label': `Quitar etiqueta ${s.recipeName}`,
      onClick: async () => {
        const next = await store.removeShoppingSource(item.id, s.recipeId);
        stepper.input.value = String(next.quantity).replace('.', ',');
        renderTags();
        toast(`Etiqueta «${s.recipeName}» quitada; el producto sigue en la lista`);
      },
    }, icon('book', { size: 14 }), h('span', null, `${s.recipeName} · ${formatQuantity(s.quantity, cur.unit)}`), h('span', { class: 'x' }, icon('close', { size: 13, stroke: 2.4 })))) : [h('p', { class: 'field-hint' }, 'Sin recetas asociadas.')]));
  };

  const form = h('form', { class: 'form', novalidate: true, onSubmit: (e) => { e.preventDefault(); save(); } },
    datalist('shop-names-2', store.knownNames()),
    field({ label: 'Producto', input: name }),
    h('div', { class: 'field-row' },
      field({ label: 'Cantidad', input: stepper }),
      h('div', { class: 'field narrow' }, h('label', { class: 'field-label', for: 'shop-unit' }, 'Unidad'), unit)),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'shop-cat' }, 'Categoría'), cat),
    editing ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Recetas'), tagsWrap,
      item.sources?.length ? h('p', { class: 'field-hint' }, 'Al quitar una receta se resta lo que aportaba, pero el producto se queda en la lista.') : null) : null,
    h('div', { class: 'sheet-footer' },
      btn(editing ? 'Guardar' : 'Añadir a la lista', { kind: 'primary', cls: 'btn-block', type: 'submit' }),
      editing ? h('div', { class: 'btn-row' },
        !item.addedToInventory ? btn('Al inventario', { kind: 'tinted', icon: 'box', onClick: () => { sheet.close(); openPurchaseSheet(ctx, item.id); } }) : null,
        btn('Eliminar', { kind: 'danger', icon: 'trash', onClick: async () => {
          const undo = await store.deleteShopping(item.id);
          sheet.close();
          toast(`«${item.name}» quitado de la lista`, { action: 'Deshacer', onAction: undo });
        } })) : null));
  if (editing) renderTags();

  const sheet = openSheet({ title: editing ? 'Editar producto' : 'Añadir a la compra', content: form, primary: { label: 'Guardar', onClick: () => save() } });
  if (!editing) setTimeout(() => name.focus(), 350);

  async function save() {
    const input = { name: name.value, quantity: stepper.input.value, unit: unit.value, category: cat.value || null };
    try {
      if (editing) {
        await store.updateShopping(item.id, { ...input, category: cat.value || item.category });
        toast('Guardado');
      } else {
        const { item: it, merged } = await store.addShopping(input);
        toast(merged ? `Sumado a «${it.name}»: ${formatQuantity(it.quantity, it.unit)}` : `«${it.name}» añadido`);
      }
      sheet.close();
    } catch (e) {
      if (e instanceof ValidationError) showErrors(form, e.errors);
      else toast('No se pudo guardar', { tone: 'danger' });
    }
  }
}

/** Confirmación de compra → inventario. El inventario solo cambia al confirmar. */
export function openPurchaseSheet(ctx, shoppingId, { onDone } = {}) {
  const { store } = ctx;
  const s = store.getShopping(shoppingId);
  if (!s) return;
  const stepper = quantityStepper({ value: s.quantity, unit: s.unit });
  const unit = unitSelect({ value: s.unit, onChange: (u) => { stepper.setUnit(u); renderTargets(); } });
  unit.id = 'buy-unit';
  const loc = segmented({ name: 'location', value: defaultLocationFor(s.category), ariaLabel: 'Ubicación',
    options: LOCATIONS.map((l) => ({ value: l.id, label: l.label, icon: LOCATION_ICON[l.id] })), onChange: () => renderTargets() });
  const expiry = expiryPicker({});
  let target = null; // id del producto existente o null = nuevo
  let userPicked = false;
  const targetsWrap = h('div', { class: 'field' });

  function renderTargets() {
    const cands = mergeCandidates(store.state.inventory, { key: s.key, unit: unit.value });
    if (!cands.length) { target = null; replace(targetsWrap); loc.closest('.field').style.display = ''; return; }
    if (!userPicked) target = (cands.find((c) => c.location === loc.getValue()) || cands[0]).id;
    if (target && !cands.some((c) => c.id === target)) target = null;
    replace(targetsWrap, 
      h('span', { class: 'field-label' }, 'Ya tienes este producto'),
      h('div', { class: 'choice-list', role: 'radiogroup' },
        cands.map((c) => choice(c.id, `Sumar a «${c.name}»`, `${formatQuantity(c.quantity, c.unit)} · ${locOf(c.location).label}`)),
        choice(null, 'Crear un producto nuevo', 'Se guarda por separado (por ejemplo, otra caducidad)')));
    loc.closest('.field').style.display = target ? 'none' : '';
  }
  function choice(id, title, sub) {
    const sel = target === id;
    return h('button', { type: 'button', role: 'radio', 'aria-checked': sel ? 'true' : 'false', class: ['choice', sel && 'selected'], onClick: () => { target = id; userPicked = true; renderTargets(); } },
      h('span', { class: 'radio' }), h('span', { class: 'choice-text' }, h('strong', null, title), h('small', null, sub)));
  }

  const form = h('form', { class: 'form', novalidate: true, onSubmit: (e) => { e.preventDefault(); confirm(); } },
    h('div', { class: 'purchase-head' }, h('span', { class: 'purchase-emoji', 'aria-hidden': 'true' }, catOf(s.category).emoji), h('div', null, h('strong', null, s.name), h('small', null, 'Revisa los datos antes de guardar'))),
    h('div', { class: 'field-row' },
      field({ label: 'Cantidad comprada', input: stepper }),
      h('div', { class: 'field narrow' }, h('label', { class: 'field-label', for: 'buy-unit' }, 'Unidad'), unit)),
    targetsWrap,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Ubicación'), loc),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Caducidad'), expiry),
    h('div', { class: 'sheet-footer' }, btn('Añadir al inventario', { kind: 'primary', cls: 'btn-block', type: 'submit', icon: 'box' })));
  const sheet = openSheet({ title: 'Al inventario', content: form, primary: { label: 'Añadir', onClick: () => confirm() } });
  renderTargets();

  let busy = false;
  async function confirm() {
    if (busy) return;
    busy = true; sheet.setBusy(true);
    form.querySelector('.sheet-footer button').disabled = true;
    try {
      const saved = await store.purchaseToInventory(s.id, {
        quantity: stepper.input.value, unit: unit.value, location: loc.getValue(), expiry: expiry.getValue() || null,
        mode: target ? 'merge' : 'new', targetId: target,
      });
      haptic();
      sheet.close();
      toast(target ? `«${saved.name}»: ahora ${formatQuantity(saved.quantity, saved.unit)}` : `«${saved.name}» guardado en ${locOf(saved.location).label}`);
      onDone?.();
    } catch (e) {
      if (e instanceof ValidationError) showErrors(form, e.errors);
      else toast(e.message || 'No se pudo añadir', { tone: 'danger' });
    } finally {
      busy = false;
      if (!sheet.closed) { sheet.setBusy(false); form.querySelector('.sheet-footer button').disabled = false; }
    }
  }
}

/** Recorre en secuencia los comprados pendientes de pasar al inventario. */
function reviewPurchases(ctx, ids) {
  const next = () => {
    const id = ids.shift();
    if (!id) return;
    const s = ctx.store.getShopping(id);
    if (!s || s.addedToInventory) { next(); return; }
    openPurchaseSheet(ctx, id, { onDone: () => setTimeout(next, 300) });
  };
  next();
}
