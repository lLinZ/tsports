/**
 * api/videos.ts
 * ---------------------------------------------------------------------
 * Los vídeos tutoriales de la pantalla «Vídeos». Solo lectura: se cargan
 * en el servidor con `php artisan videos:importar`.
 * ---------------------------------------------------------------------
 */
import { clienteHttp } from "@/api/clienteHttp";
import type { VideoTutorial } from "@/tipos/modelos";

export async function listarVideos(): Promise<VideoTutorial[]> {
  const { data } = await clienteHttp.get<{ data: VideoTutorial[] }>("/videos");

  return data.data;
}
