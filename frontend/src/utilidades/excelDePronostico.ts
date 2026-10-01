/**
 * utilidades/excelDePronostico.ts
 * ---------------------------------------------------------------------
 * El reporte «Pronóstico por marca» como libro de Excel, con las dos
 * lecturas de pantalla en dos hojas:
 *
 *   · POR MARCA     → una fila por marca y propiedad, con la marca, su
 *     agente y lo que se le pronostica. Se puede filtrar y sumar por
 *     cualquier columna.
 *   · POR PROPIEDAD → lo mismo ordenado por propiedad, con el total de
 *     cada una.
 *
 * Sale de lo que ya está en pantalla, sin volver a preguntar, y los
 * importes van como número para que la hoja los pueda sumar. La
 * librería se carga solo al descargar (ver CLAUDE.md, «vendor-excel»).
 * ---------------------------------------------------------------------
 */
import type { ReporteDePronostico } from "@/tipos/modelos";

const TINTA = "#202124";
const TINTA_SUAVE = "#5F6368";
const FONDO_CABECERA = "#F1F3F4";
const LINEA = "#E8EAED";
const FORMATO_DE_DINERO = '"$"#,##0.00';

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
  return { value: importe, type: Number, format: FORMATO_DE_DINERO, color: TINTA, ...(negrita ? { fontWeight: "bold" as const } : {}) };
}

function texto(valor: string | null, suave = false): CeldaDeExcel {
  return { value: valor ?? "", color: suave ? TINTA_SUAVE : TINTA };
}

export async function descargarElPronosticoEnExcel(reporte: ReporteDePronostico): Promise<void> {
  const { default: escribirLibroDeExcel } = await import("write-excel-file/browser");

  const porMarca: FilaDeExcel[] = [
    cabecera(["Marca", "Agente", "Sector", "Zona", "Propiedad", "OVP (USD)"]),
    ...reporte.porMarca.flatMap((marca) =>
      marca.propiedades.map((linea): FilaDeExcel => [
        texto(marca.nombre),
        texto(marca.agenteNombre ?? "Sin agente", true),
        texto(marca.sector, true),
        texto(marca.zona, true),
        texto(linea.activa ? linea.nombre : `${linea.nombre} (desactivada)`),
        dinero(linea.ovpUsd),
      ]),
    ),
    [],
    [{ value: "Total", fontWeight: "bold", color: TINTA }, null, null, null, null, dinero(reporte.resumen.totalOvpUsd, true)],
  ];

  const porPropiedad: FilaDeExcel[] = [
    cabecera(["Propiedad", "Marca", "OVP (USD)"]),
    ...reporte.porPropiedad
      .filter((propiedad) => propiedad.marcas.length > 0)
      .flatMap((propiedad): FilaDeExcel[] => [
        ...propiedad.marcas.map((marca): FilaDeExcel => [
          texto(propiedad.activa ? propiedad.nombre : `${propiedad.nombre} (desactivada)`),
          texto(marca.nombre),
          dinero(marca.ovpUsd),
        ]),
        [{ value: `Total ${propiedad.nombre}`, fontWeight: "bold", color: TINTA_SUAVE }, null, dinero(propiedad.ovpUsd, true)],
      ]),
  ];

  await escribirLibroDeExcel([
    {
      sheet: "Por marca",
      data: porMarca,
      columns: [{ width: 30 }, { width: 22 }, { width: 18 }, { width: 14 }, { width: 34 }, { width: 14 }],
      stickyRowsCount: 1,
    },
    {
      sheet: "Por propiedad",
      data: porPropiedad,
      columns: [{ width: 34 }, { width: 30 }, { width: 14 }],
      stickyRowsCount: 1,
    },
  ]).toFile(`TS-Sports-pronostico-por-marca-${reporte.generadoEn.slice(0, 10)}.xlsx`);
}
