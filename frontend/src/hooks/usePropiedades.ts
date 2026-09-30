/**
 * hooks/usePropiedades.ts
 * ---------------------------------------------------------------------
 * Lectura y escritura del catálogo de productos IOP.
 *
 * Hay dos consultas distintas a propósito, con claves de caché
 * separadas:
 *
 *   · `useCatalogoDePropiedades()` → el catálogo completo con totales,
 *     que es lo que pinta la pantalla de propiedades.
 *   · `usePropiedadesOfrecibles()` → solo las activas, sin totales, que
 *     es lo que necesita el checklist de la ficha de una marca. Se
 *     cachea más tiempo porque se abre muchas veces al día y el catálogo
 *     cambia como mucho una vez por semana.
 *
 * Tras cualquier escritura se invalidan además las marcas y el resumen:
 * cambiar el monto total de una propiedad mueve los porcentajes de todas
 * las fichas que la ofrecen y la meta del tablero.
 *
 * El ACCESO DE INVITADOS al catálogo de la web cuelga de la misma clave
 * («propiedades»), así que el aviso en vivo de un cambio en el catálogo
 * lo refresca también. Queda fuera de la copia sin conexión: es una
 * contraseña, y no tiene que acabar escrita en el navegador.
 *
 * La GALERÍA va aparte (`useGaleriaDePropiedad`): se lee de la propiedad
 * suelta y cada cambio se escribe en esa caché al momento, sin recargar.
 * El catálogo y el checklist, que también la llevan dentro, solo se
 * marcan como viejos.
 * ---------------------------------------------------------------------
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  actualizarPiezaDeGaleria,
  actualizarPropiedad,
  cambiarActivaDePropiedad,
  crearPropiedad,
  elegirPortadaDeGaleria,
  eliminarDeGaleria,
  eliminarPropiedad,
  guardarAccesoDeInvitados,
  listarPropiedades,
  obtenerAccesoDeInvitados,
  obtenerPropiedad,
  reordenarGaleria,
  subirAGaleria,
} from "@/api/propiedades";
import { clavesDeMarcas } from "@/hooks/useMarcas";
import type {
  AccesoDeInvitados,
  ArchivoDeGaleria,
  DatosDePropiedadParaGuardar,
  Propiedad,
} from "@/tipos/modelos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";

export const clavesDePropiedades = {
  todas: ["propiedades"] as const,
  catalogo: ["propiedades", "catalogo"] as const,
  ofrecibles: ["propiedades", "ofrecibles"] as const,
  detalle: (idDeLaPropiedad: string) => ["propiedades", "detalle", idDeLaPropiedad] as const,
  accesoDeInvitados: ["propiedades", "acceso-de-invitados"] as const,
};

/** El catálogo completo, con cuántas marcas y cuánto OVP lleva cada una. */
export function useCatalogoDePropiedades() {
  const consulta = useQuery<Propiedad[]>({
    queryKey: clavesDePropiedades.catalogo,
    queryFn: () => listarPropiedades({ conTotales: true }),
  });

  return {
    propiedades: consulta.data ?? [],
    estaCargando: consulta.isLoading,
    estaRefrescando: consulta.isFetching,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
  };
}

/** Las propiedades activas, para el checklist de la ficha de una marca. */
export function usePropiedadesOfrecibles() {
  const consulta = useQuery<Propiedad[]>({
    queryKey: clavesDePropiedades.ofrecibles,
    queryFn: () => listarPropiedades({ soloActivas: true }),
    staleTime: 10 * 60 * 1000,
  });

  return {
    propiedades: consulta.data ?? [],
    estaCargando: consulta.isLoading,
  };
}

/**
 * Invalida el catálogo y todo lo que depende de él.
 *
 * Es un martillo grande a propósito: el monto de una propiedad aparece
 * en el checklist de cada marca y en las cifras del resumen, y afinar
 * qué invalidar solo traería porcentajes desactualizados difíciles de
 * reproducir.
 */
function useInvalidarPropiedades() {
  const clienteDeConsultas = useQueryClient();

  return () => {
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDePropiedades.todas });
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDeMarcas.todas });
    void clienteDeConsultas.invalidateQueries({
      queryKey: clavesDeMarcas.resumenDelPanel,
    });
  };
}

export function useCrearPropiedad(): UseMutationResult<
  Propiedad,
  unknown,
  DatosDePropiedadParaGuardar
> {
  const invalidarPropiedades = useInvalidarPropiedades();

  return useMutation({
    mutationFn: crearPropiedad,
    onSuccess: invalidarPropiedades,
  });
}

export function useActualizarPropiedad(): UseMutationResult<
  Propiedad,
  unknown,
  { idDeLaPropiedad: string; datos: DatosDePropiedadParaGuardar }
> {
  const invalidarPropiedades = useInvalidarPropiedades();

  return useMutation({
    mutationFn: ({ idDeLaPropiedad, datos }) =>
      actualizarPropiedad(idDeLaPropiedad, datos),
    onSuccess: invalidarPropiedades,
  });
}

export function useCambiarActivaDePropiedad(): UseMutationResult<
  Propiedad,
  unknown,
  { idDeLaPropiedad: string; activa: boolean }
> {
  const invalidarPropiedades = useInvalidarPropiedades();

  return useMutation({
    mutationFn: ({ idDeLaPropiedad, activa }) =>
      cambiarActivaDePropiedad(idDeLaPropiedad, activa),
    onSuccess: invalidarPropiedades,
  });
}

