#!/usr/bin/env bash
#
# =====================================================================
#  TS SPORTS — Primera instalación en un VPS limpio
#  ---------------------------------------------------------------------
#  Probado en Debian 13 (Trixie) y en Ubuntu 22.04 LTS. Compatible con
#  Ubuntu 20.04/24.04 y Debian 11/12. NO sirve para AlmaLinux, CentOS ni
#  Fedora: esos usan `dnf` y otros nombres de paquete.
#
#  Deja el servidor listo de cero: paquetes, base de datos, usuario,
#  migraciones, cuenta de administrador y nginx.
#
#  SOBRE LA VERSIÓN DE PHP
#    Laravel 12 necesita PHP 8.2 o superior. Unas distribuciones lo
#    traen y otras no: Debian 13 viene con 8.4 y Ubuntu 24.04 con 8.3
#    —ambas valen tal cual—, pero Ubuntu 22.04 trae 8.1 y Debian 11 el
#    7.4. Por eso el guion mira primero qué PHP publica la distribución
#    y solo añade un repositorio externo (ondrej en Ubuntu, Sury en
#    Debian) cuando el de fábrica se queda corto. Usar el paquete de la
#    distribución cuando sirve evita depender de un tercero para recibir
#    los parches de seguridad.
#
#  SOBRE LA BASE DE DATOS
#    Debian NO publica `mysql-server` en sus repositorios: su motor es
#    MariaDB. Ubuntu sí publica los dos. El guion instala el que
#    corresponda y escribe en el .env el driver que toca (`mariadb` o
#    `mysql`), que en Laravel 12 son conexiones distintas. Los dos
#    hablan el mismo dialecto para lo que hace este proyecto.
#
#  USO
#    sudo apt update && sudo apt install -y git
#    sudo mkdir -p /var/www && cd /var/www
#    sudo git clone <URL-DEL-REPOSITORIO> tsports
#    sudo chown -R $USER:$USER tsports
#    cd tsports
#    ./deploy/instalar-vps.sh
#
#  Después de esto, cada actualización se hace con deploy/desplegar.sh.
#
#  ANTES DE EMPEZAR, revisa las variables del bloque de configuración.
# =====================================================================

set -euo pipefail

# ---------------------------------------------------------------------
# Configuración — CAMBIA ESTOS VALORES
# ---------------------------------------------------------------------
DOMINIO="${DOMINIO:-tssports.com}"
NOMBRE_BASE_DE_DATOS="${NOMBRE_BASE_DE_DATOS:-tsports}"
USUARIO_BASE_DE_DATOS="${USUARIO_BASE_DE_DATOS:-tsports}"

# Si no se pasa por variable de entorno, se genera una contraseña larga
# al azar y se muestra al final. Es mejor que dejar una escrita aquí.
#
# Se recorta con `cut` y no con `head -c`: head cierra la tubería en
# cuanto tiene sus bytes, el proceso de la izquierda recibe un SIGPIPE al
# seguir escribiendo, y con `set -o pipefail` (activado arriba) eso
# convierte la línea entera en un fallo del 141 que aborta la
# instalación. `cut` lee toda la entrada y no deja el cabo suelto.
PASSWORD_BASE_DE_DATOS="${PASSWORD_BASE_DE_DATOS:-$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)}"

CORREO_DEL_ADMINISTRADOR="${CORREO_DEL_ADMINISTRADOR:-admin@tssports.com}"
PASSWORD_DEL_ADMINISTRADOR="${PASSWORD_DEL_ADMINISTRADOR:-$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-16)}"

readonly VERSION_DE_NODE="22"

# Versión mínima de PHP que admite Laravel 12. Si la distribución trae
# una igual o mayor, se usa la suya; si no, se instala exactamente ésta
# desde un repositorio externo.
readonly VERSION_MINIMA_DE_PHP="8.2"

readonly CARPETA_DEL_PROYECTO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------------------------------------------------------------------
# Qué distribución es y cómo se pide permiso de root
# ---------------------------------------------------------------------
readonly DISTRIBUCION="$(. /etc/os-release && echo "$ID")"
readonly NOMBRE_CLAVE="$(. /etc/os-release && echo "$VERSION_CODENAME")"

