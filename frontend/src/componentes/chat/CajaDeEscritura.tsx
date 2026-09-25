/**
 * componentes/chat/CajaDeEscritura.tsx
 * ---------------------------------------------------------------------
 * Donde se escribe un mensaje: texto, emoji y marcas etiquetadas.
 *
 * ETIQUETAR UNA MARCA. Con el botón «#» o escribiendo «#», se abre el
 * buscador de marcas (solo las que esta persona puede ver) y la elegida
 * entra en el texto como «#Nombre». Mientras se escribe es texto normal
 * —se puede borrar, mover, corregir alrededor—, y al enviar, cada
 * «#Nombre» que siga en el texto se convierte en la etiqueta de verdad,
 * `[[marca:<id>]]`, que el servidor comprueba y la otra persona ve como
 * chip. Si se borró del texto, no se manda: lo que se ve es lo que va.
 *
 * El buscador de marcas se abre DENTRO del chat, encima del cuadro, y no
 * en un desplegable flotante: el desplegable de HeroUI devuelve el foco a
 * su botón al cerrarse, y lo que se tecleaba justo después de elegir la
 * marca se perdía.
 *
 * ENTER ENVÍA en un ordenador, y Mayúsculas + Enter salta de línea. En
 * un teléfono (pantalla táctil) Enter salta de línea y se envía con el
 * botón, que es lo que hace cualquier chat en el móvil: ahí no hay
 * Mayúsculas + Enter cómodo.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Textarea } from "@heroui/react";
import { Hash, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BuscadorDeMarcas, LogoPequenoDeMarca } from "@/componentes/comunes/BuscadorDeMarcas";
import { SelectorDeEmoji } from "@/componentes/chat/SelectorDeEmoji";
import { useEnviarMensaje } from "@/hooks/useChat";
import { useChat } from "@/providers/ProveedorChat";
import { avisarDeError } from "@/utilidades/avisos";

/** Una marca puesta en el texto, y cómo se ve escrita. */
interface EtiquetaEnElTexto {
  id: string;
  nombre: string;
  logoUrl: string | null;
  /** "#Nombre de la marca", tal y como está en el cuadro. */
  escrita: string;
}

const LONGITUD_MAXIMA = 4000;

