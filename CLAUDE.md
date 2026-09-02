# CLAUDE.md — Guía del proyecto TS Sports

Este fichero es el contrato de trabajo del repositorio. Todo lo que se
escriba aquí dentro tiene que cumplir estas reglas, sin excepciones.

---

## 1. Qué es esto

**TS Sports** es una agencia de marketing y consultoría deportiva. El
sistema tiene tres partes que comparten una única base de datos:

| Parte | Para qué sirve | Quién la usa |
|---|---|---|
| **Web pública** | La página de la agencia. Una sola página, en español e inglés. | Cualquier visitante |
| **CRM de patrocinios** | El tablero de marcas: a quién se le está vendiendo un patrocinio y por dónde va. | El equipo comercial |
| **Catálogo comercial** | Las **propiedades** (los productos IOP que se venden) y las **campañas** del año. | Admin y comerciales |
| **Administrador de la web** | Cambiar textos, fotos, colores y secciones sin tocar código. | Admin y comerciales |

Es la migración de un sistema anterior hecho con HTML/JS suelto y
Supabase. La versión anterior está en
`C:\Users\LinZ\Downloads\RESPALDO\RESPALDO\code\tssports` y sirve de
referencia para el negocio, **no** para el estilo de código.

---

## 2. Tecnologías (no se cambian sin hablarlo)

| Capa | Tecnología | Versión |
|---|---|---|
| Backend | Laravel | 12 |
| Lenguaje | PHP | 8.2+ |
| Base de datos | MySQL | 8 |
| Autenticación | Laravel Sanctum (tokens Bearer) | — |
| Frontend | React + TypeScript | 19 / 5.x |
| Bundler | Vite | 8 (rolldown) |
| Componentes | **HeroUI** | 2.8.x |
| Estilos | Tailwind CSS | 4 |
| Datos en cliente | TanStack Query | 5 |
| Enrutado | React Router | 7 |
| Iconos | lucide-react | — |
| Tipografía | **Inter** (Google Fonts) | — |

> **HeroUI v2, no v3.** Existe una v3, pero es una reescritura con otra
> API. Todo el código está escrito contra la v2.8, que es estable y la
> que soporta Tailwind v4. No actualizar a v3 sin migrar todo a la vez.

---

## 3. Reglas de escritura de código

Estas son las que más importan. Se aplican a PHP y a TypeScript por
igual.

### 3.1 Nombres explicativos, en español

Los nombres dicen **qué es la cosa**, no cómo se llamaba en el tutorial.
Nada de `d`, `tmp`, `res`, `handleClick2`, `data2`.

```ts
// ❌ Mal
const d = await get(id);
const r = d.filter(x => x.st);

// ✅ Bien
const marca = await obtenerMarca(idDeLaMarca);
const marcasConPropuesta = marcas.filter(
  (marca) => marca.fasePropuestaCompletada,
);
```

El dominio se nombra **en español**, porque el equipo que lee el código
y el que usa el sistema hablan español: `marca`, `zona`, `vendedor`,
`comentario`, `fase`. Lo que impone el framework se deja como está
(`User`, `Controller`, `useState`, `email`, `password`): mezclar
idiomas dentro de una convención del framework confunde más de lo que
aclara.

### 3.2 Cabecera en cada fichero

**Todo fichero empieza con un bloque que explica para qué sirve.** No se
describe lo que ya se ve leyendo el código: se explica el papel del
fichero en el sistema y las decisiones que no son obvias.

```php
/**
 * MarcaPolicy — quién puede hacer qué con una marca.
 * ---------------------------------------------------------------------
 * Aquí vive, traducido a PHP, lo que en Supabase eran las políticas de
 * Row Level Security de la tabla `deals`.
 *
 *   · EDITAR → admin y comercial siempre; el vendedor solo lo asignado.
 *   · BORRAR → solo admin y comercial.
 */
```

### 3.3 Comentarios que explican el *porqué*

Un comentario que repite el código sobra. Un comentario que explica una
decisión, una regla de negocio o una trampa conocida vale oro.

```php
// ❌ Sobra: se lee en la línea de abajo
// Recorre las marcas
foreach ($marcas as $marca) {

// ✅ Explica algo que el código no puede decir
// Sin propuesta enviada no hay importe que contar: si no, el total del
// pipeline infla cifras de marcas con las que aún no se ha hablado de dinero.
if (! $marca->fase_propuesta_completada) {
    $marca->valor_anual_usd = 0;
}
```

### 3.4 Una regla, un sitio

Si una regla de negocio se comprueba en dos sitios, tarde o temprano las
dos versiones dejan de coincidir. Ejemplos de cómo se resuelve aquí:

