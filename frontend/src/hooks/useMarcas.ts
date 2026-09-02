/**
 * hooks/useMarcas.ts
 * ---------------------------------------------------------------------
 * Toda la lectura y escritura de marcas, en un sitio.
 *
 * Las pantallas llaman a estos hooks y no a la API directamente, para
 * que la invalidación de la caché ocurra siempre. Ese detalle es la
 * diferencia entre marcar una fase y verla actualizada al instante en
 * las cifras de arriba, o tener que recargar la página a mano.
 * ---------------------------------------------------------------------
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  actualizarMarca,
  alternarFaseDeMarca,
  crearComentario,
  crearMarca,
  eliminarComentario,
  eliminarMarca,
  listarComentarios,
  listarMarcas,
  obtenerMarca,
} from "@/api/marcas";
import { obtenerResumenDelPanel } from "@/api/sistema";
import type {
  ComentarioDeMarca,
  DatosDeMarcaParaGuardar,
  FiltrosDeMarcas,
  Marca,
  ResumenDelPanel,
} from "@/tipos/modelos";

/* ==================================================================== */
/* Claves de caché                                                     */
/* ==================================================================== */

/**
 * Las claves se construyen con funciones y no a mano en cada llamada,
 * porque una clave mal escrita no da error: simplemente crea una entrada
 * distinta en la caché y la pantalla deja de refrescarse sin motivo
 * aparente.
 */
export const clavesDeMarcas = {
  todas: ["marcas"] as const,
  listado: (filtros: Partial<FiltrosDeMarcas>) => ["marcas", "listado", filtros] as const,
  ficha: (idDeLaMarca: string) => ["marcas", "ficha", idDeLaMarca] as const,
  comentarios: (idDeLaMarca: string) => ["marcas", "comentarios", idDeLaMarca] as const,
  resumenDelPanel: ["panel", "resumen"] as const,
};

/* ==================================================================== */
/* Lectura                                                             */
/* ==================================================================== */

/** El listado del tablero, con los filtros aplicados. */
export function useListadoDeMarcas(filtros: Partial<FiltrosDeMarcas>) {
  const consulta = useQuery({
    queryKey: clavesDeMarcas.listado(filtros),
    queryFn: () => listarMarcas(filtros),
    // Mantiene en pantalla el resultado anterior mientras llega el
    // nuevo: al escribir en el buscador la lista no parpadea a vacío.
    placeholderData: (datosAnteriores) => datosAnteriores,
  });

  return {
    marcas: consulta.data?.marcas ?? [],
    total: consulta.data?.total ?? 0,
    estaCargando: consulta.isLoading,
    estaRefrescando: consulta.isFetching,
    error: consulta.error,
    recargar: consulta.refetch,
  };
}

/** La ficha completa de una marca, con su bitácora. */
export function useFichaDeMarca(idDeLaMarca: string | null) {
  return useQuery<Marca>({
    queryKey: clavesDeMarcas.ficha(idDeLaMarca ?? ""),
    queryFn: () => obtenerMarca(idDeLaMarca as string),
    // Sin id no hay nada que pedir (la ficha está cerrada).
    enabled: idDeLaMarca !== null,
  });
}

/** Las cifras y los gráficos de la pantalla de resumen. */
export function useResumenDelPanel() {
  return useQuery<ResumenDelPanel>({
    queryKey: clavesDeMarcas.resumenDelPanel,
    queryFn: obtenerResumenDelPanel,
  });
}

/** La bitácora de una marca. */
export function useComentariosDeMarca(idDeLaMarca: string | null) {
  return useQuery<ComentarioDeMarca[]>({
    queryKey: clavesDeMarcas.comentarios(idDeLaMarca ?? ""),
    queryFn: () => listarComentarios(idDeLaMarca as string),
    enabled: idDeLaMarca !== null,
  });
}

/* ==================================================================== */
/* Escritura                                                           */
/* ==================================================================== */

/**
 * Invalida todo lo que depende de las marcas.
 *
 * Se llama tras cualquier escritura. Es un martillo grande a propósito:
 * las cifras del panel, el listado y la ficha están relacionadas entre
 * sí, y afinar qué invalidar en cada caso solo traería tableros
 * desactualizados difíciles de reproducir.
 */
function useInvalidarMarcas() {
  const clienteDeConsultas = useQueryClient();

  return () => {
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDeMarcas.todas });
    void clienteDeConsultas.invalidateQueries({
      queryKey: clavesDeMarcas.resumenDelPanel,
    });
  };
}

