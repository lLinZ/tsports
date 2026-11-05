/**
 * componentes/crm/CruceDePropiedades.tsx
 * ---------------------------------------------------------------------
 * Propiedades › Cruce: marcas en filas, propiedades en columnas.
 *
 * En cada casilla, lo que se le pronostica a esa marca en esa propiedad,
 * pintado con el estado de la marca. Es la vista para ver de golpe qué
 * propiedad tiene sus marcas en rojo y cuál las tiene en azul. Abajo de
 * cada columna, su total y cuántas de sus marcas están calientes.
 *
 * Los filtros (estado, agente, orden) van al servidor, que devuelve las
 * filas, los totales de las columnas y los contadores: «Calientes · 6»
 * es lo que sale al pulsarlo, con el agente elegido (como el tablero).
 * Las columnas no cambian al filtrar, para que nada se mueva de sitio.
 *
 * Una casilla de una propiedad que la marca lleva sin cifra dice «sin
 * cifra»; una que no lleva, un punto.
 * ---------------------------------------------------------------------
 */
import { Button, Select, SelectItem } from "@heroui/react";
import { FileSpreadsheet, Package } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import { exportarMovimiento } from "@/api/movimientoDePropiedades";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import {
  APARIENCIA_DE_LOS_ESTADOS,
  FiltroPorEstado,
} from "@/componentes/crm/EstadoDeLaMarca";
import { LogoDeLaPropiedad } from "@/componentes/crm/MovimientoDePropiedades";
import { useCruceDePropiedades } from "@/hooks/useMovimientoDePropiedades";
import type {
  EstadoDeMarca,
  FiltrosDelCruce,
  OrdenDelCruce,
} from "@/tipos/modelos";
import { avisarDeError } from "@/utilidades/avisos";
import { descargarElCruceEnExcel } from "@/utilidades/excelDeMovimiento";
import { formatearDinero, inicialesDe } from "@/utilidades/formato";

const TODOS_LOS_AGENTES = "todos";