- Los permisos viven en `App\Enums\RolUsuario` y en `App\Policies\*`. La
  interfaz **nunca** compara roles: lee las banderas de `usuario.permisos`
  que ya vienen resueltas del servidor.
- Las listas cerradas (zonas, sectores, vías) viven en
  `App\Support\CatalogosDelCrm` y el frontend las pide a `/api/catalogos`.
- La fase de prospección la calcula el modelo `Marca` al guardar. La
  interfaz muestra una previsualización en vivo, pero la verdad es del
  servidor.

---

## 4. Estilo visual

### 4.1 Bento box

La interfaz del panel se compone de **cajas redondeadas** dentro de una
rejilla de doce columnas. Cada caja contiene una sola idea.

- Componente base: `componentes/comunes/TarjetaBento.tsx`
  (`<TarjetaBento>` y `<RejillaBento>`).
- Utilidades CSS: `.bento-card`, `.bento-card-interactive`,
  `.superficie-cristal`, definidas en `src/index.css`.
- **Nunca** se escribe una caja a mano con `border rounded-xl shadow`:
  se usa `<TarjetaBento>` o la clase `.bento-card`.

### 4.2 Esquinas redondeadas, siempre

El radio está configurado en `frontend/hero.ts` (`small: 0.625rem`,
`medium: 0.875rem`, `large: 1.25rem`). En los componentes de HeroUI se
pasa `radius="lg"` o `radius="full"`. Nada con esquinas vivas.

### 4.3 Tipografía

**Inter**, cargada desde Google Fonts en `index.html` y declarada como
`--font-sans` en `index.css`. Con `font-feature-settings` activado para
que las cifras y las letras respiren mejor.

### 4.4 Tema claro / oscuro persistente **por usuario**

Esto es una decisión de diseño, no un detalle:

- La preferencia se guarda **en el servidor** (columna `tema` de
  `users`), así que acompaña a la persona a cualquier ordenador.
- Se guarda **también** en `localStorage` (`tsports:tema`), y un script
  en `index.html` la aplica **antes de que React arranque**. Sin eso,
  quien usa el modo oscuro ve un destello blanco en cada recarga.
- Tres opciones: `claro`, `oscuro`, `sistema` (sigue al sistema
  operativo, escuchando `prefers-color-scheme` en vivo).
- Todo pasa por `providers/ProveedorTema.tsx`. Ningún componente toca
  la clase `dark` por su cuenta.

### 4.5 Color de perfil

Cada persona elige su color de acento. No es decorativo: sirve para
reconocer de un vistazo qué sesión está abierta.

- Se guarda en el servidor (`color_acento`) y en `localStorage`
  (`tsports:acento`).
- `theme/colorAcento.ts` convierte el hexadecimal en la rampa HSL
  completa de HeroUI (`--heroui-primary-50` … `-900`) y la escribe en
  `<html>`. Cambiar el color **retiñe toda la interfaz al instante**,
  sin recompilar Tailwind y sin volver a renderizar nada.
- El contraste del texto sobre el color se calcula con la fórmula de
  luminancia de WCAG, no a ojo.
- La paleta disponible está en `CatalogosDelCrm::COLORES_DE_ACENTO`.

> La **web pública** no usa nada de esto: tiene su propia identidad y
> sus colores salen del contenido que se edita en el panel.

### 4.6 Los efectos de la web pública

La web pública conserva el acabado del sitio original. Todo vive en
`hooks/useEfectosDeScroll.ts` y no se reimplementa por pantalla:

- `useCabeceraSolida` → la cabecera va translúcida sobre la portada y se
  vuelve sólida al bajar.
- `useContadorAnimado` → las cifras suben desde cero al entrar en
  pantalla, conservando el sufijo (`20+`, `100%`).
- `useRevelarAlEntrar` → las secciones aparecen al hacer scroll, con un
  único observador para todas.
- `useParallax` → el fondo de la franja central se mueve más despacio
  que la página.

Los cuatro respetan `prefers-reduced-motion`. La marquesina de aliados y
el anclaje del carrusel del equipo son CSS puro (`index.css`).

> **Aviso al verificar:** estos efectos dependen de
> `IntersectionObserver` y `requestAnimationFrame`, y el navegador los
> **suspende en pestañas ocultas**. Si se comprueban con herramientas
> automáticas sin panel visible, no se dispararán: no es un fallo.

---

## 5. Estructura del repositorio

