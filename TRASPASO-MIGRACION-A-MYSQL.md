# Traspaso — migración de los datos de Supabase a MySQL

> **Qué es este fichero.** El acta de la sesión del **2026-08-26** en la
> que se trajeron los datos reales desde Supabase a la base MySQL local.
> Está escrito para que otra sesión pueda continuar sin volver a
> investigar el terreno: recoge lo que se cambió, lo que se comprobó, lo
> que se descartó y por qué.
>
> **Caduca** cuando el sistema esté desplegado en el VPS con sus datos
> dentro. A partir de ahí, la referencia buena es el `CLAUDE.md`.

---

## 1. Resumen en una línea

Los datos de Supabase **ya están importados y verificados** en la base
`tsports` de la MariaDB local. Falta el VPS.

---

## 2. Estado de la base de datos

Base **`tsports`** en la MariaDB de XAMPP (`127.0.0.1:3306`, usuario
`root` sin contraseña), con `utf8mb4` / `utf8mb4_unicode_ci`.

| Tabla | Filas | Comprobado contra el origen |
|---|---|---|
| `users` | 8 | 2 admin, 1 comercial, 5 vendedor — ninguno cayó al valor por defecto |
| `marcas` | 71 | Los 71 UUID son **idénticos** a los de Supabase |
| `comentarios_marca` | 0 | `deal_comments` estaba genuinamente vacía en origen (`Content-Range: */0`) |
| `contenido_sitio` | 1 | Una versión, publicada como «Importado desde Supabase» |

Comprobaciones que se hicieron y salieron bien:

- **Fechas conservadas**: de `2026-08-05 13:38` a `2026-08-14 14:04`, con
  **cero marcas con fecha de hoy**. El histórico del tablero no se vino
  a hoy.
- **Integridad referencial intacta**: se conservaron los UUID, así que
  las marcas siguen apuntando a la persona correcta sin tabla de
  equivalencias.
- **Todos los valores encajan con los catálogos** de
  `App\Support\CatalogosDelCrm`: zonas, vías de aproximación y vías de
  prospección, sin un solo valor fuera de lista.
- **La API responde** con un usuario real importado: `/api/auth/login`,
  `/api/panel/resumen` (71 marcas, 67 en aproximación, 1 en prospección),
  `/api/marcas` (71, paginadas de 60), `/api/usuarios` (8) y
  `/api/contenido-web`. Las tildes salen bien de punta a punta.

---

## 3. Qué se cambió en el repositorio

| Fichero | Cambio |
|---|---|
| `backend/app/Console/Commands/ImportarDesdeSupabase.php` | **Corrección de un fallo real.** Ver §4. |
| `backend/.env` | `DB_CONNECTION=sqlite` → bloque MySQL apuntando a `tsports`. |
| `backend/.env.sqlite.bak` | **Nuevo.** Copia del `.env` anterior, para volver a SQLite si hace falta. |
| `.claude/launch.json` | Se añadió la configuración `backend` (`php backend/artisan serve`), que faltaba. Ya estaba la de `frontend`. |
| `deploy/exportar-supabase.sh` | **Nuevo.** Ver §5. |
| `backend/storage/app/import/*.json` | Los cuatro ficheros exportados. **Ignorados por git** (`.gitignore` línea 38) porque llevan datos reales de contactos. |

No se tocó nada del frontend.

---

## 4. El fallo que se corrigió

`ImportarDesdeSupabase::restaurarFechasOriginales()` metía la marca de
tiempo de Supabase **tal cual** en una columna `DATETIME`:

```
2026-08-05T23:59:34.814326+00:00
```

SQLite lo aceptaba porque guarda las fechas como texto. MySQL responde
con un **error 1292** y, como la importación va dentro de una
transacción, tumbaba las 71 marcas de golpe.

Se añadió `comoFechaDeBaseDeDatos()`, que normaliza con `Carbon::parse()`
a la zona horaria de la aplicación y formatea `Y-m-d H:i:s`.

> **Por qué importa más allá de esta línea:** es la clase de fallo que el
> desarrollo en SQLite esconde y que solo aparece al pasar a MySQL. Si
> aparecen más diferencias de comportamiento entre el local y el VPS,
> sospechar de este mismo origen antes que de nada más.

---

## 5. Cómo repetir la exportación (para el VPS)

El comando de importación ya existía y está documentado en su propia
cabecera. Lo que faltaba era sacar los datos: las tablas `profiles`,
`deals` y `deal_comments` tienen **RLS activo**, y con la clave anónima
devuelven `[]` con un **200 OK** — el fallo silencioso que describe el
`CLAUDE.md` §7. Solo `site_content` es de lectura pública.

Hace falta la clave **`service_role`** (Supabase → Project Settings → API
→ *Reveal*), que salta el RLS. **No está guardada en ningún sitio de este
repositorio, y la que se usó el 2026-08-26 debería estar ya rotada.**

```bash
SUPABASE_SERVICE_KEY='...' ./deploy/exportar-supabase.sh backend/storage/app/import
```

```bash
cd backend && php artisan tsports:importar-supabase --carpeta=storage/app/import --simular
```

El `--simular` hace la pasada entera dentro de una transacción y la
deshace: enseña las cifras sin escribir. Si cuadran, se repite sin él.

