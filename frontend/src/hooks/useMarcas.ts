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
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  actualizarMarca,
  alternarFaseDeMarca,
  listarAgentesDeMarcas,
  anotarAccionDeCampana,
  asignarVendedorAMarca,
  crearComentario,
  editarComentario,
  listarMencionables,
  reaccionarAComentario,
  crearMarca,
  eliminarComentario,
  eliminarMarca,
  listarComentarios,
  listarMarcas,
  obtenerMarca,
  buscarSugerenciasDeMarcas,
} from "@/api/marcas";
import { obtenerResumenDelPanel } from "@/api/sistema";
import type {
  ComentarioDeMarca,
  DatosDeComentario,
  PersonaMencionable,
  DatosDeMarcaParaGuardar,
  FiltrosDeMarcas,
  Marca,
  ResumenDelPanel,
} from "@/tipos/modelos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";
import { avisarDeError } from "@/utilidades/avisos";

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
  mencionables: (idDeLaMarca: string) => ["marcas", "mencionables", idDeLaMarca] as const,
  resumenDelPanel: ["panel", "resumen"] as const,
  agentes: ["marcas", "agentes"] as const,
  sugerencias: (texto: string) => ["marcas", "sugerencias", texto] as const,
};

/* ==================================================================== */
/* Lectura                                                             */
/* ==================================================================== */

/**
 * El listado del tablero, con los filtros aplicados y por páginas.
 *
 * El servidor devuelve el tablero paginado, y esto va pidiendo las
 * páginas conforme se baja. Antes solo se pedía la primera y las demás
 * marcas eran inalcanzables desde la interfaz.
 *
 * Las páginas se concatenan en una sola lista: la pantalla no sabe nada
 * de páginas, solo recibe marcas y un `pedirMasMarcas`.
 */
export function useListadoDeMarcas(filtros: Partial<FiltrosDeMarcas>) {
  const consulta = useInfiniteQuery({
    queryKey: clavesDeMarcas.listado(filtros),
    queryFn: ({ pageParam }) => listarMarcas(filtros, pageParam),
    initialPageParam: 1,
    getNextPageParam: (ultima) =>
      ultima.pagina < ultima.ultimaPagina ? ultima.pagina + 1 : undefined,
    // Mantiene en pantalla el resultado anterior mientras llega el
    // nuevo: al escribir en el buscador la lista no parpadea a vacío.
    placeholderData: (datosAnteriores) => datosAnteriores,
  });

  return {
    marcas: consulta.data?.pages.flatMap((pagina) => pagina.marcas) ?? [],
    // El total es el de TODO el listado filtrado, no el de lo que hay
    // cargado en pantalla: es lo que la cabecera necesita decir.
    total: consulta.data?.pages[0]?.total ?? 0,
    // Igual que el total: resume el listado entero, no lo cargado.
    resumenDeLaPropiedad: consulta.data?.pages[0]?.resumenDeLaPropiedad ?? null,
    estaCargando: consulta.isLoading,
    // `isFetching` se pone a cierto también al traer una página más, y
    // eso haría girar el botón de recargar en cada desplazamiento. Aquí
    // interesa solo cuando se está rehaciendo la consulta entera.
    estaRefrescando: consulta.isFetching && !consulta.isFetchingNextPage,
    hayMasMarcas: consulta.hasNextPage,
    estaTrayendoMas: consulta.isFetchingNextPage,
    pedirMasMarcas: consulta.fetchNextPage,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
  };
}

/**
 * El buscador corto de marcas: para elegir una al etiquetarla en el chat
 * o al acotar un reporte. Solo trae las que esta persona puede ver.
 *
 * Con el texto vacío también pregunta, y devuelve las primeras por
 * orden alfabético: abrir el selector y ver ya algo que elegir es más
 * rápido que tener que escribir primero.
 */
export function useSugerenciasDeMarcas(texto: string, { habilitado = true } = {}) {
  const textoLimpio = texto.trim();

  return useQuery({
    queryKey: clavesDeMarcas.sugerencias(textoLimpio),
    queryFn: () => buscarSugerenciasDeMarcas(textoLimpio),
    enabled: habilitado,
    // Mientras llega lo nuevo se queda lo anterior: la lista no parpadea
    // a vacío con cada tecla.
    placeholderData: (anteriores) => anteriores,
    staleTime: 30_000,
    meta: { sinCopiaLocal: true },
  });
}

/**
 * Las personas que pueden salir en el filtro por agente, con cuántas
 * marcas lleva cada una.
 *
 * Es una lista distinta de la de `useVendedores`, y a propósito: aquella
 * es "a quién puedo asignarle una marca" (cuentas de vendedor activas) y
 * esta es "por quién puedo filtrar" (quien realmente aparece llevando
 * marcas, tenga el rol que tenga y aunque su cuenta ya no esté). Usar la
 * primera para filtrar dejaba marcas que no se podían encontrar por
 * ningún agente.
 */
