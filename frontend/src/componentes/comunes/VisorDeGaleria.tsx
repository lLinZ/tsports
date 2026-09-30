/**
 * componentes/comunes/VisorDeGaleria.tsx
 * ---------------------------------------------------------------------
 * Las fotos y documentos a pantalla completa. Es lo que el vendedor le
 * pone delante al cliente en la reunión, así que manda la foto: fondo
 * negro, nada alrededor que distraiga, y se pasa de una a otra como en
 * el teléfono.
 *
 *   · Con el teclado: ← y → para pasar, Inicio y Fin para ir a los
 *     extremos, Esc para salir.
 *   · Con el dedo: deslizar a los lados.
 *   · Un PDF no se pinta dentro (en el móvil no hay visor de PDF que
 *     meter en una página): sale como tarjeta con «Abrir» y «Descargar».
 *
 * Lo usan la galería de una propiedad, el checklist de la ficha de una
 * marca, los adjuntos de la bitácora y el catálogo de la web pública. No
 * sabe de dónde vienen las piezas: recibe la lista ya hecha.
 * ---------------------------------------------------------------------
 */
import { Button, Modal, ModalContent, Spinner } from "@heroui/react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { formatearTamanoDeFichero } from "@/utilidades/formato";

/** Una pieza que el visor sabe enseñar. */
export interface ElementoDelVisor {
  id: string;
  tipo: "imagen" | "documento";
  /** La foto entera o el PDF. */
  url: string;
  urlMiniatura?: string | null;
  /** Si no se da, se descarga desde `url`. */
  urlDescarga?: string | null;
  nombre: string;
  titulo?: string | null;
  descripcion?: string | null;
  tamanoBytes?: number;
}

interface PropiedadesDelVisor {
  elementos: ElementoDelVisor[];
  posicionInicial: number;
  estaAbierto: boolean;
  alCerrar: () => void;
  /** De qué es la galería: el nombre de la propiedad o de la marca. */
  titulo?: string;
  /** Textos de los botones, por si el visor se usa en la web en inglés. */
  textos?: Partial<Record<"abrir" | "descargar" | "de", string>>;
}

/** Lo que tiene que moverse el dedo para contar como «pasar». */
const DESPLAZAMIENTO_MINIMO_DEL_DEDO = 50;

export function VisorDeGaleria({
  elementos,
  posicionInicial,
  estaAbierto,
  alCerrar,
  titulo,
  textos = {},
}: PropiedadesDelVisor) {
  return (
    <Modal
      hideCloseButton
      classNames={{
        base: "bg-neutral-950 text-white",
        wrapper: "z-[70]",
        backdrop: "z-[70]",
      }}
      isOpen={estaAbierto && elementos.length > 0}
      size="full"
      onOpenChange={(abierto) => {
        if (!abierto) alCerrar();
      }}
    >
      {/* El contenido se monta al abrir y se desmonta al cerrar: así cada
          vez empieza en la pieza que se pulsó, sin arrastrar la de antes. */}
      <ModalContent>
        <ContenidoDelVisor
          alCerrar={alCerrar}
          elementos={elementos}
          posicionInicial={posicionInicial}
          textos={textos}
          titulo={titulo}
        />
      </ModalContent>
    </Modal>
  );
}

