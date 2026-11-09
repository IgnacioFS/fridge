// Listado de recetas con búsqueda por nombre o ingrediente y disponibilidad.
import { h, replace } from '../dom.js';
import { icon } from '../icons.js';
import { searchField, chipGroup, emptyState, iconButton, thumb } from '../components.js';
import { evaluateRecipe } from '../../domain/recipes.js';
import { normalizeKey } from '../../domain/matching.js';
import { openRecipeForm } from './recipe-form.js';

const viewState = { query: '', filter: null };

export function RecipesView(ctx) {
  const { store } = ctx;
  const listEl = h('div', { class: 'recipe-grid' });
  const countEl = h('span', { class: 'screen-subtitle' });
  const search = searchField({ placeholder: 'Receta o ingrediente', value: viewState.query, onInput: (v) => { viewState.query = v; render(); } });
  const chips = chipGroup({
    options: [{ value: 'cook', label: 'Puedo cocinar' }, { value: 'almost', label: 'Me falta poco' }],
    value: viewState.filter, onChange: (v) => { viewState.filter = v; render(); }, ariaLabel: 'Filtros',
  });

  const el = h('div', { class: 'view-recipes' },
    h('header', { class: 'screen-header' },
      h('div', { class: 'titles' }, countEl, h('h1', { class: 'screen-title' }, 'Recetas')),
      h('div', { class: 'screen-actions' }, iconButton('plus', { label: 'Nueva receta', cls: 'accent', onClick: () => openRecipeForm(ctx, { onSaved: (r) => ctx.navigate(`#/receta/${r.id}`) }) }))),
    h('div', { class: 'filters' }, search, chips),
    listEl);

  function render() {
    const recipes = store.state.recipes;
    countEl.textContent = recipes.length === 1 ? '1 receta' : `${recipes.length} recetas`;
    if (!recipes.length) {
      replace(listEl, emptyState({
        icon: 'book', title: 'Aún no hay recetas', text: 'Guarda tus recetas y FRIDGE te dirá qué ingredientes te faltan.',
        action: { label: 'Crear receta', icon: 'plus', onClick: () => openRecipeForm(ctx, { onSaved: (r) => ctx.navigate(`#/receta/${r.id}`) }) },
      }));
      return;
    }
    const q = normalizeKey(viewState.query);
    const now = store.now();
    let rows = recipes.map((r) => ({ r, ev: evaluateRecipe(r, store.state.inventory, { now }) }));
    if (q) {
      const terms = q.split(' ');
      rows = rows.filter(({ r }) => {
        const hay = `${normalizeKey(r.name)} ${r.ingredients.map((g) => g.key).join(' ')}`;
        return terms.every((t) => hay.includes(t));
      });
    }
    if (viewState.filter === 'cook') rows = rows.filter(({ ev }) => ev.canCook);
    if (viewState.filter === 'almost') rows = rows.filter(({ ev }) => !ev.canCook && ev.missingCount + ev.incomparableCount <= 2);
    rows.sort((a, b) => (b.ev.score - a.ev.score) || a.r.name.localeCompare(b.r.name, 'es'));
    if (!rows.length) {
      replace(listEl, h('div', { class: 'empty compact' }, h('div', { class: 'empty-icon' }, icon('search', { size: 28 })), h('h3', null, 'Sin resultados'),
        h('p', null, q ? 'Prueba con otro nombre o ingrediente.' : 'Ninguna receta cumple este filtro todavía.')));
      return;
    }
    replace(listEl, ...rows.map(({ r, ev }) => recipeCard(ctx, r, ev)));
  }

  render();
  return { el, update: render, onShow: render };
}

export function recipeCard(ctx, r, ev, { small = false } = {}) {
  const pct = Math.round(ev.score * 100);
  const tone = ev.canCook ? '' : ev.ready > 0 ? 'partial' : 'none';
  const status = ev.canCook
    ? h('span', { class: 'badge badge-ok badge-cook' }, icon('check', { size: 13, stroke: 2.4 }), 'Lo tienes todo')
    : h('span', { class: 'recipe-status' }, `${ev.ready} de ${ev.total} ingredientes`);
  return h('button', { type: 'button', class: ['recipe-card', small && 'small'], onClick: () => ctx.navigate(`#/receta/${r.id}`) },
    thumb(ctx.store, { imageId: r.imageId, emoji: '🍽️', size: small ? 132 : 76, cls: 'recipe-thumb' }),
    h('div', { class: 'recipe-card-body' },
      h('span', { class: 'recipe-card-title' }, r.name),
      h('span', { class: 'row-sub' },
        r.prepMinutes ? h('span', { class: 'meta' }, icon('clock', { size: 14 }), `${r.prepMinutes} min`) : null,
        h('span', { class: 'meta' }, icon('people', { size: 14 }), `${r.servings}`)),
      h('div', { class: 'recipe-card-foot' }, status, h('div', { class: ['meter', tone], 'aria-hidden': 'true' }, h('span', { style: { width: `${pct}%` } })))));
}
