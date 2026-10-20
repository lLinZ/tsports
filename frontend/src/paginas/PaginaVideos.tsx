/**
 * paginas/PaginaVideos.tsx
 * ---------------------------------------------------------------------
 * Los vídeos tutoriales, agrupados por guía. Desde el 2026-10-20.
 *
 * Son vídeos cortos, uno por tarea, grabados sobre una agencia de
 * ejemplo. Cada quien ve los de su rol y los de debajo: el agente, los
 * del agente; el comercial, además los suyos; el administrador, todos.
 * Eso lo decide el servidor (RolUsuario::guiasDeVideoQueVe): esta
 * pantalla pinta lo que le llega, sin mirar roles.
 *
 * Los vídeos viven en el disco privado y se abren con enlace firmado que
 * caduca (regla 21), y se sirven por trozos para que Safari los
 * reproduzca. Al acabar uno se ofrece el siguiente, y se marca como visto
 * en este navegador (useVideosVistos).
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { ChevronRight, CircleCheck, Clapperboard, GraduationCap, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { mensajeDeError } from "@/api/clienteHttp";
import { BloqueDeCarga, BloqueDeError, EstadoVacio } from "@/componentes/comunes/EstadosDePantalla";
import { IndiceDeSecciones, SeccionDePantalla } from "@/componentes/comunes/SeccionDePantalla";
import { useVideos, useVideosVistos } from "@/hooks/useVideos";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import type { GuiaDeVideo, VideoTutorial } from "@/tipos/modelos";

/** Lo que dice cada serie bajo su título. */
const DE_QUE_VA_LA_GUIA: Record<GuiaDeVideo, string> = {
  agente: "El trabajo de cada día con tus marcas: el tablero, la ficha, la bitácora, «Contacté» y los recordatorios.",
  comercial: "Repartir el trabajo, la agenda del equipo, los reportes, el catálogo, las campañas, los sectores y la web.",
  administrador: "Lo que solo hace el administrador: las cuentas del equipo, la auditoría y los ajustes.",
};

/** «2:26»: los vídeos duran minutos, nunca horas. */
function formatearDuracion(segundos: number): string {
  const minutos = Math.floor(segundos / 60);

  return `${minutos}:${String(segundos % 60).padStart(2, "0")}`;
}

/** «8 vídeos · 21 min». */
function resumenDeLaGuia(videos: VideoTutorial[]): string {
  const minutos = Math.round(videos.reduce((suma, video) => suma + video.duracionSegundos, 0) / 60);

  return `${videos.length} ${videos.length === 1 ? "vídeo" : "vídeos"} · ${minutos} min`;
}

