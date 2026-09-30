/**
 * utilidades/ficheros.ts
 * ---------------------------------------------------------------------
 * Lo que el navegador hace con una foto o un PDF antes de subirlo a la
 * galería de una propiedad o a la bitácora.
 *
 * LA MINIATURA LA HACE EL NAVEGADOR. Una foto de móvil pesa 3 o 4 MB, y
 * una rejilla de doce fotos serían cincuenta megas para ver sellos de
 * correo, en el teléfono de un vendedor en la calle. Así que al subir se
 * manda además una copia pequeña, hecha aquí con un <canvas>:
 *
 *   · El navegador ya sabe girar la foto según su EXIF (la de un móvil
 *     en vertical viene «tumbada»); en el servidor habría que hacerlo a
 *     mano con la librería de imágenes de PHP, que además no está
 *     instalada en todos los equipos donde corre el proyecto.
 *   · Si algo falla, no pasa nada: la subida va sin miniatura y las
 *     pantallas usan la foto entera. La miniatura nunca bloquea subir.
 *
 * Qué tipos se admiten y cuánto pueden pesar lo decide el servidor
 * (GuardadoDeArchivos). Lo de aquí es solo para avisar al instante en vez
 * de esperar a que rechace 40 megas después de subirlos.
 * ---------------------------------------------------------------------
 */

/** Lo que se ofrece en el selector de ficheros de la galería y la bitácora. */
export const TIPOS_ADMITIDOS_EN_GALERIA_Y_BITACORA =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf";

const TIPOS_DE_IMAGEN = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** El lado largo de la miniatura: nítida en una rejilla, ligera en el móvil. */
const LADO_MAXIMO_DE_LA_MINIATURA = 960;

/** Por debajo de esto, la foto ya es su propia miniatura. */
const PESO_QUE_NO_MERECE_MINIATURA = 200 * 1024;

export function esImagen(fichero: File): boolean {
  return TIPOS_DE_IMAGEN.includes(fichero.type);
}

/**
 * ¿Se puede subir? Devuelve el motivo si no, listo para enseñar.
 *
 * El tipo se mira por lo que dice el navegador, que en un fichero sin
 * extensión puede venir vacío: en ese caso se deja pasar y que decida el
 * servidor, que lee el contenido de verdad.
 */
export function motivoParaNoSubir(fichero: File, tamanoMaximoMb: number): string | null {
  if (fichero.type !== "" && !TIPOS_ADMITIDOS_EN_GALERIA_Y_BITACORA.split(",").includes(fichero.type)) {
    return `«${fichero.name}» no es una foto ni un PDF. Se admiten JPG, PNG, WebP, GIF y PDF.`;
  }

  if (fichero.size > tamanoMaximoMb * 1024 * 1024) {
    return `«${fichero.name}» pesa más de ${tamanoMaximoMb} MB. Redúcelo antes de subirlo.`;
  }

  return null;
}

/**
 * La copia pequeña de una foto, en JPEG. Null si no es una foto, si ya es
 * pequeña o si el navegador no pudo leerla.
 */
export async function generarMiniatura(fichero: File): Promise<Blob | null> {
  if (!esImagen(fichero)) return null;

  const direccionTemporal = URL.createObjectURL(fichero);

  try {
    const imagen = new Image();
    imagen.src = direccionTemporal;
    await imagen.decode();

    const ancho = imagen.naturalWidth;
    const alto = imagen.naturalHeight;

    if (ancho === 0 || alto === 0) return null;

    const escala = Math.min(1, LADO_MAXIMO_DE_LA_MINIATURA / Math.max(ancho, alto));

    if (escala === 1 && fichero.size < PESO_QUE_NO_MERECE_MINIATURA) return null;

    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(ancho * escala));
    lienzo.height = Math.max(1, Math.round(alto * escala));

    const contexto = lienzo.getContext("2d");

    if (contexto === null) return null;

    // Fondo blanco debajo: un PNG con transparencias pasado a JPEG saldría
    // con fondo negro.
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, lienzo.width, lienzo.height);
    contexto.imageSmoothingEnabled = true;
    contexto.imageSmoothingQuality = "high";
    contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);

    return await new Promise<Blob | null>((resolver) => {
      lienzo.toBlob(resolver, "image/jpeg", 0.82);
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(direccionTemporal);
  }
}
