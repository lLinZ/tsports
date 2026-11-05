/**
 * hooks/useAvisos.ts
 * ---------------------------------------------------------------------
 * Las consultas del panel de avisos: la pantalla «Avisos» del
 * administrador (con su registro de envíos, que se recorre con scroll
 * infinito, regla 14) y los ajustes de cada persona.
 *
 * Guardar escribe la respuesta en la caché al momento: el servidor
 * devuelve la pantalla entera ya al día, y no hace falta pedirla otra
 * vez. A los demás administradores se lo lleva el aviso en vivo
 * «avisos» (ProveedorCambiosEnVivo).
 *
 * Los ajustes propios cambian además si el chat hace «pop», que viene
 * en la sesión (`usuario.avisos`): por eso, al guardarlos, se vuelve a
 * pedir el usuario.
 *
 * El registro de envíos queda fuera de la copia sin conexión: son
 * avisos de todo el equipo, y se miran cuando hace falta.
 * ---------------------------------------------------------------------
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  guardarAjusteDeAviso,
  guardarMiHorarioDeSilencio,
  guardarMiPreferenciaDeAviso,
  listarEnviosDeAvisos,
  obtenerMisAvisos,
  obtenerPanelDeAvisos,
} from "@/api/avisos";
import { useSesion } from "@/providers/ProveedorSesion";
import type {
  FiltrosDelRegistroDeEnvios,
  HorarioDeSilencio,
  MisAvisos,
  PanelDeAvisos,
  TipoDeAviso,
} from "@/tipos/modelos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";

export const clavesDeAvisos = {
  todo: ["avisos"] as const,
  panel: ["avisos", "panel"] as const,
  envios: (filtros: FiltrosDelRegistroDeEnvios) =>
    ["avisos", "envios", filtros] as const,
  mios: ["avisos", "mios"] as const,
};

/* ==================================================================== */
/* La pantalla «Avisos» (administrador)                                */
/* ==================================================================== */

export function usePanelDeAvisos() {
  const consulta = useQuery<PanelDeAvisos>({
    queryKey: clavesDeAvisos.panel,
    queryFn: obtenerPanelDeAvisos,
  });

  return {
    panel: consulta.data,
    estaCargando: consulta.isLoading,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
  };
}

export function useGuardarAjusteDeAviso() {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: ({
      tipo,
      cambios,
    }: {
      tipo: TipoDeAviso;
      cambios: Parameters<typeof guardarAjusteDeAviso>[1];
    }) => guardarAjusteDeAviso(tipo, cambios),
    onSuccess: (panel) => {
      clienteDeConsultas.setQueryData(clavesDeAvisos.panel, panel);
      // Los ajustes propios dicen si un aviso está apagado en el sistema.
      void clienteDeConsultas.invalidateQueries({
        queryKey: clavesDeAvisos.mios,
      });
    },
  });
}

export function useRegistroDeEnvios(filtros: FiltrosDelRegistroDeEnvios) {
  const consulta = useInfiniteQuery({
    queryKey: clavesDeAvisos.envios(filtros),
    queryFn: ({ pageParam }) => listarEnviosDeAvisos(filtros, pageParam),
    initialPageParam: 1,
    getNextPageParam: (ultima) =>
      ultima.pagina < ultima.ultimaPagina ? ultima.pagina + 1 : undefined,
    meta: { sinCopiaLocal: true },
  });

  const paginas = consulta.data?.pages ?? [];

  return {
    envios: paginas.flatMap((pagina) => pagina.envios),
    // El resumen y las personas son los mismos en todas las páginas.
    resumen: paginas[0]?.resumen,
    personas: paginas[0]?.personas ?? [],
    total: paginas[0]?.total ?? 0,
    estaCargando: consulta.isLoading,
    estaPidiendoMas: consulta.isFetchingNextPage,
    hayMas: consulta.hasNextPage,
    pedirMas: () => void consulta.fetchNextPage(),
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
  };
}

/* ==================================================================== */
/* Los ajustes de cada persona                                         */
/* ==================================================================== */

export function useMisAvisos() {
  const consulta = useQuery<MisAvisos>({
    queryKey: clavesDeAvisos.mios,
    queryFn: obtenerMisAvisos,
  });

  return {
    misAvisos: consulta.data,
    estaCargando: consulta.isLoading,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
  };
}

function useAlGuardarMisAvisos() {
  const clienteDeConsultas = useQueryClient();
  const { refrescarUsuario } = useSesion();

  return (misAvisos: MisAvisos) => {
    clienteDeConsultas.setQueryData(clavesDeAvisos.mios, misAvisos);
    // El «pop» del chat viaja en la sesión.
    void refrescarUsuario().catch(() => undefined);
  };
}

export function useGuardarMiPreferenciaDeAviso() {
  const alGuardar = useAlGuardarMisAvisos();

  return useMutation({
    mutationFn: ({
      tipo,
      cambios,
    }: {
      tipo: TipoDeAviso;
      cambios: { alMovil?: boolean; conSonido?: boolean };
    }) => guardarMiPreferenciaDeAviso(tipo, cambios),
    onSuccess: alGuardar,
  });
}

export function useGuardarMiHorarioDeSilencio() {
  const alGuardar = useAlGuardarMisAvisos();

  return useMutation({
    mutationFn: (silencio: HorarioDeSilencio) =>
      guardarMiHorarioDeSilencio(silencio),
    onSuccess: alGuardar,
  });
}
