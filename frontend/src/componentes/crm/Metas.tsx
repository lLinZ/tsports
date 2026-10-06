/**
 * componentes/crm/Metas.tsx
 * ---------------------------------------------------------------------
 * Las metas de venta del año, en el resumen:
 *
 *   · `MiMetaDelAnio` — la de quien mira, con su barra. Es lo primero
 *     que ve un agente debajo de sus cifras.
 *   · `MetasDelEquipo` — la de cada persona, para quien reparte el
 *     trabajo, con el lápiz para ponerla o cambiarla.
 *
 * El avance se mide contra el OVP de las marcas de cada persona (lo
 * decidió LinZ el 2026-10-05) y el porcentaje llega hecho del servidor
 * (App\Support\AvanceDeLasMetas): aquí no se divide nada. La barra se
 * corta al 100 %, pero el número no: una meta superada dice cuánto.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  NumberInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
} from "@heroui/react";
import { Pencil, Target, Trophy } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { guardarMeta } from "@/api/metas";
import { TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import {
  formatearDinero,
  formatearDineroAbreviado,
  formatearPorcentaje,
} from "@/utilidades/formato";
import type { MetaDeUnaPersona, MetasDelEquipo as MetasDelEquipoDelPanel } from "@/tipos/modelos";

/** El color de la barra: verde al llegar, acento mientras tanto. */
function colorDeLaBarra(porcentaje: number | null): "success" | "primary" | "default" {
  if (porcentaje === null) return "default";

  return porcentaje >= 100 ? "success" : "primary";
}

/* ==================================================================== */
/* La mía                                                               */
/* ==================================================================== */

export function MiMetaDelAnio({ meta, anio }: { meta: MetaDeUnaPersona | null; anio: number }) {
  return (
    <TarjetaBento
      columnas={12}
      descripcion="Cuenta lo que pronosticas vender (OVP) en tus marcas. Sube en cuanto anotas un pronóstico en una ficha."
      icono={<Target className="size-4" />}
      titulo={`Mi meta ${anio}`}
    >
      {meta === null || meta.metaUsd === null ? (
        <p className="text-sm text-default-500">
          Todavía no tienes meta para {anio}. La pone quien reparte el trabajo.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-default-600">
              <span className="text-2xl font-bold text-foreground">{formatearDineroAbreviado(meta.ovpUsd)}</span>{" "}
              de {formatearDineroAbreviado(meta.metaUsd)}
            </p>

            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {(meta.porcentaje ?? 0) >= 100 && <Trophy className="size-4 text-success" />}
              <span className={(meta.porcentaje ?? 0) >= 100 ? "text-success" : "text-primary"}>
                {formatearPorcentaje(meta.porcentaje)}
              </span>
            </p>
          </div>

          <Progress
            aria-label={`Avance de la meta de ${anio}`}
            color={colorDeLaBarra(meta.porcentaje)}
            radius="full"
            size="md"
            value={Math.min(meta.porcentaje ?? 0, 100)}
          />

          {meta.fijadaPorNombre && (
            <p className="text-[11px] text-default-400">Meta puesta por {meta.fijadaPorNombre}.</p>
          )}
        </div>
      )}
    </TarjetaBento>
  );
}

/* ==================================================================== */
/* Las del equipo                                                       */
/* ==================================================================== */

export function MetasDelEquipo({
  metas,
  puedeFijarlas,
}: {
  metas: MetasDelEquipoDelPanel;
  puedeFijarlas: boolean;
}) {
  return (
    <TarjetaBento
      ayuda={
        <>
          <p>La meta es un monto por persona y año. La ponen quienes reparten el trabajo.</p>
          <p>
            El avance es lo que esa persona pronostica vender (OVP) en las marcas que lleva: sube en cuanto se anota un
            pronóstico en el checklist de una ficha. Sin meta puesta no hay porcentaje.
          </p>
        </>
      }
      columnas={12}
      descripcion={`Lo que pronostica cada persona (OVP de sus marcas) sobre su meta de ${metas.anio}.`}
      icono={<Target className="size-4" />}
      titulo={`Metas ${metas.anio}`}
    >
      {metas.personas.length === 0 ? (
        <p className="text-sm text-default-500">Todavía no hay nadie en el equipo que lleve marcas.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {metas.personas.map((persona) => (
            <FilaDeMeta
              key={persona.personaId}
              anio={metas.anio}
              persona={persona}
              puedeFijarla={puedeFijarlas}
            />
          ))}
        </ul>
      )}
    </TarjetaBento>
  );
}

