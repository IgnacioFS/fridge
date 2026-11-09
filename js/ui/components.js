// Componentes reutilizables: hojas modales, avisos, campos, chips, stepper, estados vacíos…
import { h, clear, nextId, haptic } from './dom.js';
import { icon } from './icons.js';
import { UNITS, UNIT_ORDER, stepFor, formatNumber } from '../domain/units.js';
import { expiryStatus, expiryLabel, addDays, todayISO } from '../domain/dates.js';
import { parseNumber } from '../domain/validation.js';

/** Activa con Enter o Espacio un elemento con role="button". */
export function pressKey(e) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); }
}

// ───────────────────────── Hoja modal inferior
const sheetStack = [];

/**
 * Abre una hoja. opts: { title, content (Node), primary: {label, onClick, disabled}, onClose, full, cancelLabel }
 * Devuelve { el, body, close, setPrimaryDisabled, setBusy }.
 */
export function openSheet({ title, content, primary = null, onClose = null, full = false, cancelLabel = 'Cancelar', className = '' }) {
  const root = document.getElementById('overlays');
  hideToast(); // el aviso no debe tapar los botones de la hoja
  const titleId = nextId('t');
  let closed = false;
  const primaryBtn = primary
    ? h('button', { class: 'sheet-action primary', type: 'button', onClick: () => primary.onClick?.(api) }, primary.label)
    : null;
  const body = h('div', { class: 'sheet-body' }, content);
  const opener = document.activeElement;
  const panel = h('div', { class: ['sheet', full && 'sheet-full', className], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
    h('div', { class: 'sheet-grabber', 'aria-hidden': 'true' }),
    h('header', { class: 'sheet-header' },
      h('button', { class: 'sheet-action', type: 'button', onClick: () => close() }, cancelLabel),
      h('h2', { class: 'sheet-title', id: titleId }, title || ''),
      primaryBtn || h('span', { class: 'sheet-action-spacer' })),
    body);
  const backdrop = h('div', { class: 'sheet-backdrop', onClick: () => close() });
  const wrap = h('div', { class: 'sheet-wrap' }, backdrop, panel);
  root.appendChild(wrap);
  document.body.classList.add('has-sheet');
  requestAnimationFrame(() => { wrap.classList.add('open'); if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true }); });

  // Arrastrar hacia abajo para cerrar (desde la cabecera).
  let startY = null, dy = 0;
  const header = panel.querySelector('.sheet-header');
  const grab = panel.querySelector('.sheet-grabber');
  const onStart = (e) => { startY = e.touches[0].clientY; dy = 0; panel.style.transition = 'none'; };
  const onMove = (e) => { if (startY === null) return; dy = Math.max(0, e.touches[0].clientY - startY); panel.style.transform = `translateY(${dy}px)`; };
  const onEnd = () => { if (startY === null) return; panel.style.transition = ''; panel.style.transform = ''; if (dy > 110) close(); startY = null; };
  for (const el of [header, grab]) { el.addEventListener('touchstart', onStart, { passive: true }); el.addEventListener('touchmove', onMove, { passive: true }); el.addEventListener('touchend', onEnd); }

  const onKey = (e) => { if (e.key === 'Escape' && sheetStack[sheetStack.length - 1] === api) close(); };
  document.addEventListener('keydown', onKey);

  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    wrap.classList.remove('open');
    wrap.classList.add('closing');
    const i = sheetStack.indexOf(api);
    if (i >= 0) sheetStack.splice(i, 1);
    if (!sheetStack.length) document.body.classList.remove('has-sheet');
    setTimeout(() => wrap.remove(), 260);
    if (opener?.isConnected && !sheetStack.length) opener.focus?.({ preventScroll: true });
    onClose?.(result);
  }
  const api = {
    el: panel, body, close,
    get closed() { return closed; },
    setPrimaryDisabled(d) { if (primaryBtn) primaryBtn.disabled = d; },
    setBusy(b) { if (primaryBtn) { primaryBtn.disabled = b; primaryBtn.classList.toggle('busy', b); } },
    setTitle(t) { panel.querySelector('.sheet-title').textContent = t; },
  };
  sheetStack.push(api);
  return api;
}

export function closeAllSheets() { [...sheetStack].reverse().forEach((s) => s.close()); }

