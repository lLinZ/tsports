# Contexto para retomar el proyecto — TS Sports

> **Para qué sirve este fichero.** Es el traspaso de la sesión del
> **27 de agosto de 2026**, escrito para que otra sesión de Claude (u otra
> persona) pueda continuar sin volver a investigar el repositorio.
> Se lee junto a `CLAUDE.md`, que es el contrato de estilo y de reglas de
> negocio del proyecto y **manda sobre este documento**.

---

## 1. El proyecto en treinta segundos

- **Qué es:** sistema de TS Sports, agencia de marketing deportivo. Tres
  partes sobre una única base de datos: **web pública**, **CRM de
  patrocinios** y **administrador de la web**. Desde esta entrega hay
  además un **catálogo comercial** (productos IOP y campañas).
- **Dónde está:** `C:\Users\LinZ\Desktop\tsports`.
- **Stack:** Laravel 12 + PHP 8.2 + MySQL / React 19 + TypeScript + Vite 8
  + HeroUI **v2.8** + Tailwind 4 + TanStack Query 5 + React Router 7.
- **El repositorio NO está en git.** No hay carpeta `.git`.
- **Local:** el backend apunta a **MySQL** (`backend/.env`), no a SQLite.
  Hay un `database.sqlite` antiguo que ya no se usa.
- **Servidores de desarrollo:** hay un `.claude/launch.json` con dos
  entradas, `backend` (puerto 8000) y `frontend` (puerto 5173).

---

## 2. Aviso importante sobre los datos

La base de datos MySQL local **contiene datos reales de producción**, ya
migrados desde Supabase: **71 marcas** y **8 cuentas** con los correos
reales del equipo.

- **No se siembran datos de prueba ahí, ni se borran filas, ni se
  cambian contraseñas de esas cuentas.**
- Para probar cualquier cosa se usa la suite de pruebas, que corre sobre
  **SQLite en memoria** (`phpunit.xml`) y no toca nada.
- Si hace falta revisar la interfaz con datos reales, se puede crear un
  token temporal de Sanctum, guardarlo en `localStorage` bajo la clave
  `tsports:token`, mirar en modo **solo lectura** y borrar el token
  después. Es lo que se hizo en esta sesión.

---

## 3. Qué se hizo en la sesión del 2026-08-27

Se levantó la **segunda etapa** pedida por el cliente y se cerró lo que
faltaba de la primera.

### 3.1 Productos IOP (propiedades)

Catálogo de lo que la agencia vende (Comité Olímpico, Dvo. Lara, Dvo.
Táchira, Kombat Challenge, Megafitness, Movewireless, Sportbiz
Venezuela). Se carga de forma general, sin sub-propiedades.

**Los tres montos, que es el corazón de la etapa:**

| Monto | Dónde vive | Quién lo escribe |
|---|---|---|
| **MTP** — monto total de la propiedad | `propiedades.monto_total_usd` | admin / comercial |
| **Forecast** — meta, el 20 % del MTP | **no es columna**: `Propiedad::forecastDeVenta()` | nadie, se deriva |
| **OVP** — pronóstico del vendedor para UNA marca | `propiedades_de_marca.ovp_usd` | el vendedor, desde la ficha |

El porcentaje que se pinta en la barra (OVP ÷ MTP) **tampoco se guarda**:
se calcula al leer. Ejemplo del cliente: propiedad de 7.400 con
pronóstico de 500 → 6,76 %.

### 3.2 Checklist en la ficha de la marca

Dentro del paso *Avance*, en el bloque de prospección: se marcan las
propiedades que se le ofrecen a esa marca y se anota el OVP de cada una,
con su barra de porcentaje. **Marcar propiedades NO completa la fase de
prospección** (regla 9 de `CLAUDE.md`).

### 3.3 Campañas

Pantalla propia, selector en la ficha de la marca, filtro en el tablero,
distintivo de color en cada tarjeta y reparto por campaña en el resumen.
Era lo que había quedado pendiente de la primera etapa.

### 3.4 Informes del resumen

- Informe por propiedad (MTP, meta, OVP acumulado y su barra).
- Forecast por prospector.
- **Empresas por zona según si ya invierten en marketing deportivo**
  (el otro pendiente de la primera etapa), con tramos pulsables.
- Reparto por campaña.
- Dos contadores nuevos: meta del catálogo y OVP total del equipo.

### 3.5 Filtros nuevos del tablero

`campana`, `propiedad` e `invierte`, combinables con los que ya había
(búsqueda, etapa, zona, sector, vendedor, orden). Todos viajan en la URL.

---

## 4. Ficheros

### 4.1 Backend nuevo (20)

