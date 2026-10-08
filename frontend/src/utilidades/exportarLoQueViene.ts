/**
 * utilidades/exportarLoQueViene.ts
 * ---------------------------------------------------------------------
 * El reporte «Lo que viene» fuera de la pantalla, en las dos formas que
 * tienen los demás reportes:
 *
 *   · DOCUMENTO → para guardarlo en PDF desde el diálogo de impresión y
 *     mandarlo o llevarlo a la reunión del lunes: las cifras, quién tiene
 *     qué, lo atrasado y el día por día.
 *   · HOJA DE CÁLCULO → una fila por cosa planificada, para filtrar por
 *     persona o por tipo, y otra hoja con el reparto por persona.
 *
 * Sale de lo que ya está en pantalla, sin volver a preguntar: el servidor
 * ya decidió qué ve cada quien (ReporteDeLoQueVieneController), y los
 * días vienen redactados de allí para que pantalla, PDF y hoja digan lo
 * mismo. La librería de Excel se carga solo al descargar (ver CLAUDE.md,
 * «vendor-excel»).
 * ---------------------------------------------------------------------
 */
import { formatearFechaYHora } from "@/utilidades/formato";
import { imprimirDocumento } from "@/utilidades/imprimirDocumento";
import type {
  CosaDeLoQueViene,
  RecordatorioDeLoQueViene,
  ReporteDeLoQueViene,
  TipoDeContacto,
} from "@/tipos/modelos";

const TINTA = "#202124";
const TINTA_SUAVE = "#5F6368";
const TINTA_TENUE = "#9AA0A6";
const LINEA = "#E8EAED";
const MARCA_TS = "#1B9AAA";
const ROJO = "#C5221F";

/** Las columnas del reparto por persona, en el orden en que se leen. */
const COLUMNAS_POR_TIPO: Array<{ tipo: TipoDeContacto; titulo: string }> = [
  { tipo: "reunion", titulo: "Reuniones" },
  { tipo: "llamada", titulo: "Llamadas" },
  { tipo: "whatsapp", titulo: "WhatsApp" },
  { tipo: "correo", titulo: "Correos" },
];

/* ==================================================================== */
/* Para quién es y de cuándo                                            */
/* ==================================================================== */

/** «Todo el equipo», «Tus marcas» o el nombre de la persona elegida. */
export function deQuienEsElReporte(reporte: ReporteDeLoQueViene): string {
  if (reporte.persona !== null) return reporte.persona.nombre;

  return reporte.alcance === "empresa" ? "Todo el equipo" : "Tus marcas";
}

/** Cómo se dice cada tipo en una cuenta: «1 llamada», «3 reuniones». */
const EN_UNA_CUENTA: Record<TipoDeContacto | "otro", [string, string]> = {
  llamada: ["llamada", "llamadas"],
  whatsapp: ["WhatsApp", "WhatsApp"],
  reunion: ["reunión", "reuniones"],
  correo: ["correo", "correos"],
  otro: ["recordatorio", "recordatorios"],
};

/**
 * «2 reuniones · 3 llamadas · 1 recordatorio», con lo que el servidor
 * contó por tipo. Lo que no tiene tipo se cuenta como recordatorio.
 */
export function porTipoEnUnaFrase(porTipo: ReporteDeLoQueViene["resumen"]["porTipo"]): string {
  return porTipo
    .filter((fila) => fila.total > 0)
    .map((fila) => {
      const [singular, plural] = EN_UNA_CUENTA[fila.tipo ?? "otro"];

      return `${fila.total} ${fila.total === 1 ? singular : plural}`;
    })
    .join(" · ");
}

/** «Reunión», «Llamada», «Acción de campaña: Verano», «Recordatorio». */
export function queEs(cosa: CosaDeLoQueViene): string {
  if (cosa.clase === "campana") return `Acción de campaña: ${cosa.campana.nombre}`;

  return cosa.tipo?.etiqueta ?? "Recordatorio";
}

/** Quién la tiene que hacer: la persona del recordatorio o el agente de la marca. */
export function quienLaHace(cosa: CosaDeLoQueViene): string {
  if (cosa.clase === "campana") return cosa.agenteNombre ?? "Sin agente";

  return cosa.persona.nombre;
}

export function estadoDe(cosa: CosaDeLoQueViene): "Pendiente" | "Hecho" | "Atrasado" | "Agendada" {
  if (cosa.clase === "campana") return "Agendada";
  if (cosa.cumplido) return "Hecho";

  return cosa.vencido ? "Atrasado" : "Pendiente";
}

