/**
 * utilidades/exportarBitacora.ts
 * ---------------------------------------------------------------------
 * Sacar el histórico de la bitácora en un fichero: hoja de cálculo o
 * documento para leer e imprimir.
 *
 * DOS FORMATOS PORQUE SIRVEN PARA DOS COSAS
 *
 *   · **Excel** es para cruzar y filtrar: una fila por entrada, con la
 *     marca, el autor y la fecha en columnas.
 *   · **El documento** es para leerlo o archivarlo: cronológico, con
 *     cada respuesta colgando de su entrada. Una conversación en una
 *     hoja de cálculo no se lee.
 *
 * EL PDF LO HACE EL NAVEGADOR, no una librería. Se arma el documento en
 * HTML y se manda a imprimir; desde ahí, «Guardar como PDF» está en el
 * mismo diálogo en Chrome, Edge, Firefox y Safari. La alternativa era
 * meter un generador de PDF entero —cientos de kilobytes que se
 * descargarían aunque nadie exportase nunca— para conseguir un
 * resultado peor en tipografía y en saltos de página.
 *
 * Se imprime desde un marco oculto y no desde una ventana nueva: una
 * ventana la bloquea el navegador si no le consta que la abrió una
 * persona, y ese fallo es silencioso.
 * ---------------------------------------------------------------------
 */
import type { EntradaDelHistorico, HistoricoDeBitacora } from "@/tipos/modelos";
import { formatearFechaYHora } from "@/utilidades/formato";

/** La paleta de documento de TS Sports, la misma del reporte del calendario. */
const TINTA = "#202124";
const TINTA_SUAVE = "#5F6368";
const TINTA_TENUE = "#9AA0A6";
const LINEA = "#E8EAED";
const MARCA = "#1B9AAA";

/* ==================================================================== */
/* Hoja de cálculo                                                      */
/* ==================================================================== */

/** Anchos de las columnas, en caracteres. */
const ANCHOS = [
  { width: 26 }, // Marca
  { width: 18 }, // Fecha
  { width: 22 }, // Autor
  { width: 10 }, // Tipo
  { width: 70 }, // Texto
  { width: 26 }, // Etiquetados
  { width: 12 }, // Reacciones
  { width: 24 }, // Estado
];

/**
 * Una celda, con lo que de verdad se usa de la librería.
 *
 * Mismo criterio que en `excelDeCampanas.ts`: los tipos que trae
 * `write-excel-file` son una unión enorme y TypeScript no consigue
 * encajar una lista de celdas heterogéneas con ninguna de sus
 * sobrecargas.
 */
type CeldaDeExcel = {
  value?: string | number | Date;
  type?: DateConstructor | NumberConstructor;
  format?: string;
  fontWeight?: "bold";
  color?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
  wrap?: boolean;
  borderBottomColor?: string;
  borderBottomStyle?: "thin";
};

type FilaDeExcel = (CeldaDeExcel | null)[];

export async function descargarLaBitacoraEnExcel(
  historico: HistoricoDeBitacora,
): Promise<void> {
  // El escritor de .xlsx se pide solo aquí: tiene su propio paquete en
  // vite.config.ts y no se descarga al entrar (ver CLAUDE.md).
  const { default: escribirLibroDeExcel } = await import("write-excel-file/browser");

  const cabecera = [
    "Marca",
    "Fecha",
    "Autor",
    "Tipo",
    "Texto",
    "Etiquetados",
    "Reacciones",
    "Estado",
  ].map((titulo): CeldaDeExcel => ({
    value: titulo,
    fontWeight: "bold" as const,
    backgroundColor: "#F1F3F4",
    color: TINTA,
    borderBottomColor: LINEA,
    borderBottomStyle: "thin" as const,
  }));

  const filas = historico.entradas.map((entrada): FilaDeExcel => [
    { value: entrada.marcaNombre, color: TINTA_SUAVE },
    { value: comoFechaDeExcel(entrada.fecha), type: Date, format: "dd/mm/yyyy hh:mm" },
    { value: entrada.autorNombre, color: TINTA },
    { value: entrada.esRespuesta ? "Respuesta" : "Entrada", color: TINTA_TENUE },
    { value: entrada.eliminado ? "" : entrada.cuerpo, color: TINTA, wrap: true },
    { value: entrada.mencionados.join(", "), color: TINTA_SUAVE },
    { value: entrada.totalReacciones, type: Number, align: "center" as const },
    { value: estadoDeLaEntrada(entrada), color: TINTA_TENUE },
  ]);

  await escribirLibroDeExcel([cabecera, ...filas], {
    columns: ANCHOS,
    // La cabecera se queda a la vista al bajar por un histórico largo.
    stickyRowsCount: 1,
  }).toFile(nombreDelFichero(historico, "xlsx"));
}