# Muchos VPS de Debian entregan la máquina solo con root y sin `sudo`
# instalado. Escribir `sudo` a pelo fallaría con "command not found" en
# la primera línea, así que se resuelve una vez aquí: si ya somos root
# no hace falta nada, y si no, tiene que existir sudo.
if [[ "$(id -u)" -eq 0 ]]; then
  COMO_ROOT=""
elif command -v sudo >/dev/null 2>&1; then
  COMO_ROOT="sudo"
else
  echo "Este guion necesita privilegios de root, pero no eres root y no hay 'sudo'." >&2
  echo "Entra como root (su -) e instálalo:  apt update && apt install -y sudo" >&2
  exit 1
fi
readonly COMO_ROOT

readonly VERDE='\033[0;32m'
readonly AMARILLO='\033[1;33m'
readonly SIN_COLOR='\033[0m'

paso()  { echo -e "\n${VERDE}▶ $1${SIN_COLOR}"; }
aviso() { echo -e "${AMARILLO}  ! $1${SIN_COLOR}"; }

# ---------------------------------------------------------------------
# 1) Paquetes del sistema
# ---------------------------------------------------------------------
paso "Instalando los paquetes del sistema"

${COMO_ROOT} apt-get update

case "${DISTRIBUCION}" in
  ubuntu|debian) ;;
  *)
    aviso "Distribución '${DISTRIBUCION}' no contemplada."
    aviso "Este guion es para Ubuntu o Debian. En AlmaLinux/CentOS/Fedora no funciona."
    exit 1
    ;;
esac

# ---------------------------------------------------------------------
# Qué PHP se va a usar
# ---------------------------------------------------------------------
# Se busca en los repositorios ya configurados la serie de PHP más alta
# que publique un paquete -fpm y que sirva para Laravel 12. En Debian 13
# eso encuentra 8.4 y no hace falta añadir nada; en Ubuntu 22.04 no
# encuentra ninguna y hay que recurrir al repositorio externo.
VERSION_DE_PHP=""
for serie in 8.5 8.4 8.3 8.2; do
  if apt-cache show "php${serie}-fpm" >/dev/null 2>&1; then
    VERSION_DE_PHP="${serie}"
    break
  fi
done

if [[ -n "${VERSION_DE_PHP}" ]]; then
  echo "  PHP ${VERSION_DE_PHP} viene en los repositorios de ${DISTRIBUCION} ${NOMBRE_CLAVE}: se usa ése."
else
  paso "Añadiendo el repositorio de PHP ${VERSION_MINIMA_DE_PHP} (${DISTRIBUCION} ${NOMBRE_CLAVE})"

  ${COMO_ROOT} apt-get install -y ca-certificates apt-transport-https software-properties-common curl gnupg

  case "${DISTRIBUCION}" in
    ubuntu)
      # ondrej/php es el repositorio de referencia para PHP en Ubuntu.
      ${COMO_ROOT} add-apt-repository -y ppa:ondrej/php
      ;;
    debian)
      # En Debian el equivalente es Sury, que se añade a mano.
      curl -fsSL https://packages.sury.org/php/apt.gpg \
        | ${COMO_ROOT} gpg --dearmor -o /usr/share/keyrings/sury-php.gpg
      echo "deb [signed-by=/usr/share/keyrings/sury-php.gpg] https://packages.sury.org/php/ ${NOMBRE_CLAVE} main" \
        | ${COMO_ROOT} tee /etc/apt/sources.list.d/sury-php.list >/dev/null
      ;;
  esac

  ${COMO_ROOT} apt-get update
  VERSION_DE_PHP="${VERSION_MINIMA_DE_PHP}"
fi
readonly VERSION_DE_PHP

# Comprobación explícita: si aun así no está el paquete, se para aquí con
# un mensaje claro en vez de fallar a mitad de la instalación.
if ! apt-cache show "php${VERSION_DE_PHP}-fpm" >/dev/null 2>&1; then
  aviso "No se encuentra php${VERSION_DE_PHP}-fpm ni tras añadir el repositorio."
  aviso "Comprueba que la distribución es compatible y vuelve a intentarlo."
  exit 1