function ContenidoDelVisor({
  elementos,
  posicionInicial,
  alCerrar,
  titulo,
  textos = {},
}: Omit<PropiedadesDelVisor, "estaAbierto">) {
  const [posicion, establecerPosicion] = useState(posicionInicial);

  const total = elementos.length;
  const posicionSegura = Math.min(Math.max(posicion, 0), Math.max(total - 1, 0));
  const actual = elementos[posicionSegura];

  function irA(posicionNueva: number) {
    if (total === 0) return;

    establecerPosicion(Math.min(Math.max(posicionNueva, 0), total - 1));
  }

  // El teclado, mientras está abierto. Esc lo gestiona el propio modal.
  useEffect(() => {
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === "ArrowRight") establecerPosicion((antes) => Math.min(antes + 1, total - 1));
      if (evento.key === "ArrowLeft") establecerPosicion((antes) => Math.max(antes - 1, 0));
      if (evento.key === "Home") establecerPosicion(0);
      if (evento.key === "End") establecerPosicion(total - 1);
    }

    window.addEventListener("keydown", alPulsarTecla);

    return () => window.removeEventListener("keydown", alPulsarTecla);
  }, [total]);

  // Se adelanta la descarga de la anterior y la siguiente: al pasar, la
  // foto ya está y no se ve el hueco mientras llega.
  useEffect(() => {
    for (const vecina of [elementos[posicionSegura - 1], elementos[posicionSegura + 1]]) {
      if (vecina?.tipo === "imagen") {
        const precarga = new Image();
        precarga.src = vecina.url;
      }
    }
  }, [elementos, posicionSegura]);

  const inicioDelDedo = useRef<{ x: number; y: number } | null>(null);

  function alTocar(evento: TouchEvent) {
    const dedo = evento.touches[0];

    inicioDelDedo.current = dedo ? { x: dedo.clientX, y: dedo.clientY } : null;
  }

  function alSoltar(evento: TouchEvent) {
    const inicio = inicioDelDedo.current;
    const dedo = evento.changedTouches[0];

    inicioDelDedo.current = null;

    if (!inicio || !dedo) return;

    const horizontal = dedo.clientX - inicio.x;
    const vertical = dedo.clientY - inicio.y;

    // Solo cuenta si fue sobre todo de lado: un gesto hacia abajo es otra
    // cosa, y no debería cambiar de foto.
    if (Math.abs(horizontal) < DESPLAZAMIENTO_MINIMO_DEL_DEDO || Math.abs(horizontal) < Math.abs(vertical)) {
      return;
    }

    irA(horizontal < 0 ? posicionSegura + 1 : posicionSegura - 1);
  }

  const textoDe = textos.de ?? "de";

  if (actual === undefined) return null;

  return (
    <div
      className="flex h-full min-h-0 flex-col select-none"
      onTouchEnd={alSoltar}
      onTouchStart={alTocar}
    >
      {/* Cabecera: de qué es, en cuál va y las salidas. */}
      <header className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{titulo ?? actual.nombre}</p>
          <p className="text-xs text-white/60">
            {posicionSegura + 1} {textoDe} {total}
          </p>
        </div>

        <Button
          isIconOnly
          aria-label={textos.descargar ?? "Descargar"}
          as="a"
          className="text-white"
          download={actual.nombre}
          href={actual.urlDescarga ?? actual.url}
          radius="full"
          variant="light"
        >
          <Download className="size-5" />
        </Button>

        <Button
          isIconOnly
          aria-label="Cerrar"
          className="text-white"
          radius="full"
          variant="light"
          onPress={alCerrar}
        >
          <X className="size-5" />
        </Button>
      </header>

      {/* La pieza, con las flechas a los lados. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
        {actual.tipo === "imagen" ? (
          <FotoDelVisor key={actual.id} elemento={actual} />
        ) : (
          <DocumentoDelVisor elemento={actual} textos={textos} />
        )}

        {posicionSegura > 0 && (
          <FlechaDelVisor direccion="anterior" onPress={() => irA(posicionSegura - 1)} />
        )}
        {posicionSegura < total - 1 && (
          <FlechaDelVisor direccion="siguiente" onPress={() => irA(posicionSegura + 1)} />
        )}
      </div>

      {/* Lo que se cuenta de ella y la tira para saltar. */}
      <footer className="px-4 pb-4 pt-3">
        {(actual.titulo || actual.descripcion) && (
          <div className="mx-auto mb-3 max-w-3xl text-center">
            {actual.titulo && <p className="text-sm font-semibold">{actual.titulo}</p>}
            {actual.descripcion && (
              <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-white/70">
                {actual.descripcion}
              </p>
            )}
          </div>
        )}

        {total > 1 && (
          <TiraDeMiniaturas
            elementos={elementos}
            posicionActual={posicionSegura}
            alElegir={irA}
          />
        )}
      </footer>
    </div>
  );
}

/* ==================================================================== */
/* Piezas del visor                                                     */
/* ==================================================================== */

