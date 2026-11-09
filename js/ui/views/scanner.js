// Pantalla de escaneo: cámara → código → consulta → formulario revisable.
import { h, haptic, replace } from '../dom.js';
import { icon } from '../icons.js';
import { toast, openSheet, field, numberInput, btn, actionSheet } from '../components.js';
import { BarcodeScanner, ScannerError, cameraSupported } from '../../services/barcode/scanner.js';
import { LookupError } from '../../services/productLookup.js';
import { openItemForm } from './item-form.js';
import { formatQuantity } from '../../domain/units.js';
import { location as locOf } from '../../domain/catalog.js';

export function openScanner(ctx) {
  const root = document.getElementById('overlays');
  const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true, 'aria-hidden': 'true' });
  const status = h('p', { class: 'scan-status', role: 'status', 'aria-live': 'polite' }, 'Abriendo la cámara…');
  const torchBtn = h('button', { type: 'button', class: 'scan-round', 'aria-label': 'Linterna', hidden: true, onClick: async () => { const on = await scanner.toggleTorch(); torchBtn.classList.toggle('on', on); } }, icon('bolt', { size: 22 }));
  const errorBox = h('div', { class: 'scan-error', hidden: true });
  const frame = h('div', { class: 'scan-frame' }, h('span', { class: 'scan-line' }));
  const wrap = h('div', { class: 'scan-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Escanear código de barras' },
    video,
    h('div', { class: 'scan-shade' }, frame),
    h('div', { class: 'scan-top' },
      h('button', { type: 'button', class: 'scan-round', 'aria-label': 'Cerrar', onClick: () => close() }, icon('close', { size: 22, stroke: 2.2 })),
      h('span', { class: 'scan-title' }, 'Escanear producto'),
      torchBtn),
    h('div', { class: 'scan-bottom' },
      status, errorBox,
      h('div', { class: 'scan-actions' },
        h('button', { type: 'button', class: 'scan-pill', onClick: () => manualCode() }, icon('keyboard', { size: 18 }), 'Escribir el código'),
        h('button', { type: 'button', class: 'scan-pill', onClick: () => { close(); openItemForm(ctx); } }, icon('edit', { size: 18 }), 'Añadir a mano'))));
  root.appendChild(wrap);
  document.body.classList.add('has-sheet');
  requestAnimationFrame(() => wrap.classList.add('open'));

  const scanner = new BarcodeScanner(video, { onDetect: (code) => { haptic(); frame.classList.add('hit'); handleCode(code); } });
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    scanner.stop();
    wrap.classList.remove('open');
    setTimeout(() => { wrap.remove(); if (!document.querySelector('.sheet-wrap')) document.body.classList.remove('has-sheet'); }, 220);
    document.removeEventListener('visibilitychange', onVis);
  }
  const onVis = () => { if (document.hidden) scanner.stop(); else if (!closed && !scanner.running && !busy) start(); };
  document.addEventListener('visibilitychange', onVis);

  async function start() {
    errorBox.hidden = true;
    frame.classList.remove('hit');
    if (!cameraSupported()) { showError('Este navegador no permite usar la cámara. Puedes escribir el código o añadir el producto a mano.'); return; }
    try {
      await scanner.start();
      if (closed || !scanner.running) return;
      status.textContent = 'Apunta al código de barras dentro del recuadro';
      torchBtn.hidden = !scanner.hasTorch;
    } catch (e) {
      const msg = e instanceof ScannerError ? {
        denied: 'Sin permiso para usar la cámara. Revisa Ajustes › Safari › Cámara (debe estar en «Preguntar» o «Permitir») y vuelve a intentarlo.',
        notfound: 'No se ha encontrado ninguna cámara.',
        busy: 'La cámara está ocupada por otra app. Ciérrala e inténtalo de nuevo.',
        insecure: 'La cámara solo funciona si la app se abre desde una dirección segura (https).',
        unsupported: 'Este navegador no permite usar la cámara.',
      }[e.kind] || 'No se pudo abrir la cámara.' : 'No se pudo abrir la cámara.';
      showError(msg, e?.kind !== 'unsupported' && e?.kind !== 'insecure');
    }
  }

  function showError(text, retry = false) {
    status.textContent = '';
    errorBox.hidden = false;
    replace(errorBox, icon('camera', { size: 22 }), h('p', null, text), retry ? h('button', { type: 'button', class: 'scan-pill light', onClick: () => start() }, 'Reintentar') : null);
  }

  let busy = false;
  async function handleCode(code) {
    if (closed) return;
    busy = true;
    scanner.stop();
    replace(status, h('span', { class: 'spinner small' }), ` Buscando ${code}…`);
    let result = null, notice = null;
    try {
      const r = await ctx.lookup.lookup(code);
      result = r.result;
      code = r.code;
      if (closed) return;
      if (result?.source === 'local') {
        // Ya existe en casa con ese código: ofrecer sumar.
        const existing = ctx.store.state.inventory.filter((x) => x.barcode === code);
        close();
        offerExisting(ctx, existing, result, code);
        return;
      }
      notice = result
        ? { tone: 'ok', ic: 'check', text: `Datos de ${result.source}. Revísalos: pueden estar incompletos o no ser exactos.` }
        : { tone: 'warn', ic: 'info', text: `No hemos encontrado el código ${code}. Rellena los datos a mano; quedará guardado para la próxima vez.` };
    } catch (e) {
      if (e instanceof LookupError && e.kind === 'invalid') {
        busy = false;
        toast(e.message, { tone: 'danger' });
        start();
        return;
      }
      const why = e instanceof LookupError && e.kind === 'offline' ? 'Sin conexión a Internet'
        : e instanceof LookupError && e.kind === 'timeout' ? 'Open Food Facts no responde'
          : 'No se pudo consultar Open Food Facts';
      notice = { tone: 'warn', ic: 'wifiOff', text: `${why}. Puedes añadir el producto a mano; el código ${code} se guarda igualmente.` };
    }
    if (closed) return;
    close();
    openItemForm(ctx, { draft: { ...(result || {}), barcode: code }, notice });
  }

  function manualCode() {
    scanner.stop();
    const input = numberInput({ name: 'code', placeholder: '13 u 8 dígitos', inputmode: 'numeric', 'aria-label': 'Código de barras' });
    const s = openSheet({
      title: 'Escribir código', content: h('form', { class: 'form', onSubmit: (e) => { e.preventDefault(); go(); } },
        field({ label: 'Código de barras', input, hint: 'Son los números que aparecen bajo las barras.' }),
        h('div', { class: 'sheet-footer' }, btn('Buscar', { kind: 'primary', cls: 'btn-block', type: 'submit', icon: 'search' }))),
      primary: { label: 'Buscar', onClick: () => go() },
      onClose: () => { if (!busy && !closed) start(); },
    });
    setTimeout(() => input.focus(), 300);
    function go() {
      const code = input.value.replace(/\D/g, '');
      if (!code) return;
      busy = true;
      s.close();
      handleCode(code);
    }
  }

  start();
  return { close };
}

function offerExisting(ctx, existing, result, code) {
  const first = existing[0];
  actionSheet({
    title: `Ya tienes «${first.name}»`,
    actions: [
      ...existing.map((it) => ({
        label: `Sumar a ${locOf(it.location).label.toLowerCase()}`, icon: 'plus', detail: formatQuantity(it.quantity, it.unit),
        onClick: () => openItemForm(ctx, { item: it, notice: { tone: 'info', text: 'Ajusta la cantidad con + y guarda.' } }),
      })),
      { label: 'Añadir como producto nuevo', icon: 'box', onClick: () => openItemForm(ctx, { draft: { ...result, barcode: code, quantity: 1 }, notice: { tone: 'info', text: 'Datos tomados de tu producto anterior.' } }) },
    ],
  });
}
