/**
 * api/metas.ts
 * ---------------------------------------------------------------------
 * Poner o quitar la meta de venta de una persona. Se leen con el resumen
 * del panel; aquí solo se escriben, y solo lo acepta el servidor de
 * quien reparte el trabajo.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type { MetaDeUnaPersona } from "@/tipos/modelos";

/** Con `montoUsd: null` se quita la meta de ese año. */
export async function guardarMeta(
  idDeLaPersona: string,
  anio: number,
  montoUsd: number | null,
): Promise<MetaDeUnaPersona | null> {
  const { data } = await clienteHttp.put<{ data: MetaDeUnaPersona | null }>(
    `/metas/${idDeLaPersona}`,
    { anio, montoUsd },
  );

  return data.data;
}
