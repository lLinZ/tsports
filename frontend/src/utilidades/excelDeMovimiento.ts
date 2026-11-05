/**
 * utilidades/excelDeMovimiento.ts
 * ---------------------------------------------------------------------
 * Propiedades › Movimiento, Cruce y la ficha de una propiedad, como
 * libro de Excel para llevar a una reunión.
 *
 *   · RANKING → una fila por propiedad: MTP, meta, OVP, marcas por
 *     estado, el dinero en las calientes y el último movimiento.
 *   · CRUCE   → marcas en filas y propiedades en columnas, con el OVP
 *     de cada casilla y el estado de la marca.
 *   · FICHA   → las marcas de una propiedad, con su estado, su OVP en
 *     ella, la fase, el agente y el siguiente paso.
 *
 * Los datos son la respuesta de `/propiedades/movimiento/exportacion`,
 * que es la misma de la pantalla y deja la exportación en la auditoría
 * (regla 28). Los importes van como número para que la hoja los sume, y
 * la librería se carga solo al descargar (ver CLAUDE.md, «vendor-excel»).
 * ---------------------------------------------------------------------
 */
import {
  APARIENCIA_DE_LOS_ESTADOS,
  ORDEN_DE_LOS_ESTADOS,
  textoDeHaceDias,
} from "@/componentes/crm/EstadoDeLaMarca";
import type {
  CruceDePropiedades,
  MovimientoDeLaPropiedad,
  MovimientoDePropiedades,
  SiguientePasoDeLaMarca,
} from "@/tipos/modelos";
import { formatearSiguientePaso } from "@/utilidades/formato";

const TINTA = "#202124";
const TINTA_SUAVE = "#5F6368";
const FONDO_CABECERA = "#F1F3F4";
const LINEA = "#E8EAED";
const FORMATO_DE_DINERO = '"$"#,##0.00';
const FORMATO_DE_PORCENTAJE = '0.0"%"';

/** Lo que de verdad se usa de la librería (mismo criterio que excelDeCampanas.ts). */
type CeldaDeExcel = {
  value?: string | number;
  type?: NumberConstructor;
  format?: string;
  fontWeight?: "bold";
  color?: string;
  backgroundColor?: string;
  borderBottomColor?: string;
  borderBottomStyle?: "thin";
};

type FilaDeExcel = (CeldaDeExcel | null)[];

function cabecera(titulos: string[]): FilaDeExcel {
  return titulos.map((titulo) => ({
    value: titulo,
    fontWeight: "bold",
    backgroundColor: FONDO_CABECERA,
    color: TINTA,
    borderBottomColor: LINEA,
    borderBottomStyle: "thin",
  }));
}

function dinero(importe: number, negrita = false): CeldaDeExcel {
  return {
    value: importe,
    type: Number,
    format: FORMATO_DE_DINERO,
    color: TINTA,
    ...(negrita ? { fontWeight: "bold" as const } : {}),
  };
}

function numero(valor: number, negrita = false): CeldaDeExcel {
  return {
    value: valor,
    type: Number,
    color: TINTA,
    ...(negrita ? { fontWeight: "bold" as const } : {}),
  };
}

function porcentaje(valor: number | null): CeldaDeExcel {
  return valor === null
    ? texto("sin MTP", true)
    : {
        value: valor,
        type: Number,
        format: FORMATO_DE_PORCENTAJE,
        color: TINTA,
      };
}

function texto(valor: string | null, suave = false): CeldaDeExcel {
  return { value: valor ?? "", color: suave ? TINTA_SUAVE : TINTA };
}

function negrita(valor: string): CeldaDeExcel {
  return { value: valor, fontWeight: "bold", color: TINTA };
}

function etiquetaDelEstado(
  estado: keyof typeof APARIENCIA_DE_LOS_ESTADOS,
): string {
  return APARIENCIA_DE_LOS_ESTADOS[estado].etiqueta;
}