/** Alta de una marca nueva. */
export function useCrearMarca(): UseMutationResult<
  Marca,
  unknown,
  DatosDeMarcaParaGuardar
> {
  const invalidarMarcas = useInvalidarMarcas();

  return useMutation({
    mutationFn: crearMarca,
    onSuccess: invalidarMarcas,
  });
}

/** Edición de la ficha. */
export function useActualizarMarca(): UseMutationResult<
  Marca,
  unknown,
  { idDeLaMarca: string; datos: DatosDeMarcaParaGuardar }
> {
  const invalidarMarcas = useInvalidarMarcas();

  return useMutation({
    mutationFn: ({ idDeLaMarca, datos }) => actualizarMarca(idDeLaMarca, datos),
    onSuccess: invalidarMarcas,
  });
}

/** Borrado de una marca y de toda su bitácora. */
export function useEliminarMarca(): UseMutationResult<void, unknown, string> {
  const invalidarMarcas = useInvalidarMarcas();

  return useMutation({
    mutationFn: eliminarMarca,
    onSuccess: invalidarMarcas,
  });
}

/**
 * Marcar o desmarcar una fase desde la tarjeta del tablero.
 *
 * Es el gesto más repetido del día, así que se aplica de forma
 * optimista: la tarjeta cambia al instante y, si el servidor lo rechaza
 * (por permisos o porque falta la descripción de la propuesta), se
 * deshace el cambio. Sin esto, cada clic tendría medio segundo de espera
 * antes de reaccionar.
 */
export function useAlternarFase() {
  const clienteDeConsultas = useQueryClient();
  const invalidarMarcas = useInvalidarMarcas();

  return useMutation({
    mutationFn: ({
      idDeLaMarca,
      fase,
      completada,
    }: {
      idDeLaMarca: string;
      fase: "aproximacion" | "propuesta";
      completada: boolean;
    }) => alternarFaseDeMarca(idDeLaMarca, fase, completada),

    onMutate: async ({ idDeLaMarca, fase, completada }) => {
      // Se paran los refrescos en vuelo para que no pisen el cambio
      // optimista con datos antiguos.
      await clienteDeConsultas.cancelQueries({ queryKey: clavesDeMarcas.todas });

      const instantaneaDeLaCache = clienteDeConsultas.getQueriesData<{
        marcas: Marca[];
        total: number;
      }>({ queryKey: ["marcas", "listado"] });

      const campoAAlternar =
        fase === "aproximacion"
          ? ("faseAproximacionCompletada" as const)
          : ("fasePropuestaCompletada" as const);

      instantaneaDeLaCache.forEach(([clave, datosEnCache]) => {
        if (!datosEnCache) return;

        clienteDeConsultas.setQueryData(clave, {
          ...datosEnCache,
          marcas: datosEnCache.marcas.map((marca) =>
            marca.id === idDeLaMarca
              ? { ...marca, [campoAAlternar]: completada }
              : marca,
          ),
        });
      });

      // Se devuelve la instantánea para poder revertir si falla.
      return { instantaneaDeLaCache };
    },

    onError: (_error, _variables, contexto) => {
      contexto?.instantaneaDeLaCache.forEach(([clave, datosPrevios]) => {
        clienteDeConsultas.setQueryData(clave, datosPrevios);
      });
    },

    // Pase lo que pase, al final se pide la verdad al servidor.
    onSettled: invalidarMarcas,
  });
}

/* ==================================================================== */
/* Bitácora                                                            */
/* ==================================================================== */

export function useCrearComentario(idDeLaMarca: string) {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: (cuerpo: string) => crearComentario(idDeLaMarca, cuerpo),
    onSuccess: () => {
      void clienteDeConsultas.invalidateQueries({
        queryKey: clavesDeMarcas.comentarios(idDeLaMarca),
      });
      // El contador de comentarios de la tarjeta también cambia.
      void clienteDeConsultas.invalidateQueries({
        queryKey: clavesDeMarcas.todas,
      });
    },
  });
}

export function useEliminarComentario(idDeLaMarca: string) {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: (idDelComentario: string) =>
      eliminarComentario(idDeLaMarca, idDelComentario),
    onSuccess: () => {
      void clienteDeConsultas.invalidateQueries({
        queryKey: clavesDeMarcas.comentarios(idDeLaMarca),
      });
      void clienteDeConsultas.invalidateQueries({
        queryKey: clavesDeMarcas.todas,
      });
    },
  });
}
