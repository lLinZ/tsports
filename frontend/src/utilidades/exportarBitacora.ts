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
 *
 * DOS DOCUMENTOS: el histórico (de una marca o de todas) y el REPORTE
 * POR FECHAS, que agrupa por marca lo escrito en un periodo y abre con
 * un resumen. Los dos comparten paleta, letra y forma de las entradas.
 * ---------------------------------------------------------------------
 */
import type {
  EntradaDelHistorico,
  EntradaDelReporte,
  HistoricoDeBitacora,
  MarcaDelReporte,
  ReporteDeBitacora,
} from "@/tipos/modelos";
import {
  formatearFecha,
  formatearFechaYHora,
  formatearPeriodo,
  inicialesDe,
} from "@/utilidades/formato";

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
  await escribirLaHoja(historico.entradas, nombreDelFichero(historico, "xlsx"));
}

/** El reporte por fechas, con la misma hoja: una fila por entrada. */
export async function descargarElReporteEnExcel(reporte: ReporteDeBitacora): Promise<void> {
  await escribirLaHoja(
    reporte.marcas.flatMap((marca) => marca.entradas),
    `reporte-bitacora-${reporte.desde}-a-${reporte.hasta}.xlsx`,
  );
}

async function escribirLaHoja(
  entradas: Array<EntradaDelHistorico | EntradaDelReporte>,
  nombreDeLaHoja: string,
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

  const filas = entradas.map((entrada): FilaDeExcel => [
    { value: entrada.marcaNombre, color: TINTA_SUAVE },
    { value: comoFechaDeExcel(entrada.fecha), type: Date, format: "dd/mm/yyyy hh:mm" },
    { value: entrada.autorNombre, color: TINTA },
    { value: tipoDeLaEntrada(entrada), color: TINTA_TENUE },
    { value: entrada.eliminado ? "" : entrada.cuerpo, color: TINTA, wrap: true },
    { value: entrada.mencionados.join(", "), color: TINTA_SUAVE },
    { value: entrada.totalReacciones, type: Number, align: "center" as const },
    { value: estadoDeLaEntrada(entrada), color: TINTA_TENUE },
  ]);

  await escribirLibroDeExcel([cabecera, ...filas], {
    columns: ANCHOS,
    // La cabecera se queda a la vista al bajar por un histórico largo.
    stickyRowsCount: 1,
  }).toFile(nombreDeLaHoja);
}

/**
 * «Entrada», «Respuesta» o, en el reporte, «Respuesta a Ana»: cuando la
 * entrada a la que responde quedó fuera del periodo, la fila tiene que
 * decir a quién contestaba o no se entiende sola.
 */
function tipoDeLaEntrada(entrada: EntradaDelHistorico | EntradaDelReporte): string {
  if (!entrada.esRespuesta) return "Entrada";

  if ("respondeA" in entrada && entrada.respondeA !== null) {
    return `Respuesta a ${entrada.respondeA.autorNombre}`;
  }

  return "Respuesta";
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
  imprimirDocumento(documentoImprimible(historico));
}

/** El reporte por fechas como documento, listo para guardar en PDF. */
export function imprimirElReporteDeBitacora(reporte: ReporteDeBitacora): void {
  imprimirDocumento(reporteImprimible(reporte));
}

