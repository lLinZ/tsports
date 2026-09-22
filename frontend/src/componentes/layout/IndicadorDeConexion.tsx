/**
 * componentes/layout/IndicadorDeConexion.tsx
 * ---------------------------------------------------------------------
 * El estado de la conexión, en la barra superior del panel.
 *
 * Hay DOS conexiones distintas y aquí se enseña una sola cosa, porque a
 * quien trabaja le da igual la diferencia y dos avisos a la vez no se
 * leen:
 *
 *   1. LA RED. Sin ella, el panel sigue abriéndose y se puede consultar
 *      —los datos están guardados en el dispositivo— pero no guardar
 *      nada. Es lo primero que hay que decir, y hay que decir además de
 *      cuándo son los datos: un tablero de ayer que no avisa de que es
 *      de ayer se toma por el de hoy.
 *
 *   2. EL TIEMPO REAL. Si el demonio de Reverb se cae con la red bien,
 *      el panel funciona entero pero los avisos dejan de llegar solos.
 *      Sin este indicador, nadie se enteraría: parecería simplemente
 *      que no ha pasado nada.
 *
 * Lo que se ve es asimétrico a propósito:
 *   · todo bien        → un punto verde discreto, explicado al pasar.
 *   · sin red          → etiqueta de aviso, que sí se ve.
 *   · sin tiempo real  → etiqueta de aviso, solo si el corte dura.
 *   · conectando       → nada.
 *
 * Un corte breve de Reverb (cambiar de wifi, despertar el portátil) se
 * recupera solo en un par de segundos; por eso esa etiqueta espera. La
 * de la red NO espera: quien acaba de quedarse sin cobertura necesita
 * saberlo antes de escribir un comentario que no se va a guardar.
 *
 * Las tres formas llevan `tabIndex`, y no es de adorno: lo que explica
 * qué hacer está en el mensaje que sale al pasar por encima, y sin foco
 * no habría manera de leerlo sin ratón.
 * ---------------------------------------------------------------------
 */
import { Chip, Tooltip } from "@heroui/react";
import { CloudOff, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useEstadoDeRed } from "@/hooks/useEstadoDeRed";
import { useFechaDeLosDatos } from "@/providers/ProveedorDatosGuardados";
import { useTiempoReal } from "@/providers/ProveedorTiempoReal";
import { formatearTiempoRelativo } from "@/utilidades/formato";

/** Cuánto tiene que durar un corte del tiempo real para enseñarlo. */
const ESPERA_ANTES_DE_ENSENAR_EL_CORTE_MS = 5000;

export function IndicadorDeConexion() {
  const { estadoDeLaConexion } = useTiempoReal();
  const { estaSinConexion } = useEstadoDeRed();
  const fechaDeLosDatos = useFechaDeLosDatos();

  const [elCorteSeAlarga, establecerElCorteSeAlarga] = useState(false);

  useEffect(() => {
    if (estadoDeLaConexion !== "sinConexion") {
      return;
    }

    const temporizador = window.setTimeout(
      () => establecerElCorteSeAlarga(true),
      ESPERA_ANTES_DE_ENSENAR_EL_CORTE_MS,
    );

    return () => {
      window.clearTimeout(temporizador);
      establecerElCorteSeAlarga(false);
    };
  }, [estadoDeLaConexion]);

  /* ---------------------------------------------------------------- */
  /* 1. Sin red: manda sobre todo lo demás                            */
  /* ---------------------------------------------------------------- */

  if (estaSinConexion) {
    return (
      <Tooltip
        content={
          <span className="max-w-64 text-tiny">
            Puedes consultar, pero no guardar nada hasta que vuelva.
            {fechaDeLosDatos !== null && (
              <>
                {" "}
                Lo que ves se trajo{" "}
                {formatearTiempoRelativo(new Date(fechaDeLosDatos).toISOString())}.
              </>
            )}
          </span>
        }
        placement="bottom"
      >
        <Chip
          aria-label="Sin conexión a internet"
          color="warning"
          radius="full"
          role="status"
          size="sm"
          startContent={<CloudOff className="size-3.5" />}
          tabIndex={0}
          variant="flat"
        >
          <span className="hidden sm:inline">Sin conexión</span>
        </Chip>
      </Tooltip>
    );
  }

  /* ---------------------------------------------------------------- */
  /* 2. Con red: el estado del tiempo real                            */
  /* ---------------------------------------------------------------- */

  if (estadoDeLaConexion === "enVivo") {
    return (
      <Tooltip content="En vivo: los avisos llegan al momento" placement="bottom">
        <span
          aria-label="Conexión en vivo"
          className="flex size-8 items-center justify-center rounded-full"
          role="status"
          tabIndex={0}
        >
          <span className="size-2 rounded-full bg-success" />
        </span>
      </Tooltip>
    );
  }

  if (estadoDeLaConexion === "sinConexion" && elCorteSeAlarga) {
    return (
      <Tooltip
        content="Los avisos no llegarán hasta que vuelva. Se reintenta solo: no hace falta recargar."
        placement="bottom"
      >
        <Chip
          aria-label="Sin conexión en vivo"
          color="warning"
          radius="full"
          role="status"
          size="sm"
          startContent={<WifiOff className="size-3.5" />}
          tabIndex={0}
          variant="flat"
        >
          <span className="hidden sm:inline">Sin conexión en vivo</span>
        </Chip>
      </Tooltip>
    );
  }

  return null;
}