/**
 * Las fechas se escriben como fecha de verdad, no como texto, para que
 * en la hoja se puedan ordenar y filtrar por mes.
 *
 * Se arman en UTC a propósito: la librería convierte el `Date` a número
 * de serie con `getTime()`, que es UTC, así que pasarle una fecha local
 * desplazaría la hora —y al este de Londres, el día.
 */
function comoFechaDeExcel(fechaIso: string | null): Date | undefined {
  if (fechaIso === null) return undefined;

  const fecha = new Date(fechaIso);

  if (Number.isNaN(fecha.getTime())) return undefined;

  return new Date(
    Date.UTC(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate(),
      fecha.getHours(),
      fecha.getMinutes(),
    ),
  );
}

function estadoDeLaEntrada(entrada: EntradaDelHistorico): string {
  if (entrada.eliminado) {
    return `Eliminada por ${entrada.eliminadoPorNombre ?? "alguien"}`;
  }

  return entrada.editado ? "Editada" : "";
}

/* ==================================================================== */
/* Documento para leer o imprimir                                       */
/* ==================================================================== */

/**
 * Arma el histórico como documento y abre el diálogo de impresión, desde
 * donde se guarda como PDF.
 */
export function imprimirLaBitacora(historico: HistoricoDeBitacora): void {
  const marco = document.createElement("iframe");

  // Fuera de la vista pero DENTRO del documento: un iframe con
  // `display: none` no imprime en algunos navegadores.
  marco.setAttribute("aria-hidden", "true");
  marco.style.position = "fixed";
  marco.style.right = "0";
  marco.style.bottom = "0";
  marco.style.width = "0";
  marco.style.height = "0";
  marco.style.border = "0";

  document.body.appendChild(marco);

  const documentoDelMarco = marco.contentDocument;

  if (documentoDelMarco === null) {
    marco.remove();

    return;
  }

  documentoDelMarco.open();
  documentoDelMarco.write(documentoImprimible(historico));
  documentoDelMarco.close();

  // Se espera a que el marco termine de montar su documento: llamar a
  // print() antes deja una hoja en blanco.
  marco.onload = () => {
    marco.contentWindow?.focus();
    marco.contentWindow?.print();

    // Se quita después, no al instante: en Safari, quitar el marco
    // mientras el diálogo está abierto cancela la impresión.
    window.setTimeout(() => marco.remove(), 60_000);
  };
}

function documentoImprimible(historico: HistoricoDeBitacora): string {
  const titulo =
    historico.alcance === "marca"
      ? `Bitácora · ${historico.marcaNombre ?? ""}`
      : "Bitácora completa";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapar(titulo)}</title>
