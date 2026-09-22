/**
 * providers/ProveedorSesion.tsx
 * ---------------------------------------------------------------------
 * Quién está usando el sistema ahora mismo.
 *
 * Al arrancar, si hay un token guardado, pregunta al servidor si sigue
 * siendo válido. Mientras lo comprueba, el estado es "comprobando": es
 * importante distinguirlo de "no hay sesión", porque si no se enseñaría
 * el login durante un instante a quien ya estaba dentro, que es
 * exactamente el parpadeo que tenía la versión anterior.
 *
 * En cuanto conoce al usuario, empuja sus preferencias visuales al
 * proveedor de tema, de modo que el tema y el color de perfil viajen con
 * la cuenta y no con el navegador.
 *
 * SE RECUERDA A LA ÚLTIMA PERSONA QUE ENTRÓ, y eso hace dos cosas:
 *
 *   · El panel abre al instante, sin esperar a que el servidor conteste
 *     quién eres. Antes el arranque se comía siempre un viaje de red.
 *   · Y sobre todo: SIN RED SE PUEDE ENTRAR IGUAL. Hasta ahora, que
 *     fallara esa primera petición se trataba como un token inválido, se
 *     borraba y te echaba al acceso; en un sitio sin cobertura no había
 *     manera de mirar nada, aunque los datos estuvieran guardados en el
 *     teléfono. Ahora solo se borra el token cuando el servidor dice que
 *     no vale (401): que no se pueda preguntar no es que no valga.
 *
 * Lo guardado se borra entero al salir y cuando el servidor rechaza el
 * token, junto con la copia de datos: en un ordenador compartido, detrás
 * de una persona entra otra.
 * ---------------------------------------------------------------------
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  cerrarSesion as cerrarSesionEnLaApi,
  iniciarSesion as iniciarSesionEnLaApi,
  obtenerUsuarioActual,
} from "@/api/autenticacion";
import {
  borrarToken,
  esErrorDeApi,
  leerTokenGuardado,
  registrarManejadorDeSesionCaducada,
} from "@/api/clienteHttp";
import { darDeBajaEsteDispositivo } from "@/api/push";
import { borrarLasCopiasDeDatos } from "@/providers/ProveedorDatosGuardados";
import { useTema } from "@/providers/ProveedorTema";
import type { Usuario } from "@/tipos/modelos";

/** Los tres estados posibles del arranque. */
type EstadoDeLaSesion = "comprobando" | "conSesion" | "sinSesion";

/** Dónde se recuerda a la última persona que entró en este navegador. */
const CLAVE_DEL_USUARIO_RECORDADO = "tsports:usuario";

function leerUsuarioRecordado(): Usuario | null {
  try {
    const guardado = localStorage.getItem(CLAVE_DEL_USUARIO_RECORDADO);

    return guardado === null ? null : (JSON.parse(guardado) as Usuario);
  } catch {
    // Almacenamiento bloqueado o JSON de una versión anterior: se
    // arranca preguntando al servidor, como se hacía siempre.
    return null;
  }
}

function recordarUsuario(usuario: Usuario): void {
  try {
    localStorage.setItem(CLAVE_DEL_USUARIO_RECORDADO, JSON.stringify(usuario));
  } catch {
    /* Sin sitio: solo se pierde el arranque rápido. */
  }
}

/**
 * Borra todo rastro de la persona anterior en este navegador: a quién se
 * recordaba y su copia de datos para consultar sin conexión.
 */
function olvidarAlUsuario(): void {
  try {
    localStorage.removeItem(CLAVE_DEL_USUARIO_RECORDADO);
  } catch {
    /* Nada que limpiar. */
  }

  borrarLasCopiasDeDatos();
}

interface ValorDelContextoDeSesion {
  estadoDeLaSesion: EstadoDeLaSesion;
  usuario: Usuario | null;

  entrar: (email: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
  /** Refresca los datos del usuario tras editar el perfil. */
  refrescarUsuario: () => Promise<void>;
  /** Actualiza el usuario en memoria sin volver a pedirlo al servidor. */
  reemplazarUsuarioEnMemoria: (usuarioActualizado: Usuario) => void;
}

const ContextoDeSesion = createContext<ValorDelContextoDeSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const { aplicarPreferenciasDelServidor } = useTema();

  // A quién se recordaba de la última vez. Sin token no se mira: un
  // token borrado a mano o caducado no debe resucitar una sesión.
  const [usuarioRecordado] = useState<Usuario | null>(() =>
    leerTokenGuardado() === null ? null : leerUsuarioRecordado(),
  );

  const [estadoDeLaSesion, establecerEstado] = useState<EstadoDeLaSesion>(() => {
    // Si no hay token no hay nada que comprobar: se va directo al login
    // y se ahorra una petición.
    if (leerTokenGuardado() === null) return "sinSesion";

    // Con copia se entra directo y el servidor confirma por detrás. Si
    // el token ya no valiera, la primera petición devolverá 401 y de
    // ahí sale al acceso igual: lo único que se adelanta es la pintura.
    return usuarioRecordado !== null ? "conSesion" : "comprobando";
  });

  const [usuario, establecerUsuario] = useState<Usuario | null>(usuarioRecordado);

