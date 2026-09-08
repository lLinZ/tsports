/**
 * api/sectores.ts
 * ---------------------------------------------------------------------
 * El catálogo de rubros: Alimentos, Bebidas, Telecomunicaciones…
 *
 * Eran una lista escrita en el código del servidor, así que añadir uno
 * obligaba a desplegar. Ahora se gestionan desde el panel y estas son
 * las cuatro llamadas que lo permiten.
 *
 * El selector de la ficha de una marca NO usa esto: sigue leyendo
 * `catalogos.sectores`, que ya viene resuelto con los activos. Esta capa
 * es para la pantalla que los administra.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type { Sector } from "@/tipos/modelos";

/**
 * Trae el catálogo completo, con cuántas marcas hay en cada rubro.
 *
 * Por defecto vienen también los desactivados: la pantalla que los
 * administra tiene que poder volver a activarlos.
 */
export async function listarSectores(
  opciones: { soloActivos?: boolean } = {},
): Promise<Sector[]> {
  const { data } = await clienteHttp.get<{ data: Sector[] }>("/sectores", {
    params: opciones.soloActivos ? { soloActivos: 1 } : {},
  });

  return data.data;
}

export async function crearSector(nombre: string): Promise<Sector> {
  const { data } = await clienteHttp.post<{ data: Sector }>("/sectores", { nombre });

  return data.data;
}

/**
 * Renombra o activa/desactiva un rubro.
 *
 * Al renombrar, el servidor arrastra el cambio a las marcas que lo
 * llevan: la marca guarda el sector como texto, no como una relación.
 */
export async function actualizarSector(
  idDelSector: string,
  datos: { nombre: string; activo: boolean },
): Promise<Sector> {
  const { data } = await clienteHttp.put<{ data: Sector }>(
    `/sectores/${idDelSector}`,
    datos,
  );

  return data.data;
}

/**
 * Borra un rubro. El servidor lo rechaza con un 422 explicativo si hay
 * marcas dentro; en ese caso lo que toca es desactivarlo.
 */
export async function eliminarSector(idDelSector: string): Promise<void> {
  await clienteHttp.delete(`/sectores/${idDelSector}`);
}