function FotoDelVisor({ elemento }: { elemento: ElementoDelVisor }) {
  const [estaCargada, establecerCargada] = useState(false);

  return (
    <>
      {!estaCargada && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Mientras llega la grande, la pequeña ya da una idea. */}
          {elemento.urlMiniatura && (
            <img
              alt=""
              className="max-h-full max-w-full object-contain opacity-60 blur-sm"
              src={elemento.urlMiniatura}
            />
          )}
          <Spinner className="absolute" color="white" />
        </div>
      )}

      <img
        alt={elemento.titulo ?? elemento.nombre}
        className={[
          "max-h-full max-w-full rounded-lg object-contain transition-opacity duration-200",
          estaCargada ? "opacity-100" : "opacity-0",
        ].join(" ")}
        draggable={false}
        src={elemento.url}
        onError={() => establecerCargada(true)}
        onLoad={() => establecerCargada(true)}
      />
    </>
  );
}

function DocumentoDelVisor({
  elemento,
  textos,
}: {
  elemento: ElementoDelVisor;
  textos: PropiedadesDelVisor["textos"];
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-white/10 px-6 py-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-white/10">
        <FileText className="size-8" />
      </span>

      <div className="min-w-0">
        <p className="break-words text-sm font-semibold">{elemento.titulo ?? elemento.nombre}</p>
        <p className="mt-1 text-xs text-white/60">
          PDF
          {elemento.tamanoBytes !== undefined && ` · ${formatearTamanoDeFichero(elemento.tamanoBytes)}`}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          as="a"
          className="bg-white font-semibold text-neutral-900"
          href={elemento.url}
          radius="full"
          rel="noreferrer"
          startContent={<ExternalLink className="size-4" />}
          target="_blank"
        >
          {textos?.abrir ?? "Abrir"}
        </Button>

        <Button
          as="a"
          className="text-white"
          download={elemento.nombre}
          href={elemento.urlDescarga ?? elemento.url}
          radius="full"
          startContent={<Download className="size-4" />}
          variant="bordered"
        >
          {textos?.descargar ?? "Descargar"}
        </Button>
      </div>
    </div>
  );
}

function FlechaDelVisor({
  direccion,
  onPress,
}: {
  direccion: "anterior" | "siguiente";
  onPress: () => void;
}) {
  const esAnterior = direccion === "anterior";

  return (
    <button
      aria-label={esAnterior ? "Anterior" : "Siguiente"}
      className={[
        "absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full",
        "bg-white/10 text-white backdrop-blur transition hover:bg-white/25",
        esAnterior ? "left-2 sm:left-4" : "right-2 sm:right-4",
      ].join(" ")}
      type="button"
      onClick={onPress}
    >
      {esAnterior ? <ChevronLeft className="size-6" /> : <ChevronRight className="size-6" />}
    </button>
  );
}

/**
 * La tira de abajo para saltar a cualquiera. La actual se queda siempre
 * a la vista aunque la tira sea más ancha que la pantalla.
 */
function TiraDeMiniaturas({
  elementos,
  posicionActual,
  alElegir,
}: {
  elementos: ElementoDelVisor[];
  posicionActual: number;
  alElegir: (posicion: number) => void;
}) {
  const referenciaALaTira = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const botonActual = referenciaALaTira.current?.children[posicionActual];

    if (botonActual instanceof HTMLElement) {
      botonActual.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }, [posicionActual]);

  return (
    <div
      ref={referenciaALaTira}
      className="mx-auto flex max-w-3xl justify-start gap-2 overflow-x-auto pb-1 sm:justify-center"
    >
      {elementos.map((elemento, posicion) => (
        <button
          key={elemento.id}
          aria-label={`Ver ${elemento.titulo ?? elemento.nombre}`}
          className={[
            "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl transition",
            posicion === posicionActual
              ? "ring-2 ring-white"
              : "opacity-50 hover:opacity-90",
          ].join(" ")}
          type="button"
          onClick={() => alElegir(posicion)}
        >
          {elemento.tipo === "imagen" ? (
            <img
              alt=""
              className="size-full object-cover"
              draggable={false}
              loading="lazy"
              src={elemento.urlMiniatura ?? elemento.url}
            />
          ) : (
            <span className="flex size-full items-center justify-center bg-white/10">
              <FileText className="size-5" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
