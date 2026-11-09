# FRIDGE — Seguimiento del proyecto

Última actualización: 9 nov 2026

## Decisiones tomadas con el usuario
| Decisión | Motivo |
|---|---|
| PWA (web instalable) en lugar de Swift/SwiftUI | El usuario no tiene Mac ni iPad; sin ellos no se puede compilar ni firmar una app nativa. Elegido por el usuario. |
| iOS 17 o superior | Elegido por el usuario. |
| Publicación en GitHub Pages (`IgnacioFS/fridge`) | Gratis, HTTPS (requisito para la cámara y para instalar). |
| Sin dependencias ni paso de compilación | No se pueden instalar paquetes en el entorno, y además simplifica el mantenimiento. |
| Decodificador EAN propio | Safari en iOS no trae `BarcodeDetector`. Si el navegador lo trae (Chrome/Android), se usa ese. |
| Exportar/importar copia en el MVP | Safari puede borrar datos de webs no instaladas; es la red de seguridad. |

## Fases

### ✅ Fase 1 — Planificación
- [x] Análisis de requisitos y adaptación a PWA
- [x] Arquitectura en capas (docs/ARQUITECTURA.md)
- [x] Modelos de datos con UUID + `createdAt`/`updatedAt` (preparados para sincronizar)
- [x] Navegación: 4 pestañas (Inicio, Inventario, Recetas, Compra) + hojas modales para formularios
- [x] Sistema de diseño (css/tokens.css)

### ✅ Fase 2 — Estructura visual
- [x] Barra de pestañas con insignias (caducados, pendientes)
- [x] Componentes: hoja modal arrastrable, alerta, avisos con deshacer, stepper, control segmentado, chips, selector de caducidad con atajos, estados vacíos
- [x] Modo claro/oscuro automático, áreas seguras, «Reducir movimiento»

### ✅ Fase 3 — Inventario
- [x] Alta/edición/eliminación (con deshacer)
- [x] Categoría sugerida por el nombre; ubicación sugerida por la categoría
- [x] Búsqueda, filtros por ubicación/categoría/estado, orden por caducidad o nombre
- [x] Botón «−» para consumir rápido; al agotarse, ofrece añadir a la compra
- [x] Aviso de duplicado al dar de alta (sumar o crear otro)
- [x] Escáner EAN-13/EAN-8/UPC-A, linterna, entrada manual del código
- [x] Open Food Facts con avisos de «revisa los datos», no encontrado, sin conexión, tiempo agotado y código no válido
- [x] Productos ya escaneados se reconocen sin Internet

### ✅ Fase 4 — Recetas
- [x] Alta/edición/eliminación, foto, tiempo, raciones, pasos
- [x] Búsqueda por nombre o ingrediente; filtros «Puedo cocinar» y «Me falta poco»

### ✅ Fase 5 — Lista de la compra
- [x] Alta rápida en una línea («2 l leche»), edición con detalle, agrupación por categoría
- [x] Pendientes / comprados, «Vaciar comprados» con deshacer
- [x] Paso a inventario solo tras confirmar: cantidad, unidad, ubicación, caducidad, sumar a existente o crear nuevo

### ✅ Fase 6 — Integración
- [x] Comparación receta ↔ inventario con escalado por raciones
- [x] Conversión g/kg y ml/cl/l en enteros (sin errores de redondeo)
- [x] Unidades incompatibles: aviso + decisión del usuario («Lo tengo» / «Comprar»)
- [x] Caducados no cuentan como disponibles
- [x] Etiquetas por receta, fusión sin duplicados, reemplazo al reañadir la misma receta, quitar etiqueta sin quitar producto
- [x] Indicador «En la lista: X» en la receta

### ✅ Fase 7 — Pruebas
- [x] 60 pruebas unitarias (`npm test`), incluidas regresiones de la revisión QA
- [x] 29 escenarios E2E en Chrome con viewport de iPhone (`tests/e2e/e2e.mjs`)
- [x] Capturas en claro/oscuro × iPhone SE / 13 / Pro Max, sin desbordes horizontales
- [x] Revisión independiente por subagente QA: 22 hallazgos, 20 corregidos (ver abajo)

