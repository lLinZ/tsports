/**
 * hooks/useEstadoDeRed.ts
 * ---------------------------------------------------------------------
 * ¿Hay conexión a internet ahora mismo?
 *
 * Lo usan el indicador de la barra superior —para decir que lo que se ve
 * es la copia guardada— y nada más. El corte de las escrituras se hace
 * en `api/clienteHttp.ts`, que es por donde pasan todas: si cada
 * pantalla comprobase la red por su cuenta, tarde o temprano una se
 * olvidaría.
 *
 * QUÉ SIGNIFICA DE VERDAD `navigator.onLine`
 *
 * Solo una de las dos respuestas es fiable. `false` quiere decir que el
 * sistema operativo sabe que no hay ninguna red: eso es cierto. `true`
 * quiere decir que hay una tarjeta conectada a algo, y eso incluye el
 * wifi del hotel que pide contraseña en una página y el móvil con datos
 * agotados. Por eso aquí solo se actúa sobre el `false`: se avisa de que
 * no hay red, pero no se promete que haya.
 * ---------------------------------------------------------------------
 */
import { useEffect, useState } from "react";

export function useEstadoDeRed(): { estaSinConexion: boolean } {
  const [estaSinConexion, establecerEstaSinConexion] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    const alPerderla = () => establecerEstaSinConexion(true);
    const alRecuperarla = () => establecerEstaSinConexion(false);

    window.addEventListener("offline", alPerderla);
    window.addEventListener("online", alRecuperarla);

    // Por si cambió entre el primer renderizado y este efecto, que es
    // justo lo que pasa al despertar un portátil con la tapa cerrada.
    establecerEstaSinConexion(navigator.onLine === false);

    return () => {
      window.removeEventListener("offline", alPerderla);
      window.removeEventListener("online", alRecuperarla);
    };
  }, []);

  return { estaSinConexion };
}
