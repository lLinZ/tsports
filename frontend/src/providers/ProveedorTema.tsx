/**
 * providers/ProveedorTema.tsx
 * ---------------------------------------------------------------------
 * El tema (claro / oscuro / automático) y el color de acento del perfil.
 *
 * La preferencia se guarda en DOS sitios, y cada uno cumple una función
 * distinta:
 *
 *   · En el SERVIDOR (tabla users) → es lo que hace que el tema sea de
 *     verdad "persistente por usuario": si alguien entra desde otro
 *     ordenador o desde el móvil, se encuentra su sistema tal y como lo
 *     dejó.
 *
 *   · En localStorage → es una copia que permite pintar el tema correcto
 *     ANTES de que React arranque (lo hace el script de index.html). Sin
 *     ella, quien usa el modo oscuro vería un destello blanco en cada
 *     recarga.
 *
 * El guardado en el servidor es optimista: la interfaz cambia al
 * instante y la llamada viaja por detrás. Si falla, no se revierte nada:
 * sería muy desconcertante que el tema volviese solo al anterior, y como
 * mucho se pierde la preferencia al cambiar de dispositivo.
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
import { actualizarApariencia } from "@/api/autenticacion";
import { leerTokenGuardado } from "@/api/clienteHttp";
import {
  COLOR_ACENTO_POR_DEFECTO,
  aplicarColorDeAcento,
} from "@/theme/colorAcento";
import type { PreferenciaDeTema } from "@/tipos/modelos";

/** Claves de localStorage. Deben coincidir con el script de index.html. */
const CLAVE_TEMA = "tsports:tema";
const CLAVE_ACENTO = "tsports:acento";

interface ValorDelContextoDeTema {
  /** Lo que el usuario eligió: claro, oscuro o seguir al sistema. */
  preferenciaDeTema: PreferenciaDeTema;
  /** Lo que se está pintando de hecho, ya resuelto el "automático". */
  estaEnModoOscuro: boolean;
  colorAcento: string;

  cambiarPreferenciaDeTema: (nuevaPreferencia: PreferenciaDeTema) => void;
  cambiarColorAcento: (nuevoColor: string) => void;
  /** Alterna entre claro y oscuro; sale del modo automático. */
  alternarTema: () => void;
  /**
   * Aplica las preferencias que vienen del servidor al iniciar sesión.
   * Lo llama el proveedor de sesión en cuanto conoce al usuario.
   */
  aplicarPreferenciasDelServidor: (
    tema: PreferenciaDeTema,
    colorAcento: string,
  ) => void;
}

const ContextoDeTema = createContext<ValorDelContextoDeTema | null>(null);

/** Lee la preferencia guardada en el navegador. */
function leerPreferenciaGuardada(): PreferenciaDeTema {
  try {
    const valorGuardado = localStorage.getItem(CLAVE_TEMA);

    if (valorGuardado === "claro" || valorGuardado === "oscuro" || valorGuardado === "sistema") {
      return valorGuardado;
    }
  } catch {
    /* Almacenamiento bloqueado: se usa el valor por defecto. */
  }

  return "sistema";
}

function leerColorAcentoGuardado(): string {
  try {
    return localStorage.getItem(CLAVE_ACENTO) || COLOR_ACENTO_POR_DEFECTO;
  } catch {
    return COLOR_ACENTO_POR_DEFECTO;
  }
}

