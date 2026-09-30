/**
 * api/propiedades.ts
 * ---------------------------------------------------------------------
 * El catálogo de productos IOP: las propiedades que la agencia vende.
 *
 * Se pide de dos maneras distintas y conviene no confundirlas:
 *
 *   · `listarPropiedades({ soloActivas: true })` → lo que necesita el
 *     checklist de la ficha de una marca: ligero, sin totales.
 *   · `listarPropiedades({ conTotales: true })`  → lo que necesita la
 *     pantalla del catálogo: añade cuántas marcas llevan cada propiedad
 *     y cuánto suman sus pronósticos.
 *
 * Las dos traen la galería de cada propiedad. La galería se toca con sus
 * propias llamadas (abajo), fichero a fichero: no viaja con el
 * formulario de la propiedad.
 *
 * Al final, el usuario y la contraseña de invitado con los que los
 * clientes abren el catálogo de la web.
 * ---------------------------------------------------------------------
 */
import { clienteHttp, TIEMPO_MAXIMO_DE_UNA_SUBIDA_MS } from "@/api/clienteHttp";
import type {
  AccesoDeInvitados,
  ArchivoDeGaleria,
  DatosDePropiedadParaGuardar,
  Propiedad,
} from "@/tipos/modelos";

export async function listarPropiedades(opciones?: {
  soloActivas?: boolean;
  conTotales?: boolean;
}): Promise<Propiedad[]> {
  const parametrosDeConsulta: Record<string, string> = {};

  if (opciones?.soloActivas) parametrosDeConsulta.soloActivas = "1";
  if (opciones?.conTotales) parametrosDeConsulta.conTotales = "1";

  const { data } = await clienteHttp.get<{ data: Propiedad[] }>("/propiedades", {
    params: parametrosDeConsulta,
  });

  return data.data;
}

export async function obtenerPropiedad(idDeLaPropiedad: string): Promise<Propiedad> {
  const { data } = await clienteHttp.get<{ data: Propiedad }>(
    `/propiedades/${idDeLaPropiedad}`,
  );

  return data.data;
}

export async function crearPropiedad(
  datos: DatosDePropiedadParaGuardar,
): Promise<Propiedad> {
  const { data } = await clienteHttp.post<{ data: Propiedad }>("/propiedades", datos);

  return data.data;
}

export async function actualizarPropiedad(
  idDeLaPropiedad: string,
  datos: DatosDePropiedadParaGuardar,
): Promise<Propiedad> {
  const { data } = await clienteHttp.put<{ data: Propiedad }>(
    `/propiedades/${idDeLaPropiedad}`,
    datos,
  );

  return data.data;
}

/**
 * Desactiva o reactiva una propiedad sin tocar nada más. Desactivada deja
 * de ofrecerse en el checklist, pero las marcas que la llevaban la
 * conservan con su pronóstico.
 */
export async function cambiarActivaDePropiedad(
  idDeLaPropiedad: string,
  activa: boolean,
): Promise<Propiedad> {
  const { data } = await clienteHttp.patch<{ data: Propiedad }>(
    `/propiedades/${idDeLaPropiedad}/activa`,
    { activa },
  );

  return data.data;
}

/**
 * Borra la propiedad y, con ella, sus líneas del checklist en todas las
 * marcas. Para retirarla de la venta conservando el histórico, la
 * pantalla ofrece antes desactivarla.
 */
export async function eliminarPropiedad(idDeLaPropiedad: string): Promise<void> {
  await clienteHttp.delete(`/propiedades/${idDeLaPropiedad}`);
}

/* ==================================================================== */
/* Galería                                                              */
/* ==================================================================== */

/**
 * Sube UNA foto o PDF a la galería. Para varias se llama una vez por
 * fichero: cada uno lleva su barra, y si uno falla no arrastra al resto.
 *
 * Se envía como multipart y se deja que el navegador ponga el
 * Content-Type con su propio boundary.
 */
