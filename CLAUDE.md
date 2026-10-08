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
| **Administrador de la web** | Cambiar textos, fotos, colores y secciones sin tocar código, y en «Catálogo web» qué propiedades ven los clientes. | Admin y comerciales |
| **Cierre de mes** | Los reportes que el comercial sube al acabar cada mes, agrupados por mes. | Admin y comerciales |

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
| Reportes en Excel | write-excel-file | 4.x |
| Avisos al móvil | minishlink/web-push | 11.x |

> **El escritor de .xlsx se carga solo al descargar.** Se pide con
> `import()` dentro de `utilidades/excelDeCampanas.ts` y tiene su propio
> paquete declarado en `vite.config.ts` (`vendor-excel`). Sin esa línea
> acabaría dentro de `vendor`, que se descarga siempre al entrar.

> **La aplicación instalable no trae ninguna dependencia.** El
> manifiesto, el service worker (`frontend/sw/servicio.js`) y la pieza
> de Vite que lo rellena (`frontend/plugins/`) están escritos a mano. El
> complemento habitual de PWA está pensado para versiones anteriores de
> Vite y este proyecto va con Vite 8 sobre rolldown: sale más a cuenta
> mantener estas líneas que perseguir la incompatibilidad en cada
> actualización. Ver la regla 18.

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
- Las listas cerradas (zonas y vías) viven en
  `App\Support\CatalogosDelCrm` y el frontend las pide a `/api/catalogos`.
  Los **sectores** ya NO: desde el 2026-09-08 son una tabla que el equipo
  gestiona desde el panel (regla 15). `/api/catalogos` los sigue
  sirviendo, así que ningún selector cambió; lo que cambió es de dónde
  salen. `CatalogosDelCrm::SECTORES_INICIALES` es solo la semilla, no se
  usa para validar.
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
- Se guarda **también** en `localStorage` (`tsports:tema`), y
  `public/tema-inicial.js`, que `index.html` carga en el `<head>`, la
  aplica **antes de que React arranque**. Sin eso, quien usa el modo
  oscuro ve un destello blanco en cada recarga. Va en un fichero y no
  escrito en la página por la CSP (regla 25).
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

> **`useRevelarAlEntrar` apunta los elementos aunque el observador no
> exista todavía.** React llama a las referencias antes que a los
> efectos, y con la sesión del panel abierta el contenido de la web sale
> de la copia guardada y se pinta en el primer render. Hasta el
> 2026-10-01 esos elementos no se vigilaban nunca y servicios y
> proyectos salían en blanco **solo en producción**: en desarrollo,
> `StrictMode` vuelve a enganchar las referencias y tapa el fallo. Un
> cambio en ese hook se comprueba con el build (`frontend-compilado`).

> **Aviso al verificar:** estos efectos dependen de
> `IntersectionObserver` y `requestAnimationFrame`, y el navegador los
> **suspende en pestañas ocultas**. Si se comprueban con herramientas
> automáticas sin panel visible, no se dispararán: no es un fallo.

### 4.7 La barra de desplazamiento se ve, también en el Mac

Con el trackpad, el Mac esconde la barra de scroll mientras no se
desplaza (y Edge y Firefox en Windows 11 también), y dentro de un modal
eso deja sin pista de que hay más formulario debajo. Dos piezas lo
resuelven:

- En todo el panel, con ratón o trackpad, `index.css` pinta una barra
  propia (`::-webkit-scrollbar`), la única que Chrome, Edge y Safari no
  esconden. Por eso **no** se ponen `scrollbar-width` ni
  `scrollbar-color` a todo: desde Chrome 121, con cualquiera de las dos
  el navegador ignora la barra propia.
- Las ventanas de alta y edición (marca con su bitácora, propiedad,
  campaña, cuenta) tienen la barra vertical **siempre** a la vista,
  quepa o no el formulario, también en Firefox, donde ningún CSS la
  obliga, y en pantallas táctiles. Ojo al comprobarlo: el modo
  dispositivo de las DevTools («Responsive») simula un teléfono táctil,
  así que lo que depende de `pointer`/`any-pointer` se ve ahí como en
  un móvil, no como en el portátil. Ahí la dibuja `componentes/comunes/BarraDeScrollDibujada.tsx`,
  y la zona que se desplaza lleva `barra-de-scroll-fija`, que esconde la
  del sistema para que no salgan dos. Una ventana de formulario nueva
  lleva las dos piezas:

  ```tsx
  const cuerpoDelModal = useRef<HTMLDivElement>(null);

  <Modal classNames={{ body: "barra-de-scroll-fija" }} scrollBehavior="inside" …>
    <ModalContent>
      <ModalHeader>…</ModalHeader>
      <ModalBody ref={cuerpoDelModal}>…</ModalBody>
      <BarraDeScrollDibujada zona={cuerpoDelModal} />
      <ModalFooter>…</ModalFooter>
    </ModalContent>
  </Modal>
  ```

### 4.8 Las pantallas largas van por partes

Desde el 2026-10-06 el resumen de la dirección va en cinco partes, cada
una con su título y la pregunta que contesta, y un índice arriba para
saltar a cada una (`componentes/comunes/SeccionDePantalla.tsx`): «Lo de
hoy», «El pipeline», «Lo que se espera vender», «El equipo» y «Dónde está
el negocio». Antes eran diez cifras y once cajas seguidas, y el equipo lo
encontraba denso y sin saber qué era cada cosa.

- Una caja nueva del resumen entra en la parte cuya pregunta contesta,
  no al final.
- Si una caja no se entiende solo con su título (una barra con una raya,
  un tramo gris), lleva `ayuda` en `<TarjetaBento>`: un «?» que explica
  cómo se lee. Es un Popover y no un Tooltip, para que funcione con el
  dedo.
