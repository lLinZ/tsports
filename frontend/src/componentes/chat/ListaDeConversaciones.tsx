/**
 * componentes/chat/ListaDeConversaciones.tsx
 * ---------------------------------------------------------------------
 * La columna de las charlas: quién está en línea arriba, y debajo cada
 * charla con su último mensaje y lo que queda sin leer.
 *
 * La franja «En línea» es lo primero a propósito: la pregunta con la que
 * se abre un chat de equipo suele ser «¿quién está ahora?», y desde ahí
 * se le escribe con un toque.
 * ---------------------------------------------------------------------
 */
import { Button, Input, Spinner, Tooltip } from "@heroui/react";
import { MessageSquarePlus, Search, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { mensajeDeError } from "@/api/clienteHttp";
import { AvatarDeConversacion, AvatarDePersona } from "@/componentes/chat/AvataresDelChat";
import { LogoPequenoDeMarca } from "@/componentes/comunes/BuscadorDeMarcas";
import { useConversaciones, usePersonasDelChat, useQuienEstaEnLinea } from "@/hooks/useChat";
import { useChat } from "@/providers/ProveedorChat";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { formatearMomentoCorto } from "@/utilidades/formato";

export function ListaDeConversaciones({
  idSeleccionada,
  alElegir,
  alVerEquipo,
  alNuevoGrupo,
  alCerrar,
}: {
  idSeleccionada: string | null;
  alElegir: (idDeLaConversacion: string) => void;
  alVerEquipo: () => void;
  alNuevoGrupo: () => void;
  /** La X de la ventana flotante. */
  alCerrar?: () => void;
}) {
  const usuario = useUsuarioAutenticado();
  const { escribirA, marcaParaCompartir, descartarMarcaParaCompartir } = useChat();
  const { conversaciones, estaCargando, error } = useConversaciones();
  const enLinea = useQuienEstaEnLinea();
  const { data: equipo = [] } = usePersonasDelChat();

  const [busqueda, establecerBusqueda] = useState("");

  const texto = busqueda.trim().toLocaleLowerCase("es");
  const visibles =
    texto === ""
      ? conversaciones
      : conversaciones.filter((conversacion) => conversacion.nombre.toLocaleLowerCase("es").includes(texto));

  const conectados = equipo.filter((persona) => enLinea.has(persona.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-1 border-b border-default-100 px-3 py-2">
        <h2 className="flex-1 text-base font-bold tracking-tight text-foreground">Chat</h2>

        <Tooltip content="Nuevo grupo">
          <Button isIconOnly aria-label="Nuevo grupo" radius="full" size="sm" variant="light" onPress={alNuevoGrupo}>
            <UsersRound className="size-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Escribir a alguien">
          <Button isIconOnly aria-label="Escribir a alguien" radius="full" size="sm" variant="light" onPress={alVerEquipo}>
            <MessageSquarePlus className="size-4" />
          </Button>
        </Tooltip>
        {alCerrar !== undefined && (
          <Button isIconOnly aria-label="Cerrar el chat" radius="full" size="sm" variant="light" onPress={alCerrar}>
            <X className="size-5" />
          </Button>
        )}
      </header>

      {marcaParaCompartir !== null && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl bg-primary-50 px-2.5 py-2 dark:bg-primary-100/10">
          <LogoPequenoDeMarca marca={marcaParaCompartir} tamano="size-7" />
          <p className="min-w-0 flex-1 text-xs text-default-700">
            Elige a quién mandarle <strong className="text-foreground">#{marcaParaCompartir.nombre}</strong>
          </p>
          <Button isIconOnly aria-label="No compartir" radius="full" size="sm" variant="light" onPress={descartarMarcaParaCompartir}>
            <X className="size-4" />
          </Button>
        </div>
      )}

      <div className="px-3 pt-2">
        <Input
          aria-label="Buscar una charla"
          isClearable
          placeholder="Buscar una charla…"
          radius="lg"
          size="sm"
          startContent={<Search className="size-4 text-default-400" />}
          value={busqueda}
          variant="flat"
          onClear={() => establecerBusqueda("")}
          onValueChange={establecerBusqueda}
        />
      </div>

      {conectados.length > 0 && texto === "" && (
        <section aria-label="En línea ahora" className="px-3 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-default-400">
            En línea ahora
          </p>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {conectados.map((persona) => (
              <li key={persona.id} className="shrink-0">
                <button
                  className="flex w-14 flex-col items-center gap-1 rounded-xl py-1 transition hover:bg-default-100"
                  title={`Escribir a ${persona.nombre}`}
                  type="button"
                  onClick={() => void escribirA(persona.id)}
                >
                  <AvatarDePersona enLinea persona={persona} tamano="md" />
                  <span className="w-full truncate text-center text-[10px] text-default-600">
                    {persona.nombre.split(" ")[0]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {estaCargando ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : error ? (
          <p className="m-2 rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger dark:bg-danger-100/10">
            {mensajeDeError(error)}
          </p>
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="text-3xl">💬</span>
            <p className="text-sm font-semibold text-foreground">
              {texto === "" ? "Todavía no tienes charlas" : "Ninguna charla se llama así"}
            </p>
            {texto === "" && (
              <>
                <p className="text-xs text-default-500">Escríbele a alguien del equipo o arma un grupo.</p>
                <Button color="primary" radius="full" size="sm" variant="flat" onPress={alVerEquipo}>
                  Escribir a alguien
                </Button>
              </>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visibles.map((conversacion) => {
              const ultimo = conversacion.ultimoMensaje;
              const estaElegida = conversacion.id === idSeleccionada;
              const tienePendientes = conversacion.sinLeer > 0;

              return (
                <li key={conversacion.id}>
                  <button
                    className={[
                      "flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition",
                      estaElegida ? "bg-primary-50 dark:bg-primary-100/15" : "hover:bg-default-100",
                    ].join(" ")}
                    type="button"
                    onClick={() => alElegir(conversacion.id)}
                  >
                    <AvatarDeConversacion conversacion={conversacion} enLinea={enLinea} idPropio={usuario.id} />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={[
                            "min-w-0 flex-1 truncate text-sm",
                            tienePendientes ? "font-bold text-foreground" : "font-semibold text-foreground",
                          ].join(" ")}
                        >
                          {conversacion.nombre}
                        </span>
                        <span
                          className={[
                            "shrink-0 text-[10px]",
                            tienePendientes ? "font-semibold text-primary" : "text-default-400",
                          ].join(" ")}
                        >
                          {formatearMomentoCorto(ultimo?.creadoEn ?? conversacion.creadaEn)}
                        </span>
                      </span>

                      <span className="mt-0.5 flex items-center gap-2">
                        <span
                          className={[
                            "min-w-0 flex-1 truncate text-xs",
                            tienePendientes ? "text-foreground" : "text-default-500",
                          ].join(" ")}
                        >
                          {ultimo === null
                            ? conversacion.esGrupo
                              ? "Grupo nuevo"
                              : "Sin mensajes todavía"
                            : ultimo.esDeSistema
                              ? ultimo.texto
                              : `${ultimo.esMio ? "Tú" : conversacion.esGrupo ? ultimo.autorNombre.split(" ")[0] : ""}${
                                  ultimo.esMio || conversacion.esGrupo ? ": " : ""
                                }${ultimo.texto}`}
                        </span>

                        {tienePendientes && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                            {conversacion.sinLeer > 99 ? "99+" : conversacion.sinLeer}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
