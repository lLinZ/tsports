/**
 * utilidades/excelDeCampanas.ts
 * ---------------------------------------------------------------------
 * El reporte del calendario, como libro de Excel de verdad.
 *
 * Antes esto era un CSV: una sola tabla sin cabecera, sin formato y sin
 * el resumen que se ve en pantalla. Servía para volcar datos, no para
 * enseñárselo a nadie. Lo que se entrega ahora es un libro con tres
 * hojas, cada una contestando una pregunta distinta:
 *
 *   · RESUMEN   → "¿cómo fue el periodo?". Portada con el nombre de la
 *     agencia, el periodo y de quién es la agenda, las cifras grandes y
 *     los tres desgloses (campaña, zona y agente) que ya están debajo
 *     del calendario.
 *   · ACCIONES  → "¿qué se hizo exactamente?". Una fila por acción, con
 *     la cabecera congelada para que no se pierda al bajar, y una banda
 *     de color a la izquierda con el color de su campaña: el mismo de
 *     la leyenda del calendario, así el papel y la pantalla se leen
 *     igual.
 *   · POR DÍA   → "¿cómo se repartió el esfuerzo?". Los días con
 *     actividad, cuántas acciones cayeron en cada uno y de qué campañas.
 *
 * DE DÓNDE SALEN LOS DATOS
 * De lo que ya está en pantalla, que es lo que el servidor devolvió para
 * ese periodo. No se vuelve a preguntar: así el fichero dice exactamente
 * lo mismo que el calendario que se estaba mirando, sin ventana para que
 * los dos se separen.
 *
 * POR QUÉ SE CARGA APARTE
 * La librería que escribe el .xlsx se pide con `import()` dentro de la
 * función, no arriba del fichero. Es el único sitio del sistema que la
 * necesita y pesa lo suyo: cargándola así, quien nunca descarga el
 * reporte no la descarga tampoco.
 * ---------------------------------------------------------------------
 */
import { comoFechaLocal } from "@/utilidades/formato";
import type { DiaDelCalendario, PeriodoDelCalendario } from "@/tipos/modelos";

/* ==================================================================== */
/* La paleta del documento                                             */
/* ==================================================================== */

/**
 * Los colores de la papelería de TS Sports, los mismos de la propuesta
 * y del anexo en PDF que recibe el cliente.
 *
 * No se usa el color de acento del perfil: ese sirve para reconocer de
 * un vistazo qué sesión está abierta, y un reporte que sale de la
 * agencia tiene que verse igual lo descargue quien lo descargue.
 */
const COLOR = {
  turquesa: "#1B9AAA",
  tinta: "#202124",
  grisTexto: "#5F6368",
  grisSuave: "#9AA0A6",
  lineaSuave: "#E8EAED",
  fondoBanda: "#F1F3F4",
  blanco: "#FFFFFF",
} as const;

/** Nombres de los días, empezando en domingo como `Date.getDay()`. */
const DIAS_DE_LA_SEMANA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/** Ancho de las columnas de la hoja de resumen, en caracteres. */
const ANCHOS_DEL_RESUMEN = [{ width: 4 }, { width: 34 }, { width: 14 }, { width: 14 }];

/** Ancho de las columnas de la hoja de acciones. */
const ANCHOS_DE_ACCIONES = [
  { width: 3 },
  { width: 12 },
  { width: 12 },
  { width: 34 },
  { width: 26 },
  { width: 18 },
  { width: 24 },
  { width: 24 },
];

/** Ancho de las columnas de la hoja del reparto por día. */
const ANCHOS_POR_DIA = [
  { width: 12 },
  { width: 12 },
  { width: 11 },
  { width: 52 },
];

/* ==================================================================== */
/* La función que usa el calendario                                    */
/* ==================================================================== */

/**
 * Arma el libro y lo descarga.
 *
 * Devuelve una promesa que se resuelve cuando el fichero ya está en la
 * carpeta de descargas, para que la pantalla pueda enseñar "generando…"
 * mientras tanto: con un mes cargado, escribir el .xlsx tarda lo
 * suficiente como para que un botón que no responde parezca roto.
 */
export async function descargarElReporteEnExcel(
  reporte: PeriodoDelCalendario,
): Promise<void> {
  const { periodo, dias } = reporte;

  // La librería se pide aquí y no arriba: ver la cabecera del fichero.
  const { default: escribirLibroDeExcel } = await import(
    "write-excel-file/browser"
  );

  await escribirLibroDeExcel([
    {
      sheet: "Resumen",
      data: hojaDeResumen(reporte),
      columns: ANCHOS_DEL_RESUMEN,
      // Sin la cuadrícula gris de fondo: es una portada, no una tabla.
      showGridLines: false,
    },
    {
      sheet: "Acciones",
      data: hojaDeAcciones(dias),
      columns: ANCHOS_DE_ACCIONES,
      // La cabecera se queda clavada arriba: un mes son decenas de
      // filas y sin esto se pierde de vista a la tercera pantalla.
      stickyRowsCount: 1,
    },
    {
      sheet: "Por día",
      data: hojaDelRepartoPorDia(dias),
      columns: ANCHOS_POR_DIA,
      stickyRowsCount: 1,
    },
  ]).toFile(nombreDelFichero(periodo));
}

