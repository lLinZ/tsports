/**
 * hooks/useVendedores.ts
 * ---------------------------------------------------------------------
 * La lista de vendedores activos, que hace falta en tres sitios: el
 * filtro por responsable del tablero, el selector de la ficha y el
 * avatar de cada tarjeta.
 *
 * Estaba escrita a mano en cada uno, con su clave de caché repetida. Al
 * añadir el tercero se sacó aquí: si una copia cambiara la clave o los
 * filtros, TanStack Query trataría las dos como consultas distintas y el
 * mismo dato viajaría dos veces.
 *
 * Solo se pide a quien reparte trabajo. Un vendedor raso no necesita
 * saber quiénes son sus compañeros para hacer su trabajo, y el servidor
 * le devolvería un 403 de todas formas.
 * ---------------------------------------------------------------------
 */
import { useQuery } from "@tanstack/react-query";
import { listarUsuarios } from "@/api/usuarios";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import type { Usuario } from "@/tipos/modelos";

/** La clave de caché, en un solo sitio. */
export const CLAVE_DE_VENDEDORES = ["usuarios", "vendedores"] as const;

export function useVendedores({
  habilitado = true,
}: { habilitado?: boolean } = {}): {
  vendedores: Usuario[];
  estaCargando: boolean;
  puedeRepartir: boolean;
} {
  const usuario = useUsuarioAutenticado();
  const puedeRepartir = usuario.permisos.asignaVendedores;

  const consulta = useQuery({
    queryKey: CLAVE_DE_VENDEDORES,
    queryFn: () => listarUsuarios({ rol: "vendedor", soloActivos: true }),
    enabled: habilitado && puedeRepartir,
    // El equipo no cambia de una hora para otra: cinco minutos evitan
    // pedir la misma lista cada vez que se abre una ficha.
    staleTime: 5 * 60 * 1000,
  });

  return {
    vendedores: consulta.data ?? [],
    estaCargando: consulta.isLoading,
    puedeRepartir,
  };
}