fi

# ---------------------------------------------------------------------
# Qué motor de base de datos se va a usar
# ---------------------------------------------------------------------
# Debian no empaqueta MySQL: su motor es MariaDB. En Ubuntu están los
# dos y se mantiene MySQL, que es con lo que se probó el proyecto.
# `PAQUETE_BASE_DE_DATOS` es lo que se instala y `DRIVER_BASE_DE_DATOS`
# lo que se escribe en el .env, porque Laravel 12 los distingue.
if [[ "${DISTRIBUCION}" == "debian" ]] || ! apt-cache show mysql-server >/dev/null 2>&1; then
  readonly PAQUETE_BASE_DE_DATOS="mariadb-server"
  readonly DRIVER_BASE_DE_DATOS="mariadb"
else
  readonly PAQUETE_BASE_DE_DATOS="mysql-server"
  readonly DRIVER_BASE_DE_DATOS="mysql"
fi
echo "  Motor de base de datos: ${PAQUETE_BASE_DE_DATOS}."

${COMO_ROOT} apt-get install -y \
  nginx \
  "${PAQUETE_BASE_DE_DATOS}" \
  "php${VERSION_DE_PHP}-fpm" \
  "php${VERSION_DE_PHP}-cli" \
  "php${VERSION_DE_PHP}-mysql" \
  "php${VERSION_DE_PHP}-mbstring" \
  "php${VERSION_DE_PHP}-xml" \
  "php${VERSION_DE_PHP}-curl" \
  "php${VERSION_DE_PHP}-zip" \
  "php${VERSION_DE_PHP}-gd" \
  "php${VERSION_DE_PHP}-bcmath" \
  "php${VERSION_DE_PHP}-intl" \
  unzip curl git acl

# Composer, si no estaba ya.
if ! command -v composer >/dev/null 2>&1; then
  paso "Instalando Composer"
  curl -sS https://getcomposer.org/installer | php
  ${COMO_ROOT} mv composer.phar /usr/local/bin/composer
fi

# Node, desde el repositorio oficial (el de Ubuntu va muy por detrás).
if ! command -v node >/dev/null 2>&1; then
  paso "Instalando Node ${VERSION_DE_NODE}"
  curl -fsSL "https://deb.nodesource.com/setup_${VERSION_DE_NODE}.x" | ${COMO_ROOT:+sudo -E} bash -
  ${COMO_ROOT} apt-get install -y nodejs
fi

# ---------------------------------------------------------------------
# 1b) Memoria de intercambio (swap)
# ---------------------------------------------------------------------
# En el servidor conviven nginx, PHP-FPM y la base de datos. Durante un
# despliegue se suma el `npm ci`, que descomprime casi 40.000 ficheros.
# Si en un pico se agota la memoria, el kernel mata el proceso más gordo
# —que casi siempre es la base de datos—, y una base de datos que se cae
# a mitad de una migración es justo lo que no queremos.
#
# La swap es barata en disco y quita ese riesgo. Se pone aunque la
# máquina vaya sobrada de RAM (la de TS Sports tiene 7,8 GB): el coste
# es nulo mientras no haga falta, porque con swappiness=10 el kernel
# sigue prefiriendo la RAM.
paso "Configurando la memoria de intercambio"

readonly FICHERO_DE_SWAP="/swapfile"
readonly TAMANO_DE_SWAP="2G"

if ${COMO_ROOT} swapon --show | grep -q "${FICHERO_DE_SWAP}"; then
  aviso "Ya había swap activa: no se toca."
elif [[ -e "${FICHERO_DE_SWAP}" ]]; then
  aviso "${FICHERO_DE_SWAP} ya existe pero no está activo. Revísalo a mano."
