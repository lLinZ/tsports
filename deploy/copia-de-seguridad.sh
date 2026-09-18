#!/usr/bin/env bash
#
# =====================================================================
#  TS SPORTS — Copia de seguridad
#  ---------------------------------------------------------------------
#  Copia la base de datos y las imágenes subidas
#  (backend/storage/app/public) de ESTA instalación, comprueba que la
#  copia está entera y borra las que ya han caducado.
#
#  USO
#    sudo ./deploy/copia-de-seguridad.sh
#        La diaria: base e imágenes. La lanza systemd de madrugada
#        (deploy/tsports-copia.timer), así que a mano solo hace falta
#        para sacar una fuera de hora.
#
#    sudo ./deploy/copia-de-seguridad.sh --solo-base antes-de-desplegar
#        Solo la base, con un motivo en el nombre. La pide desplegar.sh
#        antes de migrar: una migración que sale mal se deshace
#        restaurando esa copia, no a mano.
#
#  DÓNDE QUEDAN
#    /var/backups/<carpeta de la instalación>/automaticas/
#        20260918-073000-diaria-base.sql.gz
#        20260918-073000-diaria-archivos.tar.gz
#    La hora del nombre es UTC. Solo root puede leerlas: la base lleva
#    los hashes de las contraseñas y los tokens de sesión.
#
#  CUÁNTO DURAN
#    · la de cada día y las de antes de desplegar → 14 días
#    · la del domingo («semanal») → 90 días
#    Con solo 14 días, un error que se descubre a las tres semanas —una
#    marca borrada sin querer— ya no tendría copia de la que salir.
#    Lo que haya fuera de automaticas/ (las copias hechas a mano) no lo
#    toca nunca.
#
#  LO QUE NO RESUELVE
#    Las copias viven en el mismo disco que el sitio. Protegen de un
#    error —una migración torcida, un borrado—, no de perder el servidor
#    entero. Para eso hay que sacarlas de la máquina.
#
#  CÓMO ENTRA EN LA BASE
#    Como root por el socket de MariaDB, sin contraseña escrita en
#    ningún sitio. Del .env solo se lee el NOMBRE de la base, para que
#    el mismo guion sirva a producción y a test.
# =====================================================================

set -euo pipefail

# Todo lo que se cree a partir de aquí nace legible solo por root.
umask 077

readonly CARPETA_DEL_PROYECTO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly CARPETA_BACKEND="${CARPETA_DEL_PROYECTO}/backend"
readonly NOMBRE_DE_LA_INSTALACION="$(basename "${CARPETA_DEL_PROYECTO}")"
readonly CARPETA_DE_LA_INSTALACION="/var/backups/${NOMBRE_DE_LA_INSTALACION}"
readonly CARPETA_DE_COPIAS="${CARPETA_DE_LA_INSTALACION}/automaticas"

readonly DIAS_QUE_DURA_UNA_COPIA=14
readonly DIAS_QUE_DURA_LA_SEMANAL=90

fallo() { echo "✖ $1" >&2; exit 1; }
aviso() { echo "  ! $1"; }

# ---------------------------------------------------------------------
# Qué copia se pide
# ---------------------------------------------------------------------
SOLO_LA_BASE=false
MOTIVO=""

for ARGUMENTO in "$@"; do
  case "${ARGUMENTO}" in
    --solo-base) SOLO_LA_BASE=true ;;
    -*) fallo "Opción desconocida: ${ARGUMENTO}" ;;
    *) MOTIVO="${ARGUMENTO}" ;;
  esac
done

# El motivo va dentro del nombre del fichero y decide cuánto dura la
# copia, así que no puede traer barras ni espacios.
if [[ -z "${MOTIVO}" ]]; then
  if [[ "$(date -u +%u)" -eq 7 ]]; then
    MOTIVO="semanal"
  else
    MOTIVO="diaria"
  fi
fi

[[ "${MOTIVO}" =~ ^[a-z0-9-]+$ ]] || \
  fallo "El motivo solo admite minúsculas, cifras y guiones: «${MOTIVO}»."

readonly SOLO_LA_BASE MOTIVO

# ---------------------------------------------------------------------
# Comprobaciones previas
# ---------------------------------------------------------------------
[[ "$(id -u)" -eq 0 ]] || \
  fallo "Hay que ejecutarlo como root: la base se lee por el socket de root."

[[ -f "${CARPETA_BACKEND}/.env" ]] || fallo "No encuentro backend/.env."

leer_del_env() {
  grep -m1 "^$1=" "${CARPETA_BACKEND}/.env" | cut -d= -f2- | tr -d "\"'" || true
}

readonly CONEXION="$(leer_del_env DB_CONNECTION)"
readonly BASE_DE_DATOS="$(leer_del_env DB_DATABASE)"

[[ "${CONEXION}" == "mariadb" || "${CONEXION}" == "mysql" ]] || \
  fallo "Esta instalación usa «${CONEXION}»: el guion solo sabe copiar MariaDB y MySQL."

[[ -n "${BASE_DE_DATOS}" ]] || fallo "backend/.env no dice qué base usar (DB_DATABASE)."

# Debian trae los dos nombres; en otras distribuciones puede faltar uno.
if command -v mariadb-dump >/dev/null 2>&1; then
  readonly VOLCADOR="mariadb-dump"