```
database/migrations/2026_08_26_000100_create_propiedades_table.php
database/migrations/2026_08_26_000200_create_prospectores_de_propiedad_table.php
database/migrations/2026_08_26_000300_create_campanas_table.php
database/migrations/2026_08_26_000400_create_propiedades_de_marca_table.php
database/migrations/2026_08_26_000500_anadir_campana_a_marcas.php
app/Models/Propiedad.php
app/Models/PropiedadDeMarca.php
app/Models/Campana.php
app/Http/Controllers/Api/PropiedadController.php
app/Http/Controllers/Api/CampanaController.php
app/Http/Requests/GuardarPropiedadRequest.php
app/Http/Requests/GuardarCampanaRequest.php
app/Http/Resources/RecursoPropiedad.php
app/Http/Resources/RecursoCampana.php
app/Http/Resources/RecursoPropiedadDeMarca.php
app/Policies/PropiedadPolicy.php
app/Policies/CampanaPolicy.php
database/seeders/PropiedadesIopSeeder.php
tests/Feature/PropiedadesYForecastTest.php
tests/Feature/BitacoraDeMarcasTest.php
```

### 4.2 Backend modificado

| Fichero | Qué cambió |
|---|---|
| `app/Enums/RolUsuario.php` | `puedeGestionarElCatalogoComercial()` (admin y comercial) |
| `app/Models/Marca.php` | `campana_id`, relaciones `campana` y `propiedadesOfrecidas`, `ovpTotal()`, scopes `deCampana`, `queOfrecenLaPropiedad`, `conInversion` |
| `app/Models/User.php` | relación `propiedadesAsignadas()` |
| `app/Http/Controllers/Api/MarcaController.php` | filtros nuevos, `sincronizarElChecklistDePropiedades()`, alta y edición dentro de una transacción |
| `app/Http/Controllers/Api/PanelController.php` | 4 bloques nuevos y 2 contadores |
| `app/Http/Requests/GuardarMarcaRequest.php` | `campanaId`, `propiedades[]` y su validación |
| `app/Http/Resources/RecursoMarca.php` | campaña, checklist y `ovpTotalUsd` |
| `app/Http/Resources/RecursoUsuario.php` | permiso `gestionaElCatalogoComercial` |
| `app/Providers/AppServiceProvider.php` | registro de las dos políticas nuevas |
| `app/Support/CatalogosDelCrm.php` | `porcentajeForecastPorDefecto` |
| `routes/api.php` | rutas de propiedades y campañas |
| `database/seeders/DatabaseSeeder.php` | llama al seeder de propiedades; campañas de ejemplo solo fuera de producción |

### 4.3 Frontend nuevo (9)

```
src/api/propiedades.ts
src/api/campanas.ts
src/hooks/usePropiedades.ts
src/hooks/useCampanas.ts
src/componentes/comunes/BarraDeProporcion.tsx
src/componentes/crm/ChecklistDePropiedades.tsx
src/componentes/crm/ModalDePropiedad.tsx
src/paginas/PaginaPropiedades.tsx
src/paginas/PaginaCampanas.tsx
```

### 4.4 Frontend modificado

`src/tipos/modelos.ts` · `src/api/marcas.ts` ·
`src/componentes/crm/ModalDeMarca.tsx` ·
`src/componentes/crm/TarjetaDeMarca.tsx` ·
`src/componentes/layout/LayoutDelPanel.tsx` ·
`src/paginas/PaginaMarcas.tsx` · `src/paginas/PaginaPanel.tsx` ·
`src/App.tsx` · `src/utilidades/formato.ts` (`formatearPorcentaje`).

### 4.5 Documentación

- `CLAUDE.md`: parte nueva en la tabla de la sección 1, estructura
  actualizada (sección 5) y **reglas de negocio 8 a 12** (los tres
  montos, el checklist y la prospección, asignación de propiedades, a
  quién se le cuenta el pronóstico, qué pasa al borrar). Además, la
  sección 8 incluye `php artisan test` y la 9 dos prohibiciones nuevas.
- `README.md`: apartados de propiedades y campañas, y el paso del seeder
  al actualizar el VPS.
- `informes/`: los dos PDF de reporte y `generar_informes.py`, que los
  regenera (`python generar_informes.py`, necesita `reportlab`).

---

## 5. API nueva

```
GET    /api/propiedades           (soloActivas, conTotales)
GET    /api/propiedades/{id}
POST   /api/propiedades
PUT    /api/propiedades/{id}
DELETE /api/propiedades/{id}

GET    /api/campanas              (soloActivas)
POST   /api/campanas
PUT    /api/campanas/{id}
DELETE /api/campanas/{id}

GET    /api/marcas                filtros nuevos: campana, propiedad, invierte
POST   /api/marcas                campos nuevos: campanaId, propiedades[]
PUT    /api/marcas/{id}           idem
GET    /api/panel/resumen         bloques nuevos: propiedades,
                                  forecastPorProspector, inversionPorZona, porCampana
```

---

## 6. Decisiones tomadas donde el pedido era ambiguo

Están explicadas también en los dos PDF de `informes/`.