- La sección no es una caja: el título va suelto sobre el fondo y las
  cajas debajo (sin caja dentro de caja).

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
│   │   ├── Observers/          ObservadorDeCambiosEnVivo (regla 22)
│   │   ├── Policies/           quién puede hacer qué
│   │   └── Support/            catálogos, contenido de fábrica y
│   │                           GuardadoDeArchivos (la puerta de los ficheros)
│   ├── database/migrations/
│   ├── database/seeders/       DatabaseSeeder, PropiedadesIopSeeder
│   ├── tests/Feature/          reglas de negocio y permisos
│   └── routes/api.php     ← el mapa completo de la API
├── frontend/              ← SPA React
│   ├── hero.ts            ← tema base de HeroUI
│   ├── plugins/           ← piezas propias de Vite (emite dist/sw.js)
│   ├── public/            ← manifiesto e iconos de la aplicación
│   ├── sw/                ← el service worker, escrito a mano
│   └── src/
│       ├── api/           ← única capa que habla con el servidor
│       ├── componentes/
│       │   ├── chat/      ← burbuja y ventana flotante, charla, emoji,
│       │   │                grupos (la página es paginas/PaginaChat)
│       │   ├── comunes/   ← TarjetaBento, CampoDeImagen, BarraDeProporcion,
│       │   │                VisorDeGaleria…
│       │   ├── crm/       ← tarjeta de marca, ficha, bitácora,
│       │   │                checklist y galería de propiedades
│       │   └── layout/    ← barra lateral y superior
│       ├── hooks/         ← useMarcas, usePropiedades, useCampanas,
│       │                    useCatalogos, useRecordatorios, useEfectosDeScroll
│       ├── paginas/       ← una por ruta
│       ├── providers/     ← tema, sesión, caché de datos, tiempo real
│       │                    y cambios en vivo
│       ├── theme/         ← conversión del color de acento
│       ├── tipos/         ← los tipos de la API, en un solo fichero
│       └── utilidades/    ← formato de dinero y fechas, avisos, los
│                            documentos para imprimir (bitácora, brochure)
└── deploy/                ← nginx, topes de PHP y guion de despliegue del VPS
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

5. **Los leads de la web nacen sin dueño**, y quien los alcanza y los
   trabaja se los queda ("adopción"). Desde el 2026-09-08 un agente ya
   no los alcanza —solo ve lo asignado—, así que en la práctica los
   reparte el comercial; la adopción sigue viva para quien sí los ve. En
   la versión de Supabase esto fallaba en silencio y fue el error más
   caro de depurar.

6. **Roles:**
   - `admin` → todo: cuentas, web y marcas. Es el único que ve
     **Equipo, Auditoría y Tiempo real**.
   - `comercial` → todas las marcas; asigna vendedores. Desde el
     2026-10-01 no ve la pantalla de Equipo (la veía sin poder tocar
     nada); la lista del equipo para repartir marcas le sigue llegando
     por `/api/usuarios`.
   - `vendedor` (en pantalla, AGENTE) → **ve y edita solo las marcas que
     tiene asignadas**, y no borra. Hasta el 2026-09-08 las veía todas;
     se cambió a petición del equipo, con el argumento de que quien
     reparte es el comercial. El corte lo hace el servidor: las marcas
     ajenas no salen en la respuesta, ni por el listado ni por la ficha.
   - "Suya" se decide **por el id** del vendedor asignado y nunca por su
     nombre. El nombre se repite entre personas y además se puede editar;
     usarlo para dar acceso abriría la cartera de una a la otra. El
     filtro por agente del tablero sí busca además por nombre, pero eso
     es una comodidad de búsqueda para quien ya lo ve todo, no un
     permiso.

7. **Nadie cambia su propio rol ni su propia zona.** Ni un admin. Si el
   único administrador se rebajase, no quedaría nadie capaz de dar
   permisos.

   **Una cuenta desactivada se queda fuera al momento**, también con la
   pestaña que ya tenía abierta: desactivarla borra sus tokens, y
   `AppServiceProvider` no acepta el token de una cuenta inactiva
   (401, que en el panel cierra la sesión). Hasta el 2026-10-01 solo se
   le impedía volver a entrar, y el reporte de bitácora, el chat y los
   avisos le seguían respondiendo: no todas las rutas tienen política.

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

   **En qué marcas está el OVP** lo contesta Reportes › «Pronóstico por
   marca» (desde el 2026-10-01): el mismo dinero por marca y por
   propiedad, cada quien de las marcas que ve. Su total tiene que
   cuadrar con «Pronosticado por el equipo» de Propiedades, que suma
   todas las líneas, también las de propiedades desactivadas.

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

    **Una marca TIENE una campaña si la tiene puesta o si la tuvo alguna
    vez.** Desde el 2026-10-01, a petición del equipo: lo que importa es
    a cuántas marcas llegó cada campaña, sea cuando sea. Sale de
    `marcas.campana_id` **y** del historial a la vez
    (`Marca::campanasQueHaTenido`), y de ahí cuentan la pantalla de
    campañas, el reparto del resumen y el filtro del tablero, así que la
    cifra y su lista coinciden. Una sola cifra: la de «ahora» se quitó.
    «Sin campaña» son las que no han tenido ninguna nunca. El IMPORTE sí
    sale solo de la casilla, o una marca que pasó por tres campañas
    sumaría su valor tres veces.

14. **Los listados largos se recorren con scroll infinito.** El tablero
    de marcas y el historial de auditoría vienen paginados del servidor
    (60 y 50 por página) y la interfaz va pidiendo la siguiente al
    llegar al final, con `useScrollInfinito`. No se pone un paginador:
    el equipo recorre el tablero desplazándose.

    El orden de `/api/marcas` lleva **desempate por `id`** y no es
    cosmético: ninguno de los criterios que ofrece el selector es único
    —hay marcas con el mismo valor, el mismo nombre y la misma fecha de
    creación—, y sin desempate la base de datos puede devolverlas en
    distinto orden en cada página, con lo que el recorrido repetiría
    unas y se saltaría otras sin dar ningún error.