function nombreDelArchivo(reporte: ReporteDeLoQueViene): string {
  return `TS-Sports-lo-que-viene-${reporte.periodo.desde}-al-${reporte.periodo.hasta}`;
}

/* ==================================================================== */
/* Documento (PDF)                                                      */
/* ==================================================================== */

export async function imprimirLoQueViene(reporte: ReporteDeLoQueViene): Promise<void> {
  await imprimirDocumento(loQueVieneImprimible(reporte));
}

/** El documento en sí. Se exporta para poder verlo sin imprimirlo. */
export function loQueVieneImprimible(reporte: ReporteDeLoQueViene): string {
  const { resumen } = reporte;
  const tipos = porTipoEnUnaFrase(resumen.porTipo);

  const porPersona =
    reporte.alcance === "empresa" && reporte.persona === null && resumen.porPersona.length > 0
      ? `<section>
  <h2>Quién tiene qué</h2>
  <table>
    <thead><tr><th>Persona</th><th class="num">Por hacer</th>${COLUMNAS_POR_TIPO.map(
      (columna) => `<th class="num">${columna.titulo}</th>`,
    ).join("")}<th class="num">Acciones de campaña</th><th class="num">Atrasado</th></tr></thead>
    <tbody>${resumen.porPersona
      .map(
        (persona) => `<tr><td>${escapar(persona.nombre)}</td><td class="num"><strong>${persona.porHacer}</strong></td>${COLUMNAS_POR_TIPO.map(
          (columna) => `<td class="num">${persona.porTipo[columna.tipo] || ""}</td>`,
        ).join("")}<td class="num">${persona.acciones || ""}</td><td class="num${persona.atrasados > 0 ? " rojo" : ""}">${
          persona.atrasados || ""
        }</td></tr>`,
      )
      .join("")}</tbody>
  </table>
</section>`
      : "";

  const atrasados =
    reporte.atrasados.length > 0
      ? `<section>
  <h2 class="rojo">Atrasado · sigue pendiente de antes</h2>
  <table>${cabeceraDeCosas(true)}<tbody>${reporte.atrasados.map((cosa) => filaDeCosa(cosa, true)).join("")}</tbody></table>
</section>`
      : "";

  const dias =
    reporte.dias.length > 0
      ? reporte.dias
          .map(
            (dia) => `<section class="dia">
  <h2>${escapar(mayuscula(dia.etiqueta))}${dia.esHoy ? ' <span class="hoy">Hoy</span>' : ""}</h2>
  <table>${cabeceraDeCosas()}<tbody>${dia.cosas.map((cosa) => filaDeCosa(cosa, false)).join("")}</tbody></table>
</section>`,
          )
          .join("")
      : `<p class="vacio">No hay nada planificado ${escapar(reporte.periodo.etiqueta)}.</p>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Lo que viene · ${escapar(reporte.periodo.etiqueta)}</title>
<style>
  /* Sin tipografías de fuera, como la ficha y la bitácora: al imprimir
     puede no haber red, y una fuente que no carga mueve las páginas. */
  * { box-sizing: border-box; }
  @page { margin: 14mm 12mm; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    color: ${TINTA}; margin: 0; font-size: 10pt; line-height: 1.4;
  }
  header { border-bottom: 2px solid ${MARCA_TS}; padding-bottom: 12px; margin-bottom: 16px; }
  .agencia { color: ${MARCA_TS}; font-weight: 800; letter-spacing: -0.02em; font-size: 11pt; }
  h1 { font-size: 20pt; margin: 4px 0 2px; letter-spacing: -0.02em; }
  .subtitulo { color: ${TINTA_SUAVE}; font-size: 10.5pt; }
  .generado { color: ${TINTA_TENUE}; font-size: 8.5pt; margin-top: 6px; }

  .cifras { display: flex; gap: 8px; margin-bottom: 6px; }
  .cifra { flex: 1; border: 1px solid ${LINEA}; border-radius: 10px; padding: 8px 10px; }
  .cifra .valor { font-size: 18pt; font-weight: 800; letter-spacing: -0.02em; }
  .cifra .etiqueta { color: ${TINTA_SUAVE}; font-size: 8.5pt; }
  .cifra.rojo .valor { color: ${ROJO}; }
  .tipos { color: ${TINTA_SUAVE}; font-size: 9pt; margin: 0 0 14px; }

  section { margin-bottom: 14px; }
  section.dia { break-inside: avoid; }
  h2 {
    font-size: 10.5pt; margin: 0 0 4px; padding-bottom: 3px;
    border-bottom: 1px solid ${LINEA}; break-after: avoid;
  }
  h2.rojo { color: ${ROJO}; }
  .hoy {
    display: inline-block; font-size: 8pt; font-weight: 700; color: #fff;
    background: ${MARCA_TS}; border-radius: 999px; padding: 0 7px; vertical-align: middle;
  }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th {
    text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em;
    color: ${TINTA_TENUE}; font-weight: 600; padding: 3px 6px 3px 0;
  }
  td { padding: 4px 6px 4px 0; border-top: 1px solid ${LINEA}; vertical-align: top; }
  tr { break-inside: avoid; }
  .num { text-align: right; width: 1%; white-space: nowrap; padding-left: 10px; }
  .hora { width: 62px; white-space: nowrap; color: ${TINTA_SUAVE}; }
  .que { width: 150px; font-weight: 600; }
  .marca { width: 150px; }
  .quien { width: 120px; color: ${TINTA_SUAVE}; }
  .estado { width: 70px; font-size: 8pt; color: ${TINTA_SUAVE}; }
  .estado.hecho { color: #188038; }
  .rojo, .estado.atrasado { color: ${ROJO}; }
  .punto { display: inline-block; width: 8px; height: 8px; border-radius: 999px; margin-right: 5px; }
  .hecho-tachado { text-decoration: line-through; color: ${TINTA_TENUE}; }
  .vacio { color: ${TINTA_TENUE}; font-style: italic; }
  footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid ${LINEA}; color: ${TINTA_SUAVE}; font-size: 8.5pt; }
</style>
</head>
<body>
<header>
  <div class="agencia">TS Sports</div>
  <h1>Lo que viene</h1>
  <div class="subtitulo">${escapar(mayuscula(reporte.periodo.etiqueta))} · ${escapar(deQuienEsElReporte(reporte))}</div>
  <div class="generado">Generado por ${escapar(reporte.generadoPor)} el ${escapar(formatearFechaYHora(reporte.generadoEn))}</div>
</header>

<div class="cifras">
  <div class="cifra"><div class="valor">${resumen.porHacer}</div><div class="etiqueta">Por hacer</div></div>
  <div class="cifra"><div class="valor">${resumen.acciones}</div><div class="etiqueta">Acciones de campaña</div></div>
  <div class="cifra"><div class="valor">${resumen.marcas}</div><div class="etiqueta">Marcas con algo planificado</div></div>
  <div class="cifra${resumen.atrasados > 0 ? " rojo" : ""}"><div class="valor">${resumen.atrasados}</div><div class="etiqueta">Atrasado</div></div>
</div>
<p class="tipos">${tipos !== "" ? escapar(tipos) : "Ningún recordatorio por hacer en el periodo."}${
    resumen.hechos > 0 ? ` · ${resumen.hechos} ya ${resumen.hechos === 1 ? "hecho" : "hechos"}` : ""
  }</p>

${porPersona}
${atrasados}
${dias}

<footer>
  ${
    resumen.sinSiguientePaso > 0
      ? `<strong>${resumen.sinSiguientePaso} ${resumen.sinSiguientePaso === 1 ? "marca no tiene" : "marcas no tienen"} nada por delante</strong>: ni un recordatorio ni una acción de campaña. Se ven en el tablero con el filtro «Sin siguiente paso».`
      : "Todas las marcas tienen algo por delante."
  }
</footer>
</body>
</html>`;
}