function textoDelSiguientePaso(paso: SiguientePasoDeLaMarca | null): string {
  return paso === null ? "Sin siguiente paso" : formatearSiguientePaso(paso);
}

function dia(generadoEn: string | undefined): string {
  return (generadoEn ?? new Date().toISOString()).slice(0, 10);
}

/* ==================================================================== */

export async function descargarElRankingEnExcel(
  movimiento: MovimientoDePropiedades,
): Promise<void> {
  const { default: escribirLibroDeExcel } =
    await import("write-excel-file/browser");

  const filas: FilaDeExcel[] = [
    cabecera([
      "Propiedad",
      "MTP (USD)",
      "Meta (USD)",
      "OVP (USD)",
      "% del MTP",
      "Marcas",
      "Calientes",
      "Tibias",
      "Frías",
      "OVP en calientes (USD)",
      "Nuevas este mes",
      "Último movimiento",
    ]),
    ...movimiento.propiedades.map((propiedad): FilaDeExcel => [
      texto(
        propiedad.activa
          ? propiedad.nombre
          : `${propiedad.nombre} (desactivada)`,
      ),
      dinero(propiedad.montoTotalUsd),
      dinero(propiedad.forecastDeVentaUsd),
      dinero(propiedad.ovpUsd),
      porcentaje(propiedad.porcentajeSobreElTotal),
      numero(propiedad.marcas),
      ...ORDEN_DE_LOS_ESTADOS.map((estado) =>
        numero(propiedad.porEstado[estado].marcas),
      ),
      dinero(propiedad.ovpEnCalientesUsd),
      numero(propiedad.nuevasEsteMes),
      texto(
        propiedad.ultimoMovimiento === null
          ? ""
          : `${textoDeHaceDias(propiedad.ultimoMovimiento.haceDias)} · ${propiedad.ultimoMovimiento.marcaNombre} · ${propiedad.ultimoMovimiento.etiqueta}`,
        true,
      ),
    ]),
    [],
    [
      negrita("Total"),
      dinero(movimiento.totales.montoTotalUsd, true),
      dinero(movimiento.totales.forecastDeVentaUsd, true),
      dinero(movimiento.totales.ovpUsd, true),
      null,
      null,
      null,
      null,
      null,
      dinero(movimiento.totales.ovpEnCalientesUsd, true),
    ],
    ...(movimiento.sinMarcas.length > 0
      ? [
          [],
          [
            texto(
              `Sin marcas todavía: ${movimiento.sinMarcas.map((propiedad) => propiedad.nombre).join(", ")}`,
              true,
            ),
          ],
        ]
      : []),
  ];

  await escribirLibroDeExcel([
    {
      sheet: "Movimiento",
      data: filas,
      columns: [
        { width: 28 },
        { width: 13 },
        { width: 13 },
        { width: 13 },
        { width: 10 },
        { width: 9 },
        { width: 10 },
        { width: 9 },
        { width: 9 },
        { width: 20 },
        { width: 14 },
        { width: 50 },
      ],
      stickyRowsCount: 1,
    },
  ]).toFile(
    `TS-Sports-movimiento-de-propiedades-${dia(movimiento.generadoEn)}.xlsx`,
  );
}

