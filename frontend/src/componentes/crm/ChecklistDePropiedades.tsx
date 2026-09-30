/**
 * componentes/crm/ChecklistDePropiedades.tsx
 * ---------------------------------------------------------------------
 * El checklist de la prospección: qué productos IOP se le están
 * ofreciendo a una marca y cuánto se pronostica venderle de cada uno.
 *
 * CÓMO SE LEE CADA LÍNEA
 *   · A la izquierda, la casilla y el nombre de la propiedad.
 *   · A la derecha, su monto total (MTP) y la meta acordada.
 *   · Al marcarla se abre el campo del pronóstico (OVP) y, debajo, la
 *     barra con la proporción: de los 7.400 que vale la propiedad se
 *     estiman vender 500 → 6,8 %.
 *
 * QUÉ NO HACE, Y POR QUÉ
 * Marcar propiedades NO completa la fase de prospección. Esa fase se
 * sigue calculando sola con los cinco datos de la ficha (nombre, logo,
 * contacto, cargo y correo), exactamente igual que antes. El checklist
 * es el trabajo que se hace DENTRO de la prospección, no su semáforo:
 * mezclarlos haría que el indicador dejara de significar lo que el
 * equipo cree que significa.
 *
 * Una propiedad que no está asignada a quien edita se enseña igualmente,
 * pero apagada: sirve para saber que existe sin poder colocarla en una
 * ficha que no le toca. El servidor rechaza el intento de todos modos.
 *
 * EL MATERIAL DE VENTA SE ABRE AQUÍ. Es el momento en que hace falta: el
 * vendedor está delante del cliente, le añade la propiedad y le enseña
 * el recinto sin cambiar de pantalla. Cada línea con material lleva su
 * botón, y al marcarla aparecen además las primeras fotos.
 * ---------------------------------------------------------------------
 */
import { Checkbox, Chip, NumberInput, Tooltip } from "@heroui/react";
import { Images, Lock, Package } from "lucide-react";
import { useMemo, useState } from "react";
import { BarraDeProporcion } from "@/componentes/comunes/BarraDeProporcion";
import { VisorDeGaleria } from "@/componentes/comunes/VisorDeGaleria";
import { usePropiedadesOfrecibles } from "@/hooks/usePropiedades";
import {
  formatearDinero,
  formatearDineroAbreviado,
  formatearPorcentaje,
  inicialesDe,
} from "@/utilidades/formato";
import { elementosDeUnaGaleria } from "@/utilidades/galeria";
import type {
  ArchivoDeGaleria,
  LineaDeChecklistDePropiedad,
  LineaDeChecklistParaGuardar,
  Propiedad,
} from "@/tipos/modelos";

/** Cuántas fotos asoman bajo una propiedad marcada antes del «+N». */
const FOTOS_QUE_ASOMAN = 4;

/**
 * Una propiedad lista para pintar: mezcla del catálogo con lo que la
 * marca ya tenía guardado. Hace falta porque una propiedad que se
 * desactivó después de ofrecerse ya no está en el catálogo activo, y aun
 * así tiene que seguir viéndose en la ficha donde se ofreció.
 */
interface PropiedadDelChecklist {
  id: string;
  nombre: string;
  logoUrl: string | null;
  montoTotalUsd: number;
  porcentajeForecast: number;
  forecastDeVentaUsd: number;
  laPuedoOfrecer: boolean;
  estaRetirada: boolean;
  /** Sus fotos y documentos. Vacía en las retiradas: ya no están en el catálogo. */
  galeria: ArchivoDeGaleria[];
}

interface PropiedadesDelChecklist {
  /** Las líneas marcadas ahora mismo en el formulario. */
  lineas: LineaDeChecklistParaGuardar[];
  alCambiar: (lineasNuevas: LineaDeChecklistParaGuardar[]) => void;

  /** Lo que la marca tenía guardado, para no perder de vista lo retirado. */
  lineasGuardadas?: LineaDeChecklistDePropiedad[];

  esEditable: boolean;
}

