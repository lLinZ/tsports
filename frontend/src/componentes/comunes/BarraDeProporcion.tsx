/**
 * componentes/comunes/BarraDeProporcion.tsx
 * ---------------------------------------------------------------------
 * La barra que enseña qué parte de una propiedad se está pronosticando
 * vender. Es la pieza visual que pidió el cliente para los productos IOP:
 *
 *   Propiedad con un monto total (MTP) de 7.400 y un pronóstico (OVP) de
 *   500 → la barra se llena un 6,8 % y se lee "500 de 7.400".
 *
 * Sobre la barra se dibuja además una marca fina en la META (el
 * porcentaje acordado sobre el MTP, un 20 % de partida). Sin esa marca,
 * un 6,8 % no dice si va bien o mal; con ella se ve de un vistazo cuánto
 * falta para el objetivo.
 *
 * El color cambia solo, y no por decoración:
 *   · por debajo de la meta → color de acento del perfil (en marcha),
 *   · alcanzada la meta     → verde (objetivo cubierto),
 *   · por encima del total  → ámbar (hay más pronosticado que valor
 *     tiene la propiedad, algo que revisar).
 *
 * Se usa en el checklist de la ficha, en la tarjeta del tablero y en el
 * informe de propiedades del resumen: los tres sitios enseñan la misma
 * proporción calculada de la misma manera.
 * ---------------------------------------------------------------------
 */
import { Tooltip } from "@heroui/react";
import { formatearDineroAbreviado, formatearPorcentaje } from "@/utilidades/formato";

interface PropiedadesDeBarraDeProporcion {
  /** MTP: el valor total de la propiedad, o sea el 100 % de la barra. */
  montoTotal: number;
  /** OVP: lo que se pronostica vender dentro de ella. */
  montoPronosticado: number;
  /** Meta de venta (el % acordado del MTP). Sin ella no se dibuja marca. */
  montoDeLaMeta?: number;

  /** Enseña la línea de texto con los importes bajo la barra. */
  conDetalle?: boolean;
  /** Versión estrecha, para dentro de una tarjeta del tablero. */
  compacta?: boolean;
}

export function BarraDeProporcion({
  montoTotal,
  montoPronosticado,
  montoDeLaMeta,
  conDetalle = true,
  compacta = false,
}: PropiedadesDeBarraDeProporcion) {
  // Con el monto total todavía sin cargar no hay proporción posible: se
  // enseña la barra vacía en vez de dividir entre cero.
  const hayMontoTotal = montoTotal > 0;

  const porcentajePronosticado = hayMontoTotal
    ? (montoPronosticado / montoTotal) * 100
    : 0;

  const porcentajeDeLaMeta =
    hayMontoTotal && montoDeLaMeta !== undefined && montoDeLaMeta > 0
      ? (montoDeLaMeta / montoTotal) * 100
      : null;

  const seHaPasadoDelTotal = porcentajePronosticado > 100;
  const haAlcanzadoLaMeta =
    porcentajeDeLaMeta !== null && porcentajePronosticado >= porcentajeDeLaMeta;

  const colorDeLaBarra = seHaPasadoDelTotal
    ? "bg-warning"
    : haAlcanzadoLaMeta
      ? "bg-success"
      : "bg-primary";

  return (
    <div className="flex flex-col gap-1">
      <div
        aria-label={`Pronóstico: ${formatearPorcentaje(porcentajePronosticado)} del valor de la propiedad`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(porcentajePronosticado)}
        className={[
          "relative w-full overflow-hidden rounded-full bg-default-100",
          compacta ? "h-1.5" : "h-2.5",
        ].join(" ")}
        role="progressbar"
      >
        <div
          className={[
            "h-full rounded-full transition-all duration-500",
            colorDeLaBarra,
          ].join(" ")}
          style={{
            // Un mínimo visible para que un pronóstico pequeño se note:
            // el 0,5 % de una propiedad grande es una raya invisible.
            width: montoPronosticado > 0
              ? `${Math.max(2, Math.min(100, porcentajePronosticado))}%`
              : "0%",
          }}
        />

        {/* La marca de la meta, por encima del relleno. */}
        {porcentajeDeLaMeta !== null && porcentajeDeLaMeta <= 100 && (
          <Tooltip
            content={`Meta: ${formatearDineroAbreviado(montoDeLaMeta ?? 0)}`}
            placement="top"
          >
            <span
              className="absolute inset-y-0 w-0.5 bg-foreground/45"
              style={{ left: `${porcentajeDeLaMeta}%` }}
            />
          </Tooltip>
        )}
      </div>

      {conDetalle && (
        <div className="flex items-baseline justify-between gap-2 text-[11px]">
          <span className="text-default-500">
            {hayMontoTotal ? (
              <>
                <strong className="text-foreground">
                  {formatearDineroAbreviado(montoPronosticado)}
                </strong>{" "}
                de {formatearDineroAbreviado(montoTotal)}
              </>
            ) : (
              "Esta propiedad todavía no tiene monto total cargado"
            )}
          </span>

          {hayMontoTotal && (
            <span
              className={[
                "shrink-0 font-semibold tabular-nums",
                seHaPasadoDelTotal
                  ? "text-warning"
                  : haAlcanzadoLaMeta
                    ? "text-success"
                    : "text-primary",
              ].join(" ")}
            >
              {formatearPorcentaje(porcentajePronosticado)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
