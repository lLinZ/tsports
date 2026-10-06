/**
 * utilidades/fichaEnPdf.ts
 * ---------------------------------------------------------------------
 * La ficha de una marca como documento, para guardarla en PDF desde el
 * diálogo de impresión y adjuntarla en un correo.
 *
 * Lleva lo de la ficha: quién es la marca y quién la lleva, su estado,
 * el contacto, el avance de las tres fases con el valor de la propuesta,
 * las propiedades que se le ofrecen con su pronóstico, el historial de
 * campañas y los recordatorios pendientes.
 *
 * La bitácora NO va: tiene su propia exportación (regla 19), y es
 * justamente lo que no se adjunta sin pensarlo en un correo.
 *
 * Los datos los pide quien llama a `/marcas/{id}/exportacion`, que deja
 * la salida anotada en la auditoría. Se imprime con `imprimirDocumento`,
 * esperando al logo para que no salga un hueco en blanco.
 * ---------------------------------------------------------------------
 */
import { imprimirDocumento } from "@/utilidades/imprimirDocumento";
import {
  formatearDinero,
  formatearFecha,
  formatearFechaYHora,
  formatearPorcentaje,
  inicialesDe,
} from "@/utilidades/formato";
import type { EstadoDeMarca, Marca, Recordatorio } from "@/tipos/modelos";

const TINTA = "#202124";
const TINTA_SUAVE = "#5F6368";
const TINTA_TENUE = "#9AA0A6";
const LINEA = "#E8EAED";
const MARCA_TS = "#1B9AAA";

const APARIENCIA_DEL_ESTADO: Record<EstadoDeMarca, { etiqueta: string; fondo: string; texto: string }> = {
  caliente: { etiqueta: "Caliente", fondo: "#FDEBEC", texto: "#C5221F" },
  tibia: { etiqueta: "Tibia", fondo: "#FEF4E2", texto: "#B06000" },
  fria: { etiqueta: "Fría", fondo: "#EDF3FB", texto: "#3F6690" },
};

export async function imprimirLaFichaDeLaMarca({
  marca,
  recordatorios,
  generadoEn,
  generadoPor,
}: {
  marca: Marca;
  recordatorios: Recordatorio[];
  generadoEn: string;
  generadoPor: string;
}): Promise<void> {
  await imprimirDocumento(fichaImprimible({ marca, recordatorios, generadoEn, generadoPor }), {
    esperarARecursos: true,
  });
}

