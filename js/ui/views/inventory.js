// Inventario: búsqueda, filtros por ubicación/categoría/estado, orden y ajuste rápido de cantidades.
import { h, haptic, replace } from '../dom.js';
import { icon, LOCATION_ICON } from '../icons.js';
import { segmented, chipGroup, searchField, emptyState, expiryBadge, thumb, iconButton, toast, actionSheet, pressKey } from '../components.js';
import { CATEGORIES, LOCATIONS, category as catOf, location as locOf } from '../../domain/catalog.js';
import { filterItems, sortItems, attention } from '../../domain/inventory.js';
import { formatQuantity, stepFor } from '../../domain/units.js';
import { openItemForm } from './item-form.js';

const viewState = { query: '', location: 'all', category: null, status: null, sort: 'expiry' };

export function setInventoryFilter(patch) { Object.assign(viewState, { query: '', location: 'all', category: null, status: null }, patch); }

export function InventoryView(ctx) {
  const { store } = ctx;
  const listEl = h('div', { class: 'inv-list' });
  const countEl = h('span', { class: 'screen-subtitle' });

  const search = searchField({ placeholder: 'Buscar en casa', value: viewState.query, onInput: (v) => { viewState.query = v; renderList(); } });
  const loc = segmented({
    name: 'loc', value: viewState.location, small: true, ariaLabel: 'Ubicación',
    options: [{ value: 'all', label: 'Todo' }, ...LOCATIONS.map((l) => ({ value: l.id, label: l.label }))],
    onChange: (v) => { viewState.location = v; renderAll(); },
  });
  const chips = chipGroup({ options: [], value: null, ariaLabel: 'Filtros', onChange: (v) => {
    if (v === 'expired' || v === 'soon' || v === 'out') { viewState.status = v; viewState.category = null; }
    else { viewState.category = v; viewState.status = null; }
    renderList();
  } });

  const sortBtn = h('button', { type: 'button', class: 'sort-btn', onClick: () => {
    actionSheet({ title: 'Ordenar por', actions: [
      { label: 'Caducidad', icon: 'clock', detail: viewState.sort === 'expiry' ? '✓' : '', onClick: () => { viewState.sort = 'expiry'; renderAll(); } },
      { label: 'Nombre', icon: 'sort', detail: viewState.sort === 'name' ? '✓' : '', onClick: () => { viewState.sort = 'name'; renderAll(); } },
    ] });
  } });

  const el = h('div', { class: 'view-inventory' },
    h('header', { class: 'screen-header' },
      h('div', { class: 'titles' }, countEl, h('h1', { class: 'screen-title' }, 'Inventario')),
      h('div', { class: 'screen-actions' },
        iconButton('barcode', { label: 'Escanear código', onClick: () => ctx.openScanner() }),
        iconButton('plus', { label: 'Añadir alimento', cls: 'accent', onClick: () => openItemForm(ctx) }))),
    h('div', { class: 'filters' }, search, loc, chips, h('div', { class: 'list-meta' }, sortBtn)),
    listEl);

  function chipOptions() {
    const base = filterItems(store.state.inventory, { location: viewState.location === 'all' ? null : viewState.location });
    const att = attention(base, store.now(), store.state.settings.soonDays);
    const opts = [];
    if (att.expired.length) opts.push({ value: 'expired', label: 'Caducados', count: att.expired.length, tone: 'danger' });
    if (att.soon.length) opts.push({ value: 'soon', label: 'Caducan pronto', count: att.soon.length, tone: 'warn' });
    if (att.out.length) opts.push({ value: 'out', label: 'Agotados', count: att.out.length });
    const counts = new Map();
    for (const it of base) counts.set(it.category, (counts.get(it.category) || 0) + 1);
    for (const c of CATEGORIES) if (counts.get(c.id)) opts.push({ value: c.id, label: c.label, emoji: c.emoji, count: counts.get(c.id) });
    return opts;
  }

  function renderAll() {
    const opts = chipOptions();
    chips.setOptions(opts);
    const current = viewState.status || viewState.category;
    if (current && !opts.some((o) => o.value === current)) { viewState.status = null; viewState.category = null; }
    chips.setValue(viewState.status || viewState.category);
    loc.setValue(viewState.location);
    renderList();
  }

  function renderList() {
    const all = store.state.inventory;
    const n = all.length;
    countEl.textContent = n === 1 ? '1 producto' : `${n} productos`;
    replace(sortBtn, icon('sort', { size: 15 }), h('span', null, viewState.sort === 'expiry' ? 'Por caducidad' : 'Por nombre'));
    if (!n) {
      replace(listEl, emptyState({
        icon: 'box', title: 'Tu inventario está vacío', text: 'Añade lo que tienes en la nevera, el congelador o la despensa.',
        action: { label: 'Añadir alimento', icon: 'plus', onClick: () => openItemForm(ctx) },
        secondary: { label: 'Escanear un código', onClick: () => ctx.openScanner() },
      }));
      return;
    }
    const items = sortItems(filterItems(all, {
      query: viewState.query, category: viewState.category, status: viewState.status,
      location: viewState.location === 'all' ? null : viewState.location, now: store.now(), soonDays: store.state.settings.soonDays,
    }), viewState.sort);
    if (!items.length) {
      replace(listEl, h('div', { class: 'empty compact' },
        h('div', { class: 'empty-icon' }, icon('search', { size: 28 })),
        h('h3', null, 'Sin resultados'),
        h('p', null, viewState.query ? `No hay nada que coincida con «${viewState.query}».` : 'No hay productos con estos filtros.'),
        viewState.query ? h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => openItemForm(ctx, { draft: { name: viewState.query } }) }, icon('plus', { size: 18 }), `Añadir «${viewState.query}»`) : null));
      return;
    }
    // Agrupar por ubicación cuando se ven todas; si no, lista única.
    if (viewState.location === 'all' && !viewState.query) {
      const groups = LOCATIONS.map((l) => ({ l, items: items.filter((i) => i.location === l.id) })).filter((g) => g.items.length);
      replace(listEl, ...groups.map((g) => h('section', null,
        h('h2', { class: 'group-label' }, h('span', { class: `loc-text-${g.l.id}` }, icon(LOCATION_ICON[g.l.id], { size: 15 })), g.l.label, h('span', { class: 'group-count' }, g.items.length)),
        h('div', { class: 'list' }, g.items.map((it) => itemRow(ctx, it))))));
    } else {
      replace(listEl, h('div', { class: 'list', style: { marginTop: 'var(--s3)' } }, items.map((it) => itemRow(ctx, it, { showLocation: true }))));
    }
  }

  renderAll();
  return { el, update: renderAll, onShow: () => renderAll() };
}

