/**
 * api/cierresDeMes.ts
 * ---------------------------------------------------------------------
 * Los reportes de cierre de mes: listarlos, subir uno y borrarlo.
 *
 * El fichero sube junto con sus datos en una sola petición, con barra de
 * progreso: un Excel con gráficos o una presentación pasan fácil de
 * varios megas, y sin barra parece que el botón no hizo nada.
 * ---------------------------------------------------------------------
 */
import { clienteHttp, TIEMPO_MAXIMO_DE_UNA_SUBIDA_MS } from "@/api/clienteHttp";
import type { CierreDeMes } from "@/tipos/modelos";

export async function listarCierresDeMes(): Promise<CierreDeMes[]> {
  const { data } = await clienteHttp.get<{ data: CierreDeMes[] }>("/cierres-de-mes");

  return data.data;
}

export interface DatosDeCierreDeMes {
  archivo: File;
  /** «2026-09». */
  mes: string;
  titulo: string;
  notas: string;
}

export async function subirCierreDeMes(
  datos: DatosDeCierreDeMes,
  alProgresar?: (fraccion: number) => void,
): Promise<CierreDeMes> {
  const formulario = new FormData();

  formulario.append("archivo", datos.archivo);
  formulario.append("mes", datos.mes);
  if (datos.titulo.trim()) formulario.append("titulo", datos.titulo.trim());
  if (datos.notas.trim()) formulario.append("notas", datos.notas.trim());

  const { data } = await clienteHttp.post<{ data: CierreDeMes }>("/cierres-de-mes", formulario, {
    headers: { "Content-Type": undefined },
    timeout: TIEMPO_MAXIMO_DE_UNA_SUBIDA_MS,
    onUploadProgress: (evento) => {
      if (evento.total) alProgresar?.(evento.loaded / evento.total);
    },
  });

  return data.data;
}

export async function eliminarCierreDeMes(idDelCierre: string): Promise<void> {
  await clienteHttp.delete(`/cierres-de-mes/${idDelCierre}`);
}
