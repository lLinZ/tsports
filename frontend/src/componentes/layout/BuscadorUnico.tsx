/**
 * componentes/layout/BuscadorUnico.tsx
 * ---------------------------------------------------------------------
 * El buscador de la barra superior: un solo cuadro que encuentra marcas,
 * propiedades, campañas, sectores y personas.
 *
 * Se abre con el botón, con Ctrl+K (⌘K en el Mac) o con «/» cuando no se
 * está escribiendo en otro campo, y se recorre con las flechas y Enter:
 * es para quien quiere llegar a una marca sin soltar el teclado.
 *
 * Qué encuentra cada quien y a dónde lleva cada resultado lo decide el
 * servidor (BuscadorController): aquí no se filtra ni se compone ninguna
 * ruta. Una persona sin enlace es alguien cuya cartera no se ve; con ella
 * se abre una charla.
 * ---------------------------------------------------------------------
 */
import { Button, Input, Kbd, Modal, ModalBody, ModalContent } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Megaphone,
  MessageCircle,
  Package,
  Search,
  Tags,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buscarEnTodo } from "@/api/buscador";
import { useChat } from "@/providers/ProveedorChat";
import { inicialesDe } from "@/utilidades/formato";
import type { GrupoDelBuscador, ResultadoDelBuscador } from "@/tipos/modelos";

/** Espera tras la última tecla antes de preguntar. */
const RETARDO_AL_ESCRIBIR_MS = 200;

/** Por debajo de esto el servidor no busca (BuscadorController). */
const LETRAS_MINIMAS = 2;

/** Los grupos, en el orden en que se enseñan. */
const GRUPOS: Array<{ clave: GrupoDelBuscador; titulo: string; icono: LucideIcon }> = [
  { clave: "marcas", titulo: "Marcas", icono: Building2 },
  { clave: "propiedades", titulo: "Propiedades", icono: Package },
  { clave: "campanas", titulo: "Campañas", icono: Megaphone },
  { clave: "sectores", titulo: "Sectores", icono: Tags },
  { clave: "personas", titulo: "Personas", icono: UserRound },
];

/** ¿Está la persona escribiendo en otro sitio? Entonces «/» es una barra. */
function estaEscribiendoEnUnCampo(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false;

  return (
    destino.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(destino.tagName)
  );
}

