#!/usr/bin/env bash
#
# =====================================================================
#  TS SPORTS — Comprobar que una copia se puede restaurar
#  ---------------------------------------------------------------------
#  Una copia que nunca se ha restaurado no es una copia: es una
#  esperanza. Este guion la restaura de verdad, pero en una base
#  APARTE, así que se puede lanzar en cualquier momento sin riesgo.
#
#    1. Carga la copia en <base>_comprobacion.
#    2. Cuenta las filas de cada tabla y las pone junto a las de la base
#       viva.
#    3. Borra <base>_comprobacion.
#
#  La base de verdad solo se LEE, para contar.
#
#  USO
#    sudo ./deploy/comprobar-copia.sh                        # la última copia
#    sudo ./deploy/comprobar-copia.sh /ruta/copia.sql.gz     # una concreta
#
#  El servicio de la copia diaria lo lanza justo después de copiar, así
#  que cada copia automática queda restaurada una vez.
#
#  CUÁNDO FALLA
#    · si la copia no se puede cargar,
#    · si le falta una tabla que la base viva sí tiene,
#    · si una tabla con datos en la base viva sale vacía en la copia.
#  Que las cifras difieran un poco es normal: lo que se hizo después de
#  copiar no está en la copia. Las tablas que el sistema llena y vacía
#  solo (caché, sesiones, cola) no cuentan para lo tercero.
#
#  PARA RESTAURAR DE VERDAD (a mano, con el sitio en mantenimiento)
#    php backend/artisan down
#    zcat /var/backups/tsports/automaticas/<copia>-base.sql.gz | mariadb tsports
#    tar -xzf <copia>-archivos.tar.gz -C backend/storage/app
#    php backend/artisan up
# =====================================================================

set -euo pipefail

# Lo que se escriba al disco, legible solo por root.
umask 077

readonly CARPETA_DEL_PROYECTO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly CARPETA_BACKEND="${CARPETA_DEL_PROYECTO}/backend"
readonly NOMBRE_DE_LA_INSTALACION="$(basename "${CARPETA_DEL_PROYECTO}")"
readonly CARPETA_DE_COPIAS="/var/backups/${NOMBRE_DE_LA_INSTALACION}/automaticas"

# Tablas que Laravel llena y vacía por su cuenta. Que salgan vacías en
# una copia de las 3 de la madrugada no dice nada de la copia.
readonly TABLAS_DE_PASO=" cache cache_locks jobs job_batches failed_jobs sessions password_reset_tokens personal_access_tokens "

fallo() { echo "✖ $1" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || \
  fallo "Hay que ejecutarlo como root: la base se lee por el socket de root."

readonly BASE_VIVA="$(grep -m1 '^DB_DATABASE=' "${CARPETA_BACKEND}/.env" | cut -d= -f2- | tr -d "\"'" || true)"
[[ -n "${BASE_VIVA}" ]] || fallo "backend/.env no dice qué base usar (DB_DATABASE)."

# El sufijo es la única protección entre este guion y un DROP DATABASE
# de la base de verdad. No se construye de ninguna otra forma.
readonly BASE_DE_COMPROBACION="${BASE_VIVA}_comprobacion"