export function PaginaVideos() {
  const usuario = useUsuarioAutenticado();
  const { videos, estaCargando, error, recargar } = useVideos();
  const { vistos, marcarComoVisto } = useVideosVistos(usuario.id);
  const [elegido, establecerElegido] = useState<VideoTutorial | null>(null);

  // Llegan ya ordenados del servidor: aquí solo se agrupan.
  const porGuia = useMemo(() => {
    const grupos = new Map<GuiaDeVideo, { etiqueta: string; videos: VideoTutorial[] }>();

    for (const video of videos) {
      const grupo = grupos.get(video.guia) ?? { etiqueta: video.guiaEtiqueta, videos: [] };
      grupo.videos.push(video);
      grupos.set(video.guia, grupo);
    }

    return [...grupos.entries()].map(([guia, grupo]) => ({ guia, ...grupo }));
  }, [videos]);

  const posicionDelElegido = elegido ? videos.findIndex((video) => video.id === elegido.id) : -1;
  const siguiente = posicionDelElegido >= 0 ? (videos[posicionDelElegido + 1] ?? null) : null;

  if (estaCargando) {
    return <BloqueDeCarga alto="min-h-60" mensaje="Cargando los vídeos…" />;
  }

  if (error) {
    return <BloqueDeError alReintentar={() => void recargar()} mensaje={mensajeDeError(error)} />;
  }

  if (videos.length === 0) {
    return (
      <div className="bento-card">
        <EstadoVacio
          descripcion="Cuando se carguen los vídeos de tu guía, aparecerán aquí."
          icono={<Clapperboard className="size-5" />}
          titulo="Todavía no hay vídeos"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="max-w-3xl text-sm text-default-500">
          Vídeos cortos, uno por tarea, de unos dos minutos y medio. Están grabados sobre una
          agencia de ejemplo, con subtítulos: se pueden ver sin sonido.
        </p>

        {porGuia.length > 1 && (
          <IndiceDeSecciones
            secciones={porGuia.map((grupo) => ({
              id: `guia-${grupo.guia}`,
              titulo: grupo.etiqueta,
              icono: <GraduationCap />,
            }))}
          />
        )}
      </div>

      {porGuia.map((grupo) => (
        <SeccionDePantalla
          key={grupo.guia}
          descripcion={`${DE_QUE_VA_LA_GUIA[grupo.guia]} ${resumenDeLaGuia(grupo.videos)}.`}
          icono={<GraduationCap className="size-4" />}
          id={`guia-${grupo.guia}`}
          titulo={grupo.etiqueta}
        >
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {grupo.videos.map((video) => (
              <li key={video.id}>
                <TarjetaDeVideo
                  estaVisto={vistos.has(video.clave)}
                  video={video}
                  alElegir={() => establecerElegido(video)}
                />
              </li>
            ))}
          </ul>
        </SeccionDePantalla>
      ))}

      <Reproductor
        siguiente={siguiente}
        video={elegido}
        alCerrar={() => establecerElegido(null)}
        alElegir={establecerElegido}
        alTerminar={marcarComoVisto}
      />
    </div>
  );
}

/* ==================================================================== */
/* Un vídeo de la lista                                                 */
/* ==================================================================== */

function TarjetaDeVideo({
  video,
  estaVisto,
  alElegir,
}: {
  video: VideoTutorial;
  estaVisto: boolean;
  alElegir: () => void;
}) {
  return (
    <button
      className="bento-card bento-card-interactive group flex h-full w-full flex-col overflow-hidden text-left"
      type="button"
      onClick={alElegir}
    >
      <span className="relative block aspect-video w-full overflow-hidden bg-default-900">
        {video.portada && (
          <img
            alt=""
            className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            src={video.portada}
          />
        )}

        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition group-hover:bg-primary">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </span>

        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
          {formatearDuracion(video.duracionSegundos)}
        </span>

        {estaVisto && (
          <Chip
            className="absolute left-2 top-2"
            color="success"
            radius="full"
            size="sm"
            startContent={<CircleCheck className="size-3.5" />}
            variant="solid"
          >
            Visto
          </Chip>
        )}
      </span>

      <span className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          Vídeo {video.orden}
        </span>
        <span className="text-sm font-semibold leading-snug text-foreground">{video.titulo}</span>
        {video.descripcion && (
          <span className="line-clamp-2 text-xs leading-relaxed text-default-500">{video.descripcion}</span>
        )}
      </span>
    </button>
  );
}

/* ==================================================================== */
/* El reproductor                                                       */
/* ==================================================================== */

function Reproductor({
  video,
  siguiente,
  alCerrar,
  alElegir,
  alTerminar,
}: {
  video: VideoTutorial | null;
  siguiente: VideoTutorial | null;
  alCerrar: () => void;
  alElegir: (video: VideoTutorial) => void;
  alTerminar: (clave: string) => void;
}) {
  const [haTerminado, establecerHaTerminado] = useState(false);

  // Al cambiar de vídeo vuelve a estar sin terminar. Se hace al pintar y
  // no en un efecto, para que el botón «Siguiente» no parpadee.
  const [claveAnterior, establecerClaveAnterior] = useState<string | null>(null);
  if ((video?.clave ?? null) !== claveAnterior) {
    establecerClaveAnterior(video?.clave ?? null);
    establecerHaTerminado(false);
  }

  return (
    <Modal
      isOpen={video !== null}
      placement="center"
      radius="lg"
      scrollBehavior="inside"
      size="5xl"
      onOpenChange={(abierto) => !abierto && alCerrar()}
    >
      <ModalContent>
        {video && (
          <>
            <ModalHeader className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {video.guiaEtiqueta} · Vídeo {video.orden}
              </span>
              <span className="text-lg font-bold tracking-tight">{video.titulo}</span>
            </ModalHeader>

            <ModalBody className="gap-3">
              {video.url ? (
                // La clave obliga a montar un <video> nuevo al pasar al
                // siguiente: reutilizar el mismo seguiría en el segundo
                // en que acabó el anterior.
                <video
                  key={video.clave}
                  autoPlay
                  controls
                  playsInline
                  // Con tope de alto: en un portátil de 720 px, a lo ancho
                  // no cabía y los controles quedaban debajo, fuera de vista.
                  className="aspect-video max-h-[60dvh] w-full rounded-xl bg-black object-contain"
                  poster={video.portada ?? undefined}
                  preload="metadata"
                  src={video.url}
                  onEnded={() => {
                    establecerHaTerminado(true);
                    alTerminar(video.clave);
                  }}
                />
              ) : (
                <p className="rounded-xl bg-default-100 p-6 text-center text-sm text-default-500">
                  Este vídeo no tiene fichero. Avisa al administrador.
                </p>
              )}

              {video.descripcion && (
                <p className="text-sm leading-relaxed text-default-600">{video.descripcion}</p>
              )}
            </ModalBody>

            <ModalFooter>
              <Button radius="lg" variant="light" onPress={alCerrar}>
                Cerrar
              </Button>

              {siguiente && (
                <Button
                  color="primary"
                  endContent={<ChevronRight className="size-4" />}
                  radius="lg"
                  variant={haTerminado ? "solid" : "flat"}
                  onPress={() => alElegir(siguiente)}
                >
                  Siguiente: {siguiente.titulo}
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