/** "TS-Sports-campanas-2026-09-01-a-2026-09-30.xlsx". */
function nombreDelFichero(periodo: PeriodoDelCalendario["periodo"]): string {
  return `TS-Sports-campanas-${periodo.desde}-a-${periodo.hasta}.xlsx`;
}

/* ==================================================================== */
/* Hoja 1 · Resumen                                                    */
/* ==================================================================== */

function hojaDeResumen(reporte: PeriodoDelCalendario) {
  const { periodo, dias, resumen } = reporte;

  const diasConActividad = dias.filter((dia) => dia.eventos.length > 0).length;

  const filas: FilaDeExcel[] = [
    // --- Portada -----------------------------------------------------
    [
      {
        value: "TS SPORTS",
        fontSize: 16,
        fontWeight: "bold",
        textColor: COLOR.blanco,
        backgroundColor: COLOR.turquesa,
        alignVertical: "center",
        height: 30,
        columnSpan: 4,
      },
    ],
    [
      {
        value: "Reporte de acciones de campaña",
        fontSize: 11,
        textColor: COLOR.blanco,
        backgroundColor: COLOR.turquesa,
        alignVertical: "center",
        height: 20,
        columnSpan: 4,
      },
    ],
    [],
    [
      {
        value: periodo.etiqueta,
        fontSize: 13,
        fontWeight: "bold",
        textColor: COLOR.tinta,
        columnSpan: 4,
      },
    ],
    [
      {
        // De quién es la agenda lo dice el servidor con `esSoloMia`;
        // aquí no se compara ningún rol, igual que en la pantalla.
        value: [
          periodo.esSoloMia ? "Mis marcas" : "Toda la agencia",
          `Del ${textoDeFecha(periodo.desde)} al ${textoDeFecha(periodo.hasta)}`,
          `Generado el ${textoDeFechaYHora(new Date())}`,
        ].join("   ·   "),
        fontSize: 9,
        textColor: COLOR.grisSuave,
        columnSpan: 4,
      },
    ],
    [],

    // --- Las cifras del periodo --------------------------------------
    ...bandaDeSeccion("EL PERIODO EN CIFRAS"),
    filaDeCifra("Acciones programadas", resumen.totalDeAcciones),
    filaDeCifra("Marcas distintas alcanzadas", resumen.marcasDistintas),
    filaDeCifra("Días con actividad", diasConActividad),
    filaDeCifra("Campañas implicadas", resumen.porCampana.length),
    [],

    // --- Los tres desgloses ------------------------------------------
    // Son los mismos que se ven bajo el calendario y en el mismo orden,
    // para que quien mire el fichero reconozca lo que tenía en pantalla.
    ...bandaDeSeccion("POR CAMPAÑA"),
    filaDeEncabezado(["", "Campaña", "Acciones", "% del total"]),
    ...resumen.porCampana.map((fila) => [
      // El cuadrito de color: es lo que ata esta tabla a la leyenda del
      // calendario y a la banda de la hoja de acciones.
      celdaDeColor(fila.color),
      celdaDeTexto(fila.etiqueta),
      celdaDeTotal(fila.total),
      celdaDeParte(fila.total, resumen.totalDeAcciones),
    ]),
    [],

    ...bandaDeSeccion("POR ZONA"),
    filaDeEncabezado(["", "Zona", "Acciones", "% del total"]),
    ...resumen.porZona.map((fila) => [
      null,
      celdaDeTexto(fila.etiqueta),
      celdaDeTotal(fila.total),
      celdaDeParte(fila.total, resumen.totalDeAcciones),
    ]),
    [],
  ];

  // El desglose por agente sobra cuando la agenda ya es de una sola
  // persona: sería una lista de un elemento repitiendo el total que
  // está unas filas más arriba. Mismo criterio que en pantalla.
  if (!periodo.esSoloMia) {
    filas.push(
      ...bandaDeSeccion("POR AGENTE"),
      filaDeEncabezado(["", "Agente", "Acciones", "% del total"]),
      ...resumen.porVendedor.map((fila) => [
        null,
        celdaDeTexto(fila.etiqueta),
        celdaDeTotal(fila.total),
        celdaDeParte(fila.total, resumen.totalDeAcciones),
      ]),
    );
  }

  return filas;
}