export function useAgentesDeMarcas({ habilitado = true } = {}) {
  const consulta = useQuery({
    queryKey: clavesDeMarcas.agentes,
    queryFn: listarAgentesDeMarcas,
    enabled: habilitado,
  });

  return {
    agentes: consulta.data?.agentes ?? [],
    sinAsignar: consulta.data?.sinAsignar ?? 0,
    estaCargando: consulta.isLoading,
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

/**
 * Anota una acción de campaña en el calendario al momento.
 *
 * No se aplica de forma optimista, al revés que el interruptor de fases:
 * lo que confirma que la acción quedó apuntada es el historial y el
 * calendario, y adelantarse a enseñarlos con datos inventados sería
 * prometer algo que el servidor todavía no ha dicho. La espera es de un
 * gesto puntual, no del clic que se repite cien veces al día.
 */
export function useAnotarAccionDeCampana() {
  const clienteDeConsultas = useQueryClient();
  const invalidarMarcas = useInvalidarMarcas();

  return useMutation({
    mutationFn: ({
      idDeLaMarca,
      campanaId,
      fecha,
    }: {
      idDeLaMarca: string;
      campanaId: string;
      fecha: string;
    }) => anotarAccionDeCampana(idDeLaMarca, { campanaId, fecha }),

    onSuccess: () => {
      invalidarMarcas();
      // El calendario del panel es lo que de verdad enseña la acción.
      void clienteDeConsultas.invalidateQueries({ queryKey: ["panel", "calendario"] });
    },
  });
}

/** Reparte una marca: le pone vendedor, o se lo quita. */
export function useAsignarVendedor() {
  const invalidarMarcas = useInvalidarMarcas();

  return useMutation({
    mutationFn: ({
      idDeLaMarca,
      idDelVendedor,
    }: {
      idDeLaMarca: string;
      idDelVendedor: string | null;
    }) => asignarVendedorAMarca(idDeLaMarca, idDelVendedor),

    onSuccess: invalidarMarcas,
  });
}

/* ==================================================================== */
/* Bitácora                                                            */
/* ==================================================================== */

/**
 * A quién se puede etiquetar en la bitácora de esta marca.
 *
 * Se pide por marca y no una vez para todo: la lista depende de quién
 * puede ver ESA marca, y con un agente no es la misma en una ficha que
 * en otra.
 */
export function useMencionablesDeMarca(idDeLaMarca: string | null) {
  return useQuery<PersonaMencionable[]>({
    queryKey: clavesDeMarcas.mencionables(idDeLaMarca ?? ""),
    queryFn: () => listarMencionables(idDeLaMarca as string),
    enabled: idDeLaMarca !== null,
    // Cambia cuando se reasigna la marca o entra alguien al equipo: no
    // hace falta refrescarla cada medio minuto.
    staleTime: 5 * 60 * 1000,
  });
}

export function useCrearComentario(idDeLaMarca: string) {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: (datos: DatosDeComentario) => crearComentario(idDeLaMarca, datos),
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

export function useEditarComentario(idDeLaMarca: string) {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: DatosDeComentario }) =>
      editarComentario(idDeLaMarca, id, datos),
    onSuccess: () => {
      void clienteDeConsultas.invalidateQueries({
        queryKey: clavesDeMarcas.comentarios(idDeLaMarca),
      });
    },
  });
}

/**
 * Poner o quitar una reacción.
 *
 * No se invalida nada ni se pinta de forma optimista: el servidor
 * devuelve la entrada ya recontada y se escribe tal cual en la caché.
 * Reaccionar es lo que más se pulsa de toda la bitácora y un viaje de
 * ida y vuelta por cada pulsación se notaría.
 */
export function useReaccionarAComentario(idDeLaMarca: string) {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string }) =>
      reaccionarAComentario(idDeLaMarca, id, emoji),
    onSuccess: (comentarioActualizado) => {
      clienteDeConsultas.setQueryData<ComentarioDeMarca[]>(
        clavesDeMarcas.comentarios(idDeLaMarca),
        (hiloActual) =>
          hiloActual?.map((entrada) =>
            entrada.id === comentarioActualizado.id
              ? comentarioActualizado
              : {
                  ...entrada,
                  // La reacción puede ser de una respuesta, que vive
                  // dentro de su entrada raíz.
                  respuestas: entrada.respuestas.map((respuesta) =>
                    respuesta.id === comentarioActualizado.id
                      ? comentarioActualizado
                      : respuesta,
                  ),
                },
          ),
      );
    },
    onError: (error) => avisarDeError(error, "No se pudo reaccionar"),
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
