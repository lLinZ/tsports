/**
 * utilidades/brochureDePropiedades.ts
 * ---------------------------------------------------------------------
 * El brochure de propiedades: un PDF para mandarle a un patrocinador,
 * con una portada, un índice, cada propiedad con sus fotos y, al final,
 * cómo contactar con la agencia. Se saca desde Reportes.
 *
 * Como la bitácora, lo hace el navegador (utilidades/imprimirDocumento):
 * se arma en HTML y se guarda como PDF desde el diálogo de impresión. En
 * horizontal, A4, a sangre, que es como se leen las fotos.
 *
 * Cada propiedad ocupa DOS hojas: su portada a página completa, con el
 * nombre encima, y su ficha (el texto y el resto de fotos). Todas las
 * fotos van en huecos apaisados de 16:10, la forma de casi cualquier foto
 * de un evento, de un plano o de una hoja de dossier: un hueco vertical
 * se comía la mitad de la imagen, y en un plano, el texto.
 *
 * QUÉ SALE Y QUÉ NO. Es un documento para fuera, así que sigue las
 * reglas del catálogo de la web (regla 21):
 *
 *   · Solo el TEXTO PARA LA WEB de cada propiedad, en el idioma elegido
 *     (en inglés, el español si no tiene). Nunca `descripcion`, que es
 *     la nota interna del equipo.
 *   · Solo las FOTOS que salen en la web: las marcadas «solo para el
 *     equipo» y los PDF de la galería se quedan fuera.
 *   · Ni un monto: ni MTP, ni meta, ni OVP.
 *
 * Los colores y el contacto salen del contenido de la web (el CMS), así
 * que el brochure cambia con la identidad de la web sin tocar código.
 * ---------------------------------------------------------------------
 */
import type {
  ArchivoDeGaleria,
  ContenidoDeLaWeb,
  IdiomaDeLaWeb,
  Propiedad,
} from "@/tipos/modelos";
import { imprimirDocumento } from "@/utilidades/imprimirDocumento";

export interface OpcionesDelBrochure {
  /** En el orden en que tienen que salir. */
  propiedades: Propiedad[];
  idioma: IdiomaDeLaWeb;
  /** «Preparado para…»: la marca a la que se le manda. Opcional. */
  destinatario: string;
  contenido: ContenidoDeLaWeb;
}

/** Lo más que cabe junto al texto en la ficha de una propiedad. */
const MAXIMO_DE_FOTOS_EN_LA_FICHA = 4;

/** Lo más que cabe en el mosaico de la portada y en el de la contraportada. */
const MAXIMO_EN_LA_PORTADA = 4;
const MAXIMO_EN_LA_CONTRAPORTADA = 6;

/** Los textos fijos del documento, en los dos idiomas de la web. */
const TEXTOS = {
  es: {
    titulo: "Catálogo de propiedades",
    preparadoPara: "Preparado para",
    indice: "En este catálogo",
    propiedad: "Propiedad",
    teInteresa: (nombre: string) => `¿Te interesa ${nombre}?`,
    escribenos: "Te preparamos la propuesta para tu marca.",
    hablemos: "Hablemos",
    cierre:
      "Cada propiedad se adapta a lo que busca tu marca. Cuéntanos qué necesitas y te preparamos la propuesta.",
    pagina: "Pág.",
  },
  en: {
    titulo: "Property catalogue",
    preparadoPara: "Prepared for",
    indice: "Inside this catalogue",
    propiedad: "Property",
    teInteresa: (nombre: string) => `Interested in ${nombre}?`,
    escribenos: "We'll put together a proposal for your brand.",
    hablemos: "Let's talk",
    cierre:
      "Every property adapts to what your brand is looking for. Tell us what you need and we'll prepare the proposal.",
    pagina: "p.",
  },
} as const;

export async function imprimirElBrochure(opciones: OpcionesDelBrochure): Promise<void> {
  await imprimirDocumento(brochureImprimible(opciones), { esperarARecursos: true });
}

/**
 * Cuántas páginas tiene el brochure: portada, índice (con dos o más
 * propiedades), dos por propiedad y la contraportada.
 */
export function paginasDelBrochure(cuantasPropiedades: number): number {
  if (cuantasPropiedades === 0) return 0;

  return 2 + (cuantasPropiedades >= 2 ? 1 : 0) + cuantasPropiedades * 2;
}

