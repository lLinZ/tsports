/**
 * api/recordatorios.ts
 * ---------------------------------------------------------------------
 * Los recordatorios de seguimiento: los de una marca (su ficha) y los de
 * quien pregunta (el panel). Qué ve y qué toca cada quien lo decide el
 * servidor con los permisos de la marca.
 *
 * Y «Contacté», que deja la entrada de la bitácora y el siguiente paso
 * (un recordatorio) en una sola petición.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type {
  CambiosDeRecordatorio,
  DatosDeContacto,
  DatosDeRecordatorio,
  MisRecordatorios,
  Recordatorio,
} from "@/tipos/modelos";

/** Los de la ficha: pendientes de todo el equipo y lo cumplido esta semana. */
export async function listarRecordatoriosDeLaMarca(idDeLaMarca: string): Promise<Recordatorio[]> {
  const { data } = await clienteHttp.get<{ data: Recordatorio[] }>(
    `/marcas/${idDeLaMarca}/recordatorios`,
  );

  return data.data;
}

/** Lo vencido, lo de hoy y lo de esta semana de quien pregunta. */
export async function listarMisRecordatorios(): Promise<MisRecordatorios> {
  const { data } = await clienteHttp.get<MisRecordatorios>("/recordatorios/mios");

  return data;
}

export async function crearRecordatorio(
  idDeLaMarca: string,
  datos: DatosDeRecordatorio,
): Promise<Recordatorio> {
  const { data } = await clienteHttp.post<{ data: Recordatorio }>(
    `/marcas/${idDeLaMarca}/recordatorios`,
    datos,
  );

  return data.data;
}

/** Cumplirlo (o deshacerlo), posponerlo o corregir la nota. */
export async function cambiarRecordatorio(
  idDelRecordatorio: string,
  cambios: CambiosDeRecordatorio,
): Promise<Recordatorio> {
  const { data } = await clienteHttp.patch<{ data: Recordatorio }>(
    `/recordatorios/${idDelRecordatorio}`,
    cambios,
  );

  return data.data;
}

export async function eliminarRecordatorio(idDelRecordatorio: string): Promise<void> {
  await clienteHttp.delete(`/recordatorios/${idDelRecordatorio}`);
}

/**
 * «Contacté»: la entrada en la bitácora y, si se eligió, el recordatorio
 * del siguiente paso, de una vez. Devuelve el recordatorio que dejó.
 */
export async function anotarContacto(
  idDeLaMarca: string,
  datos: DatosDeContacto,
): Promise<{ comentarioId: string; recordatorio: Recordatorio | null }> {
  const { data } = await clienteHttp.post<{ comentarioId: string; recordatorio: Recordatorio | null }>(
    `/marcas/${idDeLaMarca}/contactos`,
    datos,
  );

  return data;
}
