// Iconos SVG propios (trazo 1,8, estilo SF Symbols). Se insertan inline para heredar color.

const P = {
  home: 'M3.5 10.5 12 3.8l8.5 6.7V20a1 1 0 0 1-1 1h-4.8v-6.2H9.3V21H4.5a1 1 0 0 1-1-1z',
  box: 'M4 7.5 12 3.5l8 4v9L12 20.5l-8-4zM4 7.5l8 4 8-4M12 11.5v9',
  book: 'M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h9.5M9 8h5',
  cart: 'M3 4h2.2l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1M9.5 20.5h.01M17 20.5h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4zM16 16l4.5 4.5',
  barcode: 'M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12M2.5 3.5h3M18.5 3.5h3M2.5 20.5h3M18.5 20.5h3',
  camera: 'M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  chevronRight: 'm9.5 5.5 6.5 6.5-6.5 6.5',
  chevronLeft: 'M14.5 5.5 8 12l6.5 6.5',
  chevronDown: 'm5.5 9.5 6.5 6.5 6.5-6.5',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  trash: 'M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13M10 10.5v6M14 10.5v6',
  edit: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14a6.5 6.5 0 0 1 3.5 6',
  sort: 'M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5',
  alert: 'M12 3.5 21.5 20h-19zM12 10v4.5M12 17.5h.01',
  snow: 'M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2',
  fridge: 'M6.5 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM5.5 10h13M9 6v2M9 13v3',
  jar: 'M8 3.5h8M7.5 6h9a1 1 0 0 1 1 1v12.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM6.5 11h11',
  tag: 'M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0zM8 8h.01',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.5 7.5 0 0 1-1.9 1.1L15 20.5h-4l-.3-2a7.5 7.5 0 0 1-1.9-1.1l-1.9.7-2-3.4 1.6-1.2a7.5 7.5 0 0 1 0-2.9L4.9 9.3l2-3.4 1.9.7a7.5 7.5 0 0 1 1.9-1.1l.3-2h4l.3 2a7.5 7.5 0 0 1 1.9 1.1l1.9-.7 2 3.4-1.6 1.2a7.5 7.5 0 0 1 0 2.9z',
  bolt: 'M13 2.5 5 13.5h6l-1 8 8-11h-6z',
  keyboard: 'M3.5 6.5h17a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7.5 14h9',
  download: 'M12 3.5v12M7 10.5l5 5 5-5M4.5 20.5h15',
  upload: 'M12 15.5v-12M7 8.5l5-5 5 5M4.5 20.5h15',
  image: 'M4.5 4.5h15a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM3.5 16l5-5 4 4 2.5-2.5 5 5M15.5 9.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.8h.01',
  wifiOff: 'M2.5 8.5a14 14 0 0 1 5-3M11 4.5A14 14 0 0 1 21.5 8.5M5.5 12a9.5 9.5 0 0 1 4-2.2M15.5 10.5a9.5 9.5 0 0 1 3 1.5M8.8 15.4a5 5 0 0 1 6.4 0M12 19.5h.01M3.5 3.5l17 17',
  sparkle: 'M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  cook: 'M5.5 11.5h13v6a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3zM3 11.5h18M9 8c0-1.5 1-1.5 1-3M13 8c0-1.5 1-1.5 1-3',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
};

const FILLED = new Set(['more']);

export function icon(name, { size = 22, cls = '', stroke = 1.8, label = null } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', FILLED.has(name) ? 3 : stroke);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', P[name] || P.info);
  svg.appendChild(path);
  return svg;
}

export const LOCATION_ICON = { nevera: 'fridge', congelador: 'snow', despensa: 'jar' };
