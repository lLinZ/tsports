/**
 * utilidades/excelDelTablero.ts
 * ---------------------------------------------------------------------
 * El tablero de marcas como libro de Excel, para llevarlo a una reunión.
 *
 *   · MARCAS  → una fila por marca con todo lo que se ve en la tarjeta y
 *     en la ficha: estado, avance, valor, pronóstico, contacto y agente.
 *     Los importes van como número y las fechas como fecha, para que la
 *     hoja se pueda sumar, ordenar y filtrar.
 *   · FILTROS → con qué filtros se sacó y cuándo. Sin ella, un Excel de
 *     «las marcas calientes de Caracas» se confunde a la semana con el
 *     tablero entero.
 *
 * Las marcas las pide al servidor el que llama (`exportarElTablero`), con
 * los mismos filtros que la pantalla y el mismo corte por rol: aquí solo
 * se escriben. La librería se carga solo al descargar (CLAUDE.md,
 * «vendor-excel»).
 * ---------------------------------------------------------------------
 */
import type { EstadoDeMarca, Marca } from "@/tipos/modelos";

const TINTA = "#202124";
const TINTA_SUAVE = "#5F6368";
const FONDO_CABECERA = "#F1F3F4";
const LINEA = "#E8EAED";
const FORMATO_DE_DINERO = '"$"#,##0.00';
const FORMATO_DE_FECHA = "dd/mm/yyyy";

const NOMBRE_DEL_ESTADO: Record<EstadoDeMarca, string> = {
  caliente: "Caliente",
  tibia: "Tibia",
  fria: "Fría",
};

/** Lo que de verdad se usa de la librería (mismo criterio que excelDePronostico.ts). */
type CeldaDeExcel = {
  value?: string | number | Date;
  type?: NumberConstructor | DateConstructor;
  format?: string;
  fontWeight?: "bold";
  color?: string;
  backgroundColor?: string;
  borderBottomColor?: string;
  borderBottomStyle?: "thin";
  wrap?: boolean;
};

type FilaDeExcel = (CeldaDeExcel | null)[];

/** Un filtro tal como lo lee una persona: «Zona» → «Caracas». */
export interface FiltroDescrito {
  etiqueta: string;
  valor: string;
}

const COLUMNAS: Array<{ titulo: string; ancho: number }> = [
  { titulo: "Marca", ancho: 30 },
  { titulo: "Sector", ancho: 18 },
  { titulo: "Zona", ancho: 13 },
  { titulo: "Agente", ancho: 22 },
  { titulo: "Estado", ancho: 16 },
  { titulo: "Último movimiento", ancho: 14 },
  { titulo: "Qué fue", ancho: 28 },
  { titulo: "Próxima acción", ancho: 14 },
  { titulo: "Campaña", ancho: 26 },
  { titulo: "Prospección", ancho: 12 },
  { titulo: "Aproximación", ancho: 13 },
  { titulo: "Vía de aproximación", ancho: 20 },
  { titulo: "Propuesta", ancho: 11 },
  { titulo: "Valor anual (USD)", ancho: 16 },
  { titulo: "OVP (USD)", ancho: 14 },
  { titulo: "Propiedades ofrecidas", ancho: 34 },
  { titulo: "Contacto", ancho: 22 },
  { titulo: "Cargo", ancho: 20 },
  { titulo: "Email", ancho: 28 },
  { titulo: "Teléfono", ancho: 16 },
  { titulo: "Invierte en deporte", ancho: 16 },
  { titulo: "Origen", ancho: 10 },
  { titulo: "Registrada", ancho: 12 },
];

