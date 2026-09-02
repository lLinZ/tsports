# TS Sports — Web, CRM y administrador de contenido

Sistema completo para **TS Sports**, agencia de marketing y consultoría
deportiva. Tres piezas sobre una única base de datos:

- **Web pública** — la página de la agencia, en español e inglés.
- **CRM de patrocinios** — el tablero de marcas del equipo comercial.
- **Administrador de la web** — cambiar textos, fotos y colores sin
  tocar código.

Construido con **Laravel 12 + MySQL 8** en el servidor y **React 19 +
TypeScript + HeroUI + Tailwind 4** en el cliente.

---

## Índice

1. [Qué hace el sistema](#1-qué-hace-el-sistema)
2. [Poner en marcha el entorno local](#2-poner-en-marcha-el-entorno-local)
3. [Instalar en el VPS](#3-instalar-en-el-vps)
4. [Actualizar el VPS](#4-actualizar-el-vps)
5. [Traer los datos de Supabase](#5-traer-los-datos-de-supabase)
6. [Cómo se usa el sistema](#6-cómo-se-usa-el-sistema)
7. [Si algo falla](#7-si-algo-falla)

---

## 1. Qué hace el sistema

### El CRM

Cada **marca** es una empresa a la que se le quiere vender un
patrocinio. El proceso tiene **tres fases que van por separado** — una
marca puede tener propuesta enviada sin haber cerrado la prospección:

| Fase | Cómo se marca |
|---|---|
| **Prospección** | Sola. Se completa cuando la marca tiene nombre, logo, persona de contacto, cargo y correo. |
| **Aproximación** | A mano. Exige indicar la vía (Conocido, WhatsApp u otra). |
| **Propuesta** | A mano. Exige describir qué se le envió. |

El **valor anual** solo cuenta si hay propuesta enviada; sin ella se
guarda a cero, para que el total del pipeline no infle cifras de marcas
con las que aún no se ha hablado de dinero.

### Las propiedades (los productos IOP)

Una **propiedad** es lo que la agencia vende: el Comité Olímpico, el
Dvo. Táchira, Kombat Challenge, Megafitness… Se cargan enteras, sin
sub-propiedades, desde la pantalla **Propiedades**, y cada una lleva
tres montos:

| Monto | Qué es | Quién lo pone |
|---|---|---|
| **MTP** | El valor total de la propiedad. Ej. 162.000. | Admin o comercial, al cargarla. |
| **Forecast** | La meta de venta: el 20 % del MTP (editable por propiedad). Ej. 32.400. | Se calcula solo. |
| **OVP** | Lo que un vendedor estima venderle a **una marca concreta** dentro de esa propiedad. | El vendedor, desde la ficha de la marca. |

En la ficha de cada marca, dentro de la prospección, hay un **checklist**
con las propiedades: se marcan las que se le están ofreciendo y se anota
el OVP de cada una. Debajo aparece la barra con la proporción: de una
propiedad de 7.400 con un pronóstico de 500, la barra dice **6,8 %**, y
una marca fina señala dónde está la meta del 20 %.

Marcar propiedades **no** completa la fase de prospección: esa sigue
dependiendo solo de los cinco datos de la tabla de arriba.

Cada propiedad se asigna a quien la trabaja: a todo el equipo, o solo a
las personas que se elijan. Quien no la tenga asignada la ve, pero no
puede colocarla en una ficha.

### Las campañas

Una **campaña** es la acción comercial con la que se está trabajando una
marca. Las de partida son cinco:

| Campaña | Qué significa |
|---|---|
| **Visita presencial** | Se visitó a la marca en sus oficinas. |
| **Envió material pop** | Se le hizo llegar material POP. |
| **Invitación a nuestros medios** | Se le invitó a participar en los medios de la agencia. |
| **Invitación a evento enamorados del marketing deportivo** | Se le invitó a ese evento. |
| **Invitación a evento Sportbiz** | Se le invitó a ese evento. |

Se gestionan en la pantalla **Campañas** (crear, renombrar, cambiar el
color, desactivar), se eligen desde la ficha de cada marca y sirven para
filtrar el tablero y ver su reparto en el resumen.

Como son acciones y no periodos, **ninguna lleva fechas**: no empiezan ni
terminan en un día concreto. El sistema admite las dos formas — una
campaña con fechas ("Temporada 2026") deja de estar vigente al pasar la
fecha de fin, y una sin fechas sigue vigente mientras esté activa.

Una marca pertenece **como mucho a una campaña**. Para quitársela, se
vuelve a pulsar la campaña que tiene elegida en la ficha. Borrar una
campaña **no borra sus marcas**: se quedan sin campaña.

### Los roles

| Rol | Qué puede hacer |
|---|---|
| **Administrador** | Todo: cuentas, contenido de la web y todas las marcas. |
| **Comercial** | Todas las marcas. Asigna vendedores. |
| **Vendedor** | Ve todas las marcas, pero solo edita las que tiene asignadas. No borra. |

Los leads que entran por el formulario de la web nacen **sin dueño**: el
primero del equipo que los trabaja se los queda.

### La apariencia

Cada persona elige su **tema** (claro, oscuro o automático) y su **color
de perfil**. Las dos cosas se guardan en el servidor, así que acompañan
a la cuenta a cualquier ordenador.

---

## 2. Poner en marcha el entorno local

### Lo que hace falta

- PHP 8.2 o superior
- Composer 2
- Node 20 o superior
- (MySQL es opcional en local: se puede trabajar con SQLite)

### Backend

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
```

En local, deja `DB_CONNECTION=sqlite` en el `.env` y crea el fichero de
base de datos:

```bash
touch backend/database/database.sqlite
```

Luego crea las tablas y siembra los datos de prueba:

```bash
php artisan migrate --seed
```

Y levanta el servidor:

```bash
php artisan serve
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre **http://localhost:5173**. Vite redirige `/api` al Laravel local,
así que no hay que configurar nada más.

### Cuentas de prueba

Las siembra `php artisan db:seed` (solo fuera de producción):

| Correo | Rol | Contraseña |
|---|---|---|
| `admin@tssports.com` | Administrador | la de `ADMIN_PASSWORD` en `.env` |
| `comercial@tssports.com` | Comercial | `demo12345` |
| `vendedor.caracas@tssports.com` | Vendedor | `demo12345` |
| `vendedor.oriente@tssports.com` | Vendedor | `demo12345` |

### Antes de dar algo por terminado

```bash
npm run build --prefix frontend
```

El `build` incluye la comprobación de tipos. Si no compila, no está
terminado.

---

## 3. Instalar en el VPS

Pensado para **Ubuntu 22.04 LTS** recién instalado, que es la opción que
ofrece el proveedor. Funciona igual en Ubuntu 20.04/24.04 y en Debian
11/12.

> **Al contratar el VPS, elige Ubuntu 22.04.** De la lista del proveedor
> es la única con soporte hasta 2027: CentOS 7, Fedora 36 y Ubuntu 18.04
> están fuera de mantenimiento, y AlmaLinux usa `dnf` en vez de `apt`, con
> lo que el instalador no sirve.
>
> Ninguna distribución trae PHP 8.2 de fábrica (Ubuntu 22.04 viene con
> 8.1), así que el instalador añade solo el repositorio que lo publica.
> No hay que hacer nada a mano.

### Paso 1 — Traer el código

```bash
sudo apt update && sudo apt install -y git
sudo mkdir -p /var/www && cd /var/www
sudo git clone <URL-DEL-REPOSITORIO> tsports
sudo chown -R $USER:$USER tsports
cd tsports
```

### Paso 2 — Ejecutar el instalador

```bash
./deploy/instalar-vps.sh
```

El guion se encarga de todo: instala nginx, MySQL, PHP y Node; crea la
base de datos y su usuario; rellena el `.env`; aplica las migraciones;
crea la cuenta de administrador; construye el frontend y configura
nginx.

Si tu dominio no es `tssports.com`, pásalo antes:

```bash
DOMINIO=midominio.com ./deploy/instalar-vps.sh
```

> Al terminar imprime las contraseñas generadas. **Anótalas: no se
> vuelven a mostrar.**

### Paso 3 — Certificado HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tssports.com -d www.tssports.com
```

Certbot edita la configuración de nginx y programa la renovación
automática.

### Paso 4 — Comprobar

```bash
curl -s https://tssports.com/up
```

Después entra en `https://tssports.com/entrar` con la cuenta de
administrador y **cambia la contraseña** desde *Mi perfil*.

### Antes de que llegue tráfico real

Con `APP_ENV=production` en el `.env`, el sembrado ya no crea los
usuarios de prueba. Si instalaste con datos de ejemplo y quieres
limpiarlos:

```bash
cd /var/www/tsports/backend
php artisan tinker --execute="App\Models\User::whereIn('email', ['comercial@tssports.com','vendedor.caracas@tssports.com','vendedor.oriente@tssports.com'])->delete();"
```

---

## 4. Actualizar el VPS

Cada vez que haya cambios nuevos:

```bash
cd /var/www/tsports
./deploy/desplegar.sh
```

El guion pone el sitio en mantenimiento, baja el código, instala
dependencias, migra la base de datos, reconstruye el frontend y vuelve a
levantarlo. Si el build falla, **se detiene y el sitio anterior sigue en
pie**.

> **Al actualizar a la segunda etapa** (propiedades y campañas), después
> de migrar hay que sembrar una sola vez los dos catálogos:
>
> ```bash
> php artisan db:seed --class=PropiedadesIopSeeder
> ```
>
> ```bash
> php artisan db:seed --class=CampanasInicialesSeeder
> ```
>
> El primero crea las siete propiedades con las que trabaja el equipo.
> Solo el Comité Olímpico viene con su monto (162.000); el resto se
> completan desde el panel.
>
> El segundo crea las cinco campañas de partida (visita presencial,
> envío de material POP y las tres invitaciones).
>
> Los dos son idempotentes: si ya están cargados no tocan nada, y
> respetan lo que el equipo haya cambiado después desde el panel.

---

## 5. Traer los datos de Supabase

### Paso 1 — Exportar desde Supabase

En el **SQL Editor**, una consulta por tabla, y *Download JSON*:

```sql
select * from public.profiles;        -- → profiles.json
select * from public.deals;           -- → deals.json
select * from public.deal_comments;   -- → deal_comments.json
select * from public.site_content;    -- → site_content.json
```

### Paso 2 — Subir los ficheros al VPS

```bash
mkdir -p /var/www/tsports/backend/storage/app/import
scp *.json usuario@servidor:/var/www/tsports/backend/storage/app/import/
```

### Paso 3 — Importar

Primero una simulación, que no escribe nada:

```bash
cd /var/www/tsports/backend
php artisan tsports:importar-supabase --carpeta=storage/app/import --simular
```

Si el resumen cuadra, la importación de verdad:

```bash
php artisan tsports:importar-supabase --carpeta=storage/app/import
```

Todo va dentro de una transacción: si algo falla a mitad, la base de
datos se queda como estaba.

### Qué tener en cuenta

- **Las contraseñas no se pueden importar.** Supabase no las exporta.
  A cada usuario importado se le asigna una temporal (se muestra al
  terminar) y hay que pedirle que la cambie al entrar. Se puede elegir
  con `--password-temporal=LaQueQuieras`.
- **Los identificadores se conservan**, así que las marcas siguen
  apuntando a la persona correcta.
- **La prospección se recalcula** al importar. Si en Supabase había
  marcas con la casilla marcada pero sin los datos completos, aquí
  quedarán como incompletas: es lo correcto.
- **Los textos de la web quedan aparte.** Las claves cambiaron de nombre
  (`hero.eyebrow` → `hero.antetitulo`), así que se guardan bajo
  `_importadoSinTraducir` para no perderlos, pero conviene repasarlos
  desde el panel.

---

## 6. Cómo se usa el sistema

### Registrar una marca

1. **Marcas → Nueva marca**.
2. **Paso 1 · La marca** — nombre, logo, zona, sector y dónde la viste.
3. **Paso 2 · Contacto** — con quién se cierra el negocio, y a qué
   vendedor se le asigna.
4. **Paso 3 · Avance** — hasta dónde se ha llegado.

Se puede parar en cualquier punto y completar después.

### Avanzar el trabajo del día

En el tablero, las tres fases de cada tarjeta se marcan **con un clic**,
sin abrir la ficha. Dos excepciones a propósito:

- La **prospección** no se pulsa: al intentarlo se abre la ficha
  diciendo qué falta.
- La **propuesta** sin descripción tampoco: hace falta escribir qué se
  le envió a la marca.

### Cambiar la web

**Web pública** → pestañas de Colores, Imágenes, Textos, Servicios,
Proyectos, Equipo, Aliados y Contacto. Se edita todo lo que haga falta y
se pulsa **Publicar cambios** una sola vez.

Cada publicación guarda una versión. Si algo sale mal, **Historial →
Restaurar**.

### Dar de alta a alguien

**Equipo → Nueva cuenta**. Se le entrega la contraseña y él la cambia
desde *Mi perfil*.

Para reiniciar una contraseña olvidada: **Equipo → Editar** sobre esa
persona y escribir una nueva. Al hacerlo se cierran sus sesiones
abiertas.

---

## 7. Si algo falla

### La web carga pero el panel da error de sesión

El token caducó. Vuelve a entrar. Si pasa constantemente, comprueba que
la hora del servidor es correcta:

```bash
timedatectl
```

### "No se pudo contactar con el servidor"

PHP-FPM no está respondiendo:

```bash
sudo systemctl status php8.2-fpm
sudo systemctl restart php8.2-fpm
```

### Las imágenes subidas no se ven

Falta el enlace simbólico de la carpeta de imágenes:

```bash
cd /var/www/tsports/backend
php artisan storage:link
```

Si el enlace existe pero siguen sin verse, es cuestión de permisos:

```bash
sudo chown -R $USER:www-data storage
sudo chmod -R 775 storage
```

### Un cambio en el `.env` no surte efecto

La configuración está cacheada:

```bash
cd /var/www/tsports/backend
php artisan config:clear && php artisan config:cache
```

### Ver qué está pasando

```bash
tail -f /var/www/tsports/backend/storage/logs/laravel.log
tail -f /var/log/nginx/tsports-error.log
```

### El sitio se quedó en mantenimiento

Si un despliegue se cortó a mitad:

```bash
cd /var/www/tsports/backend
php artisan up
```

---

## Documentación para desarrollo

Las convenciones de código, el estilo visual y las reglas de negocio que
no se tocan están en **[CLAUDE.md](CLAUDE.md)**. Léelo antes de escribir
nada en este repositorio.
