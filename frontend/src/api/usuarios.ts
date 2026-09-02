/**
 * api/usuarios.ts
 * ---------------------------------------------------------------------
 * Gestión de las cuentas del equipo. Sustituye a la antigua Edge
 * Function `update-user` de Supabase, que existía solo porque el
 * navegador no podía cambiar el correo de acceso con la clave pública.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type { RolUsuario, Usuario } from "@/tipos/modelos";

/**
 * Lista del equipo. Se puede pedir solo un rol, que es lo que hace el
 * selector de "vendedor asignado" de la ficha de una marca.
 */
export async function listarUsuarios(opciones?: {
  rol?: RolUsuario;
  soloActivos?: boolean;
}): Promise<Usuario[]> {
  const parametrosDeConsulta: Record<string, string> = {};

  if (opciones?.rol) parametrosDeConsulta.rol = opciones.rol;
  if (opciones?.soloActivos) parametrosDeConsulta.soloActivos = "1";

  const { data } = await clienteHttp.get<{ data: Usuario[] }>("/usuarios", {
    params: parametrosDeConsulta,
  });

  return data.data;
}

/** Datos de una cuenta nueva. */
export interface DatosDeNuevoUsuario {
  nombre: string;
  email: string;
  password: string;
  rol: RolUsuario;
  zona: string | null;
}

export async function crearUsuario(
  datos: DatosDeNuevoUsuario,
): Promise<Usuario> {
  const { data } = await clienteHttp.post<{ data: Usuario }>(
    "/admin/usuarios",
    datos,
  );

  return data.data;
}

/**
 * Datos editables de una cuenta ajena.
 *
 * `password` es opcional: solo se envía cuando de verdad se quiere
 * reiniciar la contraseña. Si se envía, el servidor cierra todas las
 * sesiones abiertas de esa persona.
 */
export interface DatosDeUsuarioParaEditar {
  nombre?: string;
  email?: string;
  password?: string;
  rol?: RolUsuario;
  zona?: string | null;
  activo?: boolean;
}

export async function actualizarUsuario(
  idDelUsuario: string,
  datos: DatosDeUsuarioParaEditar,
): Promise<Usuario> {
  // Se limpian las claves vacías para no enviar una contraseña en blanco
  // que el servidor interpretaría como intento de cambiarla.
  const datosLimpios: Record<string, unknown> = {};

  Object.entries(datos).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== "") {
      datosLimpios[clave] = valor;
    }
  });

  const { data } = await clienteHttp.put<{ data: Usuario }>(
    `/admin/usuarios/${idDelUsuario}`,
    datosLimpios,
  );

  return data.data;
}

/**
 * Da de baja una cuenta.
 *
 * Por defecto solo la desactiva, para que el historial de marcas y
 * comentarios siga diciendo quién hizo qué. `definitivo` la borra de
 * verdad, y entonces esas referencias quedan sin nombre de usuario.
 */
export async function darDeBajaUsuario(
  idDelUsuario: string,
  definitivo = false,
): Promise<string> {
  const { data } = await clienteHttp.delete<{ mensaje: string }>(
    `/admin/usuarios/${idDelUsuario}`,
    { params: definitivo ? { definitivo: 1 } : {} },
  );

  return data.mensaje;
}
