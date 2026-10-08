/**
 * providers/ProveedorCambiosEnVivo.tsx
 * ---------------------------------------------------------------------
 * Las pantallas del panel se ponen al día solas cuando otra persona
 * cambia algo (regla 22). Desde el 2026-09-30.
 *
 * El servidor avisa por el canal privado de cada persona con el evento
 * `.datos`: `{cambios: [{entidad: 'marca', id: '…'}, …]}`. El aviso no
 * trae datos, solo QUÉ cambió; aquí se traduce eso en qué consultas se
 * dan por viejas. TanStack vuelve a pedir en el acto las que están en
 * pantalla, y las demás las pide cuando se abran: un cambio en campañas
 * no hace que nadie descargue la página de campañas si no la está
 * mirando.
 *
 * TRES DETALLES QUE NO SE VEN
 *
 * 1. SE AGRUPAN. Varios avisos seguidos (dos personas guardando a la vez,
 *    un aviso de la marca y otro de su bitácora) se juntan durante un
 *    momento y cada consulta se refresca una vez.
 *
 * 2. AL VOLVER LA CONEXIÓN SE REFRESCA TODO, una vez. Los avisos que
 *    llegaron durante el corte se perdieron; sin esto, la pantalla se
 *    quedaría con lo de antes del corte hasta que alguien tocase algo.
 *
 * 3. MIENTRAS HAY CONEXIÓN, VOLVER A LA PESTAÑA NO REFRESCA (lo decide
 *    ProveedorConsultas). Sin conexión en vivo, todo funciona como antes:
 *    se refresca al volver a la pestaña o al entrar en cada pantalla.
 *
 * El formulario de una ficha abierta NO se reescribe con lo que llega:
 * se rellena una vez al abrirla (ver ModalDeMarca). Lo que sí se pone al
 * día es lo que se enseña alrededor: la bitácora, el historial de
 * campañas, el tablero de detrás.
 * ---------------------------------------------------------------------
 */
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import { clavesDeCampanas } from "@/hooks/useCampanas";
import { CLAVE_DE_CIERRES_DE_MES } from "@/hooks/useCierresDeMes";
import { CLAVE_DE_CATALOGOS } from "@/hooks/useCatalogos";
import { clavesDeMarcas } from "@/hooks/useMarcas";
import { clavesDePropiedades } from "@/hooks/usePropiedades";
import { CLAVE_DE_SECTORES } from "@/hooks/useSectores";
import { useEventoPersonal, useTiempoReal } from "@/providers/ProveedorTiempoReal";

/** Lo que manda App\Support\CambiosEnVivo. `id` null = «varias» o «todas». */
interface CambioEnLosDatos {
  entidad: string;
  id: string | null;
}

/**
 * Cuánto se espera a que lleguen más avisos antes de refrescar. Corto
 * para que se sienta al momento, y suficiente para que los avisos de un
 * mismo guardado caigan juntos.
 */
const ESPERA_PARA_JUNTAR_AVISOS_MS = 400;

/* Pantallas que no tienen su clave en un hook propio. */
const CLAVE_DEL_PANEL: QueryKey = ["panel"]; // resumen y calendario
const CLAVE_DE_LA_AUDITORIA: QueryKey = ["auditoria"]; // cada cambio deja su línea
const CLAVE_DEL_EQUIPO: QueryKey = ["usuarios"]; // Equipo y los selectores de agente

/**
 * Qué consultas se quedan viejas con cada cambio.
 *
 * Una entidad que esta versión no conozca (un servidor más nuevo que la
 * pestaña) no refresca nada: la pestaña se pondrá al día al recargar.
 */