export function ChecklistDePropiedades({
  lineas,
  alCambiar,
  lineasGuardadas = [],
  esEditable,
}: PropiedadesDelChecklist) {
  const { propiedades: propiedadesDelCatalogo, estaCargando } =
    usePropiedadesOfrecibles();

  /**
   * El catálogo activo más las propiedades retiradas que esta marca ya
   * llevaba. Se recalcula solo cuando cambia alguna de las dos listas.
   */
  const propiedadesAMostrar = useMemo<PropiedadDelChecklist[]>(() => {
    const desdeElCatalogo = propiedadesDelCatalogo.map(
      (propiedad: Propiedad): PropiedadDelChecklist => ({
        id: propiedad.id,
        nombre: propiedad.nombre,
        logoUrl: propiedad.logoUrl,
        montoTotalUsd: propiedad.montoTotalUsd,
        porcentajeForecast: propiedad.porcentajeForecast,
        forecastDeVentaUsd: propiedad.forecastDeVentaUsd,
        laPuedoOfrecer: propiedad.laPuedoOfrecer,
        estaRetirada: false,
        galeria: propiedad.galeria ?? [],
      }),
    );

    const idsDelCatalogo = new Set(desdeElCatalogo.map((propiedad) => propiedad.id));

    const retiradasQueSiguenEnLaFicha = lineasGuardadas
      .filter((linea) => !idsDelCatalogo.has(linea.propiedadId))
      .map(
        (linea): PropiedadDelChecklist => ({
          id: linea.propiedadId,
          nombre: linea.propiedadNombre,
          logoUrl: linea.propiedadLogoUrl,
          montoTotalUsd: linea.montoTotalUsd,
          porcentajeForecast: linea.porcentajeForecast,
          forecastDeVentaUsd: linea.forecastDeVentaUsd,
          // Se puede desmarcar, pero no volver a añadir una vez fuera.
          laPuedoOfrecer: true,
          estaRetirada: true,
          galeria: [],
        }),
      );

    return [...desdeElCatalogo, ...retiradasQueSiguenEnLaFicha];
  }, [propiedadesDelCatalogo, lineasGuardadas]);

  /** Acceso rápido a la línea de una propiedad concreta. */
  const lineaPorPropiedad = useMemo(
    () => new Map(lineas.map((linea) => [linea.propiedadId, linea])),
    [lineas],
  );

  const pronosticoTotal = lineas.reduce((suma, linea) => suma + linea.ovpUsd, 0);

  /** Qué material se está enseñando en el visor, y desde qué pieza. */
  const [enElVisor, establecerEnElVisor] = useState<{
    propiedad: PropiedadDelChecklist;
    posicion: number;
  } | null>(null);

  /** Marca o desmarca una propiedad del checklist. */
  function alternarLaPropiedad(idDeLaPropiedad: string, quedaMarcada: boolean) {
    if (!quedaMarcada) {
      alCambiar(lineas.filter((linea) => linea.propiedadId !== idDeLaPropiedad));

      return;
    }

    alCambiar([...lineas, { propiedadId: idDeLaPropiedad, ovpUsd: 0, nota: null }]);
  }

  /** Cambia el pronóstico de una propiedad ya marcada. */
  function cambiarElPronostico(idDeLaPropiedad: string, pronosticoNuevo: number) {
    alCambiar(
      lineas.map((linea) =>
        linea.propiedadId === idDeLaPropiedad
          ? { ...linea, ovpUsd: Number.isNaN(pronosticoNuevo) ? 0 : pronosticoNuevo }
          : linea,
      ),
    );
  }

  if (estaCargando) {
    return (
      <p className="py-3 text-[11px] text-default-400">Cargando las propiedades…</p>
    );
  }

  if (propiedadesAMostrar.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-default-200 px-3 py-4 text-center">
        <Package className="mx-auto mb-1 size-4 text-default-300" />
        <p className="text-[11px] leading-relaxed text-default-500">
          Todavía no hay propiedades cargadas. Se dan de alta en la pantalla
          de <strong>Propiedades</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {propiedadesAMostrar.map((propiedad) => {
        const lineaDeEstaPropiedad = lineaPorPropiedad.get(propiedad.id);
        const estaMarcada = lineaDeEstaPropiedad !== undefined;

        // Una propiedad ajena solo se bloquea si NO está ya marcada:
        // quitar lo que otro puso sí se permite a quien edita la marca.
        const estaBloqueada = !esEditable || (!propiedad.laPuedoOfrecer && !estaMarcada);

        return (
          <div
            key={propiedad.id}
            className={[
              "rounded-2xl border p-3 transition",
              estaMarcada
                ? "border-primary bg-primary-50/40 dark:bg-primary-100/5"
                : "border-default-200",
            ].join(" ")}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                aria-label={`Ofrecer ${propiedad.nombre}`}
                className="mt-0.5"
                isDisabled={estaBloqueada}
                isSelected={estaMarcada}
                size="sm"
                onValueChange={(quedaMarcada) =>
                  alternarLaPropiedad(propiedad.id, quedaMarcada)
                }
              />

              {/* Logo o iniciales de la propiedad. */}
              <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-default-100">
                {propiedad.logoUrl ? (
                  <img
                    alt={propiedad.nombre}
                    className="size-full object-cover"
                    src={propiedad.logoUrl}
                  />
                ) : (
                  <span className="text-[10px] font-bold text-default-400">
                    {inicialesDe(propiedad.nombre)}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    {propiedad.nombre}
                  </span>

                  {propiedad.estaRetirada && (
                    <Chip color="warning" radius="lg" size="sm" variant="flat">
                      Retirada del catálogo
                    </Chip>
                  )}

                  {!propiedad.laPuedoOfrecer && !propiedad.estaRetirada && (
                    <Tooltip content="Esta propiedad está asignada a otras personas del equipo">
                      <span className="flex items-center gap-1 text-[10px] text-default-400">
                        <Lock className="size-3" />
                        No asignada a ti
                      </span>
                    </Tooltip>
                  )}
                </div>

                <p className="mt-0.5 text-[11px] text-default-500">
                  {propiedad.montoTotalUsd > 0 ? (
                    <>
                      MTP {formatearDinero(propiedad.montoTotalUsd)} · meta{" "}
                      {formatearDineroAbreviado(propiedad.forecastDeVentaUsd)} (
                      {formatearPorcentaje(propiedad.porcentajeForecast)})
                    </>
                  ) : (
                    "Sin monto total cargado todavía"
                  )}
                </p>
              </div>

              {/* El material, para enseñarlo aquí mismo. Lo puede abrir
                  cualquiera que vea la ficha, aunque no pueda editarla. */}
              {propiedad.galeria.length > 0 && (
                <Tooltip content="Fotos, planos y dossier">
                  <button
                    aria-label={`Ver el material de ${propiedad.nombre}`}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-default-100 px-2 py-1 text-[11px] font-semibold text-default-600 transition hover:bg-primary-50 hover:text-primary"
                    type="button"
                    onClick={() => establecerEnElVisor({ propiedad, posicion: 0 })}
                  >
                    <Images className="size-3.5" />
                    {propiedad.galeria.length}
                  </button>
                </Tooltip>
              )}
            </div>

            {/* Al marcarla asoman las primeras fotos: es cuando se enseñan. */}
            {estaMarcada && (
              <FotosQueAsoman
                galeria={propiedad.galeria}
                alAbrir={(posicion) => establecerEnElVisor({ propiedad, posicion })}
              />
            )}

            {/* El pronóstico y su proporción, solo si está marcada. */}
            {estaMarcada && lineaDeEstaPropiedad && (
              <div className="mt-3 space-y-2 pl-9">
                <NumberInput
                  aria-label={`Pronóstico de venta para ${propiedad.nombre}`}
                  description="Lo que estimas venderle a esta marca dentro de la propiedad."
                  isDisabled={!esEditable}
                  label="Pronóstico de venta (OVP)"
                  labelPlacement="outside"
                  minValue={0}
                  radius="lg"
                  size="sm"
                  startContent={<span className="text-xs text-default-400">$</span>}
                  step={100}
                  value={lineaDeEstaPropiedad.ovpUsd}
                  variant="bordered"
                  onValueChange={(valor) => cambiarElPronostico(propiedad.id, valor)}
                />

                <BarraDeProporcion
                  montoDeLaMeta={propiedad.forecastDeVentaUsd}
                  montoPronosticado={lineaDeEstaPropiedad.ovpUsd}
                  montoTotal={propiedad.montoTotalUsd}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Total de la ficha: la suma de los pronósticos marcados. */}
      {lineas.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-default-50 px-3 py-2">
          <span className="text-[11px] text-default-500">
            {lineas.length} {lineas.length === 1 ? "propiedad" : "propiedades"} en el
            checklist
          </span>

          <span className="text-xs font-bold text-foreground">
            {formatearDinero(pronosticoTotal)}
          </span>
        </div>
      )}

      <VisorDeGaleria
        elementos={elementosDeUnaGaleria(enElVisor?.propiedad.galeria ?? [])}
        estaAbierto={enElVisor !== null}
        posicionInicial={enElVisor?.posicion ?? 0}
        titulo={enElVisor?.propiedad.nombre}
        alCerrar={() => establecerEnElVisor(null)}
      />
    </div>
  );
}

/**
 * Las primeras fotos de una propiedad marcada, en pequeño, y un «+N» con
 * el resto. Cada una abre el visor en ella. Solo fotos: un PDF en una
 * miniatura no se reconoce, y ya está en el botón del material.
 */
function FotosQueAsoman({
  galeria,
  alAbrir,
}: {
  galeria: ArchivoDeGaleria[];
  alAbrir: (posicionEnLaGaleria: number) => void;
}) {
  const fotos = galeria
    .map((pieza, posicionEnLaGaleria) => ({ pieza, posicionEnLaGaleria }))
    .filter(({ pieza }) => pieza.tipo === "imagen");

  if (fotos.length === 0) return null;

  const visibles = fotos.slice(0, FOTOS_QUE_ASOMAN);
  const restantes = fotos.length - visibles.length;

  return (
    <div className="mt-2 flex gap-1.5 pl-9">
      {visibles.map(({ pieza, posicionEnLaGaleria }, indice) => {
        const esLaUltimaVisible = indice === visibles.length - 1;

        return (
          <button
            key={pieza.id}
            aria-label={`Ver ${pieza.titulo ?? pieza.nombre}`}
            className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-default-100 transition hover:opacity-80"
            type="button"
            onClick={() => alAbrir(posicionEnLaGaleria)}
          >
            <img
              alt=""
              className="size-full object-cover"
              loading="lazy"
              src={pieza.urlMiniatura ?? pieza.url}
            />

            {esLaUltimaVisible && restantes > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-bold text-white">
                +{restantes}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