15. **Los sectores son un catálogo editable**, no una lista del código.
    La marca guarda el sector como TEXTO (`marcas.sector`), no por
    relación, y de ahí salen las dos reglas que protege
    `SectorController`:

    - **Renombrar arrastra a sus marcas**, en una transacción. Si no,
      las marcas de ese rubro apuntarían a un nombre que ya no está en
      el catálogo y desaparecerían del reparto por sector del resumen.
    - **Un sector en uso no se borra**: se desactiva. Desactivado sale
      del selector pero las marcas que ya lo llevan lo conservan, y por
      eso la validación de la marca admite TODOS los sectores y no solo
      los activos (si no, editarle el teléfono a una de esas marcas
      fallaría por un campo que nadie tocó).

    **«Dinero por sector»** (desde el 2026-10-07, pedido por LinZ) es la
    suma del valor de las propuestas enviadas de cada rubro: la misma
    cuenta que el reparto por sector del resumen (regla 4). La pantalla
    lleva además la fila «Sin sector» (sin sector o con uno que no está
    en el catálogo, y dice cuáles) y el total, que es el valor propuesto
    del resumen: la columna tiene que cuadrar. Lo suma `SectorController`
    y solo para quien ve las cifras de toda la empresa; a un agente no le
    llega (`valorPropuestoUsd` null).

    Al lado va el **pronóstico** (desde el 2026-10-08, pedido por LinZ):
    la suma del OVP de las líneas del checklist de las marcas de cada
    sector (`pronosticoUsd`), en su propia consulta agrupada (con un JOIN
    a la de arriba, cada marca contaría una vez por propiedad). Su total
    es el `ovpPronosticado` del resumen y el «Pronosticado por el equipo»
    de Propiedades: todas las líneas, también las de propiedades
    desactivadas (regla 8). Se añadió porque en producción ninguna
    propuesta llevaba valor y la primera columna salía entera a cero.

    **«Campañas por sector»** (desde el 2026-10-08, pedido por LinZ con
    un boceto): en cada fila de Sectores, una tarta por semana del mes con
    las acciones de campaña de ese rubro (`eventos_de_campana`, regla 13,
    con el nombre y el color copiados en el evento). Lo arma
    `CampanasPorSectorController` (`/api/sectores/campanas?mes=AAAA-MM`):
    las semanas son las del calendario, de lunes a domingo, recortadas al
    mes, y el mes y sus vecinos los pone el servidor (regla 16). El sector
    es el que la marca tiene hoy; lo que no está en el catálogo va a «Sin
    sector». Cada quien cuenta lo de las marcas que ve (regla 6).

    **Los campos de dinero no llevan `step`** (desde el 2026-10-08): en el
    `NumberInput` de HeroUI, `step` redondea lo escrito al múltiplo más
    cercano al salir del campo, y el valor de la propuesta y el OVP se
    guardaban de 500 en 500 y de 100 en 100.

16. **Las fechas sin hora se construyen como fecha local.** Una cadena
    "2026-09-20" la interpreta el navegador como medianoche UTC, y en
    Venezuela (UTC-4) se ve como el 19. `utilidades/formato.ts` las
    detecta y las arma a mano; no usar `new Date(cadena)` con fechas de
    solo día.

    **El sistema entero va en hora de Venezuela** (desde el 2026-10-05):
    `APP_TIMEZONE=America/Caracas` y la conexión con la base en
    `DB_TIMEZONE=-04:00`. Así `now()` y `today()` ya son los de Caracas
    y no hay que convertir nada a mano. Hasta ese día `config/app.php`
    tenía `'UTC'` escrito y no leía el `.env`: desde las 20:00 el
    calendario marcaba el día siguiente como «hoy». **Las dos se cambian
    juntas o ninguna**: las columnas de hora son TIMESTAMP (la base las
    guarda en UTC y las convierte a la zona de la conexión), y con una
    sola cambiada todo lo guardado se correría cuatro horas
    (`HoraDeVenezuelaTest`). El VPS y MariaDB siguen en UTC; no cambiarles
    la zona.

17. **Los avisos se guardan antes de empujarse.** Toda notificación la
    crea `App\Support\Notificador` y es una fila en `notificaciones`;
    el WebSocket solo la adelanta a quien tenga el panel abierto y el
    push solo la lleva al móvil de quien lo tenga cerrado. Si Reverb
    está caído, o no hay trabajador de colas, la petición sale bien y
    el aviso espera en la campanita. **La fila es el aviso; los demás
    canales son salidas.** A quién le toca cada uno:

    - **Lead de la web** → a quien ve todas las marcas (hoy admin y
      comercial), por permiso del rol. Nunca al agente: no ve los leads
      sin dueño, y el aviso le filtraría el nombre de la empresa.
    - **Te asignaron una marca** → al agente nuevo, venga del camino que
      venga (alta, ficha o selector del tablero). No se avisa si el
      agente no cambió, si se quitó, ni a quien se la asigna a sí mismo.
    - **Comentario en la bitácora** (entrada o respuesta, desde el
      2026-09-30) → a los administradores, de todas las marcas (solo el
      rol admin: `recibeAvisoDeCadaComentario`; el comercial no, se
      decidió así), y a quien lleva esa marca. Nunca a quien lo escribió,
      y a quien además etiquetaron le llega un solo aviso: el de la
      mención. Editar no vuelve a avisar.
    - **Recordatorios del día** (desde el 2026-10-05) → a cada persona,
      a las 08:00 de Caracas, UN aviso con todos los suyos de hoy (regla
      27). Es el único aviso que no nace de algo que hizo alguien.

    Cada quien lee y marca solo SUS avisos; ni un admin los de otro.

    En el panel, un aviso nuevo **suena** («ding») cuando sube el número
    de la campanita —no al llegar el evento, para que suene igual en vivo
    que por la consulta de cada minuto— y un mensaje del chat hace «pop».
    Los dos salen de `utilidades/sonidos.ts`, generados con Web Audio (sin
    ficheros), solo con la pestaña a la vista (escondida ya suena la
    notificación del sistema) y se apagan por dispositivo desde el menú de
    la cuenta.

    El push va **en cola** y el empuje en vivo **no**, y no es un
    descuido: el WebSocket es un mensaje a un proceso de esta misma
    máquina, y cada push es una petición de red al servidor de Google o
    de Apple, una por dispositivo. Sin claves VAPID no se encola nada.

    Y un dispositivo pertenece a **quien lo está usando**: el endpoint
    del navegador lleva índice único y el alta reasigna, de modo que en
    un ordenador compartido al siguiente que entre no le suenan los
    avisos del anterior.

