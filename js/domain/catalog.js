// Catálogos fijos: categorías y ubicaciones.

export const CATEGORIES = [
  { id: 'frutas',    label: 'Frutas',           emoji: '🍎' },
  { id: 'verduras',  label: 'Verduras',         emoji: '🥬' },
  { id: 'carnes',    label: 'Carnes',           emoji: '🥩' },
  { id: 'pescados',  label: 'Pescados',         emoji: '🐟' },
  { id: 'lacteos',   label: 'Lácteos',          emoji: '🥛' },
  { id: 'huevos',    label: 'Huevos',           emoji: '🥚' },
  { id: 'panaderia', label: 'Panadería',        emoji: '🥖' },
  { id: 'cereales',  label: 'Cereales y pasta', emoji: '🍝' },
  { id: 'conservas', label: 'Conservas',        emoji: '🥫' },
  { id: 'bebidas',   label: 'Bebidas',          emoji: '🧃' },
  { id: 'congelados',label: 'Congelados',       emoji: '🧊' },
  { id: 'otros',     label: 'Otros',            emoji: '🛒' },
];

export const LOCATIONS = [
  { id: 'nevera',     label: 'Nevera' },
  { id: 'congelador', label: 'Congelador' },
  { id: 'despensa',   label: 'Despensa' },
];

const catMap = new Map(CATEGORIES.map((c) => [c.id, c]));
const locMap = new Map(LOCATIONS.map((l) => [l.id, l]));

export function category(id) { return catMap.get(id) || catMap.get('otros'); }
export function location(id) { return locMap.get(id) || locMap.get('nevera'); }
export function isCategory(id) { return catMap.has(id); }
export function isLocation(id) { return locMap.has(id); }

/** Ubicación sugerida por categoría. */
export function defaultLocationFor(categoryId) {
  switch (categoryId) {
    case 'congelados': return 'congelador';
    case 'cereales': case 'conservas': case 'panaderia': case 'bebidas': case 'otros': return 'despensa';
    default: return 'nevera';
  }
}

// Sugerencia de categoría a partir del nombre (para formularios rápidos).
const KEYWORDS = [
  ['huevos', ['huevo']],
  ['lacteos', ['leche', 'yogur', 'queso', 'nata', 'mantequilla', 'kefir', 'requeson', 'mozzarella', 'cuajada']],
  ['carnes', ['pollo', 'ternera', 'cerdo', 'jamon', 'chorizo', 'carne', 'pavo', 'cordero', 'salchicha', 'bacon', 'lomo', 'hamburguesa']],
  ['pescados', ['pescado', 'merluza', 'salmon', 'atun fresco', 'bacalao', 'gamba', 'langostino', 'sardina', 'dorada', 'lubina', 'calamar', 'mejillon']],
  ['frutas', ['manzana', 'platano', 'naranja', 'pera', 'fresa', 'uva', 'limon', 'kiwi', 'melon', 'sandia', 'mandarina', 'melocoton', 'pina', 'aguacate', 'mango', 'cereza']],
  ['verduras', ['tomate', 'lechuga', 'cebolla', 'ajo', 'pimiento', 'zanahoria', 'patata', 'calabacin', 'berenjena', 'pepino', 'espinaca', 'brocoli', 'coliflor', 'puerro', 'champinon', 'seta', 'judia verde', 'calabaza']],
  ['panaderia', ['pan', 'baguette', 'bolleria', 'croissant', 'magdalena', 'tostada', 'bizcocho']],
  ['cereales', ['pasta', 'arroz', 'macarron', 'espagueti', 'fideo', 'cereal', 'avena', 'harina', 'lenteja', 'garbanzo', 'quinoa', 'cuscus', 'tallarin']],
  ['conservas', ['lata', 'conserva', 'atun', 'tomate frito', 'tomate triturado', 'sardinilla', 'aceituna', 'pimiento del piquillo']],
  ['bebidas', ['agua', 'zumo', 'refresco', 'cerveza', 'vino', 'cafe', 'te', 'bebida', 'cola']],
  ['congelados', ['congelado', 'congelada', 'helado', 'pizza']],
];

/** Sugiere categoría a partir de una clave normalizada (palabras completas; gana la coincidencia más larga). */
export function suggestCategory(key) {
  if (!key) return null;
  const padded = ` ${key} `;
  let best = null;
  let bestLen = 0;
  for (const [cat, words] of KEYWORDS) {
    for (const w of words) {
      if (padded.includes(` ${w} `) && w.length > bestLen) { best = cat; bestLen = w.length; }
    }
  }
  return best;
}