  /**
   * Guarda al usuario y sincroniza su apariencia. Todo lo que establece
   * un usuario pasa por aquí, para no olvidarse nunca del tema.
   */
  const adoptarUsuario = useCallback(
    (usuarioRecibido: Usuario) => {
      establecerUsuario(usuarioRecibido);
      establecerEstado("conSesion");
      recordarUsuario(usuarioRecibido);

      aplicarPreferenciasDelServidor(
        usuarioRecibido.tema,
        usuarioRecibido.colorAcento,
      );
    },
    [aplicarPreferenciasDelServidor],
  );

  /* ---------------------------------------------------------------- */
  /* Comprobación del token al arrancar                               */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (leerTokenGuardado() === null) {
      return;
    }

    let elComponenteSigueMontado = true;

    obtenerUsuarioActual()
      .then((usuarioDelServidor) => {
        if (elComponenteSigueMontado) {
          adoptarUsuario(usuarioDelServidor);
        }
      })
      .catch((fallo: unknown) => {
        // SOLO un 401 significa que el token ya no vale. Es el que
        // devuelve Sanctum cuando está caducado o revocado, y también
        // el de una cuenta desactivada: desactivarla le borra los
        // tokens (ver UsuarioController), así que no llega como 403.
        //
        // Cualquier otra cosa —sin cobertura, nginx devolviendo 502
        // mientras Laravel reinicia, un 500 de una migración a medias—
        // es un problema del servidor, no de la sesión. Ahí se conserva
        // el token y se sigue con la copia de esta persona en modo
        // consulta. Echar a todo el equipo al acceso porque el VPS
        // tardó diez segundos en levantar sería peor que el corte.
        const elTokenYaNoVale = esErrorDeApi(fallo) && fallo.codigoHttp === 401;

        if (!elTokenYaNoVale && usuarioRecordado !== null) {
          return;
        }

        // Aquí sí: o el servidor dijo que no, o no hay copia que
        // enseñar y quedarse dentro sería una pantalla vacía sin salida.
        borrarToken();
        olvidarAlUsuario();

        if (elComponenteSigueMontado) {
          establecerUsuario(null);
          establecerEstado("sinSesion");
        }
      });

    return () => {
      elComponenteSigueMontado = false;
    };
  }, [adoptarUsuario, usuarioRecordado]);

  /* ---------------------------------------------------------------- */
  /* Reacción a un 401 en cualquier petición                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    // El cliente HTTP avisa por aquí cuando el servidor rechaza el
    // token, sea en la petición que sea. Así una sesión caducada a mitad
    // de la jornada lleva al login en lugar de dejar la pantalla
    // llenándose de errores.
    registrarManejadorDeSesionCaducada(() => {
      // El servidor ha dicho que no: se va también lo recordado y la
      // copia de datos, que sin sesión no tiene a quién servir.
      olvidarAlUsuario();

      establecerUsuario(null);
      establecerEstado("sinSesion");
    });
  }, []);

  /* ---------------------------------------------------------------- */
  /* Acciones                                                         */
  /* ---------------------------------------------------------------- */

  const entrar = useCallback(
    async (email: string, password: string) => {
      const usuarioAutenticado = await iniciarSesionEnLaApi(email, password);

      adoptarUsuario(usuarioAutenticado);
    },
    [adoptarUsuario],
  );

  const salir = useCallback(async () => {
    try {
      // Antes de invalidar el token, mientras todavía vale: este
      // dispositivo deja de estar en la libreta del push, para que sus
      // avisos no le suenen al siguiente que entre aquí.
      await darDeBajaEsteDispositivo();
      await cerrarSesionEnLaApi();
    } finally {
      // Pase lo que pase con el servidor —puede no haber red— salir
      // tiene que salir de verdad en ESTE ordenador. Detrás de una
      // persona entra otra: no puede quedarse ni su nombre ni su
      // tablero guardado.
      olvidarAlUsuario();

      establecerUsuario(null);
      establecerEstado("sinSesion");
    }
  }, []);

  const refrescarUsuario = useCallback(async () => {
    const usuarioDelServidor = await obtenerUsuarioActual();

    adoptarUsuario(usuarioDelServidor);
  }, [adoptarUsuario]);

  const reemplazarUsuarioEnMemoria = useCallback((usuarioActualizado: Usuario) => {
    establecerUsuario(usuarioActualizado);
  }, []);

  const valorDelContexto = useMemo<ValorDelContextoDeSesion>(
    () => ({
      estadoDeLaSesion,
      usuario,
      entrar,
      salir,
      refrescarUsuario,
      reemplazarUsuarioEnMemoria,
    }),
    [
      estadoDeLaSesion,
      usuario,
      entrar,
      salir,
      refrescarUsuario,
      reemplazarUsuarioEnMemoria,
    ],
  );

  return (
    <ContextoDeSesion.Provider value={valorDelContexto}>
      {children}
    </ContextoDeSesion.Provider>
  );
}

/** Acceso a la sesión desde cualquier componente. */
export function useSesion(): ValorDelContextoDeSesion {
  const contexto = useContext(ContextoDeSesion);

  if (contexto === null) {
    throw new Error("useSesion debe usarse dentro de <ProveedorSesion>.");
  }

  return contexto;
}

/**
 * Igual que useSesion, pero garantiza que hay usuario. Se usa dentro de
 * las pantallas protegidas, donde llegar sin sesión es imposible, y
 * evita tener que comprobar `usuario !== null` en cada línea.
 */
export function useUsuarioAutenticado(): Usuario {
  const { usuario } = useSesion();

  if (usuario === null) {
    throw new Error(
      "useUsuarioAutenticado se usó fuera de una pantalla protegida.",
    );
  }

  return usuario;
}
