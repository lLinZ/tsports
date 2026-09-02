#!/usr/bin/env bash
# ---------------------------------------------------------------------
# exportar-supabase.sh — saca las cuatro tablas de Supabase a JSON.
#
# La clave service_role salta el RLS, que es lo que hace falta: con la
# clave anónima las tres tablas del CRM devuelven [] en silencio.
#
# Uso:  SUPABASE_SERVICE_KEY='...' ./exportar-supabase.sh <carpeta-destino>
#
# Pagina de 1000 en 1000 porque PostgREST corta ahí por defecto, y ordena
# por id para que las páginas no se solapen ni se salten filas.
# ---------------------------------------------------------------------
set -euo pipefail

PROYECTO="https://itlfmmvanjqeimxrzipo.supabase.co"
CARPETA="${1:?Falta la carpeta destino}"
CLAVE="${SUPABASE_SERVICE_KEY:?Falta SUPABASE_SERVICE_KEY}"
TAMANO_DE_PAGINA=1000

mkdir -p "$CARPETA"

for TABLA in profiles deals deal_comments site_content; do
  DESDE=0
  ACUMULADO="[]"

  while :; do
    HASTA=$(( DESDE + TAMANO_DE_PAGINA - 1 ))
    PAGINA=$(curl -sS -m 60 \
      -H "apikey: $CLAVE" \
      -H "Authorization: Bearer $CLAVE" \
      -H "Range: ${DESDE}-${HASTA}" \
      "$PROYECTO/rest/v1/$TABLA?select=*&order=id")

    # Un error de PostgREST llega como objeto, no como lista: se corta aquí
    # en vez de escribir un fichero a medias que el importador daría por bueno.
    if [ "${PAGINA:0:1}" != "[" ]; then
      echo "  ✖ $TABLA: $PAGINA" >&2
      exit 1
    fi

    FILAS_DE_LA_PAGINA=$(printf '%s' "$PAGINA" | php -r 'echo count(json_decode(stream_get_contents(STDIN), true));')
    ACUMULADO=$(printf '%s\n%s' "$ACUMULADO" "$PAGINA" | php -r '
      $lineas = explode("\n", trim(stream_get_contents(STDIN)), 2);
      echo json_encode(
        array_merge(json_decode($lineas[0], true), json_decode($lineas[1], true)),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
      );
    ')

    [ "$FILAS_DE_LA_PAGINA" -lt "$TAMANO_DE_PAGINA" ] && break
    DESDE=$(( DESDE + TAMANO_DE_PAGINA ))
  done

  printf '%s' "$ACUMULADO" > "$CARPETA/$TABLA.json"
  TOTAL=$(printf '%s' "$ACUMULADO" | php -r 'echo count(json_decode(stream_get_contents(STDIN), true));')
  echo "  ✔ $TABLA: $TOTAL filas"
done