# ---------------------------------------------------------------------
# Qué copia se comprueba
# ---------------------------------------------------------------------
if [[ $# -ge 1 ]]; then
  readonly COPIA_DE_LA_BASE="$1"
else
  shopt -s nullglob
  COPIAS=("${CARPETA_DE_COPIAS}"/*-base.sql.gz)
  shopt -u nullglob

  [[ ${#COPIAS[@]} -gt 0 ]] || fallo "No hay ninguna copia en ${CARPETA_DE_COPIAS}."

  # El nombre empieza por la fecha, así que el último en orden
  # alfabético es el más reciente.
  readonly COPIA_DE_LA_BASE="${COPIAS[-1]}"
fi

[[ -f "${COPIA_DE_LA_BASE}" ]] || fallo "No existe ${COPIA_DE_LA_BASE}."

# La misma cerradura que la copia: dos comprobaciones a la vez se
# pisarían la base de comprobación.
exec 9>"/run/lock/${NOMBRE_DE_LA_INSTALACION}-copia.lock"
flock -w 600 9 || fallo "Otra copia o comprobación lleva más de diez minutos en marcha."

borrar_la_base_de_comprobacion() {
  mariadb -e "DROP DATABASE IF EXISTS \`${BASE_DE_COMPROBACION}\`"
}

# Pase lo que pase, no se deja una segunda copia de los datos tirada en
# el servidor.
trap borrar_la_base_de_comprobacion EXIT

# ---------------------------------------------------------------------
# 1) Restaurar en la base aparte
# ---------------------------------------------------------------------
echo "▶ Restaurando $(basename "${COPIA_DE_LA_BASE}") en «${BASE_DE_COMPROBACION}»"

borrar_la_base_de_comprobacion
mariadb -e "CREATE DATABASE \`${BASE_DE_COMPROBACION}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

# Cuando la carga falla, el cliente de MariaDB repite la sentencia entera
# que no pudo leer: filas de marcas con sus contactos y teléfonos, que
# acabarían en el registro del sistema. Se guarda aparte y solo se
# enseña el código del error y la línea.
readonly ERRORES_DE_LA_CARGA="$(mktemp)"
trap 'rm -f "${ERRORES_DE_LA_CARGA}"; borrar_la_base_de_comprobacion' EXIT

if ! zcat "${COPIA_DE_LA_BASE}" 2>"${ERRORES_DE_LA_CARGA}.zcat" \
  | mariadb "${BASE_DE_COMPROBACION}" 2>"${ERRORES_DE_LA_CARGA}"; then
  cat "${ERRORES_DE_LA_CARGA}.zcat" >&2
  grep -m1 '^ERROR' "${ERRORES_DE_LA_CARGA}" | cut -d: -f1 >&2 || true
  rm -f "${ERRORES_DE_LA_CARGA}.zcat"
  fallo "La copia no se pudo cargar: no serviría para restaurar."
fi

rm -f "${ERRORES_DE_LA_CARGA}.zcat"

# ---------------------------------------------------------------------
# 2) Comparar tabla por tabla
# ---------------------------------------------------------------------
# COUNT(*) y no TABLE_ROWS de information_schema: en InnoDB ese dato es
# una estimación y puede bailar un 40 %.
contar_las_filas() {
  local BASE="$1"
  local TABLA

  mariadb -N -B -e "SELECT table_name FROM information_schema.tables WHERE table_schema = '${BASE}' AND table_type = 'BASE TABLE' ORDER BY table_name" \
    | while read -r TABLA; do
        printf '%s\t%s\n' "${TABLA}" "$(mariadb -N -B -e "SELECT COUNT(*) FROM \`${BASE}\`.\`${TABLA}\`")"
      done
}

declare -A FILAS_EN_LA_COPIA=()
declare -A FILAS_AHORA=()

while IFS=$'\t' read -r TABLA FILAS; do
  FILAS_EN_LA_COPIA["${TABLA}"]="${FILAS}"
done < <(contar_las_filas "${BASE_DE_COMPROBACION}")

while IFS=$'\t' read -r TABLA FILAS; do
  FILAS_AHORA["${TABLA}"]="${FILAS}"
done < <(contar_las_filas "${BASE_VIVA}")

PROBLEMAS=0

printf '\n  %-32s %10s %10s\n' "TABLA" "EN LA COPIA" "AHORA"

for TABLA in $(printf '%s\n' "${!FILAS_AHORA[@]}" | sort); do
  AHORA="${FILAS_AHORA[${TABLA}]}"

  if [[ -z "${FILAS_EN_LA_COPIA[${TABLA}]+hay}" ]]; then
    printf '  %-32s %10s %10s   ✖ falta en la copia\n' "${TABLA}" "—" "${AHORA}"
    PROBLEMAS=$((PROBLEMAS + 1))
    continue
  fi

  EN_LA_COPIA="${FILAS_EN_LA_COPIA[${TABLA}]}"
  NOTA=""

  if [[ "${EN_LA_COPIA}" -eq 0 && "${AHORA}" -gt 0 && "${TABLAS_DE_PASO}" != *" ${TABLA} "* ]]; then
    NOTA="   ✖ vacía en la copia"
    PROBLEMAS=$((PROBLEMAS + 1))
  elif [[ "${EN_LA_COPIA}" -ne "${AHORA}" ]]; then
    NOTA="   (cambió después de copiar)"
  fi

  printf '  %-32s %10s %10s%s\n' "${TABLA}" "${EN_LA_COPIA}" "${AHORA}" "${NOTA}"
done

# ---------------------------------------------------------------------
# 3) Las imágenes de la misma copia, si las hay
# ---------------------------------------------------------------------
readonly COPIA_DE_LOS_ARCHIVOS="${COPIA_DE_LA_BASE%-base.sql.gz}-archivos.tar.gz"

if [[ -f "${COPIA_DE_LOS_ARCHIVOS}" ]]; then
  # Se cuenta lo que no acaba en «/», que son las carpetas.
  FICHEROS_EN_LA_COPIA="$(tar -tzf "${COPIA_DE_LOS_ARCHIVOS}" | grep -vc '/$' || true)"
  FICHEROS_AHORA="$(find "${CARPETA_BACKEND}/storage/app/public" -type f | wc -l)"

  printf '\n  %-32s %10s %10s\n' "imágenes subidas" "${FICHEROS_EN_LA_COPIA}" "${FICHEROS_AHORA}"

  if [[ "${FICHEROS_EN_LA_COPIA}" -eq 0 && "${FICHEROS_AHORA}" -gt 0 ]]; then
    echo "  ✖ La copia de las imágenes está vacía."
    PROBLEMAS=$((PROBLEMAS + 1))
  fi
fi

echo

if [[ "${PROBLEMAS}" -gt 0 ]]; then
  fallo "La copia tiene ${PROBLEMAS} problema(s): no fiarse de ella."
fi

echo "✔ La copia se restaura entera."
