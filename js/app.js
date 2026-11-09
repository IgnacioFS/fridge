// Arranque de FRIDGE: store, enrutado por hash, barra de pestañas y service worker.
import { h, clear } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { closeAllSheets, toast } from './ui/components.js';
import { createRepositories } from './data/db.js';
import { Store } from './data/store.js';
import { ProductLookup } from './services/productLookup.js';
import { HomeView } from './ui/views/home.js';
import { InventoryView } from './ui/views/inventory.js';
import { RecipesView } from './ui/views/recipes.js';
import { RecipeDetailView } from './ui/views/recipe-detail.js';
import { ShoppingView } from './ui/views/shopping.js';
import { openScanner } from './ui/views/scanner.js';
import { openItemForm } from './ui/views/item-form.js';
import { attention } from './domain/inventory.js';

const TABS = [
  { id: 'inicio', label: 'Inicio', icon: 'home', view: HomeView },
  { id: 'inventario', label: 'Inventario', icon: 'box', view: InventoryView },
  { id: 'recetas', label: 'Recetas', icon: 'book', view: RecipesView },
  { id: 'compra', label: 'Compra', icon: 'cart', view: ShoppingView },
];

function parseRoute(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'receta' && parts[1]) return { tab: 'recetas', view: RecipeDetailView, params: { id: decodeURIComponent(parts[1]) }, key: `receta/${parts[1]}` };
  const tab = TABS.find((t) => t.id === parts[0]) || TABS[0];
  return { tab: tab.id, view: tab.view, params: {}, key: tab.id };
}

async function main() {
  const repos = await createRepositories();
  const store = new Store(repos);
  await store.load();
  try { await navigator.storage?.persist?.(); } catch { /* opcional */ }

  const viewRoot = document.getElementById('view');
  const tabbar = document.getElementById('tabbar');
  const lookup = new ProductLookup({ localSource: () => store.state.inventory });
  const scrollPos = new Map();
  let current = null;
  let history = 0;

  const ctx = {
    store, lookup,
    navigate(hash) { if (location.hash === hash) render(); else { history++; location.hash = hash; } },
    back(fallback) { if (history > 0) { history--; window.history.back(); } else location.hash = fallback; },
    openScanner: () => openScanner(ctx),
    openItemForm: (o) => openItemForm(ctx, o),
  };

  const tabButtons = TABS.map((t) => {
    const b = h('a', { href: `#/${t.id}`, class: 'tab', dataset: { tab: t.id }, onClick: (e) => {
      // Pulsar la pestaña activa sube al principio.
      if (current?.route.tab === t.id && current.route.key === t.id) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    } }, icon(t.icon, { size: 24 }), h('span', null, t.label));
    return b;
  });
  tabbar.replaceChildren(...tabButtons);

  function updateTabs(route) {
    const att = attention(store.state.inventory, store.now(), store.state.settings.soonDays);
    const pending = store.state.shopping.filter((x) => !x.checked).length;
    for (const b of tabButtons) {
      const active = b.dataset.tab === route.tab;
      if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      b.querySelector('.tab-badge')?.remove();
      const n = b.dataset.tab === 'inventario' ? att.expired.length : b.dataset.tab === 'compra' ? pending : 0;
      if (n) b.appendChild(h('span', { class: ['tab-badge', b.dataset.tab === 'compra' && 'neutral'], 'aria-label': `${n} ${b.dataset.tab === 'compra' ? 'pendientes' : 'caducados'}` }, n > 99 ? '99+' : n));
    }
  }

  function render() {
    const route = parseRoute(location.hash);
    if (current) scrollPos.set(current.route.key, window.scrollY);
    closeAllSheets();
    const view = route.view(ctx, route.params);
    current = { route, view };
    clear(viewRoot);
    viewRoot.classList.toggle('detail', !!view.detail);
    viewRoot.appendChild(view.el);
    view.el.classList.add('view-enter');
    window.scrollTo(0, scrollPos.get(route.key) || 0);
    updateTabs(route);
    document.title = route.tab === 'inicio' ? 'FRIDGE' : `${TABS.find((t) => t.id === route.tab).label} · FRIDGE`;
  }

  store.addEventListener('change', () => {
    if (!current) return;
    current.view.update?.();
    updateTabs(current.route);
  });
  window.addEventListener('hashchange', render);
  // Al volver a la app (p. ej. al día siguiente) se recalculan caducidades.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && current) { current.view.update?.(); updateTabs(current.route); } });
  window.addEventListener('offline', () => toast('Sin conexión: todo sigue funcionando salvo la búsqueda de códigos', { duration: 3500 }));

  if (!location.hash) history = 0;
  render();
  document.getElementById('app').classList.add('ready');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  }
  window.__fridge = { store, ctx };
}

main().catch((e) => {
  console.error(e);
  const v = document.getElementById('view');
  v.replaceChildren(h('div', { class: 'empty' }, h('h3', null, 'No se pudo iniciar FRIDGE'), h('p', null, String(e?.message || e)),
    h('button', { class: 'btn btn-primary', onClick: () => location.reload() }, 'Reintentar')));
});
