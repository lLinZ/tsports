/**
 * api/autenticacion.ts
 * ---------------------------------------------------------------------
 * Llamadas relacionadas con la sesión: entrar, salir, saber quién soy y
 * cambiar la contraseña o las preferencias del propio perfil.
 *
 * Todas las funciones devuelven ya el dato limpio (no la respuesta HTTP)
 * para que las pantallas no tengan que acordarse de si el backend
 * envuelve el resultado en una clave `data` o no.
 * ---------------------------------------------------------------------
 */
import { clienteHttp, guardarToken, borrarToken } from "@/api/clienteHttp";
import type { PreferenciaDeTema, Usuario } from "@/tipos/modelos";

/**
 * Respuesta del login: token de acceso + los datos del usuario.
 *
 * Aquí el usuario llega sin el envoltorio "data" que Laravel añade
 * cuando un recurso es la respuesta entera; en el login es solo una
 * parte del cuerpo, junto al token.
 */
interface RespuestaDeLogin {
  token: string;
  usuario: Usuario;
}

/**
 * Inicia sesión y deja el token guardado para las siguientes peticiones.
 */
export async function iniciarSesion(
  email: string,
  password: string,
): Promise<Usuario> {
  const { data } = await clienteHttp.post<RespuestaDeLogin>("/auth/login", {
    // El correo se normaliza también en el servidor, pero hacerlo aquí
    // evita el viaje de ida y vuelta cuando alguien escribe mayúsculas.
    email: email.trim().toLowerCase(),
    password,
  });

  guardarToken(data.token);

  return data.usuario;
}

/**
 * Recupera el usuario de la sesión actual. Se llama al arrancar la
 * aplicación para comprobar si el token guardado sigue siendo válido.
 */
export async function obtenerUsuarioActual(): Promise<Usuario> {
  const { data } = await clienteHttp.get<{ data: Usuario }>("/auth/yo");

  return data.data;
}

/**
 * Cierra la sesión. El token se borra del navegador aunque la llamada al
 * servidor falle: para la persona, "salir" tiene que funcionar siempre.
 */
export async function cerrarSesion(): Promise<void> {
  try {
    await clienteHttp.post("/auth/logout");
  } finally {
    borrarToken();
  }
}

/** Cambia la contraseña propia, exigiendo la actual. */
export async function cambiarPassword(
  passwordActual: string,
  passwordNueva: string,
): Promise<string> {
  const { data } = await clienteHttp.post<{ mensaje: string }>(
    "/auth/cambiar-password",
    {
      passwordActual,
      passwordNueva,
      passwordNueva_confirmation: passwordNueva,
    },
  );

  return data.mensaje;
}

/** Datos editables del propio perfil. */
export interface DatosDeMiPerfil {
  nombre?: string;
  email?: string;
  urlAvatar?: string | null;
}

export async function actualizarMiPerfil(
  datos: DatosDeMiPerfil,
): Promise<Usuario> {
  const { data } = await clienteHttp.put<{ data: Usuario }>("/mi-perfil", datos);

  return data.data;
}

/**
 * Guarda el tema y el color de acento en el servidor.
 *
 * Es una llamada aparte del resto del perfil porque se dispara cada vez
 * que alguien pulsa el interruptor de tema, y conviene que sea lo más
 * pequeña posible.
 */
export async function actualizarApariencia(preferencias: {
  tema?: PreferenciaDeTema;
  colorAcento?: string;
}): Promise<Usuario> {
  const { data } = await clienteHttp.put<{ data: Usuario }>(
    "/mi-perfil/apariencia",
    preferencias,
  );

  return data.data;
}
