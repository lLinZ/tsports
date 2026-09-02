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
  leerTokenGuardado,
  registrarManejadorDeSesionCaducada,
} from "@/api/clienteHttp";
import { useTema } from "@/providers/ProveedorTema";
import type { Usuario } from "@/tipos/modelos";

/** Los tres estados posibles del arranque. */
type EstadoDeLaSesion = "comprobando" | "conSesion" | "sinSesion";

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

  const [estadoDeLaSesion, establecerEstado] = useState<EstadoDeLaSesion>(
    // Si no hay token no hay nada que comprobar: se va directo al login
    // y se ahorra una petición.
    () => (leerTokenGuardado() === null ? "sinSesion" : "comprobando"),
  );

  const [usuario, establecerUsuario] = useState<Usuario | null>(null);

  /**
   * Guarda al usuario y sincroniza su apariencia. Todo lo que establece
   * un usuario pasa por aquí, para no olvidarse nunca del tema.
   */
  const adoptarUsuario = useCallback(
    (usuarioRecibido: Usuario) => {
      establecerUsuario(usuarioRecibido);
      establecerEstado("conSesion");

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
      .catch(() => {
        // El token ya no vale (caducado, revocado o cuenta desactivada).
        borrarToken();

        if (elComponenteSigueMontado) {
          establecerUsuario(null);
          establecerEstado("sinSesion");
        }
      });

    return () => {
      elComponenteSigueMontado = false;
    };
  }, [adoptarUsuario]);

  /* ---------------------------------------------------------------- */
  /* Reacción a un 401 en cualquier petición                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    // El cliente HTTP avisa por aquí cuando el servidor rechaza el
    // token, sea en la petición que sea. Así una sesión caducada a mitad
    // de la jornada lleva al login en lugar de dejar la pantalla
    // llenándose de errores.
    registrarManejadorDeSesionCaducada(() => {
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
    await cerrarSesionEnLaApi();

    establecerUsuario(null);
    establecerEstado("sinSesion");
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
