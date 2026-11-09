# FRIDGE — Arquitectura técnica

## 1. Decisión de plataforma

El brief original pedía Swift + SwiftUI + SwiftData. Se descartó porque el usuario no tiene Mac ni iPad,
y sin ellos no se puede compilar ni firmar una app nativa para su iPhone. Por decisión del usuario, FRIDGE es una
**Progressive Web App (PWA)** que:

- Se abre en Safari y se instala en la pantalla de inicio («Compartir → Añadir a pantalla de inicio»).
- Funciona **sin conexión**: un *service worker* guarda en caché todos los archivos de la app.
- Guarda **todos los datos en el propio iPhone** (IndexedDB). No hay cuentas, servidor ni backend.
- Solo usa Internet para consultar Open Food Facts al escanear un código.

Tecnología: HTML + CSS + JavaScript moderno (módulos ES), **sin frameworks ni dependencias**. No hay
paso de compilación: lo que hay en el repositorio es exactamente lo que se ejecuta. Así el proyecto es fácil
de mantener y no envejece por culpa de dependencias.

## 2. Capas

```
┌─────────────────────────────────────────────────────────────┐
│ UI (js/ui)          vistas, componentes, hojas modales       │
│   └─ solo lee del Store y llama a acciones                   │
├─────────────────────────────────────────────────────────────┤
│ Store (js/data/store.js)   estado en memoria + acciones      │
│   └─ orquesta dominio + repositorios, emite «change»         │
├──────────────────────────────┬──────────────────────────────┤
│ Dominio (js/domain)          │ Servicios (js/services)       │
│  funciones puras, sin DOM    │  escáner, Open Food Facts,    │
│  unidades, fechas, recetas,  │  imágenes                     │
│  compra, coincidencias       │                               │
├──────────────────────────────┴──────────────────────────────┤
│ Persistencia (js/data/db.js, repository.js)  IndexedDB       │
└─────────────────────────────────────────────────────────────┘
```

- **Dominio**: funciones puras, probadas con `node --test`. No sabe nada de la interfaz ni del almacenamiento.
- **Persistencia**: un `Repository` genérico (`getAll`, `get`, `put`, `delete`) por colección. Se puede cambiar
  IndexedDB por otro almacenamiento, o añadir sincronización, sin tocar el dominio ni la UI.
- **Store**: carga todo en memoria al arrancar (el volumen de datos de una casa es pequeño) y escribe en
  IndexedDB en cada cambio. La UI se vuelve a pintar al recibir el evento `change`.
- **Servicios**: `ProductLookup` es una interfaz con un proveedor (`OpenFoodFactsProvider`). Se pueden añadir
  más fuentes de productos encadenándolas.

## 3. Modelos de datos

Todas las entidades tienen `id` (UUID), `createdAt` y `updatedAt` (ISO 8601) para preparar una futura sincronización.

**InventoryItem** — `name`, `key` (nombre normalizado para comparar), `brand?`, `category`, `quantity`,
`unit`, `expiry?` (`YYYY-MM-DD`, fecha local, sin hora), `location` (`nevera` | `congelador` | `despensa`),
`barcode?`, `imageId?`, `notes?`.

**Recipe** — `name`, `description?`, `imageId?`, `servings`, `prepMinutes?`, `ingredients[]`, `steps[]`.
`RecipeIngredient` — `id`, `name`, `key`, `quantity`, `unit`, `optional?`.

**ShoppingItem** — `name`, `key`, `category`, `quantity`, `unit`, `checked`, `checkedAt?`,
`addedToInventory`, `sources[]`. `ShoppingSource` — `recipeId`, `recipeName`, `quantity` (en la unidad de la línea).

**Image** — `id`, `blob` (JPEG reducido a 800 px). Las imágenes van en su propio almacén para que listar el
inventario no cargue fotos.

**Meta** — versión del esquema y ajustes (días para «caduca pronto», por defecto 3).

## 4. Reglas de negocio clave

### Unidades (js/domain/units.js)
- Dimensiones: masa (`g`, `kg` → base g), volumen (`ml`, `cl`, `l` → base ml), recuento (`ud`), envase (`paquete`, `lata`, `bote`).
- Solo se convierten unidades de la misma dimensión. `1 kg = 1000 g`, `1 l = 1000 ml`.
- Unidades incompatibles **no se comparan**: el resultado es «no comparable» y la UI avisa y deja decidir.
- Para evitar errores de coma flotante, todas las operaciones se hacen en **milésimas enteras** de la unidad base
  (`0,1 + 0,2` kg da exactamente 300 g).

