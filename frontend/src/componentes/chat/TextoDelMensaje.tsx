/**
 * componentes/chat/TextoDelMensaje.tsx
 * ---------------------------------------------------------------------
 * El texto de un mensaje, con sus marcas etiquetadas y sus enlaces.
 *
 * Las marcas llegan dentro del texto como `[[marca:<id>]]`, en el sitio
 * donde se nombraron, y aquí se cambian por un chip. Lo que lleva cada
 * chip lo decidió el servidor para QUIEN MIRA: con logo y pulsable si
 * puede abrir la marca; solo el nombre si no (regla 6). Aquí no se
 * decide nada de eso, solo se pinta.
 *
 * Los enlaces (http/https) se pueden pulsar y se abren aparte. Y un
 * mensaje que es solo uno, dos o tres emoji se ve en grande, como en
 * cualquier chat: un «👍» del tamaño de la letra se pierde.
 * ---------------------------------------------------------------------
 */
import { Tooltip } from "@heroui/react";
import { Hash } from "lucide-react";
import type { ReactNode } from "react";
import type { MarcaEnMensaje, MensajeDeChat } from "@/tipos/modelos";

/** Una marca etiquetada o un enlace, lo que aparezca antes. */
const PATRON_DE_MARCA_O_ENLACE = /\[\[marca:([0-9a-fA-F-]{36})\]\]|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"»])/g;

const PATRON_SOLO_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍|\s)+$/u;
const PATRON_UN_EMOJI = /\p{Extended_Pictographic}/gu;

export function TextoDelMensaje({
  mensaje,
  alAbrirMarca,
}: {
  mensaje: MensajeDeChat;
  alAbrirMarca: (enlace: string) => void;
}) {
  const texto = mensaje.cuerpo;

  const esSoloEmoji =
    PATRON_SOLO_EMOJI.test(texto) && (texto.match(PATRON_UN_EMOJI)?.length ?? 0) <= 3;

  if (esSoloEmoji) {
    return <p className="text-4xl leading-tight">{texto}</p>;
  }

  const marcasPorId = new Map(mensaje.marcas.map((marca) => [marca.id.toLowerCase(), marca]));
  const partes: ReactNode[] = [];
  let desde = 0;

  for (const coincidencia of texto.matchAll(PATRON_DE_MARCA_O_ENLACE)) {
    const posicion = coincidencia.index ?? 0;

    if (posicion > desde) {
      partes.push(texto.slice(desde, posicion));
    }

    const [completo, idDeLaMarca, enlace] = coincidencia;

    if (idDeLaMarca !== undefined) {
      partes.push(
        <ChipDeMarca
          key={`marca-${posicion}`}
          alAbrir={alAbrirMarca}
          esMio={mensaje.esMio}
          marca={marcasPorId.get(idDeLaMarca.toLowerCase())}
        />,
      );
    } else if (enlace !== undefined) {
      partes.push(
        <a
          key={`enlace-${posicion}`}
          className="break-all underline underline-offset-2"
          href={enlace}
          rel="noopener noreferrer"
          target="_blank"
          onClick={(evento) => evento.stopPropagation()}
        >
          {enlace}
        </a>,
      );
    }

    desde = posicion + completo.length;
  }

  if (desde < texto.length) {
    partes.push(texto.slice(desde));
  }

  return <p className="whitespace-pre-wrap break-words">{partes}</p>;
}

function ChipDeMarca({
  marca,
  esMio,
  alAbrir,
}: {
  marca: MarcaEnMensaje | undefined;
  esMio: boolean;
  alAbrir: (enlace: string) => void;
}) {
  const clases = [
    "mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 align-middle text-[0.9em] font-semibold",
    esMio
      ? "bg-white/20 text-white"
      : "bg-primary-100 text-primary-700 dark:bg-primary-100/20 dark:text-primary-300",
  ].join(" ");

  const contenido = (
    <>
      {marca?.logoUrl ? (
        <img alt="" className="size-5 shrink-0 rounded-full bg-white object-cover" src={marca.logoUrl} />
      ) : (
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Hash className="size-3.5" />
        </span>
      )}
      <span className="truncate">{marca?.nombre ?? "marca"}</span>
    </>
  );

  if (marca?.enlace) {
    const enlace = marca.enlace;

    return (
      <button
        className={`${clases} transition hover:opacity-80`}
        title={`Abrir la ficha de ${marca.nombre}`}
        type="button"
        onClick={(evento) => {
          evento.stopPropagation();
          alAbrir(enlace);
        }}
      >
        {contenido}
      </button>
    );
  }

  return (
    <Tooltip content="No llevas esta marca: solo ves su nombre." placement="top">
      <span className={clases}>{contenido}</span>
    </Tooltip>
  );
}
