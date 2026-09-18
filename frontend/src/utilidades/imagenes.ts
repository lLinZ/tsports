/**
 * utilidades/imagenes.ts
 * ---------------------------------------------------------------------
 * Convierte en fichero una imagen que llega pegada como texto.
 *
 * «Copiar dirección de la imagen» en Google Imágenes (y en cualquier web
 * que incruste sus miniaturas) no da una dirección: da la imagen entera
 * escrita en base64, `data:image/png;base64,iVBORw0KGgo…`, con miles de
 * caracteres. El navegador la pinta sin problema, así que la vista previa
 * del campo salía bien; pero no es una URL, no cabe en la columna, y el
 * servidor la rechazaba al guardar. Convertida en fichero se sube como
 * cualquier otra imagen, y lo que se guarda es su URL.
 * ---------------------------------------------------------------------
 */

/** `data:<tipo>;base64,<contenido>`. Solo imágenes y solo en base64. */
const PATRON_DE_IMAGEN_INCRUSTADA = /^data:(image\/[\w.+-]+);base64,(.*)$/is;

/** Las extensiones que no coinciden con el final del tipo MIME. */
const EXTENSION_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

/**
 * ¿Este texto es una imagen incrustada? Va aparte de la conversión para
 * distinguir «no lo es» (se trata como una dirección normal) de «lo es,
 * pero viene rota» (hay que avisar, no guardarla).
 */
export function esImagenIncrustada(texto: string): boolean {
  return /^\s*data:image\//i.test(texto);
}

/**
 * Devuelve la imagen como un File listo para subir, o null si el texto
 * no se deja leer: base64 cortado a medias, o una variante sin base64.
 */
export function ficheroDesdeImagenIncrustada(texto: string): File | null {
  const partes = PATRON_DE_IMAGEN_INCRUSTADA.exec(texto.trim());

  if (!partes) return null;

  const tipoDeImagen = partes[1].toLowerCase();
  // Al copiar de algunos sitios el base64 llega partido en líneas.
  const contenidoEnBase64 = partes[2].replace(/\s/g, "");

  let contenidoDecodificado: string;

  try {
    contenidoDecodificado = atob(contenidoEnBase64);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(contenidoDecodificado.length);

  for (let posicion = 0; posicion < contenidoDecodificado.length; posicion++) {
    bytes[posicion] = contenidoDecodificado.charCodeAt(posicion);
  }

  // El servidor vuelve a deducir la extensión del contenido real; esta
  // es solo para que el nombre del fichero no mienta.
  const extension = EXTENSION_POR_TIPO[tipoDeImagen] ?? tipoDeImagen.split("/")[1];

  return new File([bytes], `imagen-pegada.${extension}`, { type: tipoDeImagen });
}