/** Las fotos de una propiedad que pueden salir fuera, con la portada primero. */
export function fotosParaElBrochure(propiedad: Propiedad): ArchivoDeGaleria[] {
  const fotos = (propiedad.galeria ?? []).filter(
    (pieza) => pieza.tipo === "imagen" && pieza.enLaWeb,
  );
  const portada = fotos.find((foto) => foto.esPortada) ?? fotos[0];

  return portada ? [portada, ...fotos.filter((foto) => foto !== portada)] : [];
}

/** El texto para clientes en el idioma pedido, o el español si no lo hay. */
export function textoParaElBrochure(propiedad: Propiedad, idioma: IdiomaDeLaWeb): string {
  const enIngles = propiedad.textoWebEn?.trim() ?? "";
  const enEspanol = propiedad.textoWebEs?.trim() ?? "";

  return idioma === "en" && enIngles !== "" ? enIngles : enEspanol;
}

/* ==================================================================== */
/* El documento                                                         */
/* ==================================================================== */

interface PaginaDePropiedad {
  propiedad: Propiedad;
  fotos: ArchivoDeGaleria[];
  numero: number;
  paginaDondeEmpieza: number;
}

export function brochureImprimible({
  propiedades,
  idioma,
  destinatario,
  contenido,
}: OpcionesDelBrochure): string {
  const textos = TEXTOS[idioma];
  const conIndice = propiedades.length >= 2;

  // Qué página toca a cada propiedad: la portada es la 1, el índice la 2,
  // y cada propiedad ocupa dos hojas.
  const primeraPagina = conIndice ? 3 : 2;
  const paginas: PaginaDePropiedad[] = propiedades.map((propiedad, posicion) => ({
    propiedad,
    fotos: fotosParaElBrochure(propiedad),
    numero: posicion + 1,
    paginaDondeEmpieza: primeraPagina + posicion * 2,
  }));

  const tituloDelDocumento = [
    "TS Sports",
    textos.titulo,
    destinatario.trim() !== "" ? destinatario.trim() : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const hojas = [
    hojaDePortada(paginas, idioma, destinatario, contenido),
    conIndice ? hojaDeIndice(paginas, idioma) : "",
    ...paginas.map((pagina) => hojasDeLaPropiedad(pagina, idioma, contenido)),
    hojaDeContacto(paginas, idioma, contenido),
  ].join("\n");

  return `<!doctype html>
<html lang="${idioma}">
<head>
<meta charset="utf-8">
<title>${escapar(tituloDelDocumento)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=block" rel="stylesheet">
<style>${estilos(contenido)}</style>
</head>
<body>
${hojas}
</body>
</html>`;
}

function hojaDePortada(
  paginas: PaginaDePropiedad[],
  idioma: IdiomaDeLaWeb,
  destinatario: string,
  contenido: ContenidoDeLaWeb,
): string {
  const textos = TEXTOS[idioma];
  const [primera, ...otras] = portadasDe(paginas).slice(0, MAXIMO_EN_LA_PORTADA);

  const mosaico =
    primera === undefined
      ? `<div class="mosaico vacio"><span>${escapar(paginas.map((p) => p.propiedad.nombre).join(" · "))}</span></div>`
      : `<div class="mosaico">
    <img class="foto-16-10" src="${escaparAtributo(primera.url)}" alt="">
    ${
      otras.length > 0
        ? `<div class="mosaico-fila" style="grid-template-columns: repeat(${otras.length}, 1fr)">${otras
            .map((foto) => `<img class="foto-16-10" src="${escaparAtributo(foto.url)}" alt="">`)
            .join("")}</div>`
        : ""
    }
  </div>`;

  const subtitulo = contenido.textos[idioma]?.["propiedades.titulo"] ?? "";
  const parrafo = contenido.textos[idioma]?.["propiedades.parrafo"] ?? "";
  const fecha = new Intl.DateTimeFormat(idioma === "en" ? "en-GB" : "es-ES", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  return `<section class="hoja portada">
  <div class="portada-texto">
    <div class="firma"><span class="logo">TS</span><span>TS Sports</span></div>
    <div class="portada-centro">
      <p class="antetitulo">${escapar(textos.titulo)}</p>
      <h1>${escapar(subtitulo || textos.titulo)}</h1>
      ${parrafo ? `<p class="bajada">${escapar(parrafo)}</p>` : ""}
      ${
        destinatario.trim() !== ""
          ? `<div class="para"><span>${escapar(textos.preparadoPara)}</span><strong>${escapar(destinatario.trim())}</strong></div>`
          : ""
      }
    </div>
    <div class="portada-pie"><span>${escapar(capitalizar(fecha))}</span><span>${escapar(dominio())}</span></div>
  </div>
  ${mosaico}
</section>`;
}

function hojaDeIndice(paginas: PaginaDePropiedad[], idioma: IdiomaDeLaWeb): string {
  const textos = TEXTOS[idioma];

  const filas = paginas
    .map(({ propiedad, fotos, numero, paginaDondeEmpieza }) => {
      const texto = textoParaElBrochure(propiedad, idioma);

      return `<li>
      <span class="indice-numero">${dosCifras(numero)}</span>
      ${fotos[0] ? `<img src="${escaparAtributo(fotos[0].urlMiniatura ?? fotos[0].url)}" alt="">` : `<span class="indice-sin-foto">${escapar(iniciales(propiedad.nombre))}</span>`}
      <span class="indice-cuerpo">
        <strong>${escapar(propiedad.nombre)}</strong>
        ${texto ? `<span>${escapar(primeraFrase(texto))}</span>` : ""}
      </span>
      <span class="indice-pagina">${escapar(textos.pagina)} ${paginaDondeEmpieza}</span>
    </li>`;
    })
    .join("");

  return `<section class="hoja indice">
  <p class="antetitulo">TS Sports</p>
  <h2>${escapar(textos.indice)}</h2>
  <ol class="${paginas.length > 6 ? "apretado" : ""}">${filas}</ol>
  ${pie(2)}
</section>`;
}

function hojasDeLaPropiedad(
  { propiedad, fotos, numero, paginaDondeEmpieza }: PaginaDePropiedad,
  idioma: IdiomaDeLaWeb,
  contenido: ContenidoDeLaWeb,
): string {
  const textos = TEXTOS[idioma];
  const [portada, ...resto] = fotos;
  const texto = textoParaElBrochure(propiedad, idioma);
  const parrafos = texto
    .split(/\n{2,}|\r\n\r\n/)
    .map((parrafo) => parrafo.trim())
    .filter(Boolean);

  const contacto = [contenido.contacto.email, whatsappLegible(contenido.contacto.whatsapp)]
    .filter(Boolean)
    .map((dato) => `<span>${escapar(dato)}</span>`)
    .join("");

  const hojaDePortada = `<section class="hoja propiedad-portada">
  ${
    portada
      ? `<img class="a-sangre" src="${escaparAtributo(portada.url)}" alt="">`
      : `<div class="sin-foto"><span>${escapar(iniciales(propiedad.nombre))}</span></div>`
  }
  <div class="velo"></div>
  <div class="propiedad-rotulo">
    <p class="antetitulo">${dosCifras(numero)} · ${escapar(textos.propiedad)}</p>
    <h2>${escapar(propiedad.nombre)}</h2>
    ${portada?.titulo ? `<span>${escapar(portada.titulo)}</span>` : ""}
  </div>
  <span class="numero-claro">${paginaDondeEmpieza}</span>
</section>`;

  // Junto al texto, el resto de fotos; si no hay más, otra vez la portada.
  const fotosDeLaFicha = (resto.length > 0 ? resto : fotos).slice(0, MAXIMO_DE_FOTOS_EN_LA_FICHA);

  const hojaDeFicha = `<section class="hoja ficha">
  <div class="ficha-texto">
    <p class="antetitulo">${dosCifras(numero)} · ${escapar(textos.propiedad)}</p>
    <div class="propiedad-nombre">
      ${propiedad.logoUrl ? `<img class="logo-propiedad" src="${escaparAtributo(propiedad.logoUrl)}" alt="">` : ""}
      <h2>${escapar(propiedad.nombre)}</h2>
    </div>
    <div class="propiedad-cuerpo">${parrafos.map((parrafo) => `<p>${escapar(parrafo)}</p>`).join("")}</div>
    <div class="llamada">
      <strong>${escapar(textos.teInteresa(propiedad.nombre))}</strong>
      <span>${escapar(textos.escribenos)}</span>
      <div class="llamada-datos">${contacto}</div>
    </div>
  </div>
  ${
    fotosDeLaFicha.length > 0
      ? `<div class="ficha-fotos fotos-${fotosDeLaFicha.length}">${fotosDeLaFicha
          .map(
            (foto) => `<figure>
      <img src="${escaparAtributo(foto.url)}" alt="">
      ${foto.titulo || foto.descripcion ? `<figcaption>${foto.titulo ? `<strong>${escapar(foto.titulo)}</strong>` : ""}${foto.descripcion ? `<span>${escapar(foto.descripcion)}</span>` : ""}</figcaption>` : ""}
    </figure>`,
          )
          .join("")}</div>`
      : ""
  }
  ${pie(paginaDondeEmpieza + 1)}
</section>`;

  return hojaDePortada + "\n" + hojaDeFicha;
}

function hojaDeContacto(
  paginas: PaginaDePropiedad[],
  idioma: IdiomaDeLaWeb,
  contenido: ContenidoDeLaWeb,
): string {
  const textos = TEXTOS[idioma];
  const repaso = paginas
    .filter((pagina) => pagina.fotos[0] !== undefined)
    .slice(0, MAXIMO_EN_LA_CONTRAPORTADA);
  const { email, whatsapp, instagram, linkedin } = contenido.contacto;

  const datos = [
    email && ["Email", email],
    whatsapp && ["WhatsApp", whatsappLegible(whatsapp)],
    instagram && ["Instagram", sinProtocolo(instagram)],
    linkedin && ["LinkedIn", sinProtocolo(linkedin)],
    ["Web", dominio()],
  ].filter((dato): dato is [string, string] => Array.isArray(dato));

  return `<section class="hoja contacto">
  <div class="contacto-texto">
    <div class="firma"><span class="logo">TS</span><span>TS Sports</span></div>
    <div class="contacto-centro">
      <h2>${escapar(textos.hablemos)}</h2>
      <p>${escapar(textos.cierre)}</p>
      <dl>${datos.map(([etiqueta, valor]) => `<div><dt>${escapar(etiqueta)}</dt><dd>${escapar(valor)}</dd></div>`).join("")}</dl>
    </div>
  </div>
  ${
    repaso.length > 0
      ? `<div class="repaso">${repaso
          .map(
            ({ propiedad, fotos }) => `<figure>
      <img src="${escaparAtributo(fotos[0]?.url ?? "")}" alt="">
      <figcaption>${escapar(propiedad.nombre)}</figcaption>
    </figure>`,
          )
          .join("")}</div>`
      : ""
  }
</section>`;
}

/** La foto de portada de cada propiedad que tenga alguna. */
function portadasDe(paginas: PaginaDePropiedad[]): ArchivoDeGaleria[] {
  return paginas
    .map((pagina) => pagina.fotos[0])
    .filter((foto): foto is ArchivoDeGaleria => foto !== undefined);
}

function pie(numeroDePagina: number): string {
  return `<div class="pie"><span>TS Sports</span><span>${numeroDePagina}</span></div>`;
}

/* ==================================================================== */
/* Estilos                                                              */
/* ==================================================================== */

function estilos(contenido: ContenidoDeLaWeb): string {
  const { azulPrincipal, azulSecundario, acento } = contenido.colores;

  return `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Inter", "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    color: #1d2330; font-size: 10.5pt; line-height: 1.55;
    font-feature-settings: "cv05" 1, "ss01" 1;
  }
  :root { --azul: ${azulPrincipal}; --azul-2: ${azulSecundario}; --acento: ${acento}; }

  .hoja {
    width: 297mm; height: 210mm; position: relative; overflow: hidden;
    page-break-after: always; break-after: page;
  }
  .hoja:last-child { page-break-after: auto; break-after: auto; }
  img { display: block; }

  .antetitulo {
    font-size: 8pt; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase;
    color: var(--acento);
  }
  h1, h2 { letter-spacing: -0.03em; line-height: 1.05; color: inherit; }

  .firma { display: flex; align-items: center; gap: 3mm; font-weight: 700; font-size: 12pt; }
  .logo {
    width: 10mm; height: 10mm; border-radius: 2.6mm; background: var(--acento); color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 10pt; letter-spacing: -0.03em;
  }

  .pie {
    position: absolute; left: 16mm; right: 16mm; bottom: 8mm;
    display: flex; justify-content: space-between;
    font-size: 7.5pt; font-weight: 600; color: #8a93a3; letter-spacing: 0.04em;
  }

  /* Todas las fotos en huecos apaisados: ver la cabecera del fichero. */
  .foto-16-10 { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 3.5mm; }

  /* ------------------------------ Portada ------------------------------ */
  .portada {
    background: linear-gradient(135deg, var(--azul) 0%, var(--azul-2) 100%);
    color: #fff; display: grid; grid-template-columns: 1fr 1.05fr;
  }
  .portada-texto { padding: 18mm 12mm 14mm 20mm; display: flex; flex-direction: column; }
  .portada-centro { margin-top: auto; margin-bottom: auto; }
  .portada h1 { font-size: 36pt; font-weight: 800; margin-top: 5mm; }
  .portada .bajada { margin-top: 6mm; font-size: 11.5pt; color: rgba(255,255,255,0.78); max-width: 115mm; }
  .para {
    margin-top: 10mm; display: inline-flex; flex-direction: column; gap: 1mm;
    border-left: 1.2mm solid var(--acento); padding: 1mm 0 1mm 4mm;
  }
  .para span { font-size: 8pt; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.6); font-weight: 700; }
  .para strong { font-size: 15pt; font-weight: 700; }
  .portada-pie { display: flex; justify-content: space-between; font-size: 8.5pt; color: rgba(255,255,255,0.6); font-weight: 600; }

  .mosaico { padding: 14mm 14mm 14mm 0; display: flex; flex-direction: column; justify-content: center; gap: 3.5mm; }
  .mosaico-fila { display: grid; gap: 3.5mm; }
  .mosaico.vacio { align-items: center; }
  .mosaico.vacio span {
    border: 0.4mm solid rgba(255,255,255,0.25); border-radius: 4mm; padding: 10mm;
    font-size: 16pt; font-weight: 700; color: rgba(255,255,255,0.8); text-align: center;
  }

  /* ------------------------------- Índice ------------------------------ */
  .indice { padding: 20mm 22mm; background: #f5f7fa; }
  .indice h2 { font-size: 26pt; font-weight: 800; margin-top: 3mm; color: var(--azul); }
  .indice ol { list-style: none; margin-top: 10mm; display: grid; grid-template-columns: 1fr 1fr; gap: 5mm 10mm; }
  .indice li {
    display: grid; grid-template-columns: 9mm 26mm 1fr auto; gap: 4mm; align-items: center;
    background: #fff; border-radius: 4mm; padding: 3.5mm 5mm 3.5mm 4mm;
  }
  .indice li img, .indice-sin-foto { width: 26mm; height: 17mm; border-radius: 2.4mm; object-fit: cover; }
  .indice-sin-foto { background: var(--azul); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
  .indice-numero { font-size: 13pt; font-weight: 800; color: var(--acento); }
  .indice-cuerpo { display: flex; flex-direction: column; min-width: 0; }
  .indice-cuerpo strong { font-size: 11pt; color: var(--azul); }
  .indice-cuerpo span { font-size: 8.5pt; color: #5f6878; line-height: 1.4; margin-top: 0.8mm; }
  .indice-pagina { font-size: 8.5pt; font-weight: 700; color: #8a93a3; white-space: nowrap; }
  .indice ol.apretado li { padding-top: 2.4mm; padding-bottom: 2.4mm; }
  .indice ol.apretado li img, .indice ol.apretado .indice-sin-foto { height: 13mm; }

  /* ------------------- Propiedad: portada a página completa ---------------- */
  .propiedad-portada { background: var(--azul); color: #fff; }
  .a-sangre { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .velo {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(6, 12, 24, 0.94) 0%, rgba(6, 12, 24, 0.55) 34%, rgba(6, 12, 24, 0) 60%);
  }
  .propiedad-rotulo { position: absolute; left: 18mm; right: 40mm; bottom: 16mm; }
  .propiedad-rotulo .antetitulo { color: #fff; opacity: 0.85; }
  .propiedad-rotulo h2 { font-size: 40pt; font-weight: 800; margin-top: 3mm; }
  .propiedad-rotulo span { display: block; margin-top: 3mm; font-size: 10pt; color: rgba(255,255,255,0.8); }
  .numero-claro { position: absolute; right: 16mm; bottom: 8mm; font-size: 7.5pt; font-weight: 600; color: rgba(255,255,255,0.7); }
  .sin-foto { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .sin-foto span { font-size: 64pt; font-weight: 800; color: rgba(255,255,255,0.18); }

  /* ------------------------ Propiedad: su ficha ------------------------ */
  .ficha { padding: 16mm 16mm 20mm; display: grid; grid-template-columns: 100mm 1fr; gap: 10mm; }
  .ficha-texto { display: flex; flex-direction: column; min-height: 0; }
  .propiedad-nombre { display: flex; align-items: center; gap: 4mm; margin-top: 4mm; }
  .propiedad-nombre h2 { font-size: 24pt; font-weight: 800; color: var(--azul); }
  .logo-propiedad { width: 13mm; height: 13mm; border-radius: 3mm; object-fit: cover; flex: none; }
  .propiedad-cuerpo { margin-top: 6mm; font-size: 10.5pt; color: #3c4453; }
  .propiedad-cuerpo p + p { margin-top: 3mm; }
  .llamada {
    margin-top: auto; background: #f5f7fa; border-radius: 4mm; padding: 5mm 6mm;
    border-left: 1.2mm solid var(--acento);
  }
  .llamada strong { display: block; font-size: 11pt; color: var(--azul); }
  .llamada > span { display: block; font-size: 9pt; color: #5f6878; margin-top: 1mm; }
  .llamada-datos { display: flex; flex-wrap: wrap; gap: 1mm 5mm; margin-top: 2.5mm; font-size: 9pt; font-weight: 600; color: var(--acento); }

  .ficha-fotos { display: grid; gap: 4mm; align-content: center; min-height: 0; }
  .ficha-fotos figure { position: relative; aspect-ratio: 16 / 10; border-radius: 3.5mm; overflow: hidden; background: #eef1f5; }
  .ficha-fotos img { width: 100%; height: 100%; object-fit: cover; }
  .ficha-fotos figcaption {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 7mm 4.5mm 3.5mm;
    background: linear-gradient(to top, rgba(8, 14, 26, 0.82), rgba(8, 14, 26, 0));
    color: #fff; display: flex; flex-direction: column; gap: 0.5mm;
  }
  .ficha-fotos figcaption strong { font-size: 9.5pt; }
  .ficha-fotos figcaption span { font-size: 8pt; color: rgba(255,255,255,0.8); }
  .ficha-fotos.fotos-1 { grid-template-columns: 1fr; }
  /* Dos, una encima de otra: más estrechas, o no caben de alto. */
  .ficha-fotos.fotos-2 { grid-template-columns: 1fr; width: 132mm; justify-self: center; }
  .ficha-fotos.fotos-3 { grid-template-columns: 1fr 1fr; }
  .ficha-fotos.fotos-3 figure:first-child { grid-column: 1 / span 2; }
  .ficha-fotos.fotos-4 { grid-template-columns: 1fr 1fr; }

  /* ------------------------------ Contacto ----------------------------- */
  .contacto {
    background: linear-gradient(135deg, var(--azul-2) 0%, var(--azul) 100%);
    color: #fff; display: grid; grid-template-columns: 1.1fr 1fr;
  }
  .contacto-texto { padding: 18mm 10mm 18mm 20mm; display: flex; flex-direction: column; }
  .contacto-centro { margin: auto 0; }
  .contacto h2 { font-size: 44pt; font-weight: 800; }
  .contacto p { margin-top: 6mm; font-size: 12pt; color: rgba(255,255,255,0.78); max-width: 125mm; }
  .contacto dl { margin-top: 11mm; display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 10mm; }
  .contacto dt { font-size: 8pt; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--acento); }
  .contacto dd { font-size: 12.5pt; font-weight: 600; margin-top: 1mm; }
  .repaso { padding: 16mm 16mm 16mm 0; display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; align-content: center; }
  .repaso figure { position: relative; aspect-ratio: 16 / 10; border-radius: 3mm; overflow: hidden; }
  .repaso img { width: 100%; height: 100%; object-fit: cover; opacity: 0.9; }
  .repaso figcaption {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 6mm 3.5mm 2.5mm;
    background: linear-gradient(to top, rgba(6, 12, 24, 0.85), rgba(6, 12, 24, 0));
    font-size: 8.5pt; font-weight: 700;
  }
  `;
}

/* ==================================================================== */
/* Ayudantes                                                            */
/* ==================================================================== */

function dosCifras(numero: number): string {
  return String(numero).padStart(2, "0");
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase() ?? "")
    .join("");
}

/** Para el índice: la primera frase, sin pasar de una línea y media. */
function primeraFrase(texto: string): string {
  const frase = texto.split(/(?<=[.!?])\s/)[0] ?? texto;

  return frase.length > 110 ? `${frase.slice(0, 107).trimEnd()}…` : frase;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function dominio(): string {
  return window.location.host.replace(/^www\./, "");
}

function sinProtocolo(enlace: string): string {
  return enlace.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

function whatsappLegible(numero: string): string {
  const limpio = numero.trim();

  return limpio === "" || limpio.startsWith("+") ? limpio : `+${limpio}`;
}

/**
 * Escapa lo que va dentro del HTML del documento. El texto lo escribe
 * el equipo, y un `<` rompería la maqueta entera.
 */
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