export function useEliminarPropiedad(): UseMutationResult<void, unknown, string> {
  const invalidarPropiedades = useInvalidarPropiedades();

  return useMutation({
    mutationFn: eliminarPropiedad,
    onSuccess: invalidarPropiedades,
  });
}

/* ==================================================================== */
/* Galería                                                              */
/* ==================================================================== */

/**
 * La galería de una propiedad y lo que se puede hacer con ella.
 *
 * Se lee de la propiedad suelta (no del catálogo) para tenerla siempre
 * al día mientras se trabaja en ella; `propiedadInicial` la pinta al
 * instante mientras llega. Cada escritura deja la galería que devuelve el
 * servidor en esa caché, y el catálogo y el checklist se marcan como
 * viejos para que la traigan de nuevo cuando se vuelvan a ver.
 *
 * Reordenar es la única que se adelanta al servidor: al soltar una foto
 * en su sitio nuevo tiene que quedarse ahí, no volver atrás medio segundo.
 * Si el servidor lo rechaza, se deshace.
 */
export function useGaleriaDePropiedad(idDeLaPropiedad: string, propiedadInicial?: Propiedad) {
  const clienteDeConsultas = useQueryClient();
  const claveDeLaPropiedad = clavesDePropiedades.detalle(idDeLaPropiedad);

  const consulta = useQuery<Propiedad>({
    queryKey: claveDeLaPropiedad,
    queryFn: () => obtenerPropiedad(idDeLaPropiedad),
    // Como dato de partida y no como relleno: así las escrituras de abajo
    // tienen sobre qué escribir aunque se suba algo antes de que llegue
    // la respuesta. La fecha a cero hace que se pida igualmente al abrir.
    initialData: propiedadInicial,
    initialDataUpdatedAt: 0,
  });

  function escribirLaGaleria(cambiar: (galeria: ArchivoDeGaleria[]) => ArchivoDeGaleria[]) {
    clienteDeConsultas.setQueryData<Propiedad>(claveDeLaPropiedad, (propiedad) =>
      propiedad === undefined ? propiedad : { ...propiedad, galeria: cambiar(propiedad.galeria ?? []) },
    );
  }

  function marcarLasListasComoViejas() {
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDePropiedades.catalogo });
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDePropiedades.ofrecibles });
  }

  return {
    galeria: consulta.data?.galeria ?? [],
    estaCargando: consulta.isLoading,

    async subir(
      fichero: File,
      miniatura: Blob | null,
      alProgresar: (fraccion: number) => void,
    ): Promise<ArchivoDeGaleria> {
      const pieza = await subirAGaleria(idDeLaPropiedad, fichero, { miniatura, alProgresar });

      escribirLaGaleria((galeria) => [...galeria.filter((otra) => otra.id !== pieza.id), pieza]);
      marcarLasListasComoViejas();

      return pieza;
    },

    async actualizar(
      idDeLaPieza: string,
      cambios: { titulo?: string | null; descripcion?: string | null; enLaWeb?: boolean },
    ): Promise<void> {
      const pieza = await actualizarPiezaDeGaleria(idDeLaPropiedad, idDeLaPieza, cambios);

      escribirLaGaleria((galeria) => galeria.map((otra) => (otra.id === pieza.id ? pieza : otra)));
      marcarLasListasComoViejas();
    },

    async reordenar(idsEnOrden: string[]): Promise<void> {
      const galeriaAnterior =
        clienteDeConsultas.getQueryData<Propiedad>(claveDeLaPropiedad)?.galeria ?? [];

      escribirLaGaleria((galeria) =>
        idsEnOrden
          .map((id) => galeria.find((pieza) => pieza.id === id))
          .filter((pieza): pieza is ArchivoDeGaleria => pieza !== undefined),
      );

      try {
        const galeriaNueva = await reordenarGaleria(idDeLaPropiedad, idsEnOrden);

        escribirLaGaleria(() => galeriaNueva);
        marcarLasListasComoViejas();
      } catch (error) {
        escribirLaGaleria(() => galeriaAnterior);

        throw error;
      }
    },

    async elegirPortada(idDeLaPieza: string): Promise<void> {
      const galeriaNueva = await elegirPortadaDeGaleria(idDeLaPropiedad, idDeLaPieza);

      escribirLaGaleria(() => galeriaNueva);
      marcarLasListasComoViejas();
    },

    async eliminar(idDeLaPieza: string): Promise<void> {
      const galeriaNueva = await eliminarDeGaleria(idDeLaPropiedad, idDeLaPieza);

      escribirLaGaleria(() => galeriaNueva);
      marcarLasListasComoViejas();
    },
  };
}

/* ==================================================================== */
/* El acceso de invitados al catálogo de la web                         */
/* ==================================================================== */

/** El usuario y la contraseña de invitado. Solo para quien gestiona el catálogo. */
export function useAccesoDeInvitados(habilitado: boolean) {
  return useQuery<AccesoDeInvitados | null>({
    queryKey: clavesDePropiedades.accesoDeInvitados,
    queryFn: obtenerAccesoDeInvitados,
    enabled: habilitado,
    meta: { sinCopiaLocal: true },
  });
}

export function useGuardarAccesoDeInvitados(): UseMutationResult<
  AccesoDeInvitados,
  unknown,
  { usuario: string; contrasena: string }
> {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: ({ usuario, contrasena }) => guardarAccesoDeInvitados(usuario, contrasena),
    onSuccess: (acceso) => {
      clienteDeConsultas.setQueryData(clavesDePropiedades.accesoDeInvitados, acceso);
    },
  });
}