18. **El panel se instala y se consulta sin conexión, pero nunca se
    escribe sin conexión.** Son tres piezas y cada una tiene su regla:

    - **El service worker guarda el armazón, JAMÁS `/api`.** Una caché
      de red no sabe de quién son los datos, y la lista de marcas no es
      igual para todos (regla 6): guardada por dirección, dos personas
      en el mismo ordenador se verían los datos. Tampoco sabe cuándo
      caducan ni puede decir de cuándo son.
    - **La copia de datos la lleva la aplicación**, en
      `ProveedorDatosGuardados`: con el id de la persona en la clave, se
      borra al cerrar sesión, caduca a los 7 días y sabe de cuándo son
      los datos —de la última vez que hablaron con el servidor, no de
      cuándo se escribió el fichero—. Eso es lo que enseña el indicador
      de la barra superior.
    - **Un error no tapa lo que ya hay en pantalla.** Se decide en un
      solo sitio, `utilidades/consultas.ts`: si la consulta tiene datos,
      un refresco fallido no la sustituye por «no se pudieron cargar».
      Sin esta regla la consulta sin conexión no sirve de nada, porque
      la pantalla se vacía a los pocos segundos de abrirla.

    Una consulta puede quedarse fuera de la copia con
    `meta: { sinCopiaLocal: true }`: la llevan el chat, el reporte de
    bitácora y la configuración del tiempo real. Esta última, además, se
    pide siempre al arrancar: restaurada de la copia, el «apagado» de antes
    de encender Reverb en producción dejó el panel sin tiempo real, y con
    `staleTime: Infinity` no se volvía a preguntar nunca.

    Y una cuarta que las sostiene: **solo un 401 cierra la sesión**. Que
    el servidor no conteste —sin cobertura, nginx devolviendo 502
    mientras Laravel reinicia— no es un token inválido, y tratarlo como
    tal dejaba al equipo sin poder mirar nada fuera de la oficina.

    La versión nueva **no entra sola**: se instala, espera y se avisa.
    Cambiar los ficheros por debajo de una pestaña abierta le rompe la
    navegación a quien esté a mitad de un formulario.

19. **La bitácora es un registro, y por eso no se puede reescribir a
    la ligera.** Tres reglas que se sostienen entre sí:

    - **Borrar deja el hueco.** Una entrada eliminada sigue saliendo,
      sin texto y diciendo quién la quitó y cuándo. En cuanto el
      histórico se exporta, un registro del que se pueden retirar
      entradas sin rastro deja de valer como registro.
    - **Nadie edita lo de otro**, ni un administrador. Eliminar sí
      puede, y eso queda escrito. Lo editado se marca como editado:
      sin esa marca, corregir una frase a los tres meses deja el hilo
      diciendo algo que nadie dijo ese día.
    - **Un solo nivel de respuestas.** Se responde a una entrada, nunca
      a una respuesta.

    **A quién se puede etiquetar sale de los permisos sobre la marca**
    (`App\Support\QuienPuedeVerLaMarca`, que pregunta a
    `MarcaPolicy::view`), nunca de la lista del equipo. Un agente solo ve
    lo suyo (regla 6) y el aviso de una mención lleva dentro el nombre
    de la marca: etiquetarlo en una ajena se lo filtraría. Se comprueba
    dos veces —al servir el selector y al guardar—, porque el selector se
    salta escribiendo la petición a mano.

    **Exportar queda anotado en `RegistroActividad`.** Sacar la bitácora
    de una marca es sacar del sistema toda la relación comercial con
    ella; el histórico completo es el de la agencia entera, y ese solo
    lo saca el administrador.

    El **reporte por fechas** (`/reportes/bitacora`, desde el
    2026-09-25) es la misma bitácora cortada por días y agrupada por
    marca. **Sin marcas elegidas son todas las que ve quien lo pide**: la
    agencia entera para admin y comercial, su cartera para un agente.
    Hasta el 2026-10-01 eso era solo del administrador y los demás tenían
    que elegir las marcas una a una (con quinientas, quinientos clics).
    Con marcas, quien pueda ver cada una, y una ajena rechaza la petición
    entera. El histórico completo de una vez sigue siendo solo del
    administrador. Un día es un día **de quien mira**: el navegador manda
    su zona horaria, porque lo comentado a las nueve de la noche en
    Caracas ya es mañana en UTC.

20. **El chat es entre personas, y lo de una charla es de quien está
    dentro.** Desde el 2026-09-25. Uno a uno y en grupo; nunca un hilo
    por marca, que eso es la bitácora.

    - **Ni un administrador lee las charlas de otros**
      (`ConversacionPolicy`), igual que no lee sus avisos. En un grupo,
      cualquiera de dentro lo cambia (nombre, quién está) y cada cambio
      deja una línea en la charla.
    - **Con una persona hay UNA charla directa**: `clave_directa` lleva
      los dos ids ordenados con índice único.
    - **Todo mensaje lo escribe `App\Support\Mensajeria`**, en el orden de
      la regla 17: guardar, empujar en vivo, encolar el push. Sin Reverb
      el chat funciona igual: el navegador pregunta cada pocos segundos.
    - **Solo se etiquetan marcas que uno puede ver**, y se comprueba al
      guardar. Quien recibe una que no ve, recibe el nombre copiado al
      escribir y nada más —ni logo, ni enlace—; el mensaje se arma para
      cada persona que lo lee (`RecursoMensajeDeChat`). Por eso el aviso
      en vivo (`CambioEnElChat`) no lleva el mensaje, solo de qué charla es.
    - **«En línea» es tener el panel A LA VISTA**, no abierto: lo apunta
      el latido (`App\Support\Presencia`) y caduca solo. Y decide el push:
      a quien está en línea no le suena el teléfono, ya lo ve en pantalla.
      La lista del chat enseña **al equipo entero**, con quién está y
      desde cuándo no está el resto; nunca solo a quien está, que con
      nadie conectado dejaba la pantalla sin decir nada.
    - **Los mensajes llevan id numérico, no UUID**: ordena sin empates y
      sirve de cursor para pedir «lo nuevo desde el 1532» (la misma
      trampa que resuelve el desempate de la regla 14).
    - El chat se queda **fuera de la copia sin conexión**
      (`meta: { sinCopiaLocal: true }`, ver regla 18): se refresca cada
      pocos segundos y reescribiría la copia entera en cada vuelta.