export function itemRow(ctx, it, { showLocation = false, compact = false } = {}) {
  const { store } = ctx;
  const cat = catOf(it.category);
  const out = !(it.quantity > 0);
  const qty = h('span', { class: ['qty', out && 'zero'] }, out ? 'Agotado' : formatQuantity(it.quantity, it.unit));
  const sub = [
    it.brand ? h('span', null, it.brand) : null,
    showLocation ? h('span', { class: 'row-loc' }, h('span', { class: `loc-dot loc-${it.location}` }), locOf(it.location).label) : null,
    expiryBadge(it.expiry, store.state.settings.soonDays),
  ].filter(Boolean);
  const minus = compact ? null : h('button', {
    type: 'button', class: 'mini-btn', 'aria-label': `Consumir ${it.name}`, disabled: out,
    onClick: async (e) => {
      e.stopPropagation();
      haptic();
      const step = stepFor(it.unit, it.quantity);
      const prev = it.quantity;
      const next = await store.adjustItem(it.id, -Math.min(step, it.quantity));
      if (!next) return;
      const undo = () => store.setItemQuantity(it.id, prev);
      if (next.quantity === 0) {
        toast(`«${it.name}» agotado`, { action: 'Añadir a la compra', onAction: async () => { const r = await store.restock(next); toast(r.merged ? 'Ya estaba en la lista' : 'Añadido a la compra'); }, duration: 5000 });
      } else {
        toast(`${it.name}: ${formatQuantity(next.quantity, next.unit)}`, { action: 'Deshacer', onAction: undo, duration: 2500 });
      }
    },
  }, icon('minus', { size: 16, stroke: 2.2 }));

  return h('div', { class: ['row', out && 'out'], dataset: { id: it.id } },
    thumb(store, { imageId: it.imageId, emoji: cat.emoji }),
    h('div', { class: 'row-main', role: 'button', tabindex: '0', onClick: () => openItemForm(ctx, { item: store.getItem(it.id) }), onKeydown: pressKey },
      h('span', { class: 'row-title' }, it.name),
      sub.length ? h('span', { class: 'row-sub' }, sub) : null),
    h('div', { class: 'row-trail' }, qty, minus));
}
