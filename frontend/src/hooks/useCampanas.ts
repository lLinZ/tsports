/**
 * hooks/useCampanas.ts
 * ---------------------------------------------------------------------
 * Lectura y escritura de las campañas comerciales.
 *
 * Igual que con las propiedades, hay dos consultas separadas: el
 * catálogo completo (pantalla de campañas) y solo las activas (el
 * selector de la ficha de una marca, que no debe ofrecer campañas ya
 * cerradas).
 * ---------------------------------------------------------------------
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  actualizarCampana,
  crearCampana,
  eliminarCampana,
  listarCampanas,
} from "@/api/campanas";
import { clavesDeMarcas } from "@/hooks/useMarcas";
import type { Campana, DatosDeCampanaParaGuardar } from "@/tipos/modelos";

export const clavesDeCampanas = {
  todas: ["campanas"] as const,
  catalogo: ["campanas", "catalogo"] as const,
  activas: ["campanas", "activas"] as const,
};

/** Todas las campañas, con cuántas marcas lleva cada una. */
export function useCatalogoDeCampanas() {
  const consulta = useQuery<Campana[]>({
    queryKey: clavesDeCampanas.catalogo,
    queryFn: () => listarCampanas(),
  });

  return {
    campanas: consulta.data ?? [],
    estaCargando: consulta.isLoading,
    estaRefrescando: consulta.isFetching,
    error: consulta.error,
    recargar: consulta.refetch,
  };
}

/** Las campañas abiertas, para el selector de la ficha y los filtros. */
export function useCampanasActivas() {
  const consulta = useQuery<Campana[]>({
    queryKey: clavesDeCampanas.activas,
    queryFn: () => listarCampanas({ soloActivas: true }),
    staleTime: 10 * 60 * 1000,
  });

  return {
    campanas: consulta.data ?? [],
    estaCargando: consulta.isLoading,
  };
}

/**
 * Invalida las campañas y lo que las enseña: el tablero (el distintivo
 * de cada tarjeta) y el reparto por campaña del resumen.
 */
function useInvalidarCampanas() {
  const clienteDeConsultas = useQueryClient();

  return () => {
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDeCampanas.todas });
    void clienteDeConsultas.invalidateQueries({ queryKey: clavesDeMarcas.todas });
    void clienteDeConsultas.invalidateQueries({
      queryKey: clavesDeMarcas.resumenDelPanel,
    });
  };
}

export function useCrearCampana(): UseMutationResult<
  Campana,
  unknown,
  DatosDeCampanaParaGuardar
> {
  const invalidarCampanas = useInvalidarCampanas();

  return useMutation({
    mutationFn: crearCampana,
    onSuccess: invalidarCampanas,
  });
}

export function useActualizarCampana(): UseMutationResult<
  Campana,
  unknown,
  { idDeLaCampana: string; datos: DatosDeCampanaParaGuardar }
> {
  const invalidarCampanas = useInvalidarCampanas();

  return useMutation({
    mutationFn: ({ idDeLaCampana, datos }) => actualizarCampana(idDeLaCampana, datos),
    onSuccess: invalidarCampanas,
  });
}

export function useEliminarCampana(): UseMutationResult<void, unknown, string> {
  const invalidarCampanas = useInvalidarCampanas();

  return useMutation({
    mutationFn: eliminarCampana,
    onSuccess: invalidarCampanas,
  });
}
