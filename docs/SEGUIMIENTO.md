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
- [x] 48 pruebas unitarias (`npm test`)
- [x] 26 escenarios E2E en Chrome con viewport de iPhone (`tests/e2e/e2e.mjs`)
- [x] Capturas en claro/oscuro × iPhone SE / 13 / Pro Max, sin desbordes horizontales
- [~] Revisión independiente por subagente QA (en curso)

## Errores encontrados y corregidos
| Error | Causa | Corrección |
|---|---|---|
| Aparecía «null» en Inicio | `replaceChildren` convierte `null` en texto | Helper `replace()` que ignora nulos |
| Pestañas subrayadas, fecha «De Noviembre» | Estilos por defecto de enlaces / `capitalize` | CSS |
| La hoja «Escribir el código» quedaba detrás de la cámara | Orden de capas (z-index) | Visor por debajo de las hojas |
| Un aviso tapaba el botón principal de la hoja | El toast seguía visible al abrir la hoja | Se oculta al abrir una hoja |
| El decodificador fallaba con desenfoque | Umbral simple pierde barras finas | Modo por bordes con precisión subpíxel + 2 umbrales |
| Respuestas del service worker | `clone()` tras consumir el cuerpo | Clonar antes |

## ⛔ Bloqueado / pendiente del usuario
- [ ] Activar GitHub Pages (Settings → Pages → Deploy from a branch → main / root). Mi acceso no permite cambiar ajustes del repositorio.

## ⚠️ No verificado (requiere el iPhone real)
- Cámara y lectura de códigos reales en Safari iOS (probado solo con cámara simulada en Chrome).
- Que Open Food Facts permita consultas directas desde el navegador (CORS). Si no, la app avisa y permite seguir a mano.
- Instalación en pantalla de inicio y funcionamiento sin conexión en iOS.

## Ideas para siguientes versiones
Ver README → «Próximas versiones».