21. **Los ficheros entran por una sola puerta, y lo de la bitácora no es
    público.** Desde el 2026-09-29, con la galería de propiedades y los
    adjuntos.

    - **Todo fichero lo guarda `App\Support\GuardadoDeArchivos`**, que
      decide por propósito el disco, los formatos y el tope, y mira el
      tipo en el **contenido** del fichero (`finfo`); el nombre y lo que
      diga el navegador no cuentan. Galería y bitácora admiten fotos y PDF hasta
      20 MB; logos, fotos de la web y avatares siguen en 5 MB. **Ningún
      propósito admite SVG**: lleva código dentro y, servido desde
      /storage, se abre en el mismo origen que la sesión del panel (un
      agente le pasaría a un administrador el enlace de un «logo»). El
      cierre de mes (regla 24) admite además Excel, Word y PowerPoint;
      un Office moderno que `finfo` ve como ZIP a secas se reconoce por
      las piezas que lleva dentro, nunca por la extensión.
    - **Los adjuntos de la bitácora y los cierres de mes van en el disco
      privado** y se abren con un enlace firmado que caduca en uno o dos
      días (`ArchivoMedia::enlaceFirmado`, por `/api/adjuntos/{archivo}`,
      que solo sirve `PROPOSITOS_PRIVADOS`). La bitácora es la relación
      comercial con una marca: servida por `/storage`, cualquiera con la
      dirección la vería para siempre. El fichero sube antes que la
      entrada (para enseñar el progreso) y lo que nadie publica se borra
      solo a las 48 h. Lo adjuntado no se cambia al editar: si sobra, se
      elimina la entrada, que deja el hueco de la regla 19.
    - **La web pública solo enseña lo que se publicó**: propiedad activa
      **y** con «Publicar en la web», y de ella solo las fotos que no se
      dejaron «solo para el equipo». Nunca un PDF ni un monto: el recurso
      público (`RecursoPropiedadEnLaWeb`) nombra uno a uno los campos que
      salen, así que un campo nuevo en la propiedad no se publica solo.
    - **Un lead que pregunta por una propiedad entra con ella en su
      checklist** (OVP a 0) y el aviso de la regla 17 dice cuál es.
    - **La miniatura la hace el navegador** y sube con el original; si
      llega rota se descarta y se enseña el original.
    - **Tres topes que se mueven juntos**: Laravel (20 MB), PHP
      (`deploy/php-tsports.ini`) y nginx (`client_max_body_size`). Si se
      sube uno solo, el que se queda corto corta la petición sin mensaje
      y parece un fallo del sistema.

22. **Las pantallas se ponen al día solas, y el aviso no lleva datos.**
    Desde el 2026-09-30, por el mismo WebSocket de la regla 17. Cuando
    alguien cambia una marca, su bitácora, una propiedad, una campaña,
    un sector o una cuenta, a los demás se les refresca lo que tengan en
    pantalla: tablero, resumen, calendario, ficha abierta, auditoría.

    - **El aviso solo dice qué cambió** (`{entidad: 'marca', id}`,
      evento `.datos`). Cada navegador vuelve a pedirlo con su sesión,
      como el chat (regla 20): así el servidor sigue decidiendo qué ve
      cada quien.
    - **Lo de una marca solo le llega a quien puede verla**
      (`MarcaPolicy::view`, regla 6); si cambió de agente, también al
      anterior, para que desaparezca de su tablero. Lo del catálogo, a
      todo el equipo. Lo de los cierres de mes, solo a admin y comercial.
    - **Lo anota ObservadorDeCambiosEnVivo** al guardarse cada modelo,
      así ningún camino se queda fuera, y `App\Support\CambiosEnVivo`
      lo envía **una vez por petición**, al terminar y con la respuesta
      ya entregada (en la cola, al acabar cada trabajo). Un modelo nuevo que se vea en el panel se añade a
      la lista de AppServiceProvider.
    - **La pestaña que hizo el cambio no lo recibe** (`X-Socket-ID`): ya
      refresca lo suyo al guardar.
    - En el navegador, `ProveedorCambiosEnVivo` junta los avisos que
      llegan seguidos y solo se piden otra vez las consultas que están
      en pantalla. **Al volver de un corte se refresca todo una vez**:
      lo que llegó durante el corte se perdió.
    - **Con la conexión en vivo, volver a la pestaña no refresca nada**
      (ProveedorConsultas). Sin Reverb todo funciona como antes: al
      entrar en cada pantalla y al volver a la pestaña.
    - **El formulario de una ficha abierta no se reescribe** con lo que
      llega: se rellena una vez al abrirla. Se pone al día lo que se
      enseña alrededor (bitácora, historial de campañas, el tablero de
      detrás).

    Lo único que sigue preguntando cada cierto tiempo con la conexión
    en vivo es el latido del chat («en línea», regla 20), la búsqueda de
    versión nueva (cada 30 minutos) y la pantalla «Tiempo real» del
    administrador mientras está abierta.

