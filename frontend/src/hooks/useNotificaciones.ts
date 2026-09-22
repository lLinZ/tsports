/**
 * hooks/useNotificaciones.ts
 * ---------------------------------------------------------------------
 * La campanita: el contador, los avisos y cómo llegan en vivo.
 *
 * DOS FORMAS DE ENTERARSE, Y NINGUNA DEPENDE DE LA OTRA
 *   · En vivo: el servidor empuja cada aviso nuevo por el canal personal
 *     (`.notificacion-nueva`) y aquí se refresca todo al momento.
 *   · Sin tiempo real —Reverb apagado, o la conexión caída—, el contador
 *     se vuelve a pedir cada minuto. Lo peor que pasa es enterarse con un
 *     minuto de retraso; nunca perderse un aviso, porque el aviso está
 *     guardado en el servidor desde antes de empujarlo.
 *
 * Las pantallas usan estos hooks y no la API directamente, para que
 * marcar como leída baje el número de la campanita en todas partes a la
 * vez.
 * ---------------------------------------------------------------------
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  contarNotificacionesSinLeer,
  listarNotificaciones,
  marcarNotificacionComoLeida,
  marcarTodasLasNotificacionesComoLeidas,
} from "@/api/notificaciones";
import { clavesDeMarcas } from "@/hooks/useMarcas";
import { useEventoPersonal, useTiempoReal } from "@/providers/ProveedorTiempoReal";
import { avisarDeError, avisarDeNotificacion } from "@/utilidades/avisos";
import type { Notificacion } from "@/tipos/modelos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";

/* ==================================================================== */
/* Claves de caché                                                     */
/* ==================================================================== */

export const clavesDeNotificaciones = {
  todas: ["notificaciones"] as const,
  sinLeer: ["notificaciones", "sin-leer"] as const,
  ultimas: ["notificaciones", "ultimas"] as const,
  listado: (soloSinLeer: boolean) => ["notificaciones", "listado", { soloSinLeer }] as const,
};

/** Cuántas enseña el desplegable de la campanita; el resto, en su página. */
const AVISOS_EN_LA_CAMPANITA = 8;

/** Cada cuánto se pregunta el contador cuando no hay tiempo real. */
const INTERVALO_SIN_TIEMPO_REAL_MS = 60_000;

/* ==================================================================== */
/* Lectura                                                             */
/* ==================================================================== */

/** El número rojo de la campanita. */
export function useContadorDeNotificaciones() {
  const { estadoDeLaConexion } = useTiempoReal();

  return useQuery({
    queryKey: clavesDeNotificaciones.sinLeer,
    queryFn: contarNotificacionesSinLeer,
    // En vivo, el número lo mueve el WebSocket y preguntar sobra.
    refetchInterval: estadoDeLaConexion === "enVivo" ? false : INTERVALO_SIN_TIEMPO_REAL_MS,
  });
}

/**
 * Los últimos avisos, para el desplegable. Solo se piden con el
 * desplegable abierto: nadie los ve mientras está cerrado.
 */
export function useUltimasNotificaciones({ habilitado }: { habilitado: boolean }) {
  return useQuery({
    queryKey: clavesDeNotificaciones.ultimas,
    queryFn: async () =>
      (await listarNotificaciones({ porPagina: AVISOS_EN_LA_CAMPANITA })).notificaciones,
    enabled: habilitado,
  });
}

/** La página de avisos, con scroll infinito. */
export function useListadoDeNotificaciones(soloSinLeer: boolean) {
  const consulta = useInfiniteQuery({
    queryKey: clavesDeNotificaciones.listado(soloSinLeer),
    queryFn: ({ pageParam }) => listarNotificaciones({ soloSinLeer, pagina: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (ultima) =>
      ultima.pagina < ultima.ultimaPagina ? ultima.pagina + 1 : undefined,
  });

  return {
    notificaciones: consulta.data?.pages.flatMap((pagina) => pagina.notificaciones) ?? [],
    estaCargando: consulta.isLoading,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    hayMas: consulta.hasNextPage,
    estaCargandoMas: consulta.isFetchingNextPage,
    pedirMas: () => void consulta.fetchNextPage(),
  };
}

/* ==================================================================== */
/* Escritura                                                           */
/* ==================================================================== */

export function useMarcarTodasComoLeidas() {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: marcarTodasLasNotificacionesComoLeidas,
    onSuccess: () =>
      clienteDeConsultas.invalidateQueries({ queryKey: clavesDeNotificaciones.todas }),
  });
}

/**
 * Lo que pasa al pulsar un aviso: se marca como leído y se va a donde
 * lleva. Lo usan la campanita, la página de avisos y el aviso flotante,
 * para que los tres se comporten igual.
 *
 * Se navega sin esperar a que el servidor confirme la lectura: quien
 * pulsa quiere ver la marca, y si la marca de leído falla, el aviso se
 * queda sin leer y ya está — no merece cortarle el paso.
 */
export function useAbrirNotificacion() {
  const clienteDeConsultas = useQueryClient();
  const navegar = useNavigate();

  const marcarComoLeida = useMutation({
    mutationFn: marcarNotificacionComoLeida,
    onSuccess: () =>
      clienteDeConsultas.invalidateQueries({ queryKey: clavesDeNotificaciones.todas }),
    onError: (error) => avisarDeError(error, "No se pudo marcar el aviso como leído"),
  });

  return (notificacion: Notificacion) => {
    if (!notificacion.leida) {
      marcarComoLeida.mutate(notificacion.id);
    }

    if (notificacion.enlace !== null) {
      navegar(notificacion.enlace);
    }
  };
}

/* ==================================================================== */
/* En vivo                                                             */
/* ==================================================================== */

/**
 * Escucha los avisos que empuja el servidor y los enseña al momento.
 *
 * Se monta UNA vez, en la campanita de la barra superior. Montarlo en
 * dos sitios sacaría cada aviso flotante por duplicado.
 *
 * Además de la campanita refresca el tablero y el resumen: los dos
 * avisos que existen hoy (un lead nuevo, una marca asignada) significan
 * que hay una marca más en la lista de quien lo recibe.
 */
export function useAvisosEnVivo() {
  const clienteDeConsultas = useQueryClient();
  const abrirNotificacion = useAbrirNotificacion();

  useEventoPersonal<Notificacion>(".notificacion-nueva", (notificacion) => {
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDeNotificaciones.todas });
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDeMarcas.todas });
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDeMarcas.resumenDelPanel });

    avisarDeNotificacion(
      notificacion.titulo,
      notificacion.cuerpo,
      notificacion.enlace !== null ? () => abrirNotificacion(notificacion) : undefined,
    );
  });
}