export async function descargarElTableroEnExcel({
  marcas,
  generadoEn,
  filtros,
}: {
  marcas: Marca[];
  generadoEn: string;
  filtros: FiltroDescrito[];
}): Promise<void> {
  const { default: escribirLibroDeExcel } = await import("write-excel-file/browser");

  const hojaDeMarcas: FilaDeExcel[] = [
    COLUMNAS.map((columna) => cabecera(columna.titulo)),
    ...marcas.map(filaDeLaMarca),
  ];

  const hojaDeFiltros: FilaDeExcel[] = [
    [cabecera("Tablero de marcas"), cabecera("")],
    [texto("Exportado el"), texto(textoDeFechaYHora(generadoEn))],
    [texto("Marcas"), { value: marcas.length, type: Number, color: TINTA }],
    [],
    [cabecera("Filtro"), cabecera("Valor")],
    ...(filtros.length === 0
      ? [[texto("Sin filtros: el tablero entero", true), null]]
      : filtros.map((filtro): FilaDeExcel => [texto(filtro.etiqueta, true), texto(filtro.valor)])),
  ];

  await escribirLibroDeExcel([
    {
      sheet: "Marcas",
      data: hojaDeMarcas,
      columns: COLUMNAS.map((columna) => ({ width: columna.ancho })),
      // La cabecera y el nombre de la marca se quedan a la vista al
      // desplazarse: son veintitrés columnas.
      stickyRowsCount: 1,
      stickyColumnsCount: 1,
    },
    {
      sheet: "Filtros",
      data: hojaDeFiltros,
      columns: [{ width: 24 }, { width: 44 }],
    },
  ]).toFile(`TS-Sports-tablero-${generadoEn.slice(0, 10)}.xlsx`);
}

function filaDeLaMarca(marca: Marca): FilaDeExcel {
  const propiedades = (marca.propiedadesOfrecidas ?? [])
    .map((linea) => (linea.propiedadActiva ? linea.propiedadNombre : `${linea.propiedadNombre} (desactivada)`))
    .join(", ");

  return [
    texto(marca.nombreMarca),
    texto(marca.sector),
    texto(marca.zona),
    texto(marca.vendedorAsignadoNombre ?? "Sin agente", marca.vendedorAsignadoNombre === null),
    texto(`${NOMBRE_DEL_ESTADO[marca.estado]}${marca.estadoFijado ? " (fijado)" : ""}`),
    fecha(marca.ultimoMovimiento.el),
    texto(marca.ultimoMovimiento.etiqueta, true),
    fecha(marca.proximaAccionEl),
    texto(marca.campanaNombre ?? null),
    siONo(marca.faseProspeccionCompletada),
    siONo(marca.faseAproximacionCompletada),
    texto(marca.viaAproximacion),
    siONo(marca.fasePropuestaCompletada),
    dinero(marca.fasePropuestaCompletada ? marca.valorAnualUsd : 0),
    dinero(marca.ovpTotalUsd ?? 0),
    texto(propiedades || null, true),
    texto(marca.personaContacto),
    texto(marca.cargoContacto),
    texto(marca.emailContacto),
    texto(marca.telefonoContacto),
    texto(marca.invierteEtiqueta),
    texto(marca.origenEtiqueta, true),
    fecha(marca.creadaEn?.slice(0, 10) ?? null),
  ];
}

function cabecera(titulo: string): CeldaDeExcel {
  return {
    value: titulo,
    fontWeight: "bold",
    backgroundColor: FONDO_CABECERA,
    color: TINTA,
    borderBottomColor: LINEA,
    borderBottomStyle: "thin",
  };
}

function texto(valor: string | null | undefined, suave = false): CeldaDeExcel {
  return { value: valor ?? "", color: suave ? TINTA_SUAVE : TINTA };
}

function siONo(marcada: boolean): CeldaDeExcel {
  return { value: marcada ? "Sí" : "No", color: marcada ? TINTA : TINTA_SUAVE };
}

function dinero(importe: number): CeldaDeExcel {
  return { value: importe, type: Number, format: FORMATO_DE_DINERO, color: TINTA };
}

/**
 * Un día AAAA-MM-DD como fecha de Excel. Se construye en UTC por lo que
 * explica `comoDiaDeExcel` en excelDeCampanas.ts: Excel guarda días, y
 * con una medianoche local la celda caería en el día anterior.
 */
function fecha(dia: string | null): CeldaDeExcel | null {
  const partes = dia === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);

  if (partes === null) return null;

  const [, anio, mes, numeroDelDia] = partes;

  return {
    value: new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(numeroDelDia))),
    type: Date,
    format: FORMATO_DE_FECHA,
    color: TINTA,
  };
}

/** «5 de octubre de 2026, 21:30», en la hora de quien descarga. */
function textoDeFechaYHora(momentoIso: string): string {
  return new Date(momentoIso).toLocaleString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