23. **El catálogo de la web tiene puerta, y lo que sale del catálogo
    sale siempre con las reglas de la 21.** Desde el 2026-09-30.

    - **Se entra con UN usuario y UNA contraseña de invitado**
      (`AccesoDeInvitados`, una sola fila), que la agencia le pasa a cada
      cliente. **No es una cuenta de `users`**: ahí saldría en el chat,
      en las menciones y en los selectores de agente, y su token de
      Sanctum abriría rutas del panel. La contraseña va cifrada con la
      APP_KEY, no con hash: admin y comercial la ven en Propiedades →
      «Acceso a la web» para mandársela al siguiente cliente.
    - **Entrar da una llave, no una sesión** (`LlaveDelCatalogo`): texto
      cifrado con el acceso, su versión y la caducidad (30 días), en la
      cabecera `X-Llave-Del-Catalogo`. **Cambiar la contraseña sube la
      versión y echa a todos** los que entraron con la anterior; guardar
      la misma pareja no echa a nadie.
    - **Sin llave el catálogo responde 403, nunca 401**: en este sistema
      un 401 cierra la sesión del panel, y a alguien del equipo que mira
      la web con el panel abierto lo sacaría.
    - Sin acceso configurado o sin nada publicado, la web no enseña la
      sección ni su enlace del menú (`/propiedades-en-la-web/acceso`).
      Las fotos siguen en el disco público con nombre imposible de
      adivinar: la puerta protege el listado, no cada fichero.
    - **Todo se gestiona en la pantalla «Catálogo web»** (`/catalogo-web`,
      admin y comercial, desde el 2026-10-01): si el catálogo se ve y qué
      le falta (con las mismas dos condiciones que comprueba el
      servidor), el usuario de invitado a la vista, un interruptor por
      propiedad (`PATCH /propiedades/{id}/publicada`) y el paso a paso
      para montar una propiedad. Antes el acceso era una ventana escondida
      en Propiedades y en producción el catálogo no salía porque faltaban
      las dos cosas, sin que nada lo dijera.
    - **El brochure de propiedades** (Reportes → Brochure, PDF que hace
      el navegador) lleva lo mismo que la web: el texto para clientes
      (nunca `descripcion`), las fotos que salen en la web y ningún
      monto. Las reglas viven en `utilidades/brochureDePropiedades.ts`.
      Todas las fotos van en huecos 16:10: un hueco vertical se comía
      medio plano o media hoja de dossier.

24. **El cierre de mes es un archivo de reportes por mes**, desde el
    2026-10-01. El comercial sube su reporte al acabar cada mes (PDF,
    Excel, Word, PowerPoint o imagen, hasta 20 MB) en `/cierre-de-mes`.

    - **Lo ven y lo suben admin y comercial**
      (`RolUsuario::veLosCierresDeMes`, `CierreDeMesPolicy`). El agente
      no: habla de toda la agencia.
    - **Borra quien lo subió, o el administrador.** Un comercial no borra
      el reporte de otro.
    - **`mes` es el mes AL QUE CORRESPONDE**, no el día en que se subió:
      el de septiembre se sube en octubre, y por eso la ventana propone
      el mes anterior. Un mes que no ha empezado se rechaza.
    - El fichero va al disco privado por `GuardadoDeArchivos` (regla 21)
      y se borra con el cierre. Subir y borrar quedan en la auditoría.
    - Queda fuera de la copia sin conexión: sus enlaces caducan.

25. **Ninguna contraseña de verdad vive en el repositorio, y las
    cabeceras de seguridad las pone nginx en todas las respuestas.**
    Desde el 2026-10-01: la contraseña temporal del importador y del
    seeder estaba escrita en `.env.example`, y el repositorio de GitHub
    era público. Una contraseña escrita en el repositorio no protege nada.

    - **Sin contraseñas fijas en el código.** El seeder y el importador
      inventan una al azar si no se les da y la enseñan una sola vez.
      `App\Support\ContrasenasPublicadas` lista las que ya se publicaron
      (la de ejemplo y `demo12345`) y el panel no deja ponerlas: ni al
      crear una cuenta, ni al reiniciarla, ni al cambiar la propia.
    - **La sesión vive en `localStorage`**, en el mismo origen que la web
      y que /storage. Por eso importa todo lo de abajo: cualquier código
      que llegue a correr en tsports.tech puede leerla. Y por eso caduca
      a los **30 días sin usarse** (`AppServiceProvider`, contando desde
      `last_used_at`): quien entra a diario no lo nota, y una sesión
      olvidada o robada deja de valer sola.
    - **Las cabeceras van en `deploy/nginx-seguridad.conf`**, que se
      incluye en el servidor y en CADA location con un `add_header`
      propio: en nginx, uno dentro de un location anula los de arriba.
      Así estuvo el panel sin `X-Frame-Options` y /storage sin `nosniff`.
    - **La CSP solo la lleva index.html** (`deploy/nginx.conf`):
      `script-src 'self'`, nada de `<script>` escrito en la página (el
      tema va en `public/tema-inicial.js`) ni `eval`. En los PDF no se
      pone, que algún visor se niega a abrirlos. Un recurso nuevo de otro
      dominio no cargará hasta que se añada ahí; se comprueba con el
      build servido con la misma cabecera (`preview.headers` de Vite) y
      el evento `securitypolicyviolation`.
    - **Los enlaces que escribe el CMS salen por `enlaceWebONada`**
      (`http(s)` o `#`): un `javascript:` en un href correría con la
      sesión de quien abra la web.
    - **El push solo va a servicios de entrega de verdad**
      (`GuardarSuscripcionPushRequest`): el servidor llama a esa dirección
      en cada aviso, y abierta a cualquier https servía para llamar a lo
      que hay dentro de la máquina.

26. **El estado de una marca (caliente, tibia o fría) se calcula al
    leer, nunca se guarda.** Desde el 2026-10-05, primera función de la
    Fase 4. La fórmula vive en SQL en un solo sitio,
    `App\Support\EstadoDeLasMarcas`, y de ahí leen el filtro del tablero,
    sus contadores, el reparto del resumen y la tarjeta. Si se guardara,
    cambiar los umbrales dejaría todas las marcas con el estado de antes.

    - **Lo que la mueve es una lista cerrada** (`MotivoDeMovimiento`):
      alta, cambio de fase (también completar la prospección), valor de
      la propuesta, comentario o respuesta en la bitácora (la que deja
      «Contacté» lleva su propio motivo, `contacto`, regla 29), y acción
      de campaña anotada. Se apunta en `marcas.ultimo_movimiento_en`, que
      solo avanza. **No es el `updated_at`**: ese cambia al corregir el
      teléfono, y corregir datos no calienta una marca. Editar o borrar
      un comentario, reaccionar o fijar el estado tampoco la mueven.
    - **Una acción de campaña con fecha por delante la deja caliente**
      hasta ese día, y después se enfría contando desde la acción.
    - **Los umbrales** (caliente hasta 5 días, tibia hasta 15) son una
      fila de `umbrales_del_estado` que solo cambia el administrador.
    - **Lo fijado a mano manda** hasta que alguien lo suelta, y se guarda
      quién y cuándo. Lo fija quien pueda editar la marca.
    - **Los días son los de Caracas**, porque el sistema va en hora de
      Venezuela (regla 16). Los cuenta el servidor, días incluidos
      (`ultimoMovimiento.haceDias`): el navegador no cuenta nada.