function imprimirDocumento(html: string): void {
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
  documentoDelMarco.write(html);
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

/* ==================================================================== */
/* El reporte por fechas                                                */
/* ==================================================================== */

/** Los dos fondos del reporte, sobre la paleta de arriba. */
const FONDO_SUAVE = "#F6F8F9";
const MARCA_SUAVE = "#E7F5F7";

/**
 * El reporte arranca con lo que se quiere saber antes de leer nada —el
 * periodo, cuánto se escribió, en qué marcas y quién—, y después va
 * marca por marca, empezando por la que más movimiento tuvo, que es el
 * orden en que lo manda el servidor.
 */
function reporteImprimible(reporte: ReporteDeBitacora): string {
  const periodo = formatearPeriodo(reporte.desde, reporte.hasta);
  const { resumen } = reporte;

  const alcance =
    reporte.alcance === "todas"
      ? "Todas las marcas"
      : reporte.marcasElegidas.length === 1
        ? `Solo ${reporte.marcasElegidas[0].nombre}`
        : `${reporte.marcasElegidas.length} marcas elegidas: ${reporte.marcasElegidas
            .map((marca) => marca.nombre)
            .join(", ")}`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapar(`Reporte de bitácora · ${periodo}`)}</title>
<style>
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    color: ${TINTA};
    margin: 0;
    padding: 28px 34px;
    font-size: 10.5pt;
    line-height: 1.5;
  }

  .portada { background: ${MARCA}; color: #fff; border-radius: 14px; padding: 22px 26px 20px; margin-bottom: 22px; }
  .sello { display: flex; align-items: center; gap: 10px; font-size: 9pt; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.92; }
  .sello .logo { display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 8px; background: #fff; color: ${MARCA}; font-weight: 800; letter-spacing: 0; }
  .sello .separador { opacity: 0.6; }
  .portada h1 { font-size: 20pt; line-height: 1.2; margin: 12px 0 4px; letter-spacing: -0.02em; }
  .portada .alcance { margin: 0; font-size: 10pt; opacity: 0.9; }
  .cifras { display: flex; gap: 10px; margin-top: 16px; }
  .cifras div { flex: 1; background: rgba(255,255,255,0.14); border-radius: 10px; padding: 8px 12px; }
  .cifras strong { display: block; font-size: 17pt; line-height: 1.1; }
  .cifras span { font-size: 8.5pt; opacity: 0.9; }
  .generado { margin-top: 12px; font-size: 8.5pt; opacity: 0.8; }

  .resumen { display: flex; gap: 22px; margin-bottom: 26px; break-inside: avoid; }
  .resumen .columna { flex: 3; }
  .resumen .estrecha { flex: 2; }
  h2.apartado { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; color: ${TINTA_SUAVE}; margin: 0 0 8px; }
  table.tabla { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .tabla th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: ${TINTA_TENUE}; font-weight: 600; padding: 0 6px 5px 0; border-bottom: 1px solid ${LINEA}; }
  .tabla td { padding: 5px 6px 5px 0; border-bottom: 1px solid ${LINEA}; vertical-align: top; }
  .tabla .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
  .tabla .tenue { color: ${TINTA_SUAVE}; }

  .marca { margin-bottom: 22px; }
  .cabecera-marca { display: flex; align-items: center; gap: 12px; background: ${FONDO_SUAVE}; border: 1px solid ${LINEA}; border-left: 4px solid ${MARCA}; border-radius: 12px; padding: 10px 14px; margin-bottom: 6px; break-after: avoid; }
  .logo-marca { width: 38px; height: 38px; border-radius: 10px; background: #fff; border: 1px solid ${LINEA}; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 700; color: ${TINTA_TENUE}; font-size: 10pt; }
  .logo-marca img { width: 100%; height: 100%; object-fit: cover; }
  .datos-marca { flex: 1; min-width: 0; }
  .datos-marca h2 { font-size: 12.5pt; margin: 0; letter-spacing: -0.01em; }
  .datos-marca p { margin: 1px 0 0; font-size: 8.5pt; color: ${TINTA_SUAVE}; }
  .contador { text-align: right; font-size: 8.5pt; color: ${TINTA_SUAVE}; flex-shrink: 0; }
  .contador strong { display: block; font-size: 14pt; line-height: 1.1; color: ${MARCA}; }

  .entrada { display: flex; gap: 10px; padding: 9px 4px 9px 6px; border-bottom: 1px solid ${LINEA}; break-inside: avoid; }
  .respuesta { margin-left: 30px; padding-left: 12px; border-left: 2px solid ${LINEA}; }
  .avatar { width: 26px; height: 26px; border-radius: 8px; background: ${MARCA_SUAVE}; color: ${MARCA}; font-size: 8pt; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .cuerpo-entrada { flex: 1; min-width: 0; }
  .cabecera-entrada { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .autor { font-weight: 700; }
  .fecha { color: ${TINTA_TENUE}; font-size: 8.5pt; }
  .apunte { color: ${TINTA_SUAVE}; font-size: 8.5pt; font-style: italic; }
  .contexto { margin: 3px 0 2px; font-size: 8.5pt; color: ${TINTA_SUAVE}; background: ${FONDO_SUAVE}; border-radius: 6px; padding: 3px 8px; }
  .texto { white-space: pre-wrap; word-break: break-word; margin: 2px 0 0; }
  .eliminada .texto { color: ${TINTA_TENUE}; font-style: italic; }
  .etiquetados { color: ${TINTA_SUAVE}; font-size: 8.5pt; margin-top: 3px; }

  .sin-entradas { color: ${TINTA_SUAVE}; font-style: italic; padding: 30px 0; text-align: center; }

  @page { margin: 14mm; }
</style>
</head>
<body>
<header class="portada">
  <div class="sello">
    <span class="logo">TS</span>
    <span>TS Sports</span>
    <span class="separador">·</span>
    <span>Reporte de bitácora</span>
  </div>
  <h1>Bitácora ${escapar(periodo)}</h1>
  <p class="alcance">${escapar(alcance)}</p>
  <div class="cifras">
    <div><strong>${resumen.totalEntradas}</strong><span>${resumen.totalEntradas === 1 ? "entrada" : "entradas"}</span></div>
    <div><strong>${resumen.totalMarcas}</strong><span>${resumen.totalMarcas === 1 ? "marca con movimiento" : "marcas con movimiento"}</span></div>
    <div><strong>${resumen.totalAutores}</strong><span>${resumen.totalAutores === 1 ? "persona escribió" : "personas escribieron"}</span></div>
  </div>
  <div class="generado">Generado por ${escapar(reporte.generadoPor)} el ${escapar(formatearFechaYHora(reporte.generadoEn))}</div>
</header>

${
  reporte.marcas.length === 0
    ? `<p class="sin-entradas">No se escribió nada en la bitácora ${escapar(periodo)}.</p>`
    : `${resumenImprimible(reporte)}\n${reporte.marcas.map(marcaImprimible).join("\n")}`
}
</body>
</html>`;
}

function resumenImprimible(reporte: ReporteDeBitacora): string {
  const filasDeMarcas = reporte.marcas
    .map(
      (marca) => `<tr>
        <td>${escapar(marca.marcaNombre)}</td>
        <td class="tenue">${escapar(marca.agenteNombre ?? "Sin asignar")}</td>
        <td class="num">${marca.totalEntradas}</td>
      </tr>`,
    )
    .join("");

  const filasDeAutores = reporte.resumen.porAutor
    .map(
      (autor) => `<tr>
        <td>${escapar(autor.nombre)}</td>
        <td class="num">${autor.total}</td>
      </tr>`,
    )
    .join("");

  return `<section class="resumen">
  <div class="columna">
    <h2 class="apartado">Marcas del periodo</h2>
    <table class="tabla">
      <thead><tr><th>Marca</th><th>Agente</th><th class="num">Entradas</th></tr></thead>
      <tbody>${filasDeMarcas}</tbody>
    </table>
  </div>
  <div class="columna estrecha">
    <h2 class="apartado">Quién escribió</h2>
    <table class="tabla">
      <thead><tr><th>Persona</th><th class="num">Entradas</th></tr></thead>
      <tbody>${filasDeAutores}</tbody>
    </table>
  </div>
</section>`;
}

function marcaImprimible(marca: MarcaDelReporte): string {
  const datos = [
    marca.sector,
    marca.zona,
    marca.agenteNombre !== null ? `Agente: ${marca.agenteNombre}` : "Sin agente",
  ]
    .filter((dato): dato is string => Boolean(dato))
    .join(" · ");

  // El logo solo si es de este mismo servidor o va incrustado: al
  // imprimir puede no haber red, y una imagen de fuera que no carga deja
  // un hueco roto en el documento.
  const logo =
    marca.logoUrl !== null && (marca.logoUrl.startsWith("/") || marca.logoUrl.startsWith("data:"))
      ? `<img alt="" src="${escapar(marca.logoUrl)}">`
      : escapar(inicialesDe(marca.marcaNombre));

  return `<section class="marca">
  <div class="cabecera-marca">
    <div class="logo-marca">${logo}</div>
    <div class="datos-marca">
      <h2>${escapar(marca.marcaNombre)}</h2>
      <p>${escapar(datos)}</p>
    </div>
    <div class="contador"><strong>${marca.totalEntradas}</strong>${marca.totalEntradas === 1 ? "entrada" : "entradas"}</div>
  </div>
  ${marca.entradas.map(entradaDelReporteImprimible).join("\n")}
</section>`;
}

function entradaDelReporteImprimible(entrada: EntradaDelReporte): string {
  const clases = [
    "entrada",
    // Solo se sangra la respuesta que va debajo de su entrada. La que
    // responde a algo de antes del periodo va suelta, con su contexto.
    entrada.esRespuesta && entrada.respondeA === null ? "respuesta" : "",
    entrada.eliminado ? "eliminada" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const texto = entrada.eliminado
    ? `Entrada eliminada por ${escapar(entrada.eliminadoPorNombre ?? "alguien")}.`
    : escapar(entrada.cuerpo);

  const contexto =
    entrada.respondeA === null
      ? ""
      : `<p class="contexto">En respuesta a ${escapar(entrada.respondeA.autorNombre)} (${escapar(
          formatearFecha(entrada.respondeA.fecha),
        )})${
          entrada.respondeA.extracto !== null
            ? `: «${escapar(entrada.respondeA.extracto)}»`
            : ", una entrada que después se eliminó"
        }</p>`;

  return `<article class="${clases}">
  <span class="avatar">${escapar(inicialesDe(entrada.autorNombre))}</span>
  <div class="cuerpo-entrada">
    <div class="cabecera-entrada">
      <span class="autor">${escapar(entrada.autorNombre)}</span>
      <span class="fecha">${escapar(formatearFechaYHora(entrada.fecha))}</span>
      ${entrada.editado ? '<span class="apunte">editada</span>' : ""}
    </div>
    ${contexto}
    <p class="texto">${texto}</p>
    ${
      entrada.mencionados.length > 0
        ? `<div class="etiquetados">Etiquetados: ${escapar(entrada.mencionados.join(", "))}</div>`
        : ""
    }
  </div>
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