/** En el Mac el atajo se escribe con ⌘; en los demás, con Ctrl. */
const ES_UN_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function BuscadorUnico() {
  const [estaAbierto, establecerAbierto] = useState(false);

  // El atajo vale en todo el panel.
  useEffect(() => {
    function alPulsarUnaTecla(evento: KeyboardEvent) {
      const esElAtajo = (evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k";
      const esLaBarra = evento.key === "/" && !estaEscribiendoEnUnCampo(evento.target);

      if (esElAtajo || esLaBarra) {
        evento.preventDefault();
        establecerAbierto(true);
      }
    }

    window.addEventListener("keydown", alPulsarUnaTecla);

    return () => window.removeEventListener("keydown", alPulsarUnaTecla);
  }, []);

  return (
    <>
      {/* En pantalla ancha, un cuadro que invita a escribir; en el
          móvil, solo la lupa. */}
      <Button
        className="hidden h-9 min-w-56 justify-start gap-2 border-default-200 text-default-500 lg:flex"
        radius="full"
        size="sm"
        startContent={<Search className="size-4" />}
        variant="bordered"
        onPress={() => establecerAbierto(true)}
      >
        <span className="flex-1 text-left text-sm">Buscar…</span>
        <Kbd className="text-[10px]" keys={ES_UN_MAC ? ["command"] : ["ctrl"]}>
          K
        </Kbd>
      </Button>

      <Button
        isIconOnly
        aria-label="Buscar"
        className="lg:hidden"
        radius="full"
        size="sm"
        variant="light"
        onPress={() => establecerAbierto(true)}
      >
        <Search className="size-5" />
      </Button>

      <Modal
        hideCloseButton
        isOpen={estaAbierto}
        placement="top"
        radius="lg"
        scrollBehavior="inside"
        size="xl"
        onOpenChange={establecerAbierto}
      >
        <ModalContent>
          {(cerrar) => <VentanaDelBuscador alTerminar={cerrar} />}
        </ModalContent>
      </Modal>
    </>
  );
}

/**
 * El contenido de la ventana. Va aparte para que se monte de cero cada
 * vez que se abre: así el cuadro sale vacío y con el cursor dentro.
 */
function VentanaDelBuscador({ alTerminar }: { alTerminar: () => void }) {
  const navegar = useNavigate();
  const { escribirA } = useChat();

  const [texto, establecerTexto] = useState("");
  const [textoBuscado, establecerTextoBuscado] = useState("");
  const [posicionActiva, establecerPosicionActiva] = useState(0);
  const listaDeResultados = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const temporizador = window.setTimeout(() => establecerTextoBuscado(texto.trim()), RETARDO_AL_ESCRIBIR_MS);

    return () => window.clearTimeout(temporizador);
  }, [texto]);

  const consulta = useQuery({
    queryKey: ["buscador", textoBuscado],
    queryFn: () => buscarEnTodo(textoBuscado),
    enabled: textoBuscado.length >= LETRAS_MINIMAS,
    // Lo de antes se queda mientras llega lo nuevo: la lista no parpadea.
    placeholderData: (anteriores) => anteriores,
    staleTime: 30_000,
    meta: { sinCopiaLocal: true },
  });

  // Todos los resultados en fila, para recorrerlos con las flechas.
  const enFila = useMemo(() => {
    if (textoBuscado.length < LETRAS_MINIMAS || consulta.data === undefined) return [];

    return GRUPOS.flatMap((grupo) =>
      consulta.data.resultados[grupo.clave].map((resultado) => ({ grupo: grupo.clave, resultado })),
    );
  }, [consulta.data, textoBuscado]);

  // Al cambiar los resultados se vuelve al primero.
  useEffect(() => establecerPosicionActiva(0), [enFila]);

  // El resultado elegido con las flechas se mantiene a la vista.
  useEffect(() => {
    listaDeResultados.current
      ?.querySelector(`[data-posicion="${posicionActiva}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [posicionActiva]);

  function elegir(grupo: GrupoDelBuscador, resultado: ResultadoDelBuscador) {
    alTerminar();

    if (resultado.enlace !== null) {
      navegar(resultado.enlace);

      return;
    }

    if (grupo === "personas") void escribirA(resultado.id);
  }

  function alPulsarEnElCuadro(evento: React.KeyboardEvent) {
    if (enFila.length === 0) return;

    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      establecerPosicionActiva((posicion) => (posicion + 1) % enFila.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      establecerPosicionActiva((posicion) => (posicion - 1 + enFila.length) % enFila.length);
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      const elegido = enFila[posicionActiva];

      if (elegido) elegir(elegido.grupo, elegido.resultado);
    }
  }

  const escribioPoco = texto.trim().length < LETRAS_MINIMAS;
  const noHayNada = !escribioPoco && consulta.isSuccess && enFila.length === 0 && !consulta.isFetching;

  return (
    <ModalBody className="gap-0 p-0">
      <div className="border-b border-default-100 p-3">
        <Input
          autoFocus
          aria-label="Buscar en todo el panel"
          classNames={{ inputWrapper: "shadow-none" }}
          placeholder="Marcas, propiedades, campañas, sectores o personas"
          radius="lg"
          size="lg"
          startContent={<Search className="size-5 text-default-400" />}
          value={texto}
          variant="flat"
          onKeyDown={alPulsarEnElCuadro}
          onValueChange={establecerTexto}
        />
      </div>

      <div ref={listaDeResultados} className="max-h-[60vh] overflow-y-auto p-2">
        {escribioPoco && (
          <p className="px-3 py-6 text-center text-sm text-default-400">
            Escribe al menos dos letras. Con <Kbd>↑</Kbd> <Kbd>↓</Kbd> eliges y con <Kbd>Enter</Kbd> abres.
          </p>
        )}

        {noHayNada && (
          <p className="px-3 py-6 text-center text-sm text-default-500">
            Nada coincide con «{textoBuscado}».
          </p>
        )}

        {!escribioPoco &&
          GRUPOS.map((grupo) => {
            const delGrupo = enFila.filter((fila) => fila.grupo === grupo.clave);

            if (delGrupo.length === 0) return null;

            const Icono = grupo.icono;

            return (
              <section key={grupo.clave} className="mb-1">
                <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-default-400">
                  <Icono className="size-3" />
                  {grupo.titulo}
                </p>

                <ul>
                  {delGrupo.map(({ resultado }) => {
                    const posicion = enFila.findIndex((fila) => fila.resultado === resultado);
                    const estaActivo = posicion === posicionActiva;

                    return (
                      <li key={`${grupo.clave}-${resultado.id}`}>
                        <button
                          className={[
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition",
                            estaActivo ? "bg-primary-100 dark:bg-primary-100/20" : "hover:bg-default-100",
                          ].join(" ")}
                          data-posicion={posicion}
                          type="button"
                          onClick={() => elegir(grupo.clave, resultado)}
                          onMouseEnter={() => establecerPosicionActiva(posicion)}
                        >
                          <MiniaturaDelResultado grupo={grupo.clave} resultado={resultado} />

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {resultado.titulo}
                            </span>
                            {resultado.detalle && (
                              <span className="block truncate text-[11px] text-default-500">
                                {resultado.detalle}
                              </span>
                            )}
                          </span>

                          {/* A una persona siempre se le puede escribir,
                              aunque el resultado lleve a su cartera. */}
                          {grupo.clave === "personas" && (
                            <span
                              aria-label={`Escribirle a ${resultado.titulo}`}
                              className="flex size-7 shrink-0 items-center justify-center rounded-full text-default-500 hover:bg-default-200"
                              role="button"
                              tabIndex={-1}
                              onClick={(evento) => {
                                evento.stopPropagation();
                                alTerminar();
                                void escribirA(resultado.id);
                              }}
                            >
                              <MessageCircle className="size-4" />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
      </div>
    </ModalBody>
  );
}

/** El logo de la marca o propiedad, el color de la campaña, las iniciales. */
function MiniaturaDelResultado({
  grupo,
  resultado,
}: {
  grupo: GrupoDelBuscador;
  resultado: ResultadoDelBuscador;
}) {
  if (resultado.imagenUrl) {
    return (
      <img
        alt=""
        className={`size-8 shrink-0 object-cover ${grupo === "personas" ? "rounded-full" : "rounded-lg"}`}
        src={resultado.imagenUrl}
      />
    );
  }

  if (grupo === "campanas") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-default-100">
        <span className="size-3 rounded-full" style={{ backgroundColor: resultado.color ?? "#94a3b8" }} />
      </span>
    );
  }

  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center bg-default-100 text-[10px] font-bold text-default-500 ${
        grupo === "personas" ? "rounded-full" : "rounded-lg"
      }`}
    >
      {inicialesDe(resultado.titulo)}
    </span>
  );
}
