/**
 * hooks/useVideos.ts
 * ---------------------------------------------------------------------
 * Los vídeos tutoriales en la caché de datos, y cuáles ha visto ya cada
 * quien.
 *
 * La lista queda fuera de la copia sin conexión (`sinCopiaLocal`), como
 * los cierres de mes: cada vídeo lleva un enlace firmado que caduca en
 * uno o dos días, y una copia de hace una semana enseñaría vídeos que ya
 * no abren.
 *
 * «Visto» es una comodidad de este navegador (localStorage, con el id de
 * la persona en la clave): no cuenta para nada ni lo ve nadie más, así
 * que no merece una tabla en el servidor.
 * ---------------------------------------------------------------------
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { listarVideos } from "@/api/videos";
import type { VideoTutorial } from "@/tipos/modelos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";

export const CLAVE_DE_VIDEOS = ["videos"] as const;

export function useVideos() {
  const consulta = useQuery<VideoTutorial[]>({
    queryKey: CLAVE_DE_VIDEOS,
    queryFn: listarVideos,
    meta: { sinCopiaLocal: true },
  });

  return {
    videos: consulta.data ?? [],
    estaCargando: consulta.isLoading,
    error: errorSoloSiNoHayNadaQueEnsenar(consulta),
    recargar: consulta.refetch,
  };
}

function leerVistos(clave: string): Set<string> {
  try {
    const guardado = window.localStorage.getItem(clave);

    return new Set(guardado ? (JSON.parse(guardado) as string[]) : []);
  } catch {
    // Navegación privada o almacenamiento bloqueado: sin marcas, y ya.
    return new Set();
  }
}

/** Las claves de los vídeos que esta persona vio hasta el final en este navegador. */
export function useVideosVistos(idDeLaPersona: string) {
  const clave = `tsports:videos-vistos:${idDeLaPersona}`;
  const [vistos, establecerVistos] = useState(() => leerVistos(clave));

  const marcarComoVisto = useCallback(
    (claveDelVideo: string) => {
      establecerVistos((anteriores) => {
        if (anteriores.has(claveDelVideo)) return anteriores;

        const siguientes = new Set(anteriores).add(claveDelVideo);

        try {
          window.localStorage.setItem(clave, JSON.stringify([...siguientes]));
        } catch {
          // Igual que al leer: si no se puede guardar, se pierde la marca.
        }

        return siguientes;
      });
    },
    [clave],
  );

  return { vistos, marcarComoVisto };
}
