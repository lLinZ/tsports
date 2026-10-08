/**
 * hooks/useSectores.ts
 * ---------------------------------------------------------------------
 * El catálogo de rubros y sus tres escrituras.
 *
 * Cada escritura invalida DOS cosas: el propio catálogo y `/api/catalogos`,
 * que es de donde el selector de la ficha saca la lista de sectores. Sin
 * lo segundo, alguien añade un rubro, se va a crear una marca y no lo
 * encuentra en el desplegable hasta recargar la página.
 * ---------------------------------------------------------------------
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  actualizarSector,
  crearSector,
  eliminarSector,
  listarSectores,
  obtenerCampanasPorSector,
} from "@/api/sectores";
import { CLAVE_DE_CATALOGOS } from "@/hooks/useCatalogos";
import type { CatalogoDeSectores, Sector } from "@/tipos/modelos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";

export const CLAVE_DE_SECTORES = ["sectores"] as const;

export function useSectores(): {
  sectores: Sector[];
  sinSector: CatalogoDeSectores["sinSector"];
  totalValorPropuestoUsd: number | null;
  totalPronosticoUsd: number | null;
  estaCargando: boolean;
  error: unknown;
  recargar: () => void;
} {
  const consulta = useQuery({
    queryKey: CLAVE_DE_SECTORES,
    queryFn: () => listarSectores(),
  });

  return {
    sectores: consulta.data?.sectores ?? [],
    sinSector: consulta.data?.sinSector ?? null,
    totalValorPropuestoUsd: consulta.data?.totalValorPropuestoUsd ?? null,
    // `?? null`: una copia guardada de antes de esta versión no lo trae.
    totalPronosticoUsd: consulta.data?.totalPronosticoUsd ?? null,
    estaCargando: consulta.isLoading,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: () => void consulta.refetch(),
  };
}

/**
 * Las campañas por sector de un mes (null = el que dice el servidor que
 * es el actual). La clave cuelga de la del catálogo, así que todo lo que
 * refresca los sectores —una marca, una acción de campaña, un renombrado—
 * la refresca también.
 */
export function useCampanasPorSector(mes: string | null) {
  const consulta = useQuery({
    queryKey: [...CLAVE_DE_SECTORES, "campanas", mes ?? "actual"],
    queryFn: () => obtenerCampanasPorSector(mes),
    // Al pasar de mes, el anterior se queda a la vista hasta que llega el
    // nuevo: sin esto la rejilla parpadea vacía en cada flecha.
    placeholderData: keepPreviousData,
  });

  return {
    datos: consulta.data ?? null,
    estaCargando: consulta.isLoading,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: () => void consulta.refetch(),
  };
}

/**
 * Invalida el catálogo y las listas que dependen de él.
 *
 * Las marcas entran porque renombrar un sector cambia el rubro de las
 * marcas que lo llevaban: el tablero y el reparto del resumen estarían
 * enseñando el nombre viejo.
 */
function useInvalidarSectores() {
  const clienteDeConsultas = useQueryClient();

  return () => {
    void clienteDeConsultas.invalidateQueries({ queryKey: CLAVE_DE_SECTORES });
    void clienteDeConsultas.invalidateQueries({ queryKey: CLAVE_DE_CATALOGOS });
    void clienteDeConsultas.invalidateQueries({ queryKey: ["marcas"] });
    void clienteDeConsultas.invalidateQueries({ queryKey: ["panel", "resumen"] });
  };
}

export function useCrearSector() {
  const invalidar = useInvalidarSectores();

  return useMutation({
    mutationFn: (nombre: string) => crearSector(nombre),
    onSuccess: invalidar,
  });
}

export function useActualizarSector() {
  const invalidar = useInvalidarSectores();

  return useMutation({
    mutationFn: ({
      idDelSector,
      datos,
    }: {
      idDelSector: string;
      datos: { nombre: string; activo: boolean };
    }) => actualizarSector(idDelSector, datos),
    onSuccess: invalidar,
  });
}

export function useEliminarSector() {
  const invalidar = useInvalidarSectores();

  return useMutation({
    mutationFn: (idDelSector: string) => eliminarSector(idDelSector),
    onSuccess: invalidar,
  });
}