/* ==================================================================== */
/* Hoja 2 · El detalle, una fila por acción                            */
/* ==================================================================== */

function hojaDeAcciones(dias: DiaDelCalendario[]) {
  const filas: FilaDeExcel[] = [
    filaDeCabeceraDeTabla([
      "",
      "Fecha",
      "Día",
      "Marca",
      "Campaña",
      "Zona",
      "Sector",
      "Agente",
    ]),
  ];

  for (const dia of dias) {
    for (const evento of dia.eventos) {
      filas.push([
        celdaDeColor(evento.campanaColor),
        celdaDeFecha(dia.fecha),
        celdaDeCuerpo(nombreDelDia(dia.fecha)),
        // El nombre de la marca en negrita: es la columna por la que se
        // busca cuando alguien abre el fichero.
        { ...celdaDeCuerpo(evento.marcaNombre), fontWeight: "bold" },
        celdaDeCuerpo(evento.campanaNombre),
        celdaDeCuerpo(evento.zona),
        celdaDeCuerpo(evento.sector),
        celdaDeCuerpo(evento.vendedorNombre),
      ]);
    }
  }

  // Un periodo sin nada no debería llegar hasta aquí —el botón está
  // apagado—, pero una hoja con solo la cabecera se lee como un fichero
  // roto, así que se dice en su idioma qué pasó.
  if (filas.length === 1) {
    filas.push([
      null,
      {
        value: "No hay ninguna acción de campaña programada en este periodo.",
        textColor: COLOR.grisSuave,
        fontStyle: "italic",
        columnSpan: 7,
      },
    ]);
  }

  return filas;
}

/* ==================================================================== */
/* Hoja 3 · Cómo se repartió el esfuerzo                               */
/* ==================================================================== */

function hojaDelRepartoPorDia(dias: DiaDelCalendario[]) {
  const filas: FilaDeExcel[] = [
    filaDeCabeceraDeTabla(["Fecha", "Día", "Acciones", "Campañas del día"]),
  ];

  // Solo los días con algo. Los vacíos no añaden información aquí —el
  // calendario ya enseña los huecos— y alargarían la hoja hasta hacerla
  // incómoda de recorrer.
  for (const dia of dias) {
    if (dia.eventos.length === 0) continue;

    const campanasDelDia = [
      ...new Set(dia.eventos.map((evento) => evento.campanaNombre)),
    ];

    filas.push([
      celdaDeFecha(dia.fecha),
      celdaDeCuerpo(nombreDelDia(dia.fecha)),
      celdaDeTotal(dia.eventos.length),
      celdaDeCuerpo(campanasDelDia.join(", ")),
    ]);
  }

  return filas;
}

/* ==================================================================== */
/* Piezas de maquetación                                               */
/* ==================================================================== */

/**
 * Una fila del libro.
 *
 * Se declara a mano en vez de importar el tipo de la librería porque
 * ese solo está disponible tras el `import()` dinámico, y el fichero
 * tiene que poder tipar sus funciones sin haberla cargado.
 */
type CeldaDeExcel = {
  value?: string | number | Date;
  type?: DateConstructor;
  format?: string;
  fontSize?: number;
  fontWeight?: "bold";
  fontStyle?: "italic";
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
  alignVertical?: "top" | "center" | "bottom";
  height?: number;
  columnSpan?: number;
  bottomBorderColor?: string;
  bottomBorderStyle?: "thin";
};

type FilaDeExcel = (CeldaDeExcel | null)[];

/** El título de un bloque, en su banda gris a lo ancho de la hoja. */
function bandaDeSeccion(titulo: string): FilaDeExcel[] {
  return [
    [
      {
        value: titulo,
        fontSize: 10,
        fontWeight: "bold",
        textColor: COLOR.tinta,
        backgroundColor: COLOR.fondoBanda,
        alignVertical: "center",
        height: 20,
        columnSpan: 4,
      },
    ],
  ];
}

/** "Acciones programadas … 37", con la cifra grande a la derecha. */
function filaDeCifra(etiqueta: string, valor: number): FilaDeExcel {
  return [
    null,
    { value: etiqueta, fontSize: 10, textColor: COLOR.grisTexto },
    {
      value: valor,
      fontSize: 12,
      fontWeight: "bold",
      textColor: COLOR.turquesa,
      align: "right",
    },
  ];
}