## Errores encontrados y corregidos
| Error | Causa | Corrección |
|---|---|---|
| Aparecía «null» en Inicio | `replaceChildren` convierte `null` en texto | Helper `replace()` que ignora nulos |
| Pestañas subrayadas, fecha «De Noviembre» | Estilos por defecto de enlaces / `capitalize` | CSS |
| La hoja «Escribir el código» quedaba detrás de la cámara | Orden de capas (z-index) | Visor por debajo de las hojas |
| Un aviso tapaba el botón principal de la hoja | El toast seguía visible al abrir la hoja | Se oculta al abrir una hoja |
| El decodificador fallaba con desenfoque | Umbral simple pierde barras finas | Modo por bordes con precisión subpíxel + 2 umbrales |
| Respuestas del service worker | `clone()` tras consumir el cuerpo | Clonar antes |

### Hallazgos de la revisión QA corregidos
| # | Problema | Corrección |
|---|---|---|
| 1 | Dobles pulsaciones dejaban registros «fantasma» en IndexedDB | Cola única de escrituras en el store + bloqueos en botones |
| 2 | Confirmar una compra dos veces la sumaba dos veces | Bloqueo en la hoja y el store rechaza lo ya añadido |
| 3 | Importar una copia dañada borraba los datos | Validación completa previa + transacción única (todo o nada) |
| 4 | Cerrar el escáner mientras se abría la cámara la dejaba encendida | Cancelación por generación |
| 5 | Plurales mal singularizados («verdes»→«verd») | Reglas revisadas |
| 6 | «leche de coco» contaba como «leche» | Coincidencias dudosas no cuentan; el usuario decide («¿Sirve…?») |
| 7 | Un producto cubría dos ingredientes | Reparto del inventario entre ingredientes |
| 8 | Ingredientes repetidos en una receta se pisaban | Se suman |
| 9 | Cambiar la unidad de una línea corrompía sus etiquetas | Conversión de etiquetas |
| 10 | Reañadir receta tras bajar la cantidad dejaba 0 | Nunca por debajo de lo que pide la receta |
| 11 | Sumar a un producto agotado heredaba su caducidad vieja | Se toma la nueva |
| 12 | Ubicación oculta al cambiar a unidad incompatible | Se vuelve a mostrar |
| 13 | Errores del formulario de receta en la fila equivocada | Mismo índice |
| 14 | Service worker podía cachear archivos viejos | `cache: 'reload'` + `waitUntil` |
| 15 | Reescanear compartía la foto entre productos | No se reutiliza |
| 16 | «1.000 g» de Open Food Facts se leía como 1 g | Separador de miles |
| 17 | Producto escaneado sin categoría no se autocategorizaba | Sugerencia al abrir |
| 18 | Desmarcar no permitía volver a pasar al inventario | Se reinicia |
| 20 | Días de aviso sin límite | 1–30 |
| 21–22 | Teclado/VoiceOver y textos que remitían a ajustes inexistentes | Corregidos |

Sin corregir (menor): #19 al quitar una etiqueta se descarta la cantidad que se estuviera escribiendo en ese momento; el foco no queda atrapado dentro de las hojas.

## ⛔ Bloqueado / pendiente del usuario
- [ ] Activar GitHub Pages (Settings → Pages → Deploy from a branch → main / root). Mi acceso no permite cambiar ajustes del repositorio.

## ⚠️ No verificado (requiere el iPhone real)
- Cámara y lectura de códigos reales en Safari iOS (probado solo con cámara simulada en Chrome).
- Que Open Food Facts permita consultas directas desde el navegador (CORS). Si no, la app avisa y permite seguir a mano.
- Instalación en pantalla de inicio y funcionamiento sin conexión en iOS.

## Ideas para siguientes versiones
Ver README → «Próximas versiones».