### Identidad de producto (js/domain/matching.js)
- `key` = nombre en minúsculas, sin tildes ni signos, con plural simple → singular («Tomates» → `tomate`).
- Un ingrediente coincide con un producto del inventario si su `key` es igual, o si el `key` del ingrediente
  aparece como palabras completas al principio del nombre del producto («leche» ↔ «Leche entera»).
- Si hay código de barras igual, también coincide.
- La UI siempre muestra **qué productos del inventario** se han usado en la comparación, para que no sea una caja negra.

### Disponibilidad de una receta (js/domain/recipes.js)
- Cantidad necesaria = cantidad del ingrediente × (raciones elegidas ÷ raciones base).
- Se suman los productos del inventario que coinciden y tienen unidad compatible. **Los caducados no cuentan**
  (se avisa de que existen).
- Estados: `disponible`, `parcial` (falta X), `falta` (no hay nada), `incomparable` (hay producto pero en unidad
  incompatible: el usuario decide si lo tiene o lo añade a la compra).

### Lista de la compra (js/domain/shopping.js)
- Al añadir un producto, si ya hay una línea **pendiente** con el mismo `key` y unidad compatible, se suma a esa línea
  (no se duplica).
- Cada aportación de una receta queda como `source` (etiqueta). Si se vuelve a añadir la misma receta, se
  **reemplaza** su aportación (no se suma dos veces).
- Quitar una etiqueta resta lo que aportaba esa receta. Si la línea se quedaría sin cantidad, se mantiene con la
  cantidad que tenía para que el usuario decida.
- Añadir a la compra **nunca** modifica el inventario.

### Compra → inventario
- Marcar como comprado solo mueve la línea a «Comprados».
- «Añadir al inventario» abre una hoja para confirmar cantidad, ubicación y caducidad. Si existe un producto
  compatible, se ofrece **sumar** a él o crear uno nuevo. Solo al confirmar cambia el inventario.

### Caducidad (js/domain/dates.js)
- Fechas guardadas como `YYYY-MM-DD` en hora local, para que no haya desfases por zona horaria.
- `caducado` si la fecha es anterior a hoy; `pronto` si quedan ≤ N días (3 por defecto); `ok` en otro caso.

## 5. Preparado para el futuro
- **Sincronización**: UUID + `updatedAt` en todo, y el acceso a datos pasa siempre por `Repository`. Un repositorio
  remoto podría envolver al local. Pendiente: lápidas (*tombstones*) de borrado.
- **Copias / importación / exportación**: el formato JSON versionado ya existe (Ajustes → Exportar/Importar).
  Se implementó en el MVP porque Safari puede borrar datos de webs **no instaladas** tras días sin uso; es la red de seguridad.
- **Compartir listas**: la lista es un array de `ShoppingItem` serializable.
- **Nuevas fuentes de productos**: `ProductLookup` acepta una cadena de proveedores.
- **Recomendaciones**: el cálculo de disponibilidad ya da una puntuación por receta («Puedes cocinar»).

## 6. Estructura de archivos

```
index.html               shell de la app
manifest.webmanifest     metadatos de instalación
sw.js                    service worker (caché offline)
css/                     tokens.css (sistema de diseño), base.css, components.css
icons/                   iconos de la app
js/app.js                arranque y enrutado
js/domain/               lógica pura (probada en Node)
js/data/                 IndexedDB, repositorios, store, copia de seguridad
js/services/             Open Food Facts, imágenes, barcode/ (decodificador EAN + cámara)
js/ui/components/        h(), iconos SVG, hojas, avisos, campos, tarjetas
js/ui/views/             home, inventory, item-form, recipes, recipe-detail, recipe-form, shopping, scanner, settings
tests/unit/              node --test
tests/e2e/               Playwright (Chrome con viewport de iPhone)
```

## 7. Sistema de diseño (css/tokens.css)
- **Color**: acento verde salvia (`--accent`), con estados semánticos (caducado = rojo, pronto = ámbar, ok = verde)
  y variantes claro/oscuro automáticas con `prefers-color-scheme`. Colores de ubicación: nevera azul, congelador
  cian, despensa ocre.
- **Tipografía**: fuente del sistema (San Francisco en iPhone). Escala: título grande 34, título 22, cuerpo 17,
  secundario 15, pie 13.
- **Espaciado**: escala de 4 pt (4, 8, 12, 16, 20, 24, 32). Radios: 10 (controles), 16 (tarjetas), 22 (hojas).
- **Iconos**: conjunto SVG propio de trazo 1,8 px, coherente con SF Symbols.
- **Componentes**: tarjeta, fila de lista, chip/filtro, control segmentado, *stepper* de cantidad, botón
  primario/secundario, hoja modal inferior, aviso (*toast*) con deshacer, estado vacío, insignia de caducidad.
- **Movimiento**: transiciones de 150–250 ms; se desactivan con «Reducir movimiento».