/** Diálogo de confirmación. Devuelve Promise<boolean>. */
export function confirmDialog({ title, message, confirmLabel = 'Aceptar', destructive = false, cancelLabel = 'Cancelar' }) {
  return new Promise((resolve) => {
    const root = document.getElementById('overlays');
    let done = false;
    const finish = (v) => { if (done) return; done = true; wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); resolve(v); };
    const wrap = h('div', { class: 'alert-wrap' },
      h('div', { class: 'alert', role: 'alertdialog', 'aria-modal': 'true' },
        h('div', { class: 'alert-text' }, h('h2', null, title), message ? h('p', null, message) : null),
        h('div', { class: 'alert-actions' },
          h('button', { type: 'button', onClick: () => finish(false) }, cancelLabel),
          h('button', { type: 'button', class: destructive ? 'destructive' : 'strong', onClick: () => finish(true) }, confirmLabel))));
    root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    wrap.querySelector('.alert-actions button:last-child').focus();
  });
}

/** Menú de acciones (estilo action sheet). actions: [{label, icon, onClick, destructive}] */
export function actionSheet({ title, actions }) {
  const s = openSheet({
    title: title || '',
    cancelLabel: 'Cerrar',
    content: h('div', { class: 'action-list' }, actions.map((a) =>
      h('button', { type: 'button', class: ['action-item', a.destructive && 'destructive'], onClick: () => { s.close(); a.onClick(); } },
        a.icon ? icon(a.icon) : null, h('span', null, a.label), a.detail ? h('small', null, a.detail) : null))),
  });
  return s;
}

// ───────────────────────── Avisos (toast)
let toastTimer = null;
export function hideToast() {
  clearTimeout(toastTimer);
  document.querySelectorAll('#toasts .toast').forEach((t) => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); });
}
export function toast(message, { action = null, onAction = null, duration = 4000, tone = 'default' } = {}) {
  const root = document.getElementById('toasts');
  clear(root);
  clearTimeout(toastTimer);
  const el = h('div', { class: ['toast', `toast-${tone}`], role: 'status', 'aria-live': 'polite' },
    h('span', null, message),
    action ? h('button', { type: 'button', onClick: () => { hide(); onAction?.(); } }, action) : null);
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  function hide() { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }
  toastTimer = setTimeout(hide, duration);
  return hide;
}

// ───────────────────────── Campos de formulario
export function field({ label, input, error = null, hint = null, id = null, inline = false }) {
  const fid = id || input.id || nextId('in');
  input.id = fid;
  const err = h('p', { class: 'field-error', id: `${fid}-err`, role: 'alert' }, error || '');
  if (error) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', `${fid}-err`); }
  return h('div', { class: ['field', inline && 'field-inline', error && 'has-error'] },
    label ? h('label', { for: fid, class: 'field-label' }, label) : null,
    input,
    hint ? h('p', { class: 'field-hint' }, hint) : null,
    err);
}

export function setFieldError(container, name, message) {
  const input = container.querySelector(`[name="${name}"]`);
  const f = input?.closest('.field');
  if (!f) return;
  f.classList.toggle('has-error', !!message);
  const p = f.querySelector('.field-error');
  if (p) p.textContent = message || '';
  if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
}

