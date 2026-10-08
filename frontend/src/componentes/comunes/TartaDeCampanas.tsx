/**
 * componentes/comunes/TartaDeCampanas.tsx
 * ---------------------------------------------------------------------
 * Una tarta pequeña con el reparto de las acciones de campaña de un
 * tramo (en la pantalla de Sectores, un rubro en una semana). Cada
 * porción es una campaña con su color, el mismo del calendario.
 *
 * Las porciones van un poco separadas del centro, como en el boceto que
 * mandó LinZ: con tres o cuatro colores juntos y a este tamaño, sin
 * separación las porciones pequeñas se pierden.
 *
 * Pulsarla abre el desglose con nombres y cifras. Es un Popover y no un
 * Tooltip, para que funcione con el dedo (ver 4.8 del CLAUDE.md).
 * ---------------------------------------------------------------------
 */
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/react";
import type { PorcionDeCampana } from "@/tipos/modelos";
import { formatearNumero } from "@/utilidades/formato";

/** Lo que se aparta cada porción del centro, en unidades del dibujo. */
const SEPARACION = 1.6;
const RADIO = 18;
const CENTRO = 20;

export function TartaDeCampanas({
  porciones,
  titulo,
  subtitulo,
}: {
  porciones: PorcionDeCampana[];
  /** "Alimentos · Semana 2", para el desglose y para el lector de pantalla. */
  titulo: string;
  /** El tramo de días, debajo del título. */
  subtitulo: string;
}) {
  const total = porciones.reduce((suma, porcion) => suma + porcion.total, 0);

  if (total === 0) return null;

  const descripcion = `${titulo}: ${porciones
    .map((porcion) => `${porcion.etiqueta} ${porcion.total}`)
    .join(", ")}`;

  return (
    <Popover placement="bottom" radius="lg">
      <PopoverTrigger>
        <button
          aria-label={descripcion}
          className="rounded-full transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-primary"
          type="button"
        >
          <svg aria-hidden className="size-10" viewBox="0 0 40 40">
            {porciones.length === 1 ? (
              <circle
                cx={CENTRO}
                cy={CENTRO}
                fill={porciones[0].color}
                r={RADIO}
              />
            ) : (
              <Porciones porciones={porciones} total={total} />
            )}
          </svg>
        </button>
      </PopoverTrigger>

      <PopoverContent className="min-w-48 px-4 py-3">
        <div className="w-full space-y-2 text-xs">
          <div>
            <p className="font-semibold text-foreground">{titulo}</p>
            <p className="text-default-400">{subtitulo}</p>
          </div>

          <ul className="space-y-1">
            {porciones.map((porcion) => (
              <li key={porcion.etiqueta} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: porcion.color }}
                />
                <span className="flex-1 truncate text-default-600">
                  {porcion.etiqueta}
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatearNumero(porcion.total)}
                </span>
              </li>
            ))}
          </ul>

          <p className="border-t border-default-100 pt-2 text-default-500">
            {formatearNumero(total)} {total === 1 ? "acción" : "acciones"} de
            campaña
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Las porciones, empezando arriba y en el sentido del reloj. */
function Porciones({
  porciones,
  total,
}: {
  porciones: PorcionDeCampana[];
  total: number;
}) {
  let anguloDeInicio = -Math.PI / 2;

  return (
    <>
      {porciones.map((porcion) => {
        const angulo = (porcion.total / total) * Math.PI * 2;
        const anguloDeFin = anguloDeInicio + angulo;
        const anguloMedio = anguloDeInicio + angulo / 2;

        const punto = (anguloEnRadianes: number) =>
          `${CENTRO + RADIO * Math.cos(anguloEnRadianes)} ${CENTRO + RADIO * Math.sin(anguloEnRadianes)}`;

        const trazo = [
          `M ${CENTRO} ${CENTRO}`,
          `L ${punto(anguloDeInicio)}`,
          `A ${RADIO} ${RADIO} 0 ${angulo > Math.PI ? 1 : 0} 1 ${punto(anguloDeFin)}`,
          "Z",
        ].join(" ");

        anguloDeInicio = anguloDeFin;

        return (
          <path
            key={porcion.etiqueta}
            d={trazo}
            fill={porcion.color}
            transform={`translate(${SEPARACION * Math.cos(anguloMedio)} ${SEPARACION * Math.sin(anguloMedio)})`}
          />
        );
      })}
    </>
  );
}