```
tsports/
├── CLAUDE.md              ← este fichero
├── README.md              ← cómo instalar y desplegar
├── backend/               ← API Laravel
│   ├── app/
│   │   ├── Console/Commands/   ImportarDesdeSupabase.php
│   │   ├── Enums/              RolUsuario, TemaInterfaz, OrigenMarca…
│   │   ├── Http/
│   │   │   ├── Controllers/Api/
│   │   │   ├── Middleware/     ForzarRespuestaJson
│   │   │   ├── Requests/       validación de formularios
│   │   │   └── Resources/      cómo se ve cada modelo desde el cliente
│   │   ├── Models/             User, Marca, ComentarioMarca,
│   │   │                       Propiedad, PropiedadDeMarca, Campana…
│   │   ├── Policies/           quién puede hacer qué
│   │   └── Support/            catálogos y contenido de fábrica
│   ├── database/migrations/
│   ├── database/seeders/       DatabaseSeeder, PropiedadesIopSeeder
│   ├── tests/Feature/          reglas de negocio y permisos
│   └── routes/api.php     ← el mapa completo de la API
├── frontend/              ← SPA React
│   ├── hero.ts            ← tema base de HeroUI
│   └── src/
│       ├── api/           ← única capa que habla con el servidor
│       ├── componentes/
│       │   ├── comunes/   ← TarjetaBento, CampoDeImagen, BarraDeProporcion…
│       │   ├── crm/       ← tarjeta de marca, ficha, bitácora,
│       │   │                checklist de propiedades
│       │   └── layout/    ← barra lateral y superior
│       ├── hooks/         ← useMarcas, usePropiedades, useCampanas,
│       │                    useCatalogos, useEfectosDeScroll
│       ├── paginas/       ← una por ruta
│       ├── providers/     ← tema, sesión, caché de datos
│       ├── theme/         ← conversión del color de acento
│       ├── tipos/         ← los tipos de la API, en un solo fichero
│       └── utilidades/    ← formato de dinero y fechas, avisos
└── deploy/                ← nginx y guion de despliegue del VPS
```

---

## 6. Reglas de negocio que no se tocan

Salieron del cliente y están implementadas a propósito así:

1. **Las tres fases son independientes.** Una marca puede tener
   propuesta enviada sin haber cerrado la prospección. No es un embudo
   secuencial y no se debe convertir en uno.

2. **La prospección se calcula sola.** Está completa cuando la marca
   tiene nombre, logo, persona de contacto, cargo y correo. No hay
   ningún camino para marcarla a mano — ni por la interfaz ni por la
   API. Así el indicador no puede mentir.

3. **Aproximación exige vía**; **propuesta exige descripción.** Marcar
   la casilla sin ese dato se rechaza en el servidor.

4. **El valor solo cuenta con propuesta enviada.** Sin propuesta, el
   importe se guarda a cero.

5. **Los leads de la web nacen sin dueño**, y el primero del equipo que
   los trabaja se los queda ("adopción"). En la versión de Supabase esto
   fallaba en silencio y fue el error más caro de depurar.

6. **Roles:**
   - `admin` → todo: cuentas, web y marcas.
   - `comercial` → todas las marcas; asigna vendedores.
   - `vendedor` → ve todas las marcas, edita solo las suyas, no borra.

7. **Nadie cambia su propio rol ni su propia zona.** Ni un admin. Si el
   único administrador se rebajase, no quedaría nadie capaz de dar
   permisos.

8. **Un producto IOP tiene tres montos y solo uno se escribe dos veces.**
   Una propiedad (Comité Olímpico, Dvo. Táchira, Kombat Challenge…) se
   carga entera, sin sub-propiedades:

   | Monto | Dónde vive | Quién lo pone |
   |---|---|---|
   | **MTP** — monto total de la propiedad | `propiedades.monto_total_usd` | Admin o comercial |
   | **Forecast** — meta de venta, el 20 % del MTP | **no es columna**: lo calcula `Propiedad::forecastDeVenta()` | nadie, se deriva |
   | **OVP** — pronóstico del vendedor para UNA marca | `propiedades_de_marca.ovp_usd` | El vendedor, desde la ficha |

   El porcentaje que se pinta en la barra (OVP ÷ MTP) **tampoco se
   guarda**. Si se guardara, corregir el MTP de una propiedad dejaría
   desactualizadas todas sus líneas y el tablero enseñaría porcentajes
   falsos. El `20 %` es el reparto por defecto
   (`Propiedad::PORCENTAJE_FORECAST_POR_DEFECTO`) y es editable por
   propiedad, porque es un acuerdo, no una ley.

9. **El checklist de propiedades NO completa la prospección.** Va dentro
   de esa fase porque es el trabajo que se hace ahí, pero la fase sigue
   dependiendo solo de los cinco datos de la regla 2. Mezclarlos haría
   que el indicador dejase de significar lo que el equipo cree.

