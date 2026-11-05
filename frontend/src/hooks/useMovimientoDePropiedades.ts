/**
 * hooks/useMovimientoDePropiedades.ts
 * ---------------------------------------------------------------------
 * Las tres consultas de Propiedades › Movimiento: el ranking, el cruce y
 * la ficha de una propiedad.
 *
 * Cuelgan de la clave «propiedades» (["propiedades", "movimiento", …]),
 * así que un cambio en el catálogo las refresca con el resto. Además las
 * refresca cualquier cambio en una marca, su bitácora o los días del
 * estado: es lo que mueve una marca de caliente a fría
 * (ProveedorCambiosEnVivo).
 *
 * Al cambiar de orden o de filtro se queda en pantalla lo anterior hasta
 * que llega lo nuevo, para que la lista no parpadee vacía.
 * ---------------------------------------------------------------------
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  obtenerCruceDePropiedades,
  obtenerMovimientoDeLaPropiedad,
  obtenerMovimientoDePropiedades,
} from "@/api/movimientoDePropiedades";
import type {
  CruceDePropiedades,
  FiltrosDelCruce,
  MovimientoDeLaPropiedad,
  MovimientoDePropiedades,
  OrdenDelMovimiento,
} from "@/tipos/modelos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";

export const clavesDelMovimiento = {
  todo: ["propiedades", "movimiento"] as const,
  ranking: (orden: OrdenDelMovimiento) =>
    ["propiedades", "movimiento", "ranking", orden] as const,
  cruce: (filtros: FiltrosDelCruce) =>
    ["propiedades", "movimiento", "cruce", filtros] as const,
  ficha: (idDeLaPropiedad: string) =>
    ["propiedades", "movimiento", "ficha", idDeLaPropiedad] as const,
};

export function useMovimientoDePropiedades(orden: OrdenDelMovimiento) {
  const consulta = useQuery<MovimientoDePropiedades>({
    queryKey: clavesDelMovimiento.ranking(orden),
    queryFn: () => obtenerMovimientoDePropiedades(orden),
    placeholderData: keepPreviousData,
  });

  return {
    movimiento: consulta.data,
    estaCargando: consulta.isLoading,
    estaRefrescando: consulta.isFetching,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
  };
}

export function useCruceDePropiedades(filtros: FiltrosDelCruce) {
  const consulta = useQuery<CruceDePropiedades>({
    queryKey: clavesDelMovimiento.cruce(filtros),
    queryFn: () => obtenerCruceDePropiedades(filtros),
    placeholderData: keepPreviousData,
  });

  return {
    cruce: consulta.data,
    estaCargando: consulta.isLoading,
    estaRefrescando: consulta.isFetching,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
  };
}

export function useMovimientoDeLaPropiedad(idDeLaPropiedad: string) {
  const consulta = useQuery<MovimientoDeLaPropiedad>({
    queryKey: clavesDelMovimiento.ficha(idDeLaPropiedad),
    queryFn: () => obtenerMovimientoDeLaPropiedad(idDeLaPropiedad),
  });

  return {
    ficha: consulta.data,
    estaCargando: consulta.isLoading,
    estaRefrescando: consulta.isFetching,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
  };
}
