#!/usr/bin/env bash
#
# =====================================================================
#  TS SPORTS — Despliegue en el VPS
#  ---------------------------------------------------------------------
#  Actualiza el código, instala dependencias, aplica las migraciones y
#  reconstruye el frontend. Es seguro ejecutarlo tantas veces como haga
#  falta.
#
#  USO
#    cd /var/www/tsports
#    ./deploy/desplegar.sh
#
#  La primera vez usa deploy/instalar-vps.sh, que además prepara la base
#  de datos y crea la cuenta de administrador.
# =====================================================================

# -e  : se detiene en cuanto algo falla, en vez de seguir a ciegas.
# -u  : una variable sin definir es un error, no una cadena vacía.
# -o pipefail : un fallo en mitad de una tubería no pasa desapercibido.
set -euo pipefail

# Raíz del proyecto, calculada desde la ubicación de este guion: así
# funciona igual se llame desde donde se llame.
readonly CARPETA_DEL_PROYECTO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly CARPETA_BACKEND="${CARPETA_DEL_PROYECTO}/backend"
readonly CARPETA_FRONTEND="${CARPETA_DEL_PROYECTO}/frontend"

# Colores para que el registro se lea de un vistazo.
readonly VERDE='\033[0;32m'
readonly AMARILLO='\033[1;33m'
readonly ROJO='\033[0;31m'
readonly SIN_COLOR='\033[0m'

paso()   { echo -e "\n${VERDE}▶ $1${SIN_COLOR}"; }
aviso()  { echo -e "${AMARILLO}  ! $1${SIN_COLOR}"; }
fallo()  { echo -e "${ROJO}✖ $1${SIN_COLOR}" >&2; exit 1; }

# Cómo se piden privilegios de root. En un Debian recién entregado no
# suele venir `sudo` instalado y se trabaja como root directamente, así
# que escribir `sudo` a pelo daría "command not found".
if [[ "$(id -u)" -eq 0 ]]; then
  COMO_ROOT=""
elif command -v sudo >/dev/null 2>&1; then
  COMO_ROOT="sudo"
else
  fallo "Necesito privilegios de root y no hay 'sudo'. Ejecútalo como root."
fi
readonly COMO_ROOT

# ---------------------------------------------------------------------
# Comprobaciones previas
# ---------------------------------------------------------------------
paso "Comprobando el entorno"

[[ -d "${CARPETA_BACKEND}" ]]  || fallo "No encuentro la carpeta backend."
[[ -d "${CARPETA_FRONTEND}" ]] || fallo "No encuentro la carpeta frontend."
[[ -f "${CARPETA_BACKEND}/.env" ]] || fallo \
  "Falta backend/.env. Cópialo de backend/.env.example y rellénalo."

command -v php      >/dev/null || fallo "PHP no está instalado."
command -v composer >/dev/null || fallo "Composer no está instalado."
command -v npm      >/dev/null || fallo "Node/npm no está instalado."

echo "  PHP      $(php -r 'echo PHP_VERSION;')"
echo "  Composer $(composer --version --no-ansi | cut -d' ' -f3)"
echo "  Node     $(node -v)"

# ---------------------------------------------------------------------
# 1) Modo mantenimiento
# ---------------------------------------------------------------------
# Mientras se migra la base de datos, la API responde 503 en vez de
# devolver errores raros a quien esté trabajando en ese momento.
paso "Activando el modo mantenimiento"
php "${CARPETA_BACKEND}/artisan" down --render="errors::503" --retry=60 || \
  aviso "No se pudo activar (¿primera instalación?). Se continúa."

# Pase lo que pase a partir de aquí, el sitio vuelve a levantarse.
restaurar_el_sitio() {
  php "${CARPETA_BACKEND}/artisan" up >/dev/null 2>&1 || true
}
trap restaurar_el_sitio EXIT

# ---------------------------------------------------------------------
# 2) Código
# ---------------------------------------------------------------------
if [[ -d "${CARPETA_DEL_PROYECTO}/.git" ]]; then
  paso "Bajando los cambios del repositorio"
  git -C "${CARPETA_DEL_PROYECTO}" pull --ff-only
else
  aviso "Esto no es un repositorio git: se despliega el código que ya hay."
fi