1. **El 20 %** se guarda por propiedad (`porcentaje_forecast`, por defecto
   `Propiedad::PORCENTAJE_FORECAST_POR_DEFECTO`), no fijo en el sistema.
2. **La barra** enseña OVP ÷ MTP —el ejemplo que dio el cliente— con una
   marca fina en la meta. Color: acento por debajo de la meta, verde al
   alcanzarla, ámbar si pasa del MTP.
3. **El tablero enseña las dos cifras por separado**: meta del catálogo
   (Σ 20 % del MTP) y OVP del equipo. Por prospector se suma su OVP.
   → **Pregunta abierta con el cliente**, ver el punto 9.
4. **El checklist no cierra la prospección.**
5. **El OVP no puede pasar del MTP**, salvo si el MTP todavía es 0.
6. **Solo se comprueba el permiso al AÑADIR** una propiedad al checklist;
   quitar o corregir una ya puesta lo puede hacer quien edite la marca.
7. **La ficha envía siempre el checklist completo**; una petición sin la
   clave `propiedades` lo deja intacto.
8. **El OVP se le apunta al vendedor asignado de la marca**, no a quien
   escribió la cifra.
9. **Una propiedad retirada** sigue viéndose en las fichas donde ya se
   había ofrecido, marcada como retirada.

---

## 7. Cómo verificar

```bash
cd backend && php artisan test
```

54 pruebas, 121 comprobaciones, todas en verde el 2026-08-27. Corren
sobre SQLite en memoria.

```bash
cd frontend && npm run build
```

Incluye la comprobación de tipos. Si no compila, no está terminado.

Para mirar la interfaz, `preview_start` con las entradas `backend` y
`frontend` de `.claude/launch.json` (nunca `php artisan serve` por Bash).

---

## 8. Estado real de los datos (2026-08-27)

| Dato | Situación |
|---|---|
| Marcas | 71 |
| Marcas con vendedor asignado | 0 |
| Marcas con sector | 0 |
| Marcas con el dato de inversión en marketing deportivo | 0 |
| Marcas con propuesta enviada | 0 |
| Propiedades | 7 (solo Comité Olímpico con MTP: 162.000 USD) |
| Campañas | 0 |
| Comentarios | 0 |
| Cuentas | 8, todas con la clave provisional `CambiaEstaClave2026` |
| Textos de la web sin repasar | 5, bajo `_importadoSinTraducir` |

Las ocho cuentas: `tssports@gmail.com` (admin), `linz.webdev@gmail.com`
(admin), `comercial1@tsportve.online` (comercial), `dayvamar@gmail.com`,
`eliproducciones16@gmail.com`, `adraactivaciones@gmail.com`,
`homeroperozo1@gmail.com`, `dayrene.remax.galaxy@gmail.com` (vendedores).
Ninguna tiene zona asignada.

---

## 9. Pendientes

### Pregunta abierta con el cliente

Antonio escribió: *"forecast de venta: el monto del 20 % sobre el MTP,
este valor es el que se suma en el dashboard por todos los prospectores
comerciales"*. Como el 20 % es un valor de la propiedad y no del
vendedor, se implementó enseñando **las dos cifras** (meta del catálogo y
OVP por prospector). Si lo que quería es que a cada prospector se le sume
**el 20 % de su OVP**, el cambio está en
`PanelController::forecastPorProspector()`.

### Funcionalidad no incluida

- Filtro por **rango de importe estimado** en el tablero de marcas (hoy
  solo se puede ordenar por valor).
- La **bitácora de comentarios no se ve en pantallas < 1024 px**: en
  `ModalDeMarca.tsx` la columna derecha es `hidden … lg:block`.

### Datos que tiene que cargar el equipo

MTP de seis propiedades · reparto de propiedades entre prospectores ·
campañas del año · vendedor de las 71 marcas · sector e inversión de las
71 marcas · zona de las 8 cuentas · cambiar las 8 contraseñas · repasar
los 5 textos de la web.

### Infraestructura

- El proyecto **no está en git**.
- **No está instalado en el VPS.**

---

## 10. Despliegue en el VPS

Sin Docker. Ubuntu 22.04/24.04 con nginx, PHP 8.2, MySQL, Node 22 y
Composer, automatizado en `deploy/instalar-vps.sh` (primera vez) y
`deploy/desplegar.sh` (actualizaciones). El detalle está en el punto 6
del informe técnico y en el `README.md`.

Paso propio de esta entrega, solo si el sistema ya estaba instalado antes:

```bash
php artisan db:seed --class=PropiedadesIopSeeder
```

En una instalación nueva, `db:seed` ya lo ejecuta.

---

## 11. Memoria persistente

En `C:\Users\LinZ\.claude\projects\C--Users-LinZ-Desktop-tsports\memory\`
hay tres notas que conviene leer: `despliegue-vps-tsports.md`,
`importador-supabase-fechas.md` y `catalogo-iop-pendiente-de-datos.md`.