else
  # fallocate es instantáneo; si el sistema de ficheros no lo admite se
  # cae a dd, que tarda más pero funciona en cualquier sitio.
  ${COMO_ROOT} fallocate -l "${TAMANO_DE_SWAP}" "${FICHERO_DE_SWAP}" 2>/dev/null \
    || ${COMO_ROOT} dd if=/dev/zero of="${FICHERO_DE_SWAP}" bs=1M count=2048 status=none

  # Solo root debe poder leerla: en la swap acaban trozos de memoria de
  # los procesos, contraseñas incluidas.
  ${COMO_ROOT} chmod 600 "${FICHERO_DE_SWAP}"
  ${COMO_ROOT} mkswap "${FICHERO_DE_SWAP}" >/dev/null
  ${COMO_ROOT} swapon "${FICHERO_DE_SWAP}"

  # Que sobreviva a un reinicio.
  if ! grep -q "${FICHERO_DE_SWAP}" /etc/fstab; then
    echo "${FICHERO_DE_SWAP} none swap sw 0 0" | ${COMO_ROOT} tee -a /etc/fstab >/dev/null
  fi

  # Con swap disponible, se prefiere seguir usando RAM salvo apuro real:
  # 10 en vez del 60 por defecto evita que el servidor tire de disco sin
  # necesidad y vaya lento.
  ${COMO_ROOT} sysctl -w vm.swappiness=10 >/dev/null
  grep -q "vm.swappiness" /etc/sysctl.conf \
    || echo "vm.swappiness=10" | ${COMO_ROOT} tee -a /etc/sysctl.conf >/dev/null

  echo "  swap de ${TAMANO_DE_SWAP} activa."
fi

# ---------------------------------------------------------------------
# 2) Base de datos
# ---------------------------------------------------------------------
paso "Creando la base de datos y su usuario"

# MariaDB 11 renombró sus binarios: el cliente pasó a llamarse `mariadb`
# y `mysql` quedó como enlace de compatibilidad que puede no estar. Se
# usa el que exista, para no depender de ese enlace.
if command -v mariadb >/dev/null 2>&1; then
  readonly CLIENTE_SQL="mariadb"
else
  readonly CLIENTE_SQL="mysql"
fi

# utf8mb4 es obligatorio: es lo que permite guardar tildes, la eñe y los
# emojis que la gente pega en los comentarios sin que se rompa nada.
${COMO_ROOT} "${CLIENTE_SQL}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${NOMBRE_BASE_DE_DATOS}\`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '${USUARIO_BASE_DE_DATOS}'@'localhost'
  IDENTIFIED BY '${PASSWORD_BASE_DE_DATOS}';

ALTER USER '${USUARIO_BASE_DE_DATOS}'@'localhost'
  IDENTIFIED BY '${PASSWORD_BASE_DE_DATOS}';