function cabeceraDeCosas(conFecha = false): string {
  return `<thead><tr><th class="hora">${conFecha ? "Día" : "Hora"}</th><th class="que">Qué</th><th class="marca">Marca</th><th>Detalle</th><th class="quien">Quién</th><th class="estado">Estado</th></tr></thead>`;
}

function filaDeCosa(cosa: CosaDeLoQueViene | RecordatorioDeLoQueViene, conFecha: boolean): string {
  const estado = estadoDe(cosa);
  const hecho = estado === "Hecho";
  const que =
    cosa.clase === "campana"
      ? `<span class="punto" style="background:${escaparAtributo(cosa.campana.color)}"></span>${escapar(queEs(cosa))}`
      : escapar(queEs(cosa));

  const hora = conFecha ? cosa.fecha.split("-").reverse().join("/") : (cosa.hora ?? "");

  return `<tr${hecho ? ' class="hecho-tachado"' : ""}>
  <td class="hora">${escapar(hora)}</td>
  <td class="que">${que}</td>
  <td class="marca">${escapar(cosa.marca.nombre)}</td>
  <td>${cosa.nota ? escapar(cosa.nota) : ""}</td>
  <td class="quien">${escapar(quienLaHace(cosa))}</td>
  <td class="estado ${estado.toLowerCase()}">${estado}</td>
</tr>`;
}

