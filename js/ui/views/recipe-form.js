// Formulario de receta: rápido de rellenar, solo nombre e ingredientes son obligatorios.
import { h, nextId, replace } from '../dom.js';
import { icon } from '../icons.js';
import { openSheet, field, textInput, numberInput, unitSelect, showErrors, toast, btn, quantityStepper, thumb, datalist } from '../components.js';
import { ValidationError } from '../../data/store.js';
import { resizeImage } from '../../services/images.js';
import { formatNumber } from '../../domain/units.js';

export function openRecipeForm(ctx, { recipe = null, onSaved = null } = {}) {
  const { store } = ctx;
  const editing = !!recipe;
  const listId = 'ing-names';
  let imageId = recipe?.imageId || null;
  let newBlob = null;

  const name = textInput({ name: 'name', value: recipe?.name || '', placeholder: 'Ej. Pasta con tomate' });
  const desc = h('textarea', { class: 'input', name: 'description', rows: 2, placeholder: 'Opcional' }, recipe?.description || '');
  const servings = quantityStepper({ value: recipe?.servings || 2, unit: 'ud', name: 'servings', min: 1 });
  const prep = numberInput({ name: 'prepMinutes', value: recipe?.prepMinutes ?? '', placeholder: 'Opcional', inputmode: 'numeric' });

  // Ingredientes
  const ingWrap = h('div', { class: 'ing-edit-list' });
  const addIngredient = (g = { name: '', quantity: '', unit: 'g' }, focus = false) => {
    const rowId = g.id || null;
    const n = textInput({ placeholder: 'Ingrediente', value: g.name, list: listId, 'aria-label': 'Ingrediente', class: 'input ing-name' });
    const q = numberInput({ placeholder: 'Cant.', value: g.quantity === '' ? '' : formatNumber(g.quantity).replace(/\./g, ''), 'aria-label': 'Cantidad', class: 'input input-number ing-q' });
    const u = unitSelect({ value: g.unit, name: nextId('u') });
    u.classList.add('ing-u');
    const err = h('p', { class: 'field-error' });
    const row = h('div', { class: 'ing-edit', dataset: { id: rowId || '' } },
      h('div', { class: 'ing-edit-fields' }, n, q, u,
        h('button', { type: 'button', class: 'icon-btn plain ing-del', 'aria-label': 'Quitar ingrediente', onClick: () => { row.remove(); } }, icon('close', { size: 18 }))),
      err);
    row.read = () => ({ id: rowId, name: n.value, quantity: q.value, unit: u.value });
    row.setError = (m) => { err.textContent = m || ''; row.classList.toggle('has-error', !!m); };
    // Enter en cantidad → nueva fila
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient({ name: '', quantity: '', unit: u.value }, true); } });
    ingWrap.appendChild(row);
    if (focus) setTimeout(() => n.focus(), 30);
    return row;
  };
  (recipe?.ingredients?.length ? recipe.ingredients : [{ name: '', quantity: '', unit: 'g' }]).forEach((g) => addIngredient(g));
  const ingErr = h('p', { class: 'field-error', style: { display: 'none' } });

  // Pasos
  const stepsWrap = h('div', { class: 'steps-edit' });
  const addStep = (text = '', focus = false) => {
    const ta = h('textarea', { class: 'input step-input', rows: 2, placeholder: 'Describe el paso' }, text);
    const row = h('div', { class: 'step-edit' }, h('span', { class: 'step-n' }), ta,
      h('button', { type: 'button', class: 'icon-btn plain', 'aria-label': 'Quitar paso', onClick: () => { row.remove(); renumber(); } }, icon('close', { size: 18 })));
    stepsWrap.appendChild(row);
    renumber();
    if (focus) setTimeout(() => ta.focus(), 30);
  };
  const renumber = () => [...stepsWrap.querySelectorAll('.step-n')].forEach((s, i) => { s.textContent = i + 1; });
  (recipe?.steps?.length ? recipe.steps : ['']).forEach((s) => addStep(s));

  // Foto
  const photoThumb = h('div');
  const renderThumb = () => replace(photoThumb, newBlob
    ? h('div', { class: 'thumb has-img', style: { width: '64px', height: '64px' } }, h('img', { src: URL.createObjectURL(newBlob), alt: '' }))
    : thumb(store, { imageId, emoji: '🍽️', size: 64 }));
  renderThumb();
  const file = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Elegir foto' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    try { newBlob = await resizeImage(f, 1200); renderThumb(); } catch { toast('No se pudo leer la imagen', { tone: 'danger' }); }
  });

  const form = h('form', { class: 'form', novalidate: true, onSubmit: (e) => { e.preventDefault(); save(); } },
    datalist(listId, store.knownNames()),
    field({ label: 'Nombre', input: name }),
    h('div', { class: 'field-row' },
      field({ label: 'Raciones', input: servings }),
      field({ label: 'Tiempo (min)', input: prep })),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Ingredientes'), ingWrap, ingErr,
      btn('Añadir ingrediente', { kind: 'plain', icon: 'plus', onClick: () => addIngredient({ name: '', quantity: '', unit: 'g' }, true) })),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Preparación'), stepsWrap,
      btn('Añadir paso', { kind: 'plain', icon: 'plus', onClick: () => addStep('', true) })),
    field({ label: 'Descripción', input: desc }),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Foto'),
      h('div', { class: 'photo-picker' }, photoThumb, h('label', { class: 'btn btn-tinted btn-small' }, icon('camera', { size: 17 }), h('span', null, imageId ? 'Cambiar foto' : 'Añadir foto'), file))),
    h('div', { class: 'sheet-footer' }, btn(editing ? 'Guardar cambios' : 'Crear receta', { kind: 'primary', cls: 'btn-block', type: 'submit' })));

  const sheet = openSheet({ title: editing ? 'Editar receta' : 'Nueva receta', content: form, full: true, primary: { label: 'Guardar', onClick: () => save() } });
  if (!editing) setTimeout(() => name.focus(), 350);

  let saving = false;
  async function save() {
    if (saving) return;
    const rows = [...ingWrap.querySelectorAll('.ing-edit')];
    const input = {
      name: name.value, description: desc.value, servings: servings.input.value, prepMinutes: prep.value,
      ingredients: rows.map((r) => r.read()), steps: [...stepsWrap.querySelectorAll('textarea')].map((t) => t.value), imageId,
    };
    saving = true; sheet.setBusy(true);
    try {
      if (newBlob) input.imageId = await store.saveImage(newBlob);
      const saved = await store.saveRecipe(input, editing ? recipe.id : null);
      toast(editing ? 'Receta guardada' : `«${saved.name}» creada`);
      sheet.close();
      onSaved?.(saved);
    } catch (e) {
      if (e instanceof ValidationError) {
        // Errores de filas de ingredientes: se indexan sobre las filas no vacías.
        rows.forEach((r) => r.setError(null));
        rows.forEach((r, i) => {
          const m = e.errors[`ing.${i}.name`] || e.errors[`ing.${i}.quantity`] || e.errors[`ing.${i}.unit`];
          r.setError(m);
        });
        ingErr.textContent = e.errors.ingredients || '';
        ingErr.style.display = e.errors.ingredients ? 'block' : 'none';
        const top = Object.fromEntries(Object.entries(e.errors).filter(([k]) => !k.startsWith('ing')));
        showErrors(form, top);
        if (!Object.keys(top).length) (ingWrap.querySelector('.has-error input') || ingWrap).scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (e.errors.ingredients && !rows.length) addIngredient({ name: '', quantity: '', unit: 'g' }, true);
      } else { console.error(e); toast('No se pudo guardar la receta', { tone: 'danger' }); }
    } finally { saving = false; if (!sheet.closed) sheet.setBusy(false); }
  }
  return sheet;
}