export function CajaDeEscritura({
  idDeLaConversacion,
  alEnviar,
}: {
  idDeLaConversacion: string;
  /** Tras enviar: la charla baja al final para enseñar lo que se mandó. */
  alEnviar?: () => void;
}) {
  const { tomarMarcaParaCompartir } = useChat();
  const enviar = useEnviarMensaje(idDeLaConversacion);

  const [texto, establecerTexto] = useState("");
  const [etiquetas, establecerEtiquetas] = useState<EtiquetaEnElTexto[]>([]);
  const [buscandoMarca, establecerBuscandoMarca] = useState(false);

  const cuadro = useRef<HTMLTextAreaElement>(null);
  /** Dónde estaba el cursor al abrir el buscador, para poner ahí la marca. */
  const cursorAlAbrir = useRef<number | null>(null);

  // Si se llegó aquí desde «Enviar por chat» en la ficha de una marca,
  // la marca ya viene puesta.
  useEffect(() => {
    const pendiente = tomarMarcaParaCompartir();

    if (pendiente !== null) {
      const escrita = `#${pendiente.nombre}`;
      establecerTexto(`${escrita} `);
      establecerEtiquetas([{ ...pendiente, escrita }]);
    }

    window.setTimeout(() => cuadro.current?.focus(), 0);
    // Solo al abrir la charla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDeLaConversacion]);

  /** Mete un trozo de texto donde está el cursor y deja el cursor detrás. */
  function insertar(
    fragmento: string,
    { quitarAlmohadillaPrevia = false, devolverElFoco = true } = {},
  ) {
    const campo = cuadro.current;
    const inicio = cursorAlAbrir.current ?? campo?.selectionStart ?? texto.length;
    const fin = cursorAlAbrir.current ?? campo?.selectionEnd ?? texto.length;
    cursorAlAbrir.current = null;

    // Si el buscador se abrió tecleando «#», esa almohadilla la sustituye
    // la marca: si no, quedaría «##Nombre».
    const empiezaEn = quitarAlmohadillaPrevia && texto[inicio - 1] === "#" ? inicio - 1 : inicio;

    const antes = texto.slice(0, empiezaEn);
    const despues = texto.slice(fin);
    const nuevo = `${antes}${fragmento}${despues}`;

    establecerTexto(nuevo);

    const cursor = antes.length + fragmento.length;

    window.setTimeout(() => {
      if (devolverElFoco) campo?.focus();
      campo?.setSelectionRange(cursor, cursor);
    }, 0);
  }

  function abrirBuscadorDeMarcas() {
    cursorAlAbrir.current = cuadro.current?.selectionStart ?? texto.length;
    establecerBuscandoMarca(true);
  }

  function cerrarBuscadorDeMarcas() {
    establecerBuscandoMarca(false);
    cursorAlAbrir.current = null;
    window.setTimeout(() => cuadro.current?.focus(), 0);
  }

  // Las que siguen escritas en el texto: son las que se mandan y las que
  // se enseñan debajo.
  const etiquetasVigentes = etiquetas.filter((etiqueta) => texto.includes(etiqueta.escrita));

  const puedeEnviar = texto.trim() !== "" && texto.length <= LONGITUD_MAXIMA && !enviar.isPending;

  async function mandar() {
    if (!puedeEnviar) return;

    // Primero las más largas: si hay «#Polar» y «#Polar Light», cambiar
    // antes la corta rompería la larga.
    const cuerpo = [...etiquetasVigentes]
      .sort((una, otra) => otra.escrita.length - una.escrita.length)
      .reduce((acumulado, etiqueta) => acumulado.split(etiqueta.escrita).join(`[[marca:${etiqueta.id}]]`), texto.trim());

    try {
      await enviar.mutateAsync(cuerpo);
      establecerTexto("");
      establecerEtiquetas([]);
      alEnviar?.();
      cuadro.current?.focus();
    } catch (error) {
      avisarDeError(error, "No se pudo enviar el mensaje");
    }
  }

  const esPantallaTactil =
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  return (
    <div className="flex flex-col gap-1.5 border-t border-default-100 px-3 py-2.5">
      {buscandoMarca && (
        <div className="rounded-2xl bg-default-50 p-2 dark:bg-default-100/40">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-default-400">
              Etiquetar una marca
            </p>
            <button
              aria-label="Cerrar el buscador de marcas"
              className="rounded-full p-0.5 text-default-400 transition hover:text-foreground"
              type="button"
              onClick={cerrarBuscadorDeMarcas}
            >
              <X className="size-4" />
            </button>
          </div>

          <BuscadorDeMarcas
            enfocarAlMontar
            listaSiempreVisible
            alEscape={cerrarBuscadorDeMarcas}
            idsYaElegidos={etiquetasVigentes.map((etiqueta) => etiqueta.id)}
            alElegir={(marca) => {
              const escrita = `#${marca.nombre}`;
              insertar(`${escrita} `, { quitarAlmohadillaPrevia: true });
              establecerEtiquetas((actuales) => [
                ...actuales.filter((otra) => otra.id !== marca.id),
                { id: marca.id, nombre: marca.nombre, logoUrl: marca.logoUrl, escrita },
              ]);
              establecerBuscandoMarca(false);
            }}
          />
        </div>
      )}

      {etiquetasVigentes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {etiquetasVigentes.map((etiqueta) => (
            <Chip
              key={etiqueta.id}
              avatar={<LogoPequenoDeMarca marca={etiqueta} tamano="size-5" />}
              color="primary"
              radius="full"
              size="sm"
              variant="flat"
              onClose={() => {
                // Quitar el chip quita la marca del texto.
                establecerTexto((actual) => actual.split(etiqueta.escrita).join("").replace(/ {2,}/g, " "));
                establecerEtiquetas((actuales) => actuales.filter((otra) => otra.id !== etiqueta.id));
              }}
            >
              {etiqueta.nombre}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1">
        {/* Con el panel de emoji abierto el foco se queda en él, para
            poder poner varios seguidos; vuelve al cuadro al cerrarlo, y
            un poco después, porque HeroUI lo devuelve primero a su botón. */}
        <SelectorDeEmoji
          alCerrar={() => window.setTimeout(() => cuadro.current?.focus(), 120)}
          alElegir={(emoji) => insertar(emoji, { devolverElFoco: false })}
        />

        <Button
          isIconOnly
          aria-label="Etiquetar una marca"
          aria-pressed={buscandoMarca}
          radius="full"
          size="sm"
          variant={buscandoMarca ? "flat" : "light"}
          onPress={() => (buscandoMarca ? cerrarBuscadorDeMarcas() : abrirBuscadorDeMarcas())}
        >
          <Hash className="size-5 text-default-500" />
        </Button>

        <Textarea
          ref={cuadro}
          aria-label="Escribe un mensaje"
          className="min-w-0 flex-1"
          classNames={{ inputWrapper: "min-h-10 py-2", input: "text-sm" }}
          maxRows={6}
          minRows={1}
          placeholder="Escribe un mensaje…"
          radius="lg"
          value={texto}
          variant="flat"
          onKeyDown={(evento) => {
            if (evento.key === "Enter" && !evento.shiftKey && !esPantallaTactil && !evento.nativeEvent.isComposing) {
              evento.preventDefault();
              void mandar();
            }
          }}
          onValueChange={(valor) => {
            // Una «#» recién tecleada al principio de una palabra abre el
            // buscador de marcas, que es lo que se espera en un chat.
            const cursor = cuadro.current?.selectionStart ?? valor.length;
            const recienEscrita = valor.length === texto.length + 1 && valor[cursor - 1] === "#";
            const alPrincipioDePalabra = cursor === 1 || /\s/.test(valor[cursor - 2] ?? " ");

            establecerTexto(valor);

            if (recienEscrita && alPrincipioDePalabra) {
              cursorAlAbrir.current = cursor;
              establecerBuscandoMarca(true);
            }
          }}
        />

        <Button
          isIconOnly
          aria-label="Enviar"
          color="primary"
          isDisabled={!puedeEnviar}
          isLoading={enviar.isPending}
          radius="full"
          onPress={() => void mandar()}
        >
          {!enviar.isPending && <SendHorizontal className="size-4" />}
        </Button>
      </div>

      {texto.length > LONGITUD_MAXIMA * 0.9 && (
        <p className={["text-right text-[10px]", texto.length > LONGITUD_MAXIMA ? "text-danger" : "text-default-400"].join(" ")}>
          {texto.length} / {LONGITUD_MAXIMA}
        </p>
      )}
    </div>
  );
}
