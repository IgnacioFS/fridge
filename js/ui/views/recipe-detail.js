// Detalle de receta: raciones, comparación con el inventario y envío de faltantes a la compra.
import { h, haptic, replace } from '../dom.js';
import { icon } from '../icons.js';
import { emptyState, iconButton, actionSheet, confirmDialog, toast, thumb, banner, btn } from '../components.js';
import { evaluateRecipe, missingForShopping } from '../../domain/recipes.js';
import { pendingQuantityFor } from '../../domain/shopping.js';
import { formatQuantity, formatSmart } from '../../domain/units.js';
import { location as locOf } from '../../domain/catalog.js';
import { openRecipeForm } from './recipe-form.js';

export function RecipeDetailView(ctx, { id }) {
  const { store } = ctx;
  let servings = null;
  // Ingredientes con unidades incompatibles: decisión del usuario ('have' | 'buy').
  const decisions = new Map();
  const expanded = new Set();
  const el = h('div', { class: 'view-recipe-detail' });

  function render() {
    const r = store.getRecipe(id);
    if (!r) {
      replace(el, topbar(null), emptyState({ icon: 'book', title: 'Receta no encontrada', text: 'Puede que se haya eliminado.', action: { label: 'Ver recetas', onClick: () => ctx.navigate('#/recetas') } }));
      return;
    }
    if (servings === null) servings = r.servings;
    const ev = evaluateRecipe(r, store.state.inventory, { servings, now: store.now() });
    const buyIncomparable = ev.results.filter((x) => x.status === 'incomparable' && decisions.get(x.ingredient.id) === 'buy').map((x) => x.ingredient.id);
    const missing = missingForShopping(ev, { includeIncomparable: buyIncomparable });
    const pendingDecision = ev.results.filter((x) => x.status === 'incomparable' && !decisions.has(x.ingredient.id) && !x.ingredient.optional);
    const haveCount = ev.results.filter((x) => !x.ingredient.optional && (x.status === 'available' || (x.status === 'incomparable' && decisions.get(x.ingredient.id) === 'have'))).length;
    const allGood = ev.total > 0 && haveCount === ev.total;

    const hero = r.imageId ? h('div', { class: 'recipe-hero' }, thumb(store, { imageId: r.imageId, emoji: '🍽️', size: 0, cls: 'hero-img' })) : null;

    const servingsCtl = h('div', { class: 'servings' },
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Menos raciones', disabled: servings <= 1, onClick: () => { servings = Math.max(1, servings - 1); haptic(); render(); } }, icon('minus', { size: 16, stroke: 2.2 })),
      h('span', { class: 'servings-value', 'aria-live': 'polite' }, icon('people', { size: 16 }), `${servings} ${servings === 1 ? 'ración' : 'raciones'}`),
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Más raciones', disabled: servings >= 99, onClick: () => { servings = Math.min(99, servings + 1); haptic(); render(); } }, icon('plus', { size: 16, stroke: 2.2 })));

    const summary = h('div', { class: ['avail-card', allGood ? 'good' : 'needs'] },
      h('div', { class: 'avail-icon' }, icon(allGood ? 'check' : 'cart', { size: 22, stroke: 2.2 })),
      h('div', { class: 'avail-text' },
        h('strong', null, allGood ? 'Tienes todo lo necesario' : `Tienes ${haveCount} de ${ev.total} ingredientes`),
        h('span', null, allGood ? 'Puedes cocinarla ahora mismo.'
          : missing.length ? `Faltan ${missing.length} ${missing.length === 1 ? 'ingrediente' : 'ingredientes'}${pendingDecision.length ? ' y hay unidades por revisar' : ''}.`
            : pendingDecision.length ? 'Revisa los ingredientes con unidades distintas.' : 'Revisa la lista de ingredientes.')));

    const addBtn = missing.length
      ? btn(`Añadir ${missing.length === 1 ? 'el que falta' : `los ${missing.length} que faltan`} a la compra`, {
        kind: 'primary', icon: 'cart', cls: 'btn-block',
        onClick: async () => {
          const res = await store.addMissingToShopping(r, missing);
          haptic();
          const parts = [];
          if (res.added) parts.push(`${res.added} ${res.added === 1 ? 'nuevo' : 'nuevos'}`);
          if (res.merged) parts.push(`${res.merged} ${res.merged === 1 ? 'sumado' : 'sumados'} a otros`);
          if (res.updated) parts.push(`${res.updated} ya ${res.updated === 1 ? 'estaba' : 'estaban'}`);
          toast(`Lista de la compra: ${parts.join(', ')}`, { action: 'Ver lista', onAction: () => ctx.navigate('#/compra') });
          render();
        },
      }) : null;

    const ingList = h('div', { class: 'list ing-list' }, ev.results.map((res) => ingredientRow(res)));

    replace(el, 
      topbar(r),
      hero,
      h('div', { class: 'recipe-head' },
        h('h1', { class: 'detail-title' }, r.name),
        r.description ? h('p', { class: 'detail-desc' }, r.description) : null,
        h('div', { class: 'detail-meta' },
          r.prepMinutes ? h('span', { class: 'meta-pill' }, icon('clock', { size: 15 }), `${r.prepMinutes} min`) : null,
          servingsCtl)),
      summary,
      pendingDecision.length ? banner(h('span', null, h('b', null, 'Unidades distintas. '), 'Algún ingrediente está en tu inventario con otra unidad y no se puede comparar. Indica si lo tienes o si quieres comprarlo.'), { tone: 'warn', ic: 'alert' }) : null,
      h('h2', { class: 'group-label' }, 'Ingredientes', servings !== r.servings ? h('span', { class: 'group-count' }, `para ${servings}`) : null),
      ingList,
      addBtn ? h('div', { class: 'sticky-cta' }, addBtn) : null,
      r.steps?.length ? h('h2', { class: 'group-label' }, 'Preparación') : null,
      r.steps?.length ? h('ol', { class: 'steps' }, r.steps.map((s, i) => h('li', null, h('span', { class: 'step-n' }, i + 1), h('p', null, s)))) : null);
  }

  function ingredientRow(res) {
    const { ingredient: g, status } = res;
    const decision = decisions.get(g.id);
    const pending = pendingQuantityFor(store.state.shopping, g.key, g.unit);
    let ic, tone, detail;
    if (status === 'available') { ic = 'check'; tone = 'ok'; detail = 'Disponible'; }
    else if (status === 'partial') { ic = 'minus'; tone = 'warn'; detail = `Faltan ${formatSmart(res.missing, res.unit)} · tienes ${formatSmart(res.totalAvailable, res.unit)}`; }
    else if (status === 'missing') { ic = 'close'; tone = 'danger'; detail = `Faltan ${formatSmart(res.missing, res.unit)}`; }
    else {
      ic = 'alert'; tone = decision === 'have' ? 'ok' : 'warn';
      const have = res.incompatibleItems.map((i) => formatQuantity(i.quantity, i.unit)).join(' + ');
      detail = decision === 'have' ? `Marcado como disponible (tienes ${have})` : decision === 'buy' ? 'Se añadirá a la compra' : `Tienes ${have}: no se puede comparar`;
    }
    if (g.optional) detail = `Opcional · ${detail}`;
    const open = expanded.has(g.id);
    const sources = [...res.usedItems.map((u) => u.item), ...res.incompatibleItems];
    const extra = open ? h('div', { class: 'ing-extra' },
      sources.length ? sources.map((it) => h('div', { class: 'ing-source' }, h('span', { class: `loc-dot loc-${it.location}` }), `${it.name} · ${formatQuantity(it.quantity, it.unit)} · ${locOf(it.location).label}`))
        : h('div', { class: 'ing-source muted' }, 'No hay nada parecido en tu inventario.'),
      res.expiredItems.length ? h('div', { class: 'ing-source danger' }, icon('alert', { size: 14 }), `Caducado y no contado: ${res.expiredItems.map((i) => i.name).join(', ')}`) : null) : null;

    return h('div', { class: ['row', 'no-thumb', 'ing-row', `ing-${tone}`] },
      h('div', { class: ['ing-status', `tone-${tone}`], 'aria-hidden': 'true' }, icon(ic, { size: 15, stroke: 2.6 })),
      h('div', { class: 'row-main', role: 'button', tabindex: '0', 'aria-expanded': open ? 'true' : 'false', onClick: () => { if (open) expanded.delete(g.id); else expanded.add(g.id); render(); } },
        h('span', { class: 'row-title ing-title' }, h('span', null, g.name), h('span', { class: 'ing-qty' }, formatSmart(res.required, res.unit))),
        h('span', { class: ['row-sub', `text-${tone}`] }, detail),
        pending !== null && status !== 'available' ? h('span', { class: 'row-sub' }, h('span', { class: 'tag' }, icon('cart', { size: 12 }), `En la lista: ${formatSmart(pending, g.unit)}`)) : null,
        res.expiredItems.length && !open ? h('span', { class: 'row-sub text-danger' }, 'Hay producto caducado (no cuenta)') : null,
        extra),
      status === 'incomparable' ? h('div', { class: 'ing-decide' },
        h('button', { type: 'button', class: ['chip', decision === 'have' && 'selected'], onClick: () => { decisions.set(g.id, 'have'); render(); } }, 'Lo tengo'),
        h('button', { type: 'button', class: ['chip', decision === 'buy' && 'selected'], onClick: () => { decisions.set(g.id, 'buy'); render(); } }, 'Comprar')) : null);
  }

  function topbar(r) {
    return h('div', { class: 'topbar' },
      h('button', { type: 'button', class: 'back', onClick: () => ctx.back('#/recetas') }, icon('chevronLeft', { size: 22, stroke: 2.2 }), 'Recetas'),
      r ? iconButton('more', { label: 'Opciones', onClick: () => actionSheet({ title: r.name, actions: [
        { label: 'Editar receta', icon: 'edit', onClick: () => openRecipeForm(ctx, { recipe: store.getRecipe(id) }) },
        { label: 'Eliminar receta', icon: 'trash', destructive: true, onClick: async () => {
          const ok = await confirmDialog({ title: `¿Eliminar «${r.name}»?`, message: 'Los productos ya añadidos a la compra se mantienen.', confirmLabel: 'Eliminar', destructive: true });
          if (!ok) return;
          const undo = await store.deleteRecipe(r.id);
          ctx.navigate('#/recetas');
          toast('Receta eliminada', { action: 'Deshacer', onAction: async () => { await undo(); ctx.navigate(`#/receta/${r.id}`); } });
        } },
      ] }) }) : null);
  }

  render();
  return { el, update: render, detail: true };
}