export async function descargarElCruceEnExcel(
  cruce: CruceDePropiedades,
): Promise<void> {
  const { default: escribirLibroDeExcel } =
    await import("write-excel-file/browser");

  const totales = new Map(
    cruce.totalesPorColumna.map((total) => [total.propiedadId, total]),
  );

  const filas: FilaDeExcel[] = [
    cabecera([
      "Marca",
      "Estado",
      "Agente",
      ...cruce.columnas.map((columna) => columna.nombre),
      "Total (USD)",
    ]),
    ...cruce.filas.map((fila): FilaDeExcel => [
      texto(fila.nombre),
      texto(etiquetaDelEstado(fila.estado), true),
      texto(fila.agente?.nombre ?? "Sin agente", true),
      ...cruce.columnas.map((columna) =>
        columna.propiedadId in fila.celdas
          ? dinero(fila.celdas[columna.propiedadId])
          : null,
      ),
      dinero(fila.ovpUsd, true),
    ]),
    [],
    [
      negrita("Total"),
      null,
      null,
      ...cruce.columnas.map((columna) =>
        dinero(totales.get(columna.propiedadId)?.ovpUsd ?? 0, true),
      ),
      dinero(cruce.ovpUsd, true),
    ],
    [
      texto("Marcas calientes", true),
      null,
      null,
      ...cruce.columnas.map((columna) => {
        const total = totales.get(columna.propiedadId);

        return texto(`${total?.calientes ?? 0} de ${total?.marcas ?? 0}`, true);
      }),
      null,
    ],
  ];

  await escribirLibroDeExcel([
    {
      sheet: "Cruce",
      data: filas,
      columns: [
        { width: 28 },
        { width: 10 },
        { width: 22 },
        ...cruce.columnas.map(() => ({ width: 16 })),
        { width: 14 },
      ],
      stickyRowsCount: 1,
    },
  ]).toFile(
    `TS-Sports-cruce-marcas-y-propiedades-${dia(cruce.generadoEn)}.xlsx`,
  );
}

export async function descargarLaFichaEnExcel(
  ficha: MovimientoDeLaPropiedad,
): Promise<void> {
  const { default: escribirLibroDeExcel } =
    await import("write-excel-file/browser");

  const filas: FilaDeExcel[] = [
    [negrita(ficha.propiedad.nombre)],
    [
      texto(
        `MTP ${ficha.propiedad.montoTotalUsd.toLocaleString("es")} · Meta ${ficha.propiedad.forecastDeVentaUsd.toLocaleString("es")} · OVP ${ficha.propiedad.ovpUsd.toLocaleString("es")} USD`,
        true,
      ),
    ],
    [],
    cabecera([
      "Marca",
      "Estado",
      "OVP en esta propiedad (USD)",
      "Último movimiento",
      "Fase",
      "Agente",
      "Siguiente paso",
      "Nota",
    ]),
    ...ORDEN_DE_LOS_ESTADOS.flatMap((estado) =>
      ficha.marcas
        .filter((marca) => marca.estado === estado)
        .map((marca): FilaDeExcel => [
          texto(marca.nombre),
          texto(etiquetaDelEstado(marca.estado), true),
          dinero(marca.ovpUsd),
          texto(
            `${textoDeHaceDias(marca.ultimoMovimiento.haceDias)} · ${marca.ultimoMovimiento.etiqueta}`,
            true,
          ),
          texto(marca.fase.etiqueta, true),
          texto(marca.agente?.nombre ?? "Sin agente", true),
          texto(textoDelSiguientePaso(marca.siguientePaso), true),
          texto(marca.nota, true),
        ]),
    ),
    [],
    ...ORDEN_DE_LOS_ESTADOS.map((estado): FilaDeExcel => [
      negrita(
        `${APARIENCIA_DE_LOS_ESTADOS[estado].plural} · ${ficha.porEstado[estado].marcas}`,
      ),
      null,
      dinero(ficha.porEstado[estado].ovpUsd, true),
    ]),
  ];

  await escribirLibroDeExcel([
    {
      sheet: "Marcas",
      data: filas,
      columns: [
        { width: 28 },
        { width: 10 },
        { width: 22 },
        { width: 38 },
        { width: 18 },
        { width: 22 },
        { width: 32 },
        { width: 40 },
      ],
      stickyRowsCount: 4,
    },
  ]).toFile(
    `TS-Sports-${ficha.propiedad.nombre.replace(/[^\p{L}\p{N}]+/gu, "-")}-marcas-${dia(ficha.generadoEn)}.xlsx`,
  );
}
