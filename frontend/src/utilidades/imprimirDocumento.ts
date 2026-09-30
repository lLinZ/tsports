/**
 * utilidades/imprimirDocumento.ts
 * ---------------------------------------------------------------------
 * Imprime un documento HTML armado en el navegador: la bitácora, el
 * reporte por fechas y el brochure de propiedades. Desde el diálogo de
 * impresión se guarda como PDF, sin librerías de PDF ni servidor.
 *
 * Se pinta en un iframe invisible y se imprime ESE iframe, no la página:
 * así el documento lleva sus propios estilos y no hereda nada del panel.
 *
 * Con `esperarARecursos`, antes de imprimir se espera a que carguen las
 * fotos y la tipografía del documento. Es lo que necesita el brochure:
 * el navegador imprime lo que tenga pintado en ese momento, y una foto a
 * medio bajar sale como un hueco blanco. Nunca se espera para siempre:
 * pasado el tope se imprime con lo que haya.
 * ---------------------------------------------------------------------
 */

const TOPE_DE_ESPERA_MS = 20_000;

export async function imprimirDocumento(
  html: string,
  opciones: { esperarARecursos?: boolean } = {},
): Promise<void> {
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

  // Se espera a que el marco termine de montar su documento: llamar a
  // print() antes deja una hoja en blanco.
  const montado = new Promise<void>((resolver) => {
    marco.onload = () => resolver();
  });

  documentoDelMarco.open();
  documentoDelMarco.write(html);
  documentoDelMarco.close();

  await montado;

  if (opciones.esperarARecursos) {
    await Promise.race([
      esperarFotosYTipografia(documentoDelMarco),
      new Promise((resolver) => window.setTimeout(resolver, TOPE_DE_ESPERA_MS)),
    ]);
  }

  marco.contentWindow?.focus();
  marco.contentWindow?.print();

  // Se quita después, no al instante: en Safari, quitar el marco
  // mientras el diálogo está abierto cancela la impresión.
  window.setTimeout(() => marco.remove(), 60_000);
}

async function esperarFotosYTipografia(documento: Document): Promise<void> {
  const fotos = [...documento.images].map((foto) =>
    foto.complete
      ? Promise.resolve()
      : new Promise<void>((resolver) => {
          // Una foto que falla no para la impresión: sale su hueco.
          foto.addEventListener("load", () => resolver(), { once: true });
          foto.addEventListener("error", () => resolver(), { once: true });
        }),
  );

  await Promise.all([...fotos, documento.fonts.ready]);
}