export function CruceDePropiedades() {
  const [filtros, establecerFiltros] = useState<FiltrosDelCruce>({
    estado: null,
    agente: null,
    orden: "pronostico",
  });
  const { cruce, estaCargando, estaRefrescando, error, recargar } =
    useCruceDePropiedades(filtros);
  const [estaDescargando, establecerDescargando] = useState(false);

  async function descargarEnExcel() {
    establecerDescargando(true);

    try {
      await descargarElCruceEnExcel(
        await exportarMovimiento({ vista: "cruce", filtros }),
      );
    } catch (errorAlDescargar) {
      avisarDeError(errorAlDescargar, "No se pudo sacar el Excel");
    } finally {
      establecerDescargando(false);
    }
  }

  if (estaCargando) {
    return (
      <BloqueDeCarga alto="min-h-72" mensaje="Cruzando marcas y propiedades…" />
    );
  }

  if (error || cruce === undefined) {
    return (
      <BloqueDeError
        alReintentar={() => void recargar()}
        mensaje={mensajeDeError(error)}
      />
    );
  }

  const totales = new Map(
    cruce.totalesPorColumna.map((total) => [total.propiedadId, total]),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FiltroPorEstado
          alElegir={(estado) =>
            establecerFiltros((antes) => ({
              ...antes,
              estado: estado === "" ? null : estado,
            }))
          }
          contadores={cruce.contadores}
          elegido={filtros.estado ?? ""}
          puedeAjustarLosDias={false}
          umbrales={null}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Agente"
            className="w-52"
            radius="lg"
            selectedKeys={[filtros.agente ?? TODOS_LOS_AGENTES]}
            size="sm"
            onChange={(evento) =>
              establecerFiltros((antes) => ({
                ...antes,
                agente:
                  evento.target.value === TODOS_LOS_AGENTES ||
                  evento.target.value === ""
                    ? null
                    : evento.target.value,
              }))
            }
          >
            {[
              <SelectItem key={TODOS_LOS_AGENTES}>
                Todos los agentes
              </SelectItem>,
              ...cruce.agentes.map((agente) => (
                <SelectItem key={agente.id}>
                  {agente.nombre ?? "Sin nombre"}
                </SelectItem>
              )),
              <SelectItem key="sin">Sin agente</SelectItem>,
            ]}
          </Select>

          <Select
            aria-label="Orden"
            className="w-44"
            radius="lg"
            selectedKeys={[filtros.orden]}
            size="sm"
            onChange={(evento) => {
              if (evento.target.value === "") return;
              establecerFiltros((antes) => ({
                ...antes,
                orden: evento.target.value as OrdenDelCruce,
              }));
            }}
          >
            <SelectItem key="pronostico">Más pronóstico</SelectItem>
            <SelectItem key="nombre">Nombre (A–Z)</SelectItem>
          </Select>

          <Button
            isLoading={estaDescargando}
            radius="full"
            size="sm"
            startContent={
              !estaDescargando && <FileSpreadsheet className="size-4" />
            }
            variant="flat"
            onPress={() => void descargarEnExcel()}
          >
            Excel
          </Button>
        </div>
      </div>

      {cruce.columnas.length === 0 ? (
        <div className="bento-card">
          <EstadoVacio
            descripcion="Cuando el equipo añada propiedades al checklist de sus marcas, aquí se cruzarán."
            icono={<Package className="size-5" />}
            titulo="Ninguna marca lleva propiedades todavía"
          />
        </div>
      ) : (
        <div
          className={`bento-card overflow-x-auto px-4 transition-opacity ${estaRefrescando ? "opacity-70" : ""}`}
        >
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-default-100">
                <th className="py-3 pr-3 text-left align-bottom text-[10px] font-semibold uppercase tracking-wide text-default-400">
                  Marca
                </th>
                {cruce.columnas.map((columna) => (
                  <th
                    key={columna.propiedadId}
                    className="px-1 py-3 text-right align-bottom"
                  >
                    <Link
                      className="inline-flex flex-col items-end gap-1.5 hover:opacity-80"
                      to={`/propiedades/${columna.propiedadId}/movimiento`}
                    >
                      <LogoDeLaPropiedad
                        logoUrl={columna.logoUrl}
                        nombre={columna.nombre}
                      />
                      <span className="max-w-24 text-xs font-semibold leading-tight text-foreground">
                        {columna.nombre}
                        {!columna.activa && (
                          <span className="block text-[10px] font-normal text-warning-600">
                            desactivada
                          </span>
                        )}
                      </span>
                    </Link>
                  </th>
                ))}
                <th className="py-3 pl-3 text-right align-bottom text-[10px] font-semibold uppercase tracking-wide text-default-400">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {cruce.filas.length === 0 ? (
                <tr>
                  <td
                    className="py-8 text-center text-sm text-default-500"
                    colSpan={cruce.columnas.length + 2}
                  >
                    Ninguna marca con estos filtros.
                  </td>
                </tr>
              ) : (
                cruce.filas.map((fila) => {
                  const apariencia = APARIENCIA_DE_LOS_ESTADOS[fila.estado];
                  const Icono = apariencia.icono;

                  return (
                    <tr
                      key={fila.marcaId}
                      className="border-b border-default-100 last:border-b-0"
                    >
                      <td className="py-1.5 pr-3">
                        <Link
                          className="flex items-center gap-2 hover:underline"
                          to={`/marcas?abrir=${fila.marcaId}`}
                        >
                          <span
                            className="flex size-5 shrink-0 items-center justify-center rounded-full text-white"
                            style={{ backgroundColor: apariencia.solido }}
                            title={apariencia.etiqueta}
                          >
                            <Icono className="size-3" />
                          </span>
                          <span className="max-w-44 truncate font-semibold text-foreground">
                            {fila.nombre}
                          </span>
                          {fila.agente !== null && (
                            <span
                              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary"
                              title={fila.agente.nombre ?? undefined}
                            >
                              {inicialesDe(fila.agente.nombre)}
                            </span>
                          )}
                        </Link>
                      </td>

                      {cruce.columnas.map((columna) => (
                        <td
                          key={columna.propiedadId}
                          className="px-1 py-1.5 text-right"
                        >
                          <Casilla
                            estado={fila.estado}
                            ovp={fila.celdas[columna.propiedadId]}
                          />
                        </td>
                      ))}

                      <td className="py-1.5 pl-3 text-right font-bold text-foreground">
                        {formatearDinero(fila.ovpUsd)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-default-200 align-top">
                <td className="py-3 pr-3 font-bold text-foreground">Total</td>
                {cruce.columnas.map((columna) => {
                  const total = totales.get(columna.propiedadId);

                  return (
                    <td
                      key={columna.propiedadId}
                      className="px-1 py-3 text-right"
                    >
                      <p className="font-bold text-foreground">
                        {formatearDinero(total?.ovpUsd ?? 0)}
                      </p>
                      <p
                        className={`text-[11px] ${(total?.calientes ?? 0) > 0 ? APARIENCIA_DE_LOS_ESTADOS.caliente.texto : "text-default-400"}`}
                      >
                        {total?.calientes ?? 0} de {total?.marcas ?? 0}{" "}
                        calientes
                      </p>
                    </td>
                  );
                })}
                <td className="py-3 pl-3 text-right font-bold text-foreground">
                  {formatearDinero(cruce.ovpUsd)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function Casilla({
  ovp,
  estado,
}: {
  ovp: number | undefined;
  estado: EstadoDeMarca;
}) {
  if (ovp === undefined) {
    return (
      <span className="inline-block min-w-14 text-center text-default-200">
        ·
      </span>
    );
  }

  const { pastilla } = APARIENCIA_DE_LOS_ESTADOS[estado];

  return (
    <span
      className={`inline-flex h-8 min-w-[4.75rem] items-center justify-end rounded-xl px-2 text-[13px] font-semibold ${pastilla}`}
    >
      {ovp > 0 ? (
        formatearDinero(ovp)
      ) : (
        <span className="text-[11px] font-medium">sin cifra</span>
      )}
    </span>
  );
}
