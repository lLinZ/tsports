/**
 * componentes/chat/ListaDeConversaciones.tsx
 * ---------------------------------------------------------------------
 * La columna del chat, con dos secciones en el mismo desplazamiento:
 *
 *   · CHARLAS → cada charla con su último mensaje y lo que queda sin leer.
 *   · EQUIPO  → todo el equipo, con quién está en línea y desde cuándo no
 *               está el resto. Un toque abre la charla con esa persona.
 *
 * El equipo va SIEMPRE a la vista, y entero. Hasta el 2026-09-25 había
 * una franja arriba solo con quien estaba en línea, y el equipo completo
 * detrás de un botón: con nadie conectado la franja desaparecía y la
 * pantalla no decía nada, ni quién está ni quién no. Justo la pregunta
 * con la que se abre un chat de equipo.
 *
 * El buscador filtra las dos secciones a la vez: buscar a alguien por su
 * nombre encuentra la charla con esa persona y a la persona.
 * ---------------------------------------------------------------------
 */
import { Button, Input, Spinner, Tooltip } from "@heroui/react";
import { Search, UsersRound, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  AvatarDeConversacion,
  AvatarDePersona,
  PresenciaDeLaPersona,
} from "@/componentes/chat/AvataresDelChat";
import { LogoPequenoDeMarca } from "@/componentes/comunes/BuscadorDeMarcas";
import { useConversaciones, useEquipoConPresencia } from "@/hooks/useChat";
import { useChat } from "@/providers/ProveedorChat";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import type { ConversacionDelChat } from "@/tipos/modelos";
import { formatearMomentoCorto } from "@/utilidades/formato";