/* ==================================================================== */
/* Hoja de cálculo                                                      */
/* ==================================================================== */

/** Lo que de verdad se usa de la librería (mismo criterio que excelDeCampanas.ts). */
type CeldaDeExcel = {
  value?: string | number | Date;
  type?: NumberConstructor | DateConstructor;
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
    backgroundColor: "#F1F3F4",
    color: TINTA,
    borderBottomColor: LINEA,
    borderBottomStyle: "thin",
  }));
}

function texto(valor: string | null | undefined, suave = false): CeldaDeExcel {
  return { value: valor ?? "", color: suave ? TINTA_SUAVE : TINTA };
}

function numero(valor: number): CeldaDeExcel {
  return { value: valor, type: Number, color: TINTA };
}

/** Un día AAAA-MM-DD como fecha de Excel, construida en local (regla 16). */
function dia(fecha: string): CeldaDeExcel {
  const [anio, mes, diaDelMes] = fecha.split("-").map(Number);

  return { value: new Date(anio, mes - 1, diaDelMes), type: Date, format: "dd/mm/yyyy", color: TINTA };
}

function filaDeExcel(cosa: CosaDeLoQueViene, etiquetaDelDia: string): FilaDeExcel {
  return [
    dia(cosa.fecha),
    texto(etiquetaDelDia, true),
    texto(cosa.hora),
    texto(queEs(cosa)),
    texto(cosa.marca.nombre),
    texto(cosa.nota),
    texto(quienLaHace(cosa)),
    texto(estadoDe(cosa), true),
  ];
}

export async function descargarLoQueVieneEnExcel(reporte: ReporteDeLoQueViene): Promise<void> {
  const { default: escribirLibroDeExcel } = await import("write-excel-file/browser");

  const titulos = ["Fecha", "Día", "Hora", "Qué", "Marca", "Detalle", "Quién", "Estado"];

  const diaADia: FilaDeExcel[] = [
    cabecera(titulos),
    ...reporte.dias.flatMap((elDia) => elDia.cosas.map((cosa) => filaDeExcel(cosa, elDia.etiqueta))),
  ];

  const porPersona: FilaDeExcel[] = [
    cabecera(["Persona", "Por hacer", ...COLUMNAS_POR_TIPO.map((columna) => columna.titulo), "Acciones de campaña", "Atrasado"]),
    ...reporte.resumen.porPersona.map((persona): FilaDeExcel => [
      texto(persona.nombre),
      numero(persona.porHacer),
      ...COLUMNAS_POR_TIPO.map((columna) => numero(persona.porTipo[columna.tipo])),
      numero(persona.acciones),
      numero(persona.atrasados),
    ]),
  ];

  const hojas = [
    {
      sheet: "Día a día",
      data: diaADia,
      columns: [{ width: 12 }, { width: 22 }, { width: 8 }, { width: 30 }, { width: 28 }, { width: 44 }, { width: 22 }, { width: 12 }],
      stickyRowsCount: 1,
    },
    {
      sheet: "Por persona",
      data: porPersona,
      columns: [{ width: 26 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 20 }, { width: 11 }],
      stickyRowsCount: 1,
    },
  ];

  if (reporte.atrasados.length > 0) {
    hojas.push({
      sheet: "Atrasado",
      data: [cabecera(titulos), ...reporte.atrasados.map((cosa) => filaDeExcel(cosa, ""))],
      columns: hojas[0].columns,
      stickyRowsCount: 1,
    });
  }

  await escribirLibroDeExcel(hojas).toFile(`${nombreDelArchivo(reporte)}.xlsx`);
}

/* ==================================================================== */
/* Ayudantes                                                            */
/* ==================================================================== */

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escaparAtributo(valor: string): string {
  return escapar(valor).replace(/'/g, "&#39;");
}
