/**
 * utilidades/galeria.ts
 * ---------------------------------------------------------------------
 * Convierte lo que devuelve la API en piezas del visor a pantalla
 * completa (componentes/comunes/VisorDeGaleria).
 *
 * El visor no sabe de dónde vienen las fotos —de la galería de una
 * propiedad, de una entrada de la bitácora, del catálogo de la web— y así
 * se queda: cada origen se traduce aquí, una vez, y todas las pantallas
 * que lo abren lo hacen igual.
 * ---------------------------------------------------------------------
 */
import type { ElementoDelVisor } from "@/componentes/comunes/VisorDeGaleria";
import type {
  AdjuntoDeComentario,
  ArchivoDeGaleria,
  PropiedadEnLaWeb,
} from "@/tipos/modelos";

/** La galería de una propiedad, tal cual viene en `Propiedad.galeria`. */
export function elementosDeUnaGaleria(galeria: ArchivoDeGaleria[]): ElementoDelVisor[] {
  return galeria.map((pieza) => ({
    id: pieza.id,
    tipo: pieza.tipo,
    url: pieza.url,
    urlMiniatura: pieza.urlMiniatura,
    nombre: pieza.nombre,
    titulo: pieza.titulo,
    descripcion: pieza.descripcion,
    tamanoBytes: pieza.tamanoBytes,
  }));
}

/** Los adjuntos de una entrada de la bitácora, con sus enlaces firmados. */
export function elementosDeLosAdjuntos(adjuntos: AdjuntoDeComentario[]): ElementoDelVisor[] {
  return adjuntos.map((adjunto) => ({
    id: adjunto.id,
    tipo: adjunto.tipo,
    url: adjunto.url,
    urlMiniatura: adjunto.urlMiniatura,
    urlDescarga: adjunto.urlDescarga,
    nombre: adjunto.nombre,
    tamanoBytes: adjunto.tamanoBytes,
  }));
}

/** Las fotos de una propiedad en la web pública. Solo fotos: sin documentos. */
export function elementosDeUnaPropiedadEnLaWeb(propiedad: PropiedadEnLaWeb): ElementoDelVisor[] {
  return propiedad.fotos.map((foto) => ({
    id: foto.id,
    tipo: "imagen" as const,
    url: foto.url,
    urlMiniatura: foto.urlMiniatura,
    nombre: foto.titulo ?? propiedad.nombre,
    titulo: foto.titulo,
    descripcion: foto.descripcion,
  }));
}