function FilaDeMeta({
  persona,
  anio,
  puedeFijarla,
}: {
  persona: MetaDeUnaPersona;
  anio: number;
  puedeFijarla: boolean;
}) {
  const tieneMeta = persona.metaUsd !== null;

  return (
    <li className="rounded-xl bg-default-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{persona.nombre}</p>
          <p className="text-[10px] text-default-400">{persona.rolEtiqueta}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={[
              "text-xs font-bold",
              !tieneMeta ? "text-default-400" : (persona.porcentaje ?? 0) >= 100 ? "text-success" : "text-primary",
            ].join(" ")}
          >
            {tieneMeta ? formatearPorcentaje(persona.porcentaje) : "Sin meta"}
          </span>

          {puedeFijarla && <EditorDeMeta anio={anio} persona={persona} />}
        </div>
      </div>

      <Progress
        aria-label={`Avance de la meta de ${persona.nombre}`}
        className="mt-1.5"
        color={colorDeLaBarra(persona.porcentaje)}
        radius="full"
        size="sm"
        value={tieneMeta ? Math.min(persona.porcentaje ?? 0, 100) : 0}
      />

      <p className="mt-1 text-[10px] text-default-500">
        OVP {formatearDineroAbreviado(persona.ovpUsd)}
        {tieneMeta && ` de ${formatearDineroAbreviado(persona.metaUsd)}`}
      </p>
    </li>
  );
}

/** El lápiz: poner, cambiar o quitar la meta del año de una persona. */
function EditorDeMeta({ persona, anio }: { persona: MetaDeUnaPersona; anio: number }) {
  const clienteDeConsultas = useQueryClient();
  const [estaAbierto, establecerAbierto] = useState(false);
  const [monto, establecerMonto] = useState<number>(persona.metaUsd ?? 0);

  const guardar = useMutation({
    mutationFn: (montoUsd: number | null) => guardarMeta(persona.personaId, anio, montoUsd),
    onSuccess: (_resultado, montoUsd) => {
      void clienteDeConsultas.invalidateQueries({ queryKey: ["panel"] });
      establecerAbierto(false);
      avisarDeExito(
        montoUsd === null
          ? `Meta de ${persona.nombre} quitada`
          : `Meta de ${persona.nombre}: ${formatearDinero(montoUsd)}`,
      );
    },
    onError: (error) => avisarDeError(error, "No se pudo guardar la meta"),
  });

  return (
    <Popover
      isOpen={estaAbierto}
      placement="bottom-end"
      onOpenChange={(abierto) => {
        if (abierto) establecerMonto(persona.metaUsd ?? 0);
        establecerAbierto(abierto);
      }}
    >
      <PopoverTrigger>
        <Button
          isIconOnly
          aria-label={`Cambiar la meta de ${persona.nombre}`}
          className="size-7 min-w-7"
          radius="full"
          size="sm"
          variant="light"
        >
          <Pencil className="size-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0">
        <form
          className="w-full space-y-3 p-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            guardar.mutate(monto);
          }}
        >
          <p className="text-sm font-semibold text-foreground">
            Meta de {persona.nombre} para {anio}
          </p>

          <NumberInput
            aria-label="Meta en dólares"
            minValue={1}
            radius="lg"
            size="sm"
            startContent={<span className="text-xs text-default-400">$</span>}
            step={1000}
            value={monto}
            variant="bordered"
            onValueChange={establecerMonto}
          />

          <div className="flex justify-between gap-2">
            {persona.metaUsd !== null ? (
              <Button
                color="danger"
                isDisabled={guardar.isPending}
                radius="lg"
                size="sm"
                variant="light"
                onPress={() => guardar.mutate(null)}
              >
                Quitar
              </Button>
            ) : (
              <span />
            )}

            <Button
              color="primary"
              isDisabled={!(monto > 0)}
              isLoading={guardar.isPending}
              radius="lg"
              size="sm"
              type="submit"
            >
              Guardar
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