El proyecto de Supabase es `itlfmmvanjqeimxrzipo`. La URL y la clave
anónima están en `config.js` del respaldo antiguo
(`C:\Users\LinZ\Downloads\RESPALDO\RESPALDO\code\tssports`).

---

## 6. Lo que hay que repasar a mano

Nada de esto es un fallo de la importación: **venía así de Supabase** y se
respetó tal cual, en vez de inventar datos.

- **Ningún usuario tiene zona.** Los 8 tenían el campo vacío en origen.
- **Ninguna marca tiene vendedor asignado.** Las 71 tenían `assigned_to`
  vacío. El panel las cuenta como «sin asignar».
- **7 marcas sin zona** y **las 71 sin sector**.
- **`invierte` vacío en las 71** → todas quedan como `desconocido`, que
  es explícito, en vez de como un `no` que sería mentira.
- **KALDINI** tiene la aproximación marcada **sin vía**, lo que incumple
  la regla de negocio 3. Al abrirla en el panel, el servidor pedirá la
  vía antes de dejar guardar. No es un fallo del sistema nuevo: es el
  sistema nuevo haciendo su trabajo con un dato torcido que venía de
  antes.
- **Los textos de la web** (textos, servicios, proyectos, equipo,
  aliados) quedaron bajo la clave `_importadoSinTraducir`. Las claves
  cambiaron de nombre (`hero.eyebrow` → `hero.antetitulo`) y traducirlas
  una a una daba más trabajo que reescribirlas desde el panel. **Colores,
  imágenes y contacto sí entraron traducidos.**

### Contraseñas

**Supabase no exporta las contraseñas.** Los 8 usuarios quedaron con la
temporal **`CambiaEstaClave2026`** (se cambia con `--password-temporal=`)
y tienen que cambiarla al entrar. Los correos son los mismos de siempre.

Para probar: `tssports@gmail.com` es una de las dos cuentas admin.

---

## 7. Lo que sigue pendiente

1. **El VPS.** El repositorio **no está inicializado en git**, y
   `deploy/instalar-vps.sh` y `deploy/desplegar.sh` asumen un
   `git clone`. Hay que resolver eso antes de desplegar.
2. **Reexportar antes del corte.** El sistema viejo **sigue en uso**:
   había un inicio de sesión en Supabase el mismo 2026-08-26. Si pasan
   días hasta el despliegue, conviene repetir la exportación justo antes
   para no perder lo añadido entre medias.
3. **Rotar la clave `service_role`** si no se ha hecho ya.
4. **Repasar lo de la §6** con el cliente.

---

## 8. Cosas del entorno que no son obvias

- **Es MariaDB 10.4, no MySQL 8.** XAMPP trae MariaDB. Las nueve
  migraciones pasaron limpias, y la columna `json` se materializa como
  `longtext ... CHECK (json_valid(...))`, que es el alias normal de
  MariaDB y funciona con Laravel. Pero **el VPS usará MySQL 8**
  (`backend/.env.example`), así que no es exactamente el mismo motor.
- **`config/app.php` fija `'timezone' => 'UTC'` literal** e ignora el
  `APP_TIMEZONE=America/Caracas` del `.env`. Ahora mismo no rompe nada
  (Supabase también entrega UTC, así que las fechas importadas son
  coherentes con lo que escribe Eloquent), pero si algún día las horas se
  ven corridas respecto a Venezuela, ese es el motivo.
- El cliente `mysql` está en `C:\xampp\mysql\bin\mysql.exe`, no en el
  `PATH`.
- Redirigir la salida de ese `mysql.exe` a rutas estilo `/tmp` desde Git
  Bash **no funciona**: es un binario de Windows y no entiende esas
  rutas. Hay que usar rutas de Windows.

---

## 9. Comprobaciones rápidas

Para saber en qué punto está todo sin volver a investigarlo:

```bash
/c/xampp/mysql/bin/mysql.exe -u root tsports --table -e "SELECT (SELECT COUNT(*) FROM users) AS usuarios, (SELECT COUNT(*) FROM marcas) AS marcas, (SELECT COUNT(*) FROM contenido_sitio) AS contenido;"
```

```bash
cd backend && php artisan migrate:status
```

```bash
cd frontend && npm run build
```

---

## 10. Aviso: había otra sesión trabajando en paralelo

Durante esta sesión, **otro proceso estaba construyendo una funcionalidad
nueva en este mismo repositorio** (Propiedades, Prospectores de
propiedad y Campañas): 5 migraciones, modelos, políticas, recursos,
peticiones, controladores, seeders, rutas y tipos del frontend, más
cambios en `Marca`, `User`, `RolUsuario` y `CatalogosDelCrm`.

Eso rompió `/api/marcas` un rato, porque `RecursoMarca` pasó a exponer
`campana_id` antes de que existiese la columna. **Ya está resuelto**: esa
sesión corrió sus migraciones (con `migrate`, no `migrate:fresh`), los
datos importados sobrevivieron intactos y `/api/marcas` volvió a
responder.

Se decidió **no** correr esas migraciones desde aquí, para no marcarlas
como aplicadas mientras su autor todavía podía estar editándolas.

> Si al retomar el trabajo aparecen cambios que este documento no
> menciona, es muy probable que vengan de esa línea de trabajo y no de la
> migración de datos.