GRANT ALL PRIVILEGES ON \`${NOMBRE_BASE_DE_DATOS}\`.*
  TO '${USUARIO_BASE_DE_DATOS}'@'localhost';

FLUSH PRIVILEGES;
SQL

echo "  Base de datos '${NOMBRE_BASE_DE_DATOS}' lista."

# ---------------------------------------------------------------------
# 3) Configuración del backend
# ---------------------------------------------------------------------
paso "Preparando backend/.env"

if [[ -f "${CARPETA_DEL_PROYECTO}/backend/.env" ]]; then
  aviso "Ya existía un .env: no se toca. Comprueba a mano que DB_CONNECTION dice '${DRIVER_BASE_DE_DATOS}'."
else
  cp "${CARPETA_DEL_PROYECTO}/backend/.env.example" "${CARPETA_DEL_PROYECTO}/backend/.env"

  # Se rellenan los valores con sed. Se usa | como separador porque las
  # URLs llevan barras.
  sed -i "s|^APP_URL=.*|APP_URL=https://${DOMINIO}|"                        "${CARPETA_DEL_PROYECTO}/backend/.env"
  # El driver tiene que coincidir con el motor instalado: Laravel 12
  # define 'mysql' y 'mariadb' como conexiones separadas, y la de
  # MariaDB es la que genera el SQL correcto para ese servidor.
  sed -i "s|^DB_CONNECTION=.*|DB_CONNECTION=${DRIVER_BASE_DE_DATOS}|"       "${CARPETA_DEL_PROYECTO}/backend/.env"
  sed -i "s|^DB_DATABASE=.*|DB_DATABASE=${NOMBRE_BASE_DE_DATOS}|"           "${CARPETA_DEL_PROYECTO}/backend/.env"
  sed -i "s|^DB_USERNAME=.*|DB_USERNAME=${USUARIO_BASE_DE_DATOS}|"          "${CARPETA_DEL_PROYECTO}/backend/.env"
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${PASSWORD_BASE_DE_DATOS}|"         "${CARPETA_DEL_PROYECTO}/backend/.env"
  sed -i "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=${CORREO_DEL_ADMINISTRADOR}|"       "${CARPETA_DEL_PROYECTO}/backend/.env"
  sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${PASSWORD_DEL_ADMINISTRADOR}|" "${CARPETA_DEL_PROYECTO}/backend/.env"
  sed -i "s|^FRONTEND_URLS=.*|FRONTEND_URLS=https://${DOMINIO}|"            "${CARPETA_DEL_PROYECTO}/backend/.env"

  echo "  .env creado y configurado."
fi

paso "Instalando las dependencias de PHP"
composer install \
  --working-dir="${CARPETA_DEL_PROYECTO}/backend" \
  --no-dev --optimize-autoloader --no-interaction --prefer-dist

paso "Generando la clave de cifrado de la aplicación"
php "${CARPETA_DEL_PROYECTO}/backend/artisan" key:generate --force

paso "Creando las tablas"
php "${CARPETA_DEL_PROYECTO}/backend/artisan" migrate --force

paso "Sembrando el administrador y el contenido de la web"
php "${CARPETA_DEL_PROYECTO}/backend/artisan" db:seed --force

paso "Enlazando la carpeta de imágenes"
php "${CARPETA_DEL_PROYECTO}/backend/artisan" storage:link

# ---------------------------------------------------------------------
# 4) Frontend
# ---------------------------------------------------------------------
paso "Construyendo el frontend"
npm ci --prefix "${CARPETA_DEL_PROYECTO}/frontend"
npm run build --prefix "${CARPETA_DEL_PROYECTO}/frontend"

# ---------------------------------------------------------------------
# 5) Permisos
# ---------------------------------------------------------------------
paso "Ajustando permisos"
# $USER puede venir vacío en un shell no interactivo y con `set -u` eso
# aborta la instalación: se le pregunta al sistema quién somos.
readonly USUARIO_ACTUAL="$(id -un)"
${COMO_ROOT} chown -R "${USUARIO_ACTUAL}":www-data "${CARPETA_DEL_PROYECTO}/backend/storage" \
                               "${CARPETA_DEL_PROYECTO}/backend/bootstrap/cache"
${COMO_ROOT} chmod -R 775 "${CARPETA_DEL_PROYECTO}/backend/storage" \
                  "${CARPETA_DEL_PROYECTO}/backend/bootstrap/cache"

# El .env lleva contraseñas: solo lo lee su dueño.
chmod 600 "${CARPETA_DEL_PROYECTO}/backend/.env"

# ---------------------------------------------------------------------
# 6) nginx
# ---------------------------------------------------------------------
paso "Configurando nginx"

# Se copia la plantilla sustituyendo el dominio y la ruta reales.
${COMO_ROOT} sed \
  -e "s|tssports.com|${DOMINIO}|g" \
  -e "s|/var/www/tsports|${CARPETA_DEL_PROYECTO}|g" \
  -e "s|php8.2-fpm.sock|php${VERSION_DE_PHP}-fpm.sock|g" \
  "${CARPETA_DEL_PROYECTO}/deploy/nginx.conf" \
  | ${COMO_ROOT} tee /etc/nginx/sites-available/tsports >/dev/null

${COMO_ROOT} ln -sf /etc/nginx/sites-available/tsports /etc/nginx/sites-enabled/tsports

# El sitio de bienvenida de nginx estorba: ocupa el puerto 80 por defecto.
${COMO_ROOT} rm -f /etc/nginx/sites-enabled/default

${COMO_ROOT} nginx -t

# `reload` falla si el servicio no estaba levantado, cosa que pasa en una
# instalación desde cero. `enable --now` lo deja arrancado y activado al
# inicio, y el reload posterior aplica la configuración recién escrita.
${COMO_ROOT} systemctl enable --now nginx
${COMO_ROOT} systemctl reload nginx

# ---------------------------------------------------------------------
# 6b) Cortafuegos
# ---------------------------------------------------------------------
# Un VPS recién entregado viene con nftables vacío: cualquier puerto que
# un proceso abra queda expuesto a internet. Aquí solo tienen que verse
# tres cosas: SSH, HTTP y HTTPS. En particular, el 3306 de la base de
# datos NO debe salir de la máquina.
paso "Configurando el cortafuegos"

${COMO_ROOT} apt-get install -y ufw

# El orden importa y no es negociable: primero se autoriza SSH y solo
# después se activa el cortafuegos. Al revés, la regla por defecto de
# denegar entrante corta la propia sesión desde la que se está
# instalando y el servidor queda inaccesible.
#
# Se lee el puerto real de sshd en vez de suponer el 22: si alguien lo
# cambió, dar por bueno el 22 dejaría fuera al siguiente que entre.
#
# El awk guarda y no sale a la primera: cortarle la salida a `sshd -T` a
# media escritura le provoca un SIGPIPE y, con `set -o pipefail`, la
# línea devuelve 141 y `set -e` aborta la instalación aquí mismo —
# después de haber montado todo y justo antes del cortafuegos. Ya pasó.
# El `|| true` cubre además el caso de que sshd no sepa responder, y
# entonces se recurre al 22 de la línea siguiente.
PUERTO_SSH="$(${COMO_ROOT} sshd -T 2>/dev/null | awk '/^port /{puerto=$2} END{print puerto}' || true)"
PUERTO_SSH="${PUERTO_SSH:-22}"
readonly PUERTO_SSH

${COMO_ROOT} ufw allow "${PUERTO_SSH}"/tcp comment "SSH"
${COMO_ROOT} ufw allow 80/tcp   comment "HTTP"
${COMO_ROOT} ufw allow 443/tcp  comment "HTTPS"

${COMO_ROOT} ufw default deny incoming
${COMO_ROOT} ufw default allow outgoing

# --force evita la pregunta interactiva, que colgaría el guion.
${COMO_ROOT} ufw --force enable
${COMO_ROOT} ufw status verbose

# ---------------------------------------------------------------------
# 7) Resumen
# ---------------------------------------------------------------------
echo -e "\n${VERDE}═══════════════════════════════════════════════════════${SIN_COLOR}"
echo -e "${VERDE}  ✔ TS Sports instalado${SIN_COLOR}"
echo -e "${VERDE}═══════════════════════════════════════════════════════${SIN_COLOR}"
echo
echo "  Web:    http://${DOMINIO}"
echo "  Panel:  http://${DOMINIO}/entrar"
echo
echo "  ADMINISTRADOR"
echo "    Correo:      ${CORREO_DEL_ADMINISTRADOR}"
echo "    Contraseña:  ${PASSWORD_DEL_ADMINISTRADOR}"
echo
echo "  BASE DE DATOS"
echo "    Nombre:      ${NOMBRE_BASE_DE_DATOS}"
echo "    Usuario:     ${USUARIO_BASE_DE_DATOS}"
echo "    Contraseña:  ${PASSWORD_BASE_DE_DATOS}"
echo
echo -e "${AMARILLO}  ANOTA ESTAS CONTRASEÑAS AHORA: no se vuelven a mostrar.${SIN_COLOR}"
echo -e "${AMARILLO}  (La del administrador queda en backend/.env; cámbiala al entrar.)${SIN_COLOR}"
echo
echo "  SIGUIENTE PASO — el certificado HTTPS:"
echo "    sudo apt install -y certbot python3-certbot-nginx"
echo "    sudo certbot --nginx -d ${DOMINIO} -d www.${DOMINIO}"
echo