27. **Un recordatorio es de una persona, y solo le sale mientras pueda
    ver su marca.** Desde el 2026-10-05. Tabla `recordatorios` (varios
    por marca, cada uno de alguien), en la ficha encima de la bitácora,
    el próximo propio en la tarjeta y «Para hoy» y «Vencidos» en el panel.

    - **Los permisos salen de la marca** (`RecordatorioController`): los
      ve quien puede verla; los deja, cumple, pospone o borra quien
      puede editarla. Dejárselo a OTRA persona es solo de quien reparte,
      y solo a alguien que pueda ver esa marca, porque el recordatorio
      lleva dentro su nombre (regla 6). Si a alguien le quitan la marca,
      sus recordatorios dejan de salirle (`Recordatorio::scopeDe`).
    - **Ni hoy ni mañana los decide el navegador**: el servidor manda
      `cuando` y `diasHasta` con el día de Caracas, y la interfaz solo
      los pinta. Un día ya pasado no se acepta.
    - **El aviso de la mañana** lo lanza un temporizador de systemd
      (`deploy/tsports-recordatorios.timer`, 08:00 de Caracas) con
      `php artisan recordatorios:avisar-del-dia`. Es el primer proceso
      programado del sistema y lo instala `desplegar.sh`. Solo avisa de
      lo de HOY (lo vencido se cuenta dentro) y marca lo avisado
      (`avisado_en`), así que repetirlo no duplica; posponer quita la
      marca para que avise el día nuevo.
    - **Cumplirlo no calienta la marca**: no está en la lista cerrada de
      la regla 26. Si de la llamada sale algo, va a la bitácora.
    - **Qué toca y a qué hora** (desde el 2026-10-07): `tipo` es la misma
      lista que el contacto de la bitácora (`TipoDeContacto`) y `hora` es
      opcional («ese día»). Los dos se eligen al dejarlo, se corrigen
      después y se enseñan junto al día («Mañana · 10:00 · Reunión»).
      Dentro de un día, primero lo que no tiene hora y después por hora.

28. **Las herramientas del día a día no enseñan más que el tablero.**
    Desde el 2026-10-06 (etapa 7).

    - **El buscador único** (`/api/buscar`, Ctrl+K o «/» en la barra
      superior) encuentra marcas con `quePuedeVer`, como el tablero; el
      catálogo (propiedades, campañas, sectores) y al equipo activo, que
      el chat ya enseña a todos. Cada resultado trae su `enlace` del
      servidor; una persona solo lleva a su cartera a quien reparte, y a
      los demás les abre una charla.
    - **Las metas son anuales y se miden contra el OVP** (LinZ eligió el
      OVP; lo anual fue decisión de desarrollo, porque los importes del
      sistema son anuales). Se guarda el monto (`metas`, una por persona
      y año); el avance y su porcentaje los calcula
      `App\Support\AvanceDeLasMetas` al leer, con la misma regla que «Mi
      pronóstico» (regla 11). Sin meta, el porcentaje es null, no cero.
      Las ponen quienes reparten (`UserPolicy::fijarMetas`); un agente ve
      solo la suya.
    - **El Excel del tablero sale de la MISMA consulta que la pantalla**
      (`MarcaController::marcasDelTablero`): mismos filtros, mismo orden
      y mismo corte por rol. La hoja «Filtros» dice de qué lista se trata.
    - **La ficha en PDF** lleva datos, avance, propiedades, campañas y
      recordatorios; la bitácora no (tiene su exportación, regla 19).
    - **Las dos exportaciones quedan en la auditoría**: sacan del sistema
      contactos e importes.

29. **«Contacté» deja la entrada y el siguiente paso de una vez, y «sin
    siguiente paso» se cuenta en un solo sitio.** Desde el 2026-10-06, a
    propuesta de desarrollo y aceptado por LinZ. Una marca se enfriaba
    porque después de una llamada había que escribir en la bitácora y,
    aparte, dejarse el recordatorio, y lo segundo se olvidaba.

    - **El botón va en la tarjeta del tablero** (`VentanaDeContacto`,
      `POST /marcas/{id}/contactos`, `ContactoController`), para quien
      puede editar la marca. Deja una entrada en la bitácora con su tipo
      (llamada, WhatsApp, reunión o correo:
      `comentarios_marca.tipo_de_contacto`) y, si se elige, un
      recordatorio para quien lo anota. La entrada es una más: calienta
      la marca, avisa como un comentario (regla 17) y se edita o se
      elimina igual (regla 19).
    - **«¿Cuándo lo retomas?» no trae nada elegido**: hay que contestar,
      aunque sea «No hace falta». «En N días» lo cuenta el servidor desde
      el día de Caracas (regla 27); solo «Otro día» manda una fecha.
    - **El siguiente paso dice qué toca y, si se quiere, a qué hora**
      (desde el 2026-10-07): de partida lo mismo que se acaba de hacer,
      y su nota por defecto sale de lo que toca, no de lo que se hizo
      (después de una llamada, «Reunión de seguimiento»). Así «Contacté»
      alimenta la agenda del equipo (regla 30).
    - **Si quien anota tenía un recordatorio de hoy o vencido en esa
      marca, se propone darlo por cumplido** (marcado de partida): casi
      siempre es la llamada que se acaba de hacer, y si no, se quedaba en
      «Para hoy» junto al nuevo.
    - **Sin siguiente paso** es no tener ni un recordatorio pendiente (de
      quien sea, vencido o no) ni una acción de campaña de hoy en
      adelante. La condición vive en SQL en
      `App\Support\SiguientePasoDeLasMarcas`, y de ahí salen la cifra del
      resumen, la de cada persona en «Carga por agente», la del panel del
      agente y el filtro `?siguientePaso=sin` del tablero: pulsar «7 sin
      siguiente paso» abre esas siete.
    - **El teléfono de la ficha se pasa a WhatsApp con su código de país**
      (`numeroParaWhatsapp`: «0414-1234567» → 584141234567). En la ficha
      se escribe como se marca en Venezuela, y `wa.me/0414…` no abre nada.