/** El documento en sí. Se exporta, como el del brochure, para poder verlo sin imprimirlo. */
export function fichaImprimible({
  marca,
  recordatorios,
  generadoEn,
  generadoPor,
}: {
  marca: Marca;
  recordatorios: Recordatorio[];
  generadoEn: string;
  generadoPor: string;
}): string {
  const estado = APARIENCIA_DEL_ESTADO[marca.estado];
  const propiedades = marca.propiedadesOfrecidas ?? [];
  const historial = marca.historialDeCampanas ?? [];

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Ficha · ${escapar(marca.nombreMarca)}</title>
<style>
  /* Sin tipografías de fuera, como la bitácora: al imprimir puede no
     haber red, y una fuente que no carga mueve las páginas. */
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    color: ${TINTA};
    margin: 0;
    padding: 28px 34px;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  header { border-bottom: 2px solid ${MARCA_TS}; padding-bottom: 14px; margin-bottom: 18px; }
  .agencia { color: ${MARCA_TS}; font-weight: 800; letter-spacing: -0.02em; font-size: 12pt; }
  .identidad { display: flex; gap: 14px; align-items: center; margin-top: 10px; }
  .logo { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; border: 1px solid ${LINEA}; }
  .logo-vacio {
    width: 56px; height: 56px; border-radius: 12px; background: #F1F3F4;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; color: ${TINTA_TENUE};
  }
  h1 { font-size: 18pt; margin: 0; letter-spacing: -0.02em; }
  .subtitulo { color: ${TINTA_SUAVE}; font-size: 9.5pt; }
  .estado {
    display: inline-block; padding: 2px 10px; border-radius: 999px;
    font-size: 9pt; font-weight: 700; margin-left: 6px; vertical-align: middle;
  }
  .generado { color: ${TINTA_TENUE}; font-size: 8.5pt; margin-top: 8px; }

  section { margin-bottom: 16px; break-inside: avoid; }
  h2 {
    font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em;
    color: ${TINTA_SUAVE}; margin: 0 0 6px; padding-bottom: 4px;
    border-bottom: 1px solid ${LINEA};
  }
  dl { display: grid; grid-template-columns: 150px 1fr; gap: 3px 12px; margin: 0; }
  dt { color: ${TINTA_SUAVE}; }
  dd { margin: 0; word-break: break-word; }
  .vacio { color: ${TINTA_TENUE}; font-style: italic; }

  .fases { display: flex; gap: 8px; margin-bottom: 8px; }
  .fase {
    flex: 1; border: 1px solid ${LINEA}; border-radius: 10px; padding: 6px 10px;
    font-weight: 600; font-size: 9.5pt;
  }
  .fase.hecha { border-color: #16C79A; background: #E6F8F2; }
  .fase .marca-fase { color: ${TINTA_TENUE}; font-weight: 400; display: block; font-size: 8.5pt; }

  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th { text-align: left; color: ${TINTA_SUAVE}; font-weight: 600; padding: 4px 6px; border-bottom: 1px solid ${LINEA}; }
  td { padding: 5px 6px; border-bottom: 1px solid ${LINEA}; vertical-align: top; }
  td.numero, th.numero { text-align: right; white-space: nowrap; }
  tr { break-inside: avoid; }
  .punto { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }

  .texto-libre { white-space: pre-wrap; margin: 0; }
  footer { color: ${TINTA_TENUE}; font-size: 8.5pt; border-top: 1px solid ${LINEA}; padding-top: 8px; margin-top: 18px; }

  @page { margin: 14mm; }
</style>
</head>
<body>
<header>
  <div class="agencia">TS SPORTS</div>
  <div class="identidad">
    ${
      marca.logoUrl
        ? `<img class="logo" src="${escaparAtributo(marca.logoUrl)}" alt="">`
        : `<div class="logo-vacio">${escapar(inicialesDe(marca.nombreMarca))}</div>`
    }
    <div>
      <h1>${escapar(marca.nombreMarca)}<span class="estado" style="background:${estado.fondo};color:${estado.texto}">${estado.etiqueta}${marca.estadoFijado ? " · fijado" : ""}</span></h1>
      <div class="subtitulo">${escapar(unir([marca.sector, marca.zona, marca.vendedorAsignadoNombre ? `lleva ${marca.vendedorAsignadoNombre}` : "sin agente asignado"]))}</div>
    </div>
  </div>
  <div class="generado">Ficha generada por ${escapar(generadoPor)} el ${escapar(formatearFechaYHora(generadoEn))}</div>
</header>

<section>
  <h2>Contacto</h2>
  <dl>
    ${fila("Persona de contacto", marca.personaContacto)}
    ${fila("Cargo", marca.cargoContacto)}
    ${fila("Email", marca.emailContacto)}
    ${fila("Teléfono", marca.telefonoContacto)}
    ${fila("Dónde se identificó", marca.viaProspeccion)}
    ${fila("Invierte en deporte", marca.invierteEtiqueta)}
    ${fila("Campaña actual", marca.campanaNombre ?? null)}
  </dl>
</section>

<section>
  <h2>Avance</h2>
  <div class="fases">
    ${fase("Aproximación", marca.faseAproximacionCompletada, marca.viaAproximacion)}
    ${fase("Prospección", marca.faseProspeccionCompletada, marca.faseProspeccionCompletada ? null : `faltan ${marca.datosQueFaltan.length}`)}
    ${fase("Propuesta", marca.fasePropuestaCompletada, null)}
  </div>
  <dl>
    ${fila("Propuesta enviada", marca.descripcionPropuesta)}
    ${fila("Valor anual", marca.fasePropuestaCompletada && marca.valorAnualUsd > 0 ? formatearDinero(marca.valorAnualUsd) : null)}
    ${fila("Último movimiento", `${formatearFecha(marca.ultimoMovimiento.el)} · ${marca.ultimoMovimiento.etiqueta}`)}
  </dl>
</section>

<section>
  <h2>Propiedades ofrecidas</h2>
  ${
    propiedades.length === 0
      ? '<p class="vacio">Todavía no se le ofrece ninguna propiedad.</p>'
      : `<table>
    <thead><tr><th>Propiedad</th><th class="numero">MTP</th><th class="numero">OVP</th><th class="numero">Del MTP</th></tr></thead>
    <tbody>
      ${propiedades
        .map(
          (linea) => `<tr>
        <td>${escapar(linea.propiedadNombre)}${linea.propiedadActiva ? "" : ' <span class="vacio">(desactivada)</span>'}</td>
        <td class="numero">${linea.montoTotalUsd > 0 ? formatearDinero(linea.montoTotalUsd) : "—"}</td>
        <td class="numero">${formatearDinero(linea.ovpUsd)}</td>
        <td class="numero">${linea.montoTotalUsd > 0 ? formatearPorcentaje(linea.porcentajeSobreElTotal) : "—"}</td>
      </tr>`,
        )
        .join("")}
      <tr><td><strong>Total</strong></td><td></td><td class="numero"><strong>${formatearDinero(marca.ovpTotalUsd ?? 0)}</strong></td><td></td></tr>
    </tbody>
  </table>`
  }
</section>

<section>
  <h2>Acciones de campaña</h2>
  ${
    historial.length === 0
      ? '<p class="vacio">Ninguna acción anotada.</p>'
      : `<table>
    <thead><tr><th>Día</th><th>Campaña</th><th>Nota</th><th>Anotada por</th></tr></thead>
    <tbody>
      ${historial
        .map(
          (accion) => `<tr>
        <td style="white-space:nowrap">${escapar(formatearFecha(accion.fecha))}</td>
        <td><span class="punto" style="background:${escaparAtributo(accion.campanaColor ?? "#94a3b8")}"></span>${escapar(accion.campanaNombre)}</td>
        <td>${accion.nota ? escapar(accion.nota) : '<span class="vacio">—</span>'}</td>
        <td>${escapar(accion.registradoPorNombre ?? "—")}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>`
  }
</section>

<section>
  <h2>Recordatorios pendientes</h2>
  ${
    recordatorios.length === 0
      ? '<p class="vacio">Nada pendiente.</p>'
      : `<table>
    <thead><tr><th>Día</th><th>Para</th><th>Qué hay que hacer</th></tr></thead>
    <tbody>
      ${recordatorios
        .map(
          (recordatorio) => `<tr>
        <td style="white-space:nowrap">${escapar(formatearFecha(recordatorio.fecha))}${recordatorio.cuando === "vencido" ? ' <span style="color:#C5221F">· vencido</span>' : ""}</td>
        <td>${escapar(recordatorio.personaNombre ?? "—")}</td>
        <td>${recordatorio.nota ? escapar(recordatorio.nota) : '<span class="vacio">—</span>'}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>`
  }
</section>

${
  marca.notas
    ? `<section><h2>Notas</h2><p class="texto-libre">${escapar(marca.notas)}</p></section>`
    : ""
}

<footer>
  TS Sports · ficha de ${escapar(marca.nombreMarca)}. La bitácora de la marca se exporta aparte, desde su pestaña.
</footer>
</body>
</html>`;
}

function fila(etiqueta: string, valor: string | null | undefined): string {
  return `<dt>${escapar(etiqueta)}</dt><dd>${
    valor && valor.trim() !== "" ? escapar(valor) : '<span class="vacio">—</span>'
  }</dd>`;
}

function fase(nombre: string, hecha: boolean, detalle: string | null): string {
  return `<div class="fase${hecha ? " hecha" : ""}">${hecha ? "✓ " : ""}${escapar(nombre)}<span class="marca-fase">${
    detalle ? escapar(detalle) : hecha ? "Completada" : "Pendiente"
  }</span></div>`;
}

function unir(partes: Array<string | null | undefined>): string {
  return partes.filter((parte) => parte && parte.trim() !== "").join(" · ");
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
