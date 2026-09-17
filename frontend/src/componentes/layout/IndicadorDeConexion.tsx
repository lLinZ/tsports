/**
 * componentes/layout/IndicadorDeConexion.tsx
 * ---------------------------------------------------------------------
 * El estado de la conexión en vivo, en la barra superior del panel.
 *
 * Existe sobre todo por el caso malo: si el demonio de Reverb se cae, el
 * panel sigue funcionando y nada avisa de que los avisos han dejado de
 * llegar. Sin este indicador, la gente daría por hecho que no pasa nada
 * cuando lo que pasa es que no se entera.
 *
 * Por eso lo que se ve es asimétrico:
 *   · en vivo         → un punto verde discreto, explicado al pasar.
 *   · sin conexión    → una etiqueta de aviso, que sí se ve.
 *   · conectando, o sin tiempo real en el servidor → nada.
 *
 * Un corte breve (cambiar de wifi, despertar el portátil) se recupera
 * solo en un par de segundos. Para no hacer parpadear un aviso por eso,
 * la etiqueta solo aparece si el corte dura.
 * ---------------------------------------------------------------------
 */
import { Chip, Tooltip } from "@heroui/react";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTiempoReal } from "@/providers/ProveedorTiempoReal";

/** Cuánto tiene que durar un corte para enseñarlo. */
const ESPERA_ANTES_DE_ENSENAR_EL_CORTE_MS = 5000;

export function IndicadorDeConexion() {
  const { estadoDeLaConexion } = useTiempoReal();
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
          variant="flat"
        >
          <span className="hidden sm:inline">Sin conexión en vivo</span>
        </Chip>
      </Tooltip>
    );
  }

  return null;
}