export async function subirAGaleria(
  idDeLaPropiedad: string,
  archivo: File,
  opciones: {
    miniatura?: Blob | null;
    alProgresar?: (fraccion: number) => void;
  } = {},
): Promise<ArchivoDeGaleria> {
  const formulario = new FormData();
  formulario.append("archivo", archivo);

  if (opciones.miniatura) {
    formulario.append("miniatura", opciones.miniatura, "miniatura.jpg");
  }

  const { data } = await clienteHttp.post<{ data: ArchivoDeGaleria }>(
    `/propiedades/${idDeLaPropiedad}/galeria`,
    formulario,
    {
      headers: { "Content-Type": undefined },
      timeout: TIEMPO_MAXIMO_DE_UNA_SUBIDA_MS,
      onUploadProgress: (evento) => {
        if (evento.total) opciones.alProgresar?.(evento.loaded / evento.total);
      },
    },
  );

  return data.data;
}

/** El título, la descripción o si sale en la web. Solo lo que se mande. */
export async function actualizarPiezaDeGaleria(
  idDeLaPropiedad: string,
  idDeLaPieza: string,
  cambios: { titulo?: string | null; descripcion?: string | null; enLaWeb?: boolean },
): Promise<ArchivoDeGaleria> {
  const { data } = await clienteHttp.patch<{ data: ArchivoDeGaleria }>(
    `/propiedades/${idDeLaPropiedad}/galeria/${idDeLaPieza}`,
    cambios,
  );

  return data.data;
}

/**
 * El orden nuevo de TODA la galería. Si mientras tanto alguien subió o
 * borró algo, el servidor lo rechaza en vez de dejar piezas fuera.
 */
export async function reordenarGaleria(
  idDeLaPropiedad: string,
  idsEnOrden: string[],
): Promise<ArchivoDeGaleria[]> {
  const { data } = await clienteHttp.put<{ data: ArchivoDeGaleria[] }>(
    `/propiedades/${idDeLaPropiedad}/galeria/orden`,
    { ids: idsEnOrden },
  );

  return data.data;
}

export async function elegirPortadaDeGaleria(
  idDeLaPropiedad: string,
  idDeLaPieza: string,
): Promise<ArchivoDeGaleria[]> {
  const { data } = await clienteHttp.put<{ data: ArchivoDeGaleria[] }>(
    `/propiedades/${idDeLaPropiedad}/galeria/${idDeLaPieza}/portada`,
  );

  return data.data;
}

/** Borra la pieza y su fichero. Devuelve la galería como queda. */
export async function eliminarDeGaleria(
  idDeLaPropiedad: string,
  idDeLaPieza: string,
): Promise<ArchivoDeGaleria[]> {
  const { data } = await clienteHttp.delete<{ data: ArchivoDeGaleria[] }>(
    `/propiedades/${idDeLaPropiedad}/galeria/${idDeLaPieza}`,
  );

  return data.data;
}

/* ==================================================================== */
/* El acceso de invitados al catálogo de la web                         */
/* ==================================================================== */

/** El usuario y la contraseña de invitado, o nulo si nadie los ha puesto. */
export async function obtenerAccesoDeInvitados(): Promise<AccesoDeInvitados | null> {
  const { data } = await clienteHttp.get<{ data: AccesoDeInvitados | null }>(
    "/acceso-de-invitados",
  );

  return data.data;
}

/**
 * Pone o cambia la pareja. Si cambia, los clientes que entraron con la
 * anterior dejan de ver el catálogo hasta que entren con la nueva.
 */
export async function guardarAccesoDeInvitados(
  usuario: string,
  contrasena: string,
): Promise<AccesoDeInvitados> {
  const { data } = await clienteHttp.put<{ data: AccesoDeInvitados }>(
    "/acceso-de-invitados",
    { usuario, contrasena },
  );

  return data.data;
}