10. **Una propiedad la ofrece quien la tiene asignada.** O está abierta a
    todo el equipo (`asignada_a_todos`), o solo la trabajan las personas
    de `prospectores_de_propiedad`. Añadir a una ficha una propiedad
    ajena se rechaza en el servidor; quitar o corregir una que ya estaba
    puesta lo puede hacer cualquiera que pueda editar la marca (si no,
    reasignar una propiedad dejaría fichas bloqueadas para siempre).

11. **El pronóstico de una marca se le apunta a su vendedor asignado**,
    no a quien escribió la cifra. Así, al reasignar una marca, su
    pronóstico se va con ella.

12. **Borrar una campaña no borra sus marcas**: se quedan sin campaña.
    Borrar una propiedad sí se lleva sus líneas del checklist, y por eso
    la interfaz ofrece antes desactivarla.

13. **Cada asignación de campaña deja un evento en el historial.** Al
    asignar una campaña hay que decir QUÉ DÍA se hace la acción, y eso
    crea una fila en `eventos_de_campana`. Esa tabla —no las columnas de
    `marcas`— es la que alimenta el calendario, porque es la única que
    permite que una marca tenga varias acciones en fechas distintas.
    El nombre y el color de la campaña se COPIAN dentro del evento a
    propósito: si la campaña se renombra o se borra, el historial tiene
    que seguir diciendo lo que de verdad pasó. Guardar la ficha sin
    cambiar campaña ni fecha no repite la línea.

14. **Las fechas sin hora se construyen como fecha local.** Una cadena
    "2026-09-20" la interpreta el navegador como medianoche UTC, y en
    Venezuela (UTC-4) se ve como el 19. `utilidades/formato.ts` las
    detecta y las arma a mano; no usar `new Date(cadena)` con fechas de
    solo día.

---

## 7. Errores: una sola forma

Toda respuesta de error de `/api` sale con la misma estructura, definida
en `backend/bootstrap/app.php`:

```json
{ "mensaje": "texto listo para enseñar", "errores": { "campo": ["motivo"] } }
```

En el cliente, `api/clienteHttp.ts` lo convierte en un `ErrorDeApi` con
un `mensaje` siempre legible. Las pantallas usan
`avisarDeError(error)` de `utilidades/avisos.ts` y **nunca** componen
mensajes de error a mano.

> Un error frecuente que este diseño previene: en Supabase, cuando una
> política filtraba una fila, el `update` afectaba a cero filas y
> respondía "correcto". La interfaz cantaba "Guardado ✔" sin haber
> guardado nada. Aquí un permiso insuficiente es un **403 explícito**.

---

## 8. Cómo trabajar en local

```bash
cd backend && php artisan serve
```

```bash
cd frontend && npm run dev
```

Vite redirige `/api` al Laravel local, así que el navegador ve un único
origen y no hay problemas de CORS.

Antes de dar nada por terminado:

```bash
cd frontend && npm run build
```

El `build` incluye la comprobación de tipos. Si no compila, no está
terminado.

Y las pruebas del backend, que corren sobre SQLite en memoria y **no
tocan la base de datos de trabajo**:

```bash
cd backend && php artisan test
```

Ahí están escritas las reglas de negocio de la sección 6: si alguna se
tuerce, se pone roja una prueba con nombre propio.

**Datos de prueba** (solo fuera de producción, los siembra
`php artisan db:seed`): `admin@tssports.com`, `comercial@tssports.com`,
`vendedor.caracas@tssports.com`, `vendedor.oriente@tssports.com`.
Contraseña de los tres últimos: `demo12345`.

En local el backend usa **SQLite** por comodidad (`backend/.env`). En el
VPS usa **MySQL**: la plantilla es `backend/.env.example`.

---

## 9. Cosas que NO se hacen en este repositorio

- Escribir una caja redondeada a mano en vez de usar `<TarjetaBento>`.
- Comparar roles en el frontend (`usuario.rol === 'admin'`). Se usan las
  banderas de `usuario.permisos`.
- Duplicar una lista de zonas o sectores en el cliente.
- Guardar en una columna la meta de una propiedad o el porcentaje del
  pronóstico: los dos se derivan del MTP al leer.
- Calcular en el navegador un porcentaje que el servidor ya devuelve.
- Tocar la clase `dark` fuera de `ProveedorTema`.
- Poner textos de la web pública en el código: van en el CMS.
- Dejar un fichero sin cabecera explicativa.
- Actualizar HeroUI a la v3 sin migrar todo el código a la vez.