<style>
  /* Sin tipografías de fuera: al imprimir puede no haber red, y una
     fuente que no carga cambia el número de páginas. */
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    color: ${TINTA};
    margin: 0;
    padding: 32px 36px;
    font-size: 11pt;
    line-height: 1.5;
  }
  header { border-bottom: 2px solid ${MARCA}; padding-bottom: 12px; margin-bottom: 20px; }
  .marca { color: ${MARCA}; font-weight: 800; letter-spacing: -0.02em; font-size: 13pt; }
  h1 { font-size: 17pt; margin: 6px 0 2px; letter-spacing: -0.02em; }
  .pie-de-cabecera { color: ${TINTA_SUAVE}; font-size: 9pt; }

  .entrada { padding: 10px 0; border-bottom: 1px solid ${LINEA}; }
  /* Una entrada no se parte entre dos páginas si se puede evitar. */
  .entrada { break-inside: avoid; }
  .respuesta { margin-left: 28px; border-left: 2px solid ${LINEA}; padding-left: 12px; }

  .cabecera-entrada { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
  .autor { font-weight: 700; }
  .fecha { color: ${TINTA_TENUE}; font-size: 9pt; }
  .apunte { color: ${TINTA_SUAVE}; font-size: 9pt; font-style: italic; }
  .de-la-marca { color: ${TINTA_SUAVE}; font-size: 9pt; }

  .texto { white-space: pre-wrap; word-break: break-word; margin: 0; }
  .eliminada .texto { color: ${TINTA_TENUE}; font-style: italic; }

  .etiquetados { color: ${TINTA_SUAVE}; font-size: 9pt; margin-top: 4px; }

  .sin-entradas { color: ${TINTA_TENUE}; font-style: italic; }

  @page { margin: 16mm; }
</style>
</head>
<body>
<header>
  <div class="marca">TS SPORTS</div>
  <h1>${escapar(titulo)}</h1>
  <div class="pie-de-cabecera">
    ${historico.entradas.length} ${historico.entradas.length === 1 ? "entrada" : "entradas"} ·
    Generado por ${escapar(historico.generadoPor)} el ${escapar(formatearFechaYHora(historico.generadoEn))}
  </div>
</header>

${
  historico.entradas.length === 0
    ? '<p class="sin-entradas">Esta bitácora no tiene ninguna entrada todavía.</p>'
    : historico.entradas.map((entrada) => entradaImprimible(entrada, historico.alcance)).join("\n")
}
</body>
</html>`;
}

function entradaImprimible(
  entrada: EntradaDelHistorico,
  alcance: HistoricoDeBitacora["alcance"],
): string {
  const clases = [
    "entrada",
    entrada.esRespuesta ? "respuesta" : "",
    entrada.eliminado ? "eliminada" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Una entrada eliminada deja su hueco diciendo quién la quitó. Si
  // desapareciera, bastaría con borrar lo incómodo antes de exportar.
  const texto = entrada.eliminado
    ? `Entrada eliminada por ${escapar(entrada.eliminadoPorNombre ?? "alguien")}.`
    : escapar(entrada.cuerpo);

  return `<article class="${clases}">
  <div class="cabecera-entrada">
    <span class="autor">${escapar(entrada.autorNombre)}</span>
    <span class="fecha">${escapar(formatearFechaYHora(entrada.fecha))}</span>
    ${entrada.editado ? '<span class="apunte">editada</span>' : ""}
    ${alcance === "completa" ? `<span class="de-la-marca">· ${escapar(entrada.marcaNombre)}</span>` : ""}
  </div>
  <p class="texto">${texto}</p>
  ${
    entrada.mencionados.length > 0
      ? `<div class="etiquetados">Etiquetados: ${escapar(entrada.mencionados.join(", "))}</div>`
      : ""
  }
</article>`;
}

/**
 * Escapa lo que va dentro del HTML del documento.
 *
 * No es opcional: el texto lo escribe el equipo, y un comentario con un
 * `<` rompería la maqueta del documento entero.
 */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ==================================================================== */
/* Nombre del fichero                                                   */
/* ==================================================================== */

function nombreDelFichero(historico: HistoricoDeBitacora, extension: string): string {
  const dia = new Date(historico.generadoEn).toISOString().slice(0, 10);

  const quien =
    historico.alcance === "marca"
      ? (historico.marcaNombre ?? "marca")
          .normalize("NFD")
          // Fuera tildes y lo que no sea letra, número o espacio: el
          // nombre del fichero viaja por correo y por WhatsApp.
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-zA-Z0-9 ]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .toLowerCase()
      : "completa";

  return `bitacora-${quien}-${dia}.${extension}`;
}