# ---------------------------------------------------------------------
# 3) Backend
# ---------------------------------------------------------------------
paso "Instalando las dependencias de PHP"
# --no-dev quita las herramientas de desarrollo; -o optimiza el
# autocargador, que en producción se nota en cada petición.
composer install \
  --working-dir="${CARPETA_BACKEND}" \
  --no-dev \
  --optimize-autoloader \
  --no-interaction \
  --prefer-dist

paso "Aplicando las migraciones de la base de datos"
php "${CARPETA_BACKEND}/artisan" migrate --force

paso "Enlazando la carpeta de imágenes"
php "${CARPETA_BACKEND}/artisan" storage:link 2>/dev/null || \
  aviso "El enlace ya existía."

paso "Regenerando la caché de configuración"
# Se limpia antes de cachear: si no, un valor viejo puede quedarse
# pegado y provocar fallos imposibles de explicar.
php "${CARPETA_BACKEND}/artisan" optimize:clear
php "${CARPETA_BACKEND}/artisan" config:cache
php "${CARPETA_BACKEND}/artisan" route:cache
php "${CARPETA_BACKEND}/artisan" event:cache

# ---------------------------------------------------------------------
# 4) Frontend
# ---------------------------------------------------------------------
paso "Instalando las dependencias de Node"
# `npm ci` instala exactamente lo que dice package-lock.json: en
# producción no queremos que una dependencia se actualice sola.
npm ci --prefix "${CARPETA_FRONTEND}"

paso "Construyendo el frontend"
# El build incluye la comprobación de tipos: si algo no compila, el
# despliegue se detiene aquí y el sitio anterior sigue en pie.
npm run build --prefix "${CARPETA_FRONTEND}"

[[ -f "${CARPETA_FRONTEND}/dist/index.html" ]] || \
  fallo "El build no generó dist/index.html."

# ---------------------------------------------------------------------
# 5) Permisos
# ---------------------------------------------------------------------
paso "Ajustando los permisos de escritura"
# Laravel necesita escribir en storage (registros, caché, imágenes) y en
# bootstrap/cache. El resto se queda de solo lectura.
#
# Antes esto estaba dentro de un `if command -v setfacl`, pero el cuerpo
# solo usa chown y chmod: en un servidor sin el paquete `acl` se saltaba
# el ajuste entero y solo dejaba un aviso. El síntoma era feísimo de
# diagnosticar —la web carga y solo fallan las subidas y el registro—,
# así que la condición se quitó.
#
# $USER no está definido en un shell no interactivo (cron, por ejemplo) y
# con `set -u` eso aborta el despliegue: se pregunta al sistema.
readonly USUARIO_ACTUAL="$(id -un)"
${COMO_ROOT} chown -R "${USUARIO_ACTUAL}":www-data "${CARPETA_BACKEND}/storage" "${CARPETA_BACKEND}/bootstrap/cache"
${COMO_ROOT} chmod -R 775 "${CARPETA_BACKEND}/storage" "${CARPETA_BACKEND}/bootstrap/cache"

# ---------------------------------------------------------------------
# 6) Volver a levantar
# ---------------------------------------------------------------------
paso "Reiniciando PHP-FPM y nginx"

# El nombre del servicio lleva la versión dentro (php8.2-fpm, php8.3-fpm…),
# así que se busca cuál está instalado en vez de darlo por supuesto. Si se
# fija a mano y el VPS trae otra versión, la recarga falla en silencio y el
# código nuevo no llega a entrar en producción: se sigue sirviendo el
# viejo desde el proceso que quedó vivo.
SERVICIO_PHP_FPM="$(systemctl list-units --type=service --all --no-legend 'php*-fpm.service' 2>/dev/null | awk '{print $1}' | head -1)"

if [[ -n "${SERVICIO_PHP_FPM}" ]]; then
  ${COMO_ROOT} systemctl reload "${SERVICIO_PHP_FPM}" && echo "  recargado ${SERVICIO_PHP_FPM}"
else
  aviso "No encontré ningún servicio php*-fpm. Recárgalo a mano."
fi

${COMO_ROOT} systemctl reload nginx 2>/dev/null || aviso "No se pudo recargar nginx."

paso "Saliendo del modo mantenimiento"
php "${CARPETA_BACKEND}/artisan" up

# El trap ya no hace falta: el sitio está arriba.
trap - EXIT

echo -e "\n${VERDE}✔ Despliegue terminado.${SIN_COLOR}"
echo "  Comprueba que responde:  curl -s https://tssports.com/up"