else
  readonly VOLCADOR="mysqldump"
fi

# Una copia a la vez por instalación. Se espera en lugar de fallar: si
# se despliega justo mientras corre la diaria, lo razonable es que el
# despliegue aguarde un minuto, no que se cancele.
exec 9>"/run/lock/${NOMBRE_DE_LA_INSTALACION}-copia.lock"
flock -w 600 9 || fallo "Otra copia lleva más de diez minutos en marcha."

mkdir -p "${CARPETA_DE_COPIAS}"
chmod 700 "${CARPETA_DE_LA_INSTALACION}" "${CARPETA_DE_COPIAS}"

readonly PREFIJO="${CARPETA_DE_COPIAS}/$(date -u +%Y%m%d-%H%M%S)-${MOTIVO}"

# Se escribe primero con la terminación .parcial y se renombra al final.
# Si el volcado se corta a medias, no queda un .sql.gz de aspecto normal
# y medio vacío que alguien restauraría confiado.
trap 'rm -f "${PREFIJO}"-*.parcial' EXIT

# ---------------------------------------------------------------------
# 1) La base
# ---------------------------------------------------------------------
echo "▶ Copiando la base «${BASE_DE_DATOS}»"

readonly COPIA_DE_LA_BASE="${PREFIJO}-base.sql.gz"

# --single-transaction saca una foto coherente sin bloquear las tablas:
# el panel sigue funcionando mientras se copia. Sin --databases, el
# volcado no lleva CREATE DATABASE ni USE, y así se puede cargar en una
# base con otro nombre (es lo que hace comprobar-copia.sh).
"${VOLCADOR}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --default-character-set=utf8mb4 \
  "${BASE_DE_DATOS}" \
  | gzip -9 > "${COPIA_DE_LA_BASE}.parcial"

gzip -t "${COPIA_DE_LA_BASE}.parcial" || fallo "La copia de la base salió corrupta."

# El volcador escribe «-- Dump completed» como última línea solo si
# terminó bien. Es la forma de distinguir una copia entera de una que se
# quedó a medias sin dar error.
zcat "${COPIA_DE_LA_BASE}.parcial" | tail -n 1 | grep -q "Dump completed" || \
  fallo "El volcado de la base no llegó hasta el final."

mv "${COPIA_DE_LA_BASE}.parcial" "${COPIA_DE_LA_BASE}"
echo "  $(du -h "${COPIA_DE_LA_BASE}" | cut -f1)  ${COPIA_DE_LA_BASE}"

# ---------------------------------------------------------------------
# 2) Las imágenes
# ---------------------------------------------------------------------
if [[ "${SOLO_LA_BASE}" == false ]]; then
  readonly CARPETA_DE_ARCHIVOS="${CARPETA_BACKEND}/storage/app/public"
  readonly COPIA_DE_LOS_ARCHIVOS="${PREFIJO}-archivos.tar.gz"

  if [[ -d "${CARPETA_DE_ARCHIVOS}" ]]; then
    echo "▶ Copiando las imágenes subidas"

    # tar devuelve 1 cuando un fichero cambia mientras lo lee (alguien
    # sube un logo justo a esa hora). La copia sigue siendo válida; solo
    # un 2 o más es un fallo de verdad.
    set +e
    tar -czf "${COPIA_DE_LOS_ARCHIVOS}.parcial" -C "${CARPETA_BACKEND}/storage/app" public
    ESTADO_DE_TAR=$?
    set -e

    (( ESTADO_DE_TAR <= 1 )) || fallo "No se pudieron empaquetar las imágenes (tar devolvió ${ESTADO_DE_TAR})."

    tar -tzf "${COPIA_DE_LOS_ARCHIVOS}.parcial" >/dev/null || \
      fallo "La copia de las imágenes salió corrupta."

    mv "${COPIA_DE_LOS_ARCHIVOS}.parcial" "${COPIA_DE_LOS_ARCHIVOS}"
    echo "  $(du -h "${COPIA_DE_LOS_ARCHIVOS}" | cut -f1)  ${COPIA_DE_LOS_ARCHIVOS}"
  else
    aviso "No existe ${CARPETA_DE_ARCHIVOS}: no hay imágenes que copiar."
  fi
fi

# ---------------------------------------------------------------------
# 3) Rotación
# ---------------------------------------------------------------------
# Solo se llega aquí si la copia de hoy salió bien (set -e): un fallo
# nunca se lleva por delante las copias buenas que había.
echo "▶ Borrando las copias caducadas"

find "${CARPETA_DE_COPIAS}" -maxdepth 1 -type f -name '*-semanal-*' \
  -mtime +"${DIAS_QUE_DURA_LA_SEMANAL}" -print -delete

find "${CARPETA_DE_COPIAS}" -maxdepth 1 -type f ! -name '*-semanal-*' \
  -mtime +"${DIAS_QUE_DURA_UNA_COPIA}" -print -delete

echo "✔ Copia terminada. Hay $(find "${CARPETA_DE_COPIAS}" -maxdepth 1 -type f -name '*-base.sql.gz' | wc -l) copias de la base guardadas ($(du -sh "${CARPETA_DE_COPIAS}" | cut -f1))."