export function showErrors(container, errors) {
  container.querySelectorAll('.field.has-error').forEach((f) => {
    f.classList.remove('has-error');
    const p = f.querySelector('.field-error'); if (p) p.textContent = '';
  });
  let first = null;
  for (const [k, msg] of Object.entries(errors)) {
    setFieldError(container, k, msg);
    first = first || container.querySelector(`[name="${k}"]`);
  }
  first?.focus?.();
  first?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

export function textInput(props = {}) {
  return h('input', { type: 'text', class: 'input', autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'false', ...props });
}

export function numberInput(props = {}) {
  return h('input', { type: 'text', inputmode: 'decimal', class: 'input input-number', autocomplete: 'off', pattern: '[0-9]*[.,]?[0-9]*', ...props });
}

export function unitSelect({ value = 'ud', name = 'unit', onChange } = {}) {
  return h('select', { class: 'input select', name, 'aria-label': 'Unidad', onChange: (e) => onChange?.(e.target.value) },
    UNIT_ORDER.map((u) => h('option', { value: u, selected: u === value }, UNITS[u].label)));
}

/** Control segmentado. options: [{value, label, icon}] */
export function segmented({ options, value, name, onChange, small = false, ariaLabel }) {
  const el = h('div', { class: ['segmented', small && 'small'], role: 'radiogroup', 'aria-label': ariaLabel || name });
  const hidden = h('input', { type: 'hidden', name, value });
  const render = () => {
    clear(el);
    el.appendChild(hidden);
    for (const o of options) {
      const sel = o.value === hidden.value;
      el.appendChild(h('button', {
        type: 'button', role: 'radio', 'aria-checked': sel ? 'true' : 'false', class: ['seg', sel && 'selected'],
        onClick: () => { if (hidden.value === o.value) return; hidden.value = o.value; render(); haptic(); onChange?.(o.value); },
      }, o.icon ? icon(o.icon, { size: 17 }) : null, h('span', null, o.label)));
    }
  };
  render();
  el.setValue = (v) => { hidden.value = v; render(); };
  el.getValue = () => hidden.value;
  return el;
}

/** Fila de chips con selección única (o ninguna si `allowNone`). */
export function chipGroup({ options, value = null, onChange, allowNone = true, scroll = true, ariaLabel }) {
  const el = h('div', { class: ['chips', scroll && 'chips-scroll'], role: 'group', 'aria-label': ariaLabel });
  let cur = value;
  const render = () => {
    clear(el);
    for (const o of options) {
      const sel = o.value === cur;
      el.appendChild(h('button', {
        type: 'button', class: ['chip', sel && 'selected', o.tone && `chip-${o.tone}`], 'aria-pressed': sel ? 'true' : 'false',
        onClick: () => { cur = sel && allowNone ? null : o.value; render(); haptic(); onChange?.(cur); },
      }, o.emoji ? h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, o.emoji) : null, o.label, o.count != null ? h('span', { class: 'chip-count' }, o.count) : null));
    }
  };
  render();
  el.setValue = (v) => { cur = v; render(); };
  el.setOptions = (opts) => { options = opts; render(); };
  return el;
}

/** Stepper de cantidad con campo editable. */
export function quantityStepper({ value, unit, name = 'quantity', onChange, min = 0, max = Infinity }) {
  const input = numberInput({ name, value: formatNumber(value).replace(/\./g, ''), 'aria-label': 'Cantidad', class: 'input input-number stepper-input' });
  const read = () => { const n = parseNumber(input.value); return Number.isFinite(n) ? n : 0; };
  const write = (n) => { input.value = formatNumber(Math.min(max, Math.max(min, Math.round(n * 1000) / 1000))).replace(/\./g, ''); onChange?.(read()); };
  let curUnit = unit;
  const el = h('div', { class: 'stepper' },
    h('button', { type: 'button', class: 'stepper-btn', 'aria-label': 'Menos', onClick: () => { haptic(); write(read() - stepFor(curUnit, read())); } }, icon('minus', { size: 18 })),
    input,
    h('button', { type: 'button', class: 'stepper-btn', 'aria-label': 'Más', onClick: () => { haptic(); write(read() + stepFor(curUnit, read())); } }, icon('plus', { size: 18 })));
  input.addEventListener('input', () => onChange?.(read()));
  input.addEventListener('focus', () => input.select());
  el.setUnit = (u) => { curUnit = u; };
  el.getValue = read;
  el.input = input;
  return el;
}

/** Selector de caducidad con atajos. */
export function expiryPicker({ value = '', name = 'expiry', onChange }) {
  const date = h('input', { type: 'date', class: 'input input-date', name, value: value || '', 'aria-label': 'Fecha de caducidad' });
  const presets = [
    { label: 'Sin fecha', days: null }, { label: '+3 días', days: 3 }, { label: '+1 semana', days: 7 },
    { label: '+2 semanas', days: 14 }, { label: '+1 mes', days: 30 },
  ];
  const chips = h('div', { class: 'chips chips-scroll chips-small' }, presets.map((p) =>
    h('button', { type: 'button', class: 'chip', onClick: () => { date.value = p.days === null ? '' : addDays(todayISO(), p.days); sync(); haptic(); } }, p.label)));
  const label = h('span', { class: 'expiry-preview' });
  const sync = () => {
    const v = date.value;
    label.textContent = v ? expiryLabel(v) : 'Sin fecha de caducidad';
    label.className = `expiry-preview status-${expiryStatus(v || null)}`;
    onChange?.(v);
  };
  date.addEventListener('change', sync);
  date.addEventListener('input', sync);
  sync();
  const el = h('div', { class: 'expiry-picker' }, h('div', { class: 'expiry-row' }, date, label), chips);
  el.getValue = () => date.value;
  return el;
}

