// Inicio: resumen útil, sin convertirse en un panel de estadísticas.
import { h, replace } from '../dom.js';
import { icon, LOCATION_ICON } from '../icons.js';
import { iconButton, emptyState, banner, btn } from '../components.js';
import { attention, totalByLocation } from '../../domain/inventory.js';
import { evaluateRecipe } from '../../domain/recipes.js';
import { LOCATIONS } from '../../domain/catalog.js';
import { formatQuantity } from '../../domain/units.js';
import { itemRow, setInventoryFilter } from './inventory.js';
import { recipeCard } from './recipes.js';
import { openItemForm } from './item-form.js';
import { openSettings } from './settings.js';
import { loadSampleData } from '../../data/sample.js';
import { isIOS, isStandalone } from '../platform.js';

const dateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

export function HomeView(ctx) {
  const { store } = ctx;
  const el = h('div', { class: 'view-home' });

  function render() {
    const inv = store.state.inventory;
    const now = store.now();
    const att = attention(inv, now, store.state.settings.soonDays);
    const pending = store.state.shopping.filter((x) => !x.checked);
    const recipes = store.state.recipes.map((r) => ({ r, ev: evaluateRecipe(r, inv, { now }) }))
      .filter(({ ev }) => ev.total > 0)
      .sort((a, b) => b.ev.score - a.ev.score || a.r.name.localeCompare(b.r.name, 'es'));
    const cookable = recipes.filter((x) => x.ev.canCook);
    const suggestions = (cookable.length ? cookable : recipes.filter((x) => x.ev.score >= 0.5)).slice(0, 6);
    const hour = now.getHours();
    const hello = hour < 6 ? 'Buenas noches' : hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches';

    const header = h('header', { class: 'screen-header' },
      h('div', { class: 'titles' }, h('span', { class: 'screen-subtitle' }, dateFmt.format(now)), h('h1', { class: 'screen-title' }, hello)),
      h('div', { class: 'screen-actions' }, iconButton('settings', { label: 'Ajustes', onClick: () => openSettings(ctx) })));

    const installHint = isIOS() && !isStandalone() && !store.state.settings.hideInstallHint
      ? banner(h('span', null, h('b', null, 'Instala FRIDGE en tu iPhone. '), 'Pulsa Compartir ', h('span', { class: 'share-glyph', 'aria-label': 'Compartir' }, '⬆︎'), ' y «Añadir a pantalla de inicio». Así funciona sin conexión y Safari no borrará tus datos.'),
        { tone: 'info', ic: 'download', action: { label: 'Ocultar', onClick: () => store.setSettings({ hideInstallHint: true }) } })
      : null;
    const memHint = !store.persistent ? banner('No se puede guardar en este navegador (¿modo privado?). Los datos se perderán al cerrar.', { tone: 'danger', ic: 'alert' }) : null;

    if (!inv.length && !store.state.recipes.length && !store.state.shopping.length) {
      replace(el, header, memHint, installHint,
        h('div', { class: 'card welcome' },
          emptyState({ icon: 'fridge', title: 'Bienvenido a FRIDGE', text: 'Controla lo que tienes en casa, guarda recetas y genera la lista de la compra con lo que falta.',
            action: { label: 'Añadir mi primer alimento', icon: 'plus', onClick: () => openItemForm(ctx) },
            secondary: { label: 'Escanear un código de barras', onClick: () => ctx.openScanner() } }),
          h('div', { class: 'welcome-foot' }, h('button', { type: 'button', class: 'btn btn-plain', onClick: async () => { await loadSampleData(store); } }, icon('sparkle', { size: 18 }), 'Probar con datos de ejemplo'))));
      return;
    }

    const counts = totalByLocation(inv);
    const summary = h('div', { class: 'card summary' },
      h('button', { type: 'button', class: 'summary-main', onClick: () => { setInventoryFilter({}); ctx.navigate('#/inventario'); } },
        h('span', { class: 'summary-num' }, inv.length),
        h('span', { class: 'summary-label' }, inv.length === 1 ? 'producto en casa' : 'productos en casa'),
        icon('chevronRight', { size: 18, cls: 'summary-chev' })),
      h('div', { class: 'summary-locs' }, LOCATIONS.map((l) => h('button', { type: 'button', class: 'summary-loc', onClick: () => { setInventoryFilter({ location: l.id }); ctx.navigate('#/inventario'); } },
        h('span', { class: `loc-icon loc-${l.id}` }, icon(LOCATION_ICON[l.id], { size: 16 })), h('span', { class: 'n' }, counts[l.id]), h('span', null, l.label)))));

    const quick = h('div', { class: 'quick-actions' },
      quickAction('plus', 'Añadir', () => openItemForm(ctx), true),
      quickAction('barcode', 'Escanear', () => ctx.openScanner()),
      quickAction('book', 'Recetas', () => ctx.navigate('#/recetas')),
      quickAction('cart', 'Compra', () => ctx.navigate('#/compra')));

    const needs = [...att.expired, ...att.soon];
    const outOnly = att.out.filter((x) => !needs.includes(x));
    const attentionSection = needs.length || outOnly.length ? [
      h('div', { class: 'section-header' }, h('h2', null, 'Necesita atención'),
        h('button', { type: 'button', class: 'link', onClick: () => { setInventoryFilter({ status: att.expired.length ? 'expired' : att.soon.length ? 'soon' : 'out' }); ctx.navigate('#/inventario'); } }, 'Ver todo')),
      h('div', { class: 'att-pills' },
        att.expired.length ? h('button', { type: 'button', class: 'att-pill danger', onClick: () => { setInventoryFilter({ status: 'expired' }); ctx.navigate('#/inventario'); } }, icon('alert', { size: 15 }), `${att.expired.length} caducado${att.expired.length > 1 ? 's' : ''}`) : null,
        att.soon.length ? h('button', { type: 'button', class: 'att-pill warn', onClick: () => { setInventoryFilter({ status: 'soon' }); ctx.navigate('#/inventario'); } }, icon('clock', { size: 15 }), `${att.soon.length} caduca${att.soon.length > 1 ? 'n' : ''} pronto`) : null,
        att.out.length ? h('button', { type: 'button', class: 'att-pill', onClick: () => { setInventoryFilter({ status: 'out' }); ctx.navigate('#/inventario'); } }, icon('box', { size: 15 }), `${att.out.length} agotado${att.out.length > 1 ? 's' : ''}`) : null),
      h('div', { class: 'list' }, [...needs, ...outOnly].slice(0, 5).map((it) => itemRow(ctx, it, { showLocation: true }))),
    ] : [h('div', { class: 'card card-pad all-good' }, icon('check', { size: 20, stroke: 2.4 }), h('span', null, 'Nada caduca en los próximos días.'))];

    const recipeSection = suggestions.length ? [
      h('div', { class: 'section-header' }, h('h2', null, cookable.length ? 'Puedes cocinar' : 'Te falta poco para'), h('button', { type: 'button', class: 'link', onClick: () => ctx.navigate('#/recetas') }, 'Recetas')),
      h('div', { class: 'h-scroll' }, suggestions.map(({ r, ev }) => recipeCard(ctx, r, ev, { small: true }))),
    ] : store.state.recipes.length ? [] : [
      h('div', { class: 'section-header' }, h('h2', null, 'Recetas')),
      h('button', { type: 'button', class: 'card card-pad cta-card', onClick: () => ctx.navigate('#/recetas') }, icon('book', { size: 22 }), h('span', null, 'Guarda tu primera receta para saber qué te falta'), icon('chevronRight', { size: 18 })),
    ];

    const shopSection = [
      h('div', { class: 'section-header' }, h('h2', null, 'Lista de la compra'), h('button', { type: 'button', class: 'link', onClick: () => ctx.navigate('#/compra') }, 'Abrir')),
      h('button', { type: 'button', class: 'card card-pad shop-summary', onClick: () => ctx.navigate('#/compra') },
        pending.length
          ? [h('div', { class: 'shop-summary-head' }, h('strong', null, `${pending.length} ${pending.length === 1 ? 'producto pendiente' : 'productos pendientes'}`), icon('chevronRight', { size: 18 })),
            h('ul', null, pending.slice(0, 4).map((x) => h('li', null, h('span', null, x.name), h('span', { class: 'qty' }, formatQuantity(x.quantity, x.unit))))),
            pending.length > 4 ? h('span', { class: 'more-count' }, `y ${pending.length - 4} más`) : null]
          : h('div', { class: 'shop-summary-head' }, h('span', { class: 'muted' }, 'No hay nada pendiente'), icon('chevronRight', { size: 18 }))),
    ];

    replace(el, header, memHint, installHint, summary, quick, ...attentionSection, ...recipeSection, ...shopSection);
  }

  render();
  return { el, update: render, onShow: render };
}

function quickAction(ic, label, onClick, primary = false) {
  return h('button', { type: 'button', class: ['quick', primary && 'primary'], onClick }, h('span', { class: 'quick-icon' }, icon(ic, { size: 22 })), h('span', null, label));
}

export { btn };
