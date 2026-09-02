/**
 * hooks/useCatalogos.ts
 * ---------------------------------------------------------------------
 * Las listas cerradas del sistema (zonas, sectores, vías, roles, temas y
 * colores de acento), cacheadas para toda la sesión.
 *
 * Son datos que cambian como mucho una vez al trimestre, así que se
 * piden una sola vez y se reutilizan en cada selector de la aplicación.
 * Antes estaban copiadas a mano en tres ficheros JavaScript distintos:
 * añadir una zona significaba acordarse de tocarlos todos.
 * ---------------------------------------------------------------------
 */
import { useQuery } from "@tanstack/react-query";
import { obtenerCatalogos } from "@/api/sistema";
import type { CatalogosDelSistema } from "@/tipos/modelos";

/** Clave con la que estos datos viven en la caché. */
export const CLAVE_DE_CATALOGOS = ["catalogos"] as const;

export function useCatalogos() {
  const consulta = useQuery<CatalogosDelSistema>({
    queryKey: CLAVE_DE_CATALOGOS,
    queryFn: obtenerCatalogos,
    // Una hora: no hay ninguna razón para volver a pedir esto antes.
    staleTime: 60 * 60 * 1000,
    // Tampoco tiene sentido refrescarlo al volver a la pestaña.
    refetchOnWindowFocus: false,
  });

  return {
    catalogos: consulta.data,
    estaCargando: consulta.isLoading,
    /** Listas de reserva mientras llega la respuesta, para que ningún
     *  selector se renderice con `undefined`. */
    zonas: consulta.data?.zonas ?? [],
    sectores: consulta.data?.sectores ?? [],
    viasDeProspeccion: consulta.data?.viasDeProspeccion ?? [],
    viasDeAproximacion: consulta.data?.viasDeAproximacion ?? [],
  };
}