function clavesQueCambiaron({ entidad, id }: CambioEnLosDatos): QueryKey[] {
  switch (entidad) {
    // Los sectores, porque su pantalla cuenta las marcas y el dinero de
    // cada rubro: una propuesta nueva cambia la columna «Dinero por sector».
    case "marca":
      return id === null
        ? [clavesDeMarcas.todas, CLAVE_DEL_PANEL, CLAVE_DE_SECTORES, CLAVE_DE_LA_AUDITORIA]
        : [
            ["marcas", "listado"],
            clavesDeMarcas.ficha(id),
            clavesDeMarcas.agentes,
            ["marcas", "sugerencias"],
            CLAVE_DEL_PANEL,
            CLAVE_DE_SECTORES,
            CLAVE_DE_LA_AUDITORIA,
          ];

    case "bitacora":
      // El tablero enseña cuántos comentarios tiene cada marca.
      return id === null
        ? [clavesDeMarcas.todas, CLAVE_DE_LA_AUDITORIA]
        : [
            clavesDeMarcas.comentarios(id),
            clavesDeMarcas.ficha(id),
            ["marcas", "listado"],
            CLAVE_DE_LA_AUDITORIA,
          ];

    // Las tres siguientes se ven también dentro de las marcas (el OVP y
    // el checklist, la campaña de la tarjeta, el rubro) y en el resumen.
    case "propiedades":
      return [clavesDePropiedades.todas, clavesDeMarcas.todas, CLAVE_DEL_PANEL, CLAVE_DE_LA_AUDITORIA];

    case "campanas":
      return [clavesDeCampanas.todas, clavesDeMarcas.todas, CLAVE_DEL_PANEL, CLAVE_DE_LA_AUDITORIA];

    case "sectores":
      return [
        CLAVE_DE_SECTORES,
        CLAVE_DE_CATALOGOS,
        clavesDeMarcas.todas,
        CLAVE_DEL_PANEL,
        CLAVE_DE_LA_AUDITORIA,
      ];

    // Solo le llega a quien ve los cierres (admin y comercial).
    case "cierres":
      return [CLAVE_DE_CIERRES_DE_MES, CLAVE_DE_LA_AUDITORIA];

    // Los días que tarda una marca en enfriarse: cambian el estado de
    // todas a la vez, en el tablero y en el reparto del resumen.
    case "umbrales":
      return [clavesDeMarcas.todas, CLAVE_DEL_PANEL];

    // Las metas salen en el resumen: la propia y, a quien reparte, las
    // del equipo.
    case "metas":
      return [CLAVE_DEL_PANEL, CLAVE_DE_LA_AUDITORIA];

    // El nombre de cada persona sale en las tarjetas y en el resumen.
    case "equipo":
      return [CLAVE_DEL_EQUIPO, clavesDeMarcas.todas, CLAVE_DEL_PANEL, CLAVE_DE_LA_AUDITORIA];

    default:
      return [];
  }
}

export function ProveedorCambiosEnVivo({ children }: { children: ReactNode }) {
  const clienteDeConsultas = useQueryClient();
  const { estadoDeLaConexion } = useTiempoReal();

  const clavesPendientes = useRef(new Map<string, QueryKey>());
  const temporizador = useRef<number | null>(null);

  useEventoPersonal<{ cambios: CambioEnLosDatos[] }>(".datos", ({ cambios }) => {
    for (const cambio of cambios) {
      for (const clave of clavesQueCambiaron(cambio)) {
        clavesPendientes.current.set(JSON.stringify(clave), clave);
      }
    }

    if (temporizador.current !== null) return;

    temporizador.current = window.setTimeout(() => {
      temporizador.current = null;

      const claves = [...clavesPendientes.current.values()];
      clavesPendientes.current.clear();

      for (const clave of claves) {
        void clienteDeConsultas.invalidateQueries({ queryKey: clave });
      }
    }, ESPERA_PARA_JUNTAR_AVISOS_MS);
  });

  // Al desmontarse (cerrar sesión) no se deja un refresco pendiente.
  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    },
    [],
  );

  // Vuelta de un corte: lo que llegó mientras tanto se perdió.
  const estadoAnterior = useRef(estadoDeLaConexion);

  useEffect(() => {
    const antes = estadoAnterior.current;
    estadoAnterior.current = estadoDeLaConexion;

    if (antes === "sinConexion" && estadoDeLaConexion === "enVivo") {
      void clienteDeConsultas.invalidateQueries({
        // La configuración del tiempo real no: pedirla otra vez no trae
        // nada nuevo y no tiene nada que ver con el corte.
        predicate: (consulta) => consulta.queryKey[0] !== "tiempo-real",
      });
    }
  }, [estadoDeLaConexion, clienteDeConsultas]);

  return children;
}
