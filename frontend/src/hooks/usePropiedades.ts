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
 * ---------------------------------------------------------------------
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  actualizarPropiedad,
  crearPropiedad,
  eliminarPropiedad,
  listarPropiedades,
} from "@/api/propiedades";
import { clavesDeMarcas } from "@/hooks/useMarcas";
import type { DatosDePropiedadParaGuardar, Propiedad } from "@/tipos/modelos";

export const clavesDePropiedades = {
  todas: ["propiedades"] as const,
  catalogo: ["propiedades", "catalogo"] as const,
  ofrecibles: ["propiedades", "ofrecibles"] as const,
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
    error: consulta.error,
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

export function useEliminarPropiedad(): UseMutationResult<void, unknown, string> {
  const invalidarPropiedades = useInvalidarPropiedades();

  return useMutation({
    mutationFn: eliminarPropiedad,
    onSuccess: invalidarPropiedades,
  });
}