/** ¿El sistema operativo está en modo oscuro ahora mismo? */
function elSistemaPrefiereOscuro(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resuelve la preferencia a un sí/no concreto. */
function resolverSiEsOscuro(preferencia: PreferenciaDeTema): boolean {
  if (preferencia === "oscuro") return true;
  if (preferencia === "claro") return false;

  return elSistemaPrefiereOscuro();
}

export function ProveedorTema({ children }: { children: ReactNode }) {
  const [preferenciaDeTema, establecerPreferenciaEnEstado] =
    useState<PreferenciaDeTema>(leerPreferenciaGuardada);

  const [colorAcento, establecerColorEnEstado] = useState<string>(
    leerColorAcentoGuardado,
  );

  // Se recalcula cuando cambia la preferencia o cuando el sistema
  // operativo cambia de tema estando en modo automático.
  const [estaEnModoOscuro, establecerModoOscuro] = useState<boolean>(() =>
    resolverSiEsOscuro(leerPreferenciaGuardada()),
  );

  /* ---------------------------------------------------------------- */
  /* Aplicación al DOM                                                */
  /* ---------------------------------------------------------------- */

  // La clase "dark" en <html> es lo que activa la variante oscura de
  // Tailwind y el tema oscuro de HeroUI.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", estaEnModoOscuro);
  }, [estaEnModoOscuro]);

  // El color de acento se reaplica también al cambiar de tema, porque la
  // rampa de tonos se invierte entre claro y oscuro.
  useEffect(() => {
    aplicarColorDeAcento(colorAcento, estaEnModoOscuro);
  }, [colorAcento, estaEnModoOscuro]);

  /* ---------------------------------------------------------------- */
  /* Seguimiento del tema del sistema operativo                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    // Solo hace falta escuchar al sistema en modo automático.
    if (preferenciaDeTema !== "sistema") {
      establecerModoOscuro(preferenciaDeTema === "oscuro");

      return;
    }

    const consultaDeMedios = window.matchMedia("(prefers-color-scheme: dark)");

    const alCambiarElSistema = (evento: MediaQueryListEvent) => {
      establecerModoOscuro(evento.matches);
    };

    establecerModoOscuro(consultaDeMedios.matches);
    consultaDeMedios.addEventListener("change", alCambiarElSistema);

    return () => consultaDeMedios.removeEventListener("change", alCambiarElSistema);
  }, [preferenciaDeTema]);

  /* ---------------------------------------------------------------- */
  /* Persistencia                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Guarda en el servidor, pero solo si hay sesión: en la pantalla de
   * login o en la web pública no hay a quién guardárselo.
   */
  const guardarEnElServidorSiHaySesion = useCallback(
    (preferencias: { tema?: PreferenciaDeTema; colorAcento?: string }) => {
      if (leerTokenGuardado() === null) {
        return;
      }

      // Deliberadamente sin await ni manejo de error visible: es una
      // preferencia visual, no debe interrumpir lo que la persona esté
      // haciendo si la red falla un momento.
      void actualizarApariencia(preferencias).catch(() => {
        /* Se conserva al menos la copia local. */
      });
    },
    [],
  );

  const cambiarPreferenciaDeTema = useCallback(
    (nuevaPreferencia: PreferenciaDeTema) => {
      establecerPreferenciaEnEstado(nuevaPreferencia);

      try {
        localStorage.setItem(CLAVE_TEMA, nuevaPreferencia);
      } catch {
        /* Sin almacenamiento, la preferencia dura solo esta sesión. */
      }

      guardarEnElServidorSiHaySesion({ tema: nuevaPreferencia });
    },
    [guardarEnElServidorSiHaySesion],
  );

  const cambiarColorAcento = useCallback(
    (nuevoColor: string) => {
      establecerColorEnEstado(nuevoColor);

      try {
        localStorage.setItem(CLAVE_ACENTO, nuevoColor);
      } catch {
        /* Igual que arriba. */
      }

      guardarEnElServidorSiHaySesion({ colorAcento: nuevoColor });
    },
    [guardarEnElServidorSiHaySesion],
  );

  /** Botón de un solo toque: claro ↔ oscuro, saliendo del automático. */
  const alternarTema = useCallback(() => {
    cambiarPreferenciaDeTema(estaEnModoOscuro ? "claro" : "oscuro");
  }, [cambiarPreferenciaDeTema, estaEnModoOscuro]);

  /**
   * Sincroniza con lo que dice el servidor al iniciar sesión.
   *
   * No vuelve a guardar en el servidor (sería un viaje redundante), pero
   * sí actualiza la copia local para que el próximo arranque pinte bien
   * el tema desde el primer fotograma.
   */
  const aplicarPreferenciasDelServidor = useCallback(
    (temaDelServidor: PreferenciaDeTema, colorDelServidor: string) => {
      establecerPreferenciaEnEstado(temaDelServidor);
      establecerColorEnEstado(colorDelServidor);

      try {
        localStorage.setItem(CLAVE_TEMA, temaDelServidor);
        localStorage.setItem(CLAVE_ACENTO, colorDelServidor);
      } catch {
        /* Nada crítico. */
      }
    },
    [],
  );

  const valorDelContexto = useMemo<ValorDelContextoDeTema>(
    () => ({
      preferenciaDeTema,
      estaEnModoOscuro,
      colorAcento,
      cambiarPreferenciaDeTema,
      cambiarColorAcento,
      alternarTema,
      aplicarPreferenciasDelServidor,
    }),
    [
      preferenciaDeTema,
      estaEnModoOscuro,
      colorAcento,
      cambiarPreferenciaDeTema,
      cambiarColorAcento,
      alternarTema,
      aplicarPreferenciasDelServidor,
    ],
  );

  return (
    <ContextoDeTema.Provider value={valorDelContexto}>
      {children}
    </ContextoDeTema.Provider>
  );
}

/** Acceso al tema desde cualquier componente. */
export function useTema(): ValorDelContextoDeTema {
  const contexto = useContext(ContextoDeTema);

  if (contexto === null) {
    throw new Error("useTema debe usarse dentro de <ProveedorTema>.");
  }

  return contexto;
}