/** El encabezado de una tabla del resumen: negrita y una línea debajo. */
function filaDeEncabezado(titulos: string[]): FilaDeExcel {
  return titulos.map((titulo, posicion) => ({
    value: titulo,
    fontSize: 9,
    fontWeight: "bold" as const,
    textColor: COLOR.grisTexto,
    bottomBorderColor: COLOR.lineaSuave,
    bottomBorderStyle: "thin" as const,
    align: posicion >= 2 ? ("right" as const) : ("left" as const),
  }));
}

/** La cabecera oscura de las hojas que son una tabla de arriba abajo. */
function filaDeCabeceraDeTabla(titulos: string[]): FilaDeExcel {
  return titulos.map((titulo) => ({
    value: titulo,
    fontSize: 10,
    fontWeight: "bold" as const,
    textColor: COLOR.blanco,
    backgroundColor: COLOR.tinta,
    alignVertical: "center" as const,
    height: 22,
  }));
}

/** El cuadrito con el color de la campaña. No lleva texto: es la clave. */
function celdaDeColor(color: string): CeldaDeExcel {
  return { backgroundColor: color };
}

function celdaDeTexto(texto: string): CeldaDeExcel {
  return { value: texto, fontSize: 10, textColor: COLOR.tinta };
}

function celdaDeTotal(total: number): CeldaDeExcel {
  return {
    value: total,
    fontSize: 10,
    fontWeight: "bold",
    textColor: COLOR.tinta,
    align: "right",
  };
}

/**
 * Qué parte del periodo se lleva esta fila.
 *
 * Se calcula aquí porque no es una cifra del sistema sino una lectura
 * del propio documento: las dos columnas de las que sale están en la
 * misma hoja, unas celdas más a la izquierda.
 */
function celdaDeParte(total: number, totalDelPeriodo: number): CeldaDeExcel {
  return {
    value: totalDelPeriodo > 0 ? total / totalDelPeriodo : 0,
    // Excel guarda los porcentajes como la fracción y los pinta con este
    // formato; escribir "37 %" como texto daría una columna que no se
    // puede sumar ni ordenar.
    format: "0.0%",
    fontSize: 10,
    textColor: COLOR.grisTexto,
    align: "right",
  };
}

/** Una celda cualquiera del cuerpo de una tabla, con su línea debajo. */
function celdaDeCuerpo(texto: string | null): CeldaDeExcel {
  return {
    value: texto ?? "—",
    fontSize: 10,
    textColor: texto === null ? COLOR.grisSuave : COLOR.tinta,
    bottomBorderColor: COLOR.lineaSuave,
    bottomBorderStyle: "thin",
  };
}

/**
 * La fecha, como fecha de verdad y no como texto.
 *
 * Así la columna se ordena, se filtra y se agrupa en Excel como toca, y
 * quien reciba el fichero puede montar una tabla dinámica con ella.
 */
function celdaDeFecha(fecha: string): CeldaDeExcel {
  return {
    value: comoDiaDeExcel(fecha),
    type: Date,
    format: "dd/mm/yyyy",
    fontSize: 10,
    textColor: COLOR.tinta,
    bottomBorderColor: COLOR.lineaSuave,
    bottomBorderStyle: "thin",
  };
}

/**
 * El día "2026-09-20" convertido a la fecha que espera la celda.
 *
 * Aquí, y SOLO aquí, se construye en UTC. Excel no guarda fechas sino el
 * número de días transcurridos desde 1900, y la librería lo saca de
 * `getTime()`, que cuenta desde Greenwich. Con una medianoche local el
 * número sale con decimales —las cuatro horas que Venezuela va por
 * detrás— y en un ordenador configurado al este de Londres cae en el día
 * anterior: la acción del 20 se leería como del 19.
 *
 * No contradice la regla del día local (regla 16), la cumple: lo que
 * esa regla prohíbe es que un día del calendario se lea como un instante
 * distinto según el huso de quien mira, que es justo lo que se evita.
 * Para el texto —el nombre del día, las fechas de la portada— sí se usa
 * `comoFechaLocal`, porque ahí se pinta y no se calcula nada.
 */
function comoDiaDeExcel(fecha: string): Date | undefined {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);

  if (partes === null) return undefined;

  const [, anio, mes, dia] = partes;

  return new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
}

/** "Martes", a partir de "2026-09-22". */
function nombreDelDia(fecha: string): string {
  const comoDate = comoFechaLocal(fecha);

  return comoDate === null ? "—" : DIAS_DE_LA_SEMANA[comoDate.getDay()];
}

/** "20 sep 2026", para la portada. */
function textoDeFecha(fecha: string): string {
  const comoDate = comoFechaLocal(fecha);

  return comoDate === null
    ? "—"
    : comoDate.toLocaleDateString("es", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}

/** "22 de septiembre de 2026, 14:05", para el pie de la portada. */
function textoDeFechaYHora(momento: Date): string {
  return momento.toLocaleString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