30. **«Lo que viene» junta lo planificado, y los días los cuenta el
    servidor.** Desde el 2026-10-07, a petición de LinZ: el administrador
    tiene que poder ver qué hay planificado la semana o el mes que viene
    y sacarlo en un reporte. Reportes › «Lo que viene»
    (`/reportes/lo-que-viene`, `ReporteDeLoQueVieneController`).

    - **Junta lo que el sistema sabe del futuro**: los recordatorios del
      equipo (también los que deja «Contacté», con su tipo y hora) y las
      acciones de campaña del calendario, día por día; lo ATRASADO (lo
      pendiente de antes del periodo) aparte, y la cifra «sin siguiente
      paso» de la regla 29.
    - **El periodo lo calcula el servidor** con el día de Caracas
      (`esta_semana` es de hoy al domingo, `proxima_semana` de lunes a
      domingo, `este_mes` de hoy a fin de mes, `proximo_mes` entero, u
      `otro` con desde y hasta, un año como mucho). El navegador solo dice
      cuál (regla 16).
    - **Cada quien, lo de las marcas que ve** (regla 6): la agencia entera
      admin y comercial, su cartera el agente. Filtrar por persona es de
      quien ve todas (`personas` solo le llega a él); un agente solo se
      puede pedir a sí mismo (403 si no). Un recordatorio de alguien que ya
      no ve la marca o cuya cuenta está desactivada no sale: nadie lo va a
      hacer. Las acciones de campaña son del agente de su marca.
    - **No queda en la auditoría**, como el pronóstico: no saca
      conversaciones ni datos de contacto. Por eso se pide solo al cambiar
      un filtro. El PDF y la hoja de cálculo los arma el navegador con la
      misma respuesta (`utilidades/exportarLoQueViene.ts`).

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

Una regla de validación sin mensaje propio en su FormRequest toma el de
`backend/lang/es/validation.php`, con el nombre legible del campo de su
lista `attributes`. Sin ese fichero salía la clave en crudo
(«validation.max.string»); `MensajesDeValidacionTest` avisa si una
versión nueva de Laravel trae una regla sin traducir.

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
Contraseña de los tres últimos: `demo12345`. El catálogo de la web se
abre con el invitado `invitado` / `demo12345` (regla 23).

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
- Poner `scrollbar-width` o `scrollbar-color` a todos los elementos: en
  el Mac la barra vuelve a esconderse (ver 4.7).
- Guardar una respuesta de `/api` en el service worker (regla 18).
- Dejar que alguien lea una charla del chat en la que no está, ni
  siendo administrador (regla 20).
- Escribir un mensaje del chat sin pasar por `Mensajeria`.
- Preguntar `¿hay error?` antes que `¿hay datos?` al pintar una
  pantalla: se usa `errorSoloSiNoHayNadaQueEnsenar` (regla 18).
- Registrar el service worker en desarrollo: una caché por delante de
  Vite esconde los cambios recién guardados.
- Guardar un fichero sin pasar por `GuardadoDeArchivos`, o servir un
  adjunto de la bitácora desde `/storage` (regla 21).
- Subir el tope de subida en un solo sitio: Laravel, PHP y nginx van
  juntos (regla 21).
- Mandar datos dentro del aviso de «cambiaron los datos», o avisar de
  una marca a quien no la ve (regla 22).
- Añadir un modelo que se ve en el panel sin engancharlo a
  ObservadorDeCambiosEnVivo: su pantalla dejaría de ponerse al día sola.
- Llamar a `Event::fake([...])` en una prueba sin `CambioEnLosDatos` en
  la lista: no falla, pero la prueba vuelve a esperar a Reverb (ver
  `tests/TestCase.php`).
- Crear el acceso de invitados como una cuenta de `users`, o contestar
  401 desde una ruta de la web pública: el 401 cierra la sesión del
  panel (regla 23).
- Sacar hacia fuera (web, brochure) la `descripcion` de una propiedad,
  un monto o una foto «solo para el equipo» (reglas 21 y 23).
- Contar las marcas de una campaña solo con `marcas.campana_id`: se usa
  `Marca::campanasQueHaTenido` (regla 13).
- Dar por bueno un cambio en `useRevelarAlEntrar` probándolo solo en
  desarrollo: `StrictMode` esconde el fallo (ver 4.6).
- Escribir una contraseña de verdad en el repositorio, o un valor por
  defecto para ella en el código (regla 25).
- Poner un `<script>` escrito dentro de index.html, o algo que necesite
  `eval`: la CSP lo bloquea (regla 25).
- Un `add_header` en un location de nginx sin
  `include snippets/tsports-seguridad.conf;` al lado (regla 25).
- Aceptar SVG en cualquier subida (regla 21).
- Calcular el estado de una marca con su `updated_at`, guardarlo en una
  columna o contar sus días en el navegador (regla 26).
- Escribir una zona horaria a mano en el backend (`now('UTC')`,
  `->utc()`, `'America/Caracas'`): el sistema ya va en hora de Venezuela
  (regla 16).
- Decidir en el navegador si algo es de hoy o de mañana comparando con
  su reloj: el ordenador puede no estar en hora de Caracas (reglas 26
  y 27).
- Contar «sin siguiente paso» fuera de `SiguientePasoDeLasMarcas`: la
  cifra del resumen y la lista del tablero dejarían de coincidir (regla 29).
- Añadir una caja al resumen fuera de la parte cuya pregunta contesta
  (ver 4.8).
- Calcular en el navegador qué días son «esta semana» o «el próximo
  mes» para un reporte: se manda el periodo y los días los pone el
  servidor (regla 30).
- Mandar a un agente el dinero de la agencia por sector, o la agenda de
  otra persona (reglas 15 y 30).
- Poner `step` en un campo de dinero: redondea lo escrito al múltiplo
  (regla 15).
