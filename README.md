# FRIDGE

Inventario de casa, recetas y lista de la compra para iPhone. Es una app web instalable (PWA): funciona sin conexión y guarda todos los datos en el propio teléfono, sin cuentas ni servidor.

**App:** https://ignaciofs.github.io/fridge/

## Instalar en el iPhone
1. Abre el enlace en **Safari**.
2. Pulsa **Compartir** (el cuadrado con la flecha) → **Añadir a pantalla de inicio**.
3. Abre FRIDGE desde el icono. La primera vez que escanees, permite el acceso a la cámara.

> Instálala: si solo la usas desde Safari sin instalar, iOS puede borrar los datos tras unos días sin uso. Además, en Ajustes → Exportar puedes guardar una copia.

## Qué hace
- **Inventario**: alimentos con cantidad, unidad, ubicación (nevera, congelador o despensa), caducidad, categoría, marca, código, foto y notas. Búsqueda, filtros, orden y botón «−» para descontar lo que consumes.
- **Escáner**: lee EAN-13, EAN-8 y UPC-A y consulta Open Food Facts. Siempre puedes revisar y corregir los datos antes de guardar, o escribir el código a mano.
- **Recetas**: ingredientes con cantidades, pasos, foto, tiempo y raciones. Al abrir una receta ves qué tienes, qué falta y cuánto, ajustado a las raciones.
- **Compra**: alta rápida («2 l leche»), agrupada por categorías, con etiquetas de la receta que generó cada producto y sin duplicados. Lo comprado pasa al inventario solo cuando lo confirmas.

## Arquitectura
HTML + CSS + JavaScript (módulos ES), sin dependencias ni compilación. Capas: dominio puro → store → interfaz, con persistencia en IndexedDB detrás de un `Repository`. Detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). Seguimiento en [docs/SEGUIMIENTO.md](docs/SEGUIMIENTO.md).

## Desarrollo
```bash
python3 -m http.server 8080          # servir en local → http://localhost:8080
npm test                             # pruebas unitarias (Node 20+)
python3 tests/e2e/make-video.py      # vídeo con código de barras para la cámara simulada
node tests/e2e/e2e.mjs               # pruebas E2E (Playwright + Chrome)
```
Al publicar cambios, sube `CACHE_VERSION` en `sw.js` y `APP_VERSION` en `js/version.js` para que los iPhone descarguen la versión nueva.

## Limitaciones conocidas
- Requiere iOS 17+ (Safari). Para usar la cámara, la app debe abrirse por HTTPS.
- Los datos viven en un solo dispositivo; para pasarlos a otro, exporta e importa una copia.
- La identificación de «mismo producto» se basa en el nombre normalizado («Tomates» = «tomate», «leche» cubre «Leche entera»). Nombres muy distintos para lo mismo («espaguetis» frente a «pasta») no se relacionan.
- Unidades de envase (paquete, lata, bote) no se convierten a peso o volumen.
- La información de Open Food Facts es colaborativa y puede ser incompleta.

## Próximas versiones
- Sincronización entre dispositivos y lista de la compra compartida (los modelos ya llevan UUID y fecha de modificación).
- Equivalencias por producto (p. ej. 1 huevo ≈ 60 g) y sinónimos de ingredientes.
- Notificaciones de caducidad (iOS 16.4+ con la PWA instalada).
- Importar recetas desde una web y recomendar recetas según lo que caduca antes.
- Registro de consumo al cocinar una receta (descontar ingredientes con confirmación).
