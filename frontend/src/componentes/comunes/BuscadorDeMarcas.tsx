/**
 * componentes/comunes/BuscadorDeMarcas.tsx
 * ---------------------------------------------------------------------
 * Un cuadro para encontrar y ELEGIR una marca escribiendo su nombre.
 *
 * Lo usan el reporte de bitácora (para acotarlo a unas marcas) y el
 * chat (para etiquetar una marca en un mensaje). Los dos necesitan lo
 * mismo: escribir tres letras, ver el logo y el nombre, pulsar.
 *
 * LA LISTA LA DECIDE EL SERVIDOR (`/api/marcas/sugerencias`): solo trae
 * las marcas que esta persona puede ver. Aquí no se filtra nada por
 * permisos; si se hiciera, un agente seguiría recibiendo la cartera de
 * sus compañeros en la respuesta, solo que sin pintarla.
 *
 * Está hecho a mano sobre un campo de texto y no con el Autocomplete de
 * HeroUI: aquel se queda con el texto de lo elegido en el campo, y aquí,
 * al elegir, el campo tiene que vaciarse para buscar la siguiente.
 * ---------------------------------------------------------------------
 */
import { Input, Spinner } from "@heroui/react";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSugerenciasDeMarcas } from "@/hooks/useMarcas";
import { inicialesDe } from "@/utilidades/formato";
import type { SugerenciaDeMarca } from "@/tipos/modelos";

/** Milisegundos que se espera a que se deje de teclear antes de buscar. */
const RETARDO_DE_BUSQUEDA_MS = 250;

export function BuscadorDeMarcas({
  alElegir,
  idsYaElegidos = [],
  marcadorDePosicion = "Buscar una marca…",
  enfocarAlMontar = false,
  listaSiempreVisible = false,
}: {
  alElegir: (marca: SugerenciaDeMarca) => void;
  /** Se marcan como ya puestas y no se ofrecen otra vez. */
  idsYaElegidos?: string[];
  marcadorDePosicion?: string;
  enfocarAlMontar?: boolean;
  /**
   * Con la lista siempre abierta debajo del campo, en vez de desplegable.
   * Es lo que conviene dentro de una ventanita que ya se abrió para esto
   * (etiquetar en el chat); en una pantalla, mejor desplegable.
   */
  listaSiempreVisible?: boolean;
}) {
  const [texto, establecerTexto] = useState("");
  const [textoBuscado, establecerTextoBuscado] = useState("");
  const [estaAbierta, establecerAbierta] = useState(listaSiempreVisible);
  const [posicionResaltada, establecerPosicionResaltada] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const temporizador = window.setTimeout(
      () => establecerTextoBuscado(texto),
      RETARDO_DE_BUSQUEDA_MS,
    );

    return () => window.clearTimeout(temporizador);
  }, [texto]);

  useEffect(() => {
    if (enfocarAlMontar) {
      campo.current?.focus();
    }
  }, [enfocarAlMontar]);

  const consulta = useSugerenciasDeMarcas(textoBuscado, { habilitado: estaAbierta });
  const sugerencias = (consulta.data ?? []).filter(
    (marca) => !idsYaElegidos.includes(marca.id),
  );

  useEffect(() => {
    establecerPosicionResaltada(0);
  }, [textoBuscado]);

  function elegir(marca: SugerenciaDeMarca) {
    alElegir(marca);
    establecerTexto("");
    campo.current?.focus();
  }

  const lista = (
    <ul
      aria-label="Marcas encontradas"
      className="max-h-64 overflow-y-auto p-1"
      role="listbox"
    >
      {consulta.isLoading ? (
        <li className="flex items-center gap-2 px-3 py-3 text-xs text-default-500">
          <Spinner size="sm" /> Buscando…
        </li>
      ) : sugerencias.length === 0 ? (
        <li className="px-3 py-3 text-xs text-default-500">
          {textoBuscado.trim() === ""
            ? "No hay marcas que puedas elegir."
            : `Ninguna marca que puedas ver se llama «${textoBuscado.trim()}».`}
        </li>
      ) : (
        sugerencias.map((marca, posicion) => (
          <li key={marca.id} aria-selected={posicion === posicionResaltada} role="option">
            <button
              className={[
                "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition",
                posicion === posicionResaltada ? "bg-default-100" : "hover:bg-default-100",
              ].join(" ")}
              type="button"
              // mousedown y no click: con click, el campo pierde el foco
              // antes, la lista se cierra y el clic cae en el vacío.
              onMouseDown={(evento) => {
                evento.preventDefault();
                elegir(marca);
              }}
              onMouseEnter={() => establecerPosicionResaltada(posicion)}
            >
              <LogoPequenoDeMarca marca={marca} />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {marca.nombre}
                </span>
                {(marca.sector || marca.zona) && (
                  <span className="block truncate text-[11px] text-default-400">
                    {[marca.sector, marca.zona].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))
      )}
    </ul>
  );

  return (
    <div className="relative">
      <Input
        ref={campo}
        aria-label={marcadorDePosicion}
        autoComplete="off"
        endContent={consulta.isFetching && !consulta.isLoading ? <Spinner size="sm" /> : null}
        placeholder={marcadorDePosicion}
        radius="lg"
        size="sm"
        startContent={<Search className="size-4 text-default-400" />}
        value={texto}
        variant="bordered"
        onBlur={() => {
          if (!listaSiempreVisible) establecerAbierta(false);
        }}
        onFocus={() => establecerAbierta(true)}
        onKeyDown={(evento) => {
          if (evento.key === "ArrowDown") {
            evento.preventDefault();
            establecerAbierta(true);
            establecerPosicionResaltada((actual) =>
              Math.min(actual + 1, Math.max(sugerencias.length - 1, 0)),
            );
          } else if (evento.key === "ArrowUp") {
            evento.preventDefault();
            establecerPosicionResaltada((actual) => Math.max(actual - 1, 0));
          } else if (evento.key === "Enter") {
            const resaltada = sugerencias[posicionResaltada];

            if (resaltada !== undefined) {
              evento.preventDefault();
              elegir(resaltada);
            }
          } else if (evento.key === "Escape" && !listaSiempreVisible) {
            establecerAbierta(false);
          }
        }}
        onValueChange={(valor) => {
          establecerTexto(valor);
          establecerAbierta(true);
        }}
      />

      {listaSiempreVisible ? (
        <div className="mt-2">{lista}</div>
      ) : (
        estaAbierta && (
          <div className="bento-card absolute inset-x-0 top-full z-50 mt-1 shadow-lg">
            {lista}
          </div>
        )
      )}
    </div>
  );
}

/** El logo de una marca en pequeño, con sus iniciales si no tiene. */
export function LogoPequenoDeMarca({
  marca,
  tamano = "size-8",
}: {
  marca: { nombre: string; logoUrl: string | null };
  tamano?: string;
}) {
  return (
    <span
      className={`flex ${tamano} shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default-100`}
    >
      {marca.logoUrl ? (
        <img alt="" className="size-full object-cover" src={marca.logoUrl} />
      ) : (
        <span className="text-[10px] font-bold text-default-400">
          {inicialesDe(marca.nombre)}
        </span>
      )}
    </span>
  );
}