// ───────────────────────── Visuales
export function expiryBadge(iso, soonDays) {
  const s = expiryStatus(iso, new Date(), soonDays);
  if (s === 'none') return null;
  const text = expiryLabel(iso);
  return h('span', { class: ['badge', `badge-${s}`] }, s === 'expired' ? icon('alert', { size: 13 }) : icon('clock', { size: 13 }), text);
}

export function emptyState({ icon: ic, title, text, action = null, secondary = null }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(ic, { size: 34, stroke: 1.5 })),
    h('h3', null, title),
    text ? h('p', null, text) : null,
    action ? h('button', { type: 'button', class: 'btn btn-primary', onClick: action.onClick }, action.icon ? icon(action.icon, { size: 18 }) : null, action.label) : null,
    secondary ? h('button', { type: 'button', class: 'btn btn-plain', onClick: secondary.onClick }, secondary.label) : null);
}

/** Miniatura: imagen guardada o emoji de categoría. Carga asíncrona. */
export function thumb(store, { imageId, emoji, size = 44, cls = '' }) {
  const el = h('div', { class: ['thumb', cls], style: { width: `${size}px`, height: `${size}px` } }, h('span', { class: 'thumb-emoji', 'aria-hidden': 'true' }, emoji || '🛒'));
  if (imageId) {
    store.imageURL(imageId).then((url) => {
      if (!url) return;
      const img = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
      img.onload = () => { el.classList.add('has-img'); };
      el.appendChild(img);
    });
  }
  return el;
}

export function sectionHeader(title, trailing = null) {
  return h('div', { class: 'section-header' }, h('h2', null, title), trailing);
}

export function btn(label, { icon: ic, onClick, kind = 'primary', cls = '', type = 'button', disabled = false, ariaLabel } = {}) {
  return h('button', { type, class: ['btn', `btn-${kind}`, cls], onClick, disabled, 'aria-label': ariaLabel }, ic ? icon(ic, { size: 18 }) : null, label ? h('span', null, label) : null);
}

export function iconButton(ic, { label, onClick, cls = '', size = 22 } = {}) {
  return h('button', { type: 'button', class: ['icon-btn', cls], 'aria-label': label, title: label, onClick }, icon(ic, { size }));
}

/** Banner informativo dentro de formularios. tone: info | warn | danger | ok */
export function banner(text, { tone = 'info', ic = 'info', action = null } = {}) {
  return h('div', { class: ['banner', `banner-${tone}`], role: tone === 'danger' ? 'alert' : 'note' },
    icon(ic, { size: 18 }), h('div', { class: 'banner-text' }, text),
    action ? h('button', { type: 'button', class: 'banner-action', onClick: action.onClick }, action.label) : null);
}

/** Campo de búsqueda con botón de borrar. */
export function searchField({ placeholder = 'Buscar', value = '', onInput }) {
  const input = h('input', { type: 'search', class: 'search-input', placeholder, value, enterkeyhint: 'search', autocomplete: 'off', 'aria-label': placeholder });
  const clearBtn = h('button', { type: 'button', class: 'search-clear', 'aria-label': 'Borrar búsqueda', hidden: !value, onClick: () => { input.value = ''; clearBtn.hidden = true; onInput?.(''); input.focus(); } }, icon('close', { size: 14, stroke: 2.4 }));
  input.addEventListener('input', () => { clearBtn.hidden = !input.value; onInput?.(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  const el = h('div', { class: 'search' }, icon('search', { size: 17 }), input, clearBtn);
  el.input = input;
  return el;
}

/** Lista para autocompletar (datalist). */
export function datalist(id, names) {
  return h('datalist', { id }, names.map((n) => h('option', { value: n })));
}