export function ListaDeConversaciones({
  idSeleccionada,
  alElegir,
  alNuevoGrupo,
  alCerrar,
  conTitulo,
}: {
  idSeleccionada: string | null;
  alElegir: (idDeLaConversacion: string) => void;
  alNuevoGrupo: () => void;
  /** La X de la ventana flotante. */
  alCerrar?: () => void;
  /**
   * La ventana lleva su título; la página no, porque ya lo dice la barra
   * superior y salía «Chat» dos veces.
   */
  conTitulo: boolean;
}) {
  const usuario = useUsuarioAutenticado();
  const { escribirA, abriendoCharla, marcaParaCompartir, descartarMarcaParaCompartir } = useChat();
  const { conversaciones, estaCargando, error } = useConversaciones();
  const { equipo, enLinea, cuantosEnLinea, estaCargando: cargandoElEquipo } = useEquipoConPresencia();

  const [busqueda, establecerBusqueda] = useState("");

  const texto = busqueda.trim().toLocaleLowerCase("es");
  const coincide = (nombre: string) => texto === "" || nombre.toLocaleLowerCase("es").includes(texto);
  const charlasVisibles = conversaciones.filter((conversacion) => coincide(conversacion.nombre));
  const personasVisibles = equipo.filter((persona) => coincide(persona.nombre));

  const botonDeNuevoGrupo = (
    <Tooltip content="Nuevo grupo">
      <Button isIconOnly aria-label="Nuevo grupo" radius="full" size="sm" variant="light" onPress={alNuevoGrupo}>
        <UsersRound className="size-4" />
      </Button>
    </Tooltip>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {conTitulo && (
        <header className="flex items-center gap-1 border-b border-default-100 px-3 py-2">
          <h2 className="flex-1 text-base font-bold tracking-tight text-foreground">Chat</h2>
          {botonDeNuevoGrupo}
          {alCerrar !== undefined && (
            <Button isIconOnly aria-label="Cerrar el chat" radius="full" size="sm" variant="light" onPress={alCerrar}>
              <X className="size-5" />
            </Button>
          )}
        </header>
      )}

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

      <div className={["flex items-center gap-1 px-3", conTitulo ? "pt-2" : "py-3"].join(" ")}>
        <Input
          aria-label="Buscar una charla o a alguien"
          isClearable
          placeholder="Buscar una charla o a alguien…"
          radius="lg"
          size="sm"
          startContent={<Search className="size-4 text-default-400" />}
          value={busqueda}
          variant="flat"
          onClear={() => establecerBusqueda("")}
          onValueChange={establecerBusqueda}
        />
        {!conTitulo && botonDeNuevoGrupo}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {/* Charlas */}
        <TituloDeSeccion>Charlas</TituloDeSeccion>

        {estaCargando ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : error ? (
          <p className="m-2 rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger dark:bg-danger-100/10">
            {mensajeDeError(error)}
          </p>
        ) : charlasVisibles.length === 0 ? (
          <p className="px-2.5 pb-2 text-xs text-default-500">
            {texto !== ""
              ? "Ninguna charla se llama así."
              : "Todavía no tienes charlas. Escríbele a alguien del equipo o arma un grupo."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {charlasVisibles.map((conversacion) => (
              <li key={conversacion.id}>
                <FilaDeCharla
                  conversacion={conversacion}
                  enLinea={enLinea}
                  estaElegida={conversacion.id === idSeleccionada}
                  idPropio={usuario.id}
                  alElegir={() => alElegir(conversacion.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {/* El equipo */}
        <TituloDeSeccion
          detalle={
            // Mientras carga no se sabe: «nadie más en línea» sería mentira.
            cargandoElEquipo ? undefined : cuantosEnLinea > 0 ? (
              <span className="flex items-center gap-1 font-semibold normal-case tracking-normal text-success">
                <span className="size-1.5 rounded-full bg-success" />
                {cuantosEnLinea === 1 ? "1 en línea" : `${cuantosEnLinea} en línea`}
              </span>
            ) : (
              <span className="normal-case tracking-normal">nadie más en línea</span>
            )
          }
        >
          Equipo
        </TituloDeSeccion>

        {cargandoElEquipo ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : personasVisibles.length === 0 ? (
          <p className="px-2.5 text-xs text-default-500">Nadie del equipo se llama así.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {personasVisibles.map((persona) => {
              const estaEnLinea = enLinea.has(persona.id);

              return (
                <li key={persona.id}>
                  <button
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-default-100 disabled:opacity-60"
                    disabled={abriendoCharla}
                    title={`Escribir a ${persona.nombre}`}
                    type="button"
                    onClick={() => void escribirA(persona.id)}
                  >
                    <AvatarDePersona enLinea={estaEnLinea} marcarSiNoEsta persona={persona} tamano="md" />
                    <span className="min-w-0 flex-1">
                      <span
                        className={[
                          "block truncate text-sm font-semibold",
                          estaEnLinea ? "text-foreground" : "text-default-600",
                        ].join(" ")}
                      >
                        {persona.nombre}
                      </span>
                      <PresenciaDeLaPersona enLinea={estaEnLinea} persona={persona} />
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

function TituloDeSeccion({ children, detalle }: { children: ReactNode; detalle?: ReactNode }) {
  return (
    <p className="flex items-center justify-between gap-2 px-2.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wide text-default-400">
      <span>{children}</span>
      {detalle}
    </p>
  );
}

function FilaDeCharla({
  conversacion,
  idPropio,
  enLinea,
  estaElegida,
  alElegir,
}: {
  conversacion: ConversacionDelChat;
  idPropio: string;
  enLinea: Set<string>;
  estaElegida: boolean;
  alElegir: () => void;
}) {
  const ultimo = conversacion.ultimoMensaje;
  const tienePendientes = conversacion.sinLeer > 0;

  return (
    <button
      className={[
        "flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition",
        estaElegida ? "bg-primary-50 dark:bg-primary-100/15" : "hover:bg-default-100",
      ].join(" ")}
      type="button"
      onClick={alElegir}
    >
      <AvatarDeConversacion conversacion={conversacion} enLinea={enLinea} idPropio={idPropio} />

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
  );
}
