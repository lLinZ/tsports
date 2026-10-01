/**
 * hooks/useCierresDeMes.ts
 * ---------------------------------------------------------------------
 * Los reportes de cierre de mes en la caché de datos.
 *
 * Quedan fuera de la copia sin conexión (`sinCopiaLocal`): cada reporte
 * lleva un enlace firmado que caduca en uno o dos días, y una copia de
 * hace una semana enseñaría enlaces que ya no abren nada.
 * ---------------------------------------------------------------------
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  eliminarCierreDeMes,
  listarCierresDeMes,
  subirCierreDeMes,
  type DatosDeCierreDeMes,
} from "@/api/cierresDeMes";
import type { CierreDeMes } from "@/tipos/modelos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";

export const CLAVE_DE_CIERRES_DE_MES = ["cierres-de-mes"] as const;

export function useCierresDeMes() {
  const consulta = useQuery<CierreDeMes[]>({
    queryKey: CLAVE_DE_CIERRES_DE_MES,
    queryFn: listarCierresDeMes,
    meta: { sinCopiaLocal: true },
  });

  return {
    cierres: consulta.data ?? [],
    estaCargando: consulta.isLoading,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
  };
}

export function useSubirCierreDeMes() {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: ({ datos, alProgresar }: { datos: DatosDeCierreDeMes; alProgresar?: (fraccion: number) => void }) =>
      subirCierreDeMes(datos, alProgresar),
    onSuccess: () => {
      void clienteDeConsultas.invalidateQueries({ queryKey: CLAVE_DE_CIERRES_DE_MES });
    },
  });
}

export function useEliminarCierreDeMes() {
  const clienteDeConsultas = useQueryClient();

  return useMutation({
    mutationFn: eliminarCierreDeMes,
    onSuccess: () => {
      void clienteDeConsultas.invalidateQueries({ queryKey: CLAVE_DE_CIERRES_DE_MES });
    },
  });
}
