/**
 * componentes/chat/EquipoYGruposDelChat.tsx
 * ---------------------------------------------------------------------
 * Las vistas de los grupos (el equipo, con quién está en línea, va en
 * la propia lista del chat: ver ListaDeConversaciones):
 *
 *   · FormularioDeGrupo → crear un grupo, o añadir gente a uno.
 *   · DetallesDelGrupo  → quién está, cambiar el nombre, sacar a
 *                         alguien, salirse.
 *
 * En un grupo cualquiera de dentro puede cambiarlo todo: el equipo es
 * pequeño y un grupo con dueño obligaría a buscarlo para añadir a
 * alguien. Cada cambio queda escrito en la charla, así que se sabe quién
 * lo hizo (lo decide el servidor, ConversacionPolicy).
 * ---------------------------------------------------------------------
 */
import { Button, Checkbox, Input, Spinner } from "@heroui/react";
import { ArrowLeft, LogOut, Search, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { AvatarDePersona, PresenciaDeLaPersona } from "@/componentes/chat/AvataresDelChat";
import {
  useAnadirAlGrupo,
  useConversacion,
  useCrearGrupo,
  useEquipoConPresencia,
  useQuienEstaEnLinea,
  useRenombrarGrupo,
  useSacarDelGrupo,
} from "@/hooks/useChat";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import type { PersonaDelChat } from "@/tipos/modelos";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";

/* ==================================================================== */
/* Cabecera común                                                       */
/* ==================================================================== */

function CabeceraConVolver({ titulo, alVolver }: { titulo: string; alVolver: () => void }) {
  return (
    <header className="flex items-center gap-2 border-b border-default-100 px-2 py-2">
      <Button isIconOnly aria-label="Volver" radius="full" size="sm" variant="light" onPress={alVolver}>
        <ArrowLeft className="size-5" />
      </Button>
      <h2 className="flex-1 truncate text-sm font-semibold text-foreground">{titulo}</h2>
    </header>
  );
}

function filtrarPorNombre(personas: PersonaDelChat[], busqueda: string): PersonaDelChat[] {
  const texto = busqueda.trim().toLocaleLowerCase("es");

  return texto === ""
    ? personas
    : personas.filter((persona) => persona.nombre.toLocaleLowerCase("es").includes(texto));
}

function CampoDeBusqueda({ valor, alCambiar }: { valor: string; alCambiar: (valor: string) => void }) {
  return (
    <Input
      aria-label="Buscar a alguien"
      isClearable
      placeholder="Buscar a alguien…"
      radius="lg"
      size="sm"
      startContent={<Search className="size-4 text-default-400" />}
      value={valor}
      variant="flat"
      onClear={() => alCambiar("")}
      onValueChange={alCambiar}
    />
  );
}

/* ==================================================================== */
/* Crear un grupo o añadir gente                                        */
/* ==================================================================== */

export function FormularioDeGrupo({
  idDelGrupo,
  alVolver,
  alTerminar,
}: {
  /** Con un grupo, añade gente a ese grupo; sin él, crea uno nuevo. */
  idDelGrupo?: string;
  alVolver: () => void;
  alTerminar: (idDeLaConversacion: string) => void;
}) {
  const { equipo, enLinea, estaCargando } = useEquipoConPresencia();
  const { data: grupo } = useConversacion(idDelGrupo ?? null);
  const crearGrupo = useCrearGrupo();
  const anadirAlGrupo = useAnadirAlGrupo();

  const [nombre, establecerNombre] = useState("");
  const [elegidas, establecerElegidas] = useState<string[]>([]);
  const [busqueda, establecerBusqueda] = useState("");

  const esNuevo = idDelGrupo === undefined;
  const yaEstan = new Set(grupo?.participantes.map((persona) => persona.id) ?? []);
  const candidatas = filtrarPorNombre(equipo, busqueda).filter((persona) => !yaEstan.has(persona.id));

  const estaGuardando = crearGrupo.isPending || anadirAlGrupo.isPending;
  const puedeGuardar = elegidas.length > 0 && (!esNuevo || nombre.trim() !== "") && !estaGuardando;

  async function guardar() {
    if (!puedeGuardar) return;

    try {
      const resultado =
        idDelGrupo === undefined
          ? await crearGrupo.mutateAsync({ nombre: nombre.trim(), personas: elegidas })
          : await anadirAlGrupo.mutateAsync({ id: idDelGrupo, personas: elegidas });

      avisarDeExito(esNuevo ? "Grupo creado." : "Añadidas al grupo.");
      alTerminar(resultado.id);
    } catch (error) {
      avisarDeError(error, esNuevo ? "No se pudo crear el grupo" : "No se pudo añadir a nadie");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CabeceraConVolver alVolver={alVolver} titulo={esNuevo ? "Nuevo grupo" : `Añadir a ${grupo?.nombre ?? "el grupo"}`} />

      <div className="flex flex-col gap-2 px-3 pt-3">
        {esNuevo && (
          <Input
            autoFocus
            label="Nombre del grupo"
            maxLength={80}
            placeholder="Ej.: Zona Centro, Sportbiz 2026…"
            radius="lg"
            size="sm"
            value={nombre}
            variant="bordered"
            onValueChange={establecerNombre}
          />
        )}
        <CampoDeBusqueda alCambiar={establecerBusqueda} valor={busqueda} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {estaCargando ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : candidatas.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-default-500">
            {esNuevo ? "No hay nadie con ese nombre." : "Ya están todos en el grupo."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {candidatas.map((persona) => (
              <li key={persona.id}>
                <Checkbox
                  classNames={{
                    base: "m-0 flex w-full max-w-none items-center gap-1 rounded-2xl px-2 py-1.5 hover:bg-default-100",
                    label: "flex min-w-0 flex-1 items-center gap-2.5",
                  }}
                  isSelected={elegidas.includes(persona.id)}
                  radius="full"
                  onValueChange={(marcada) =>
                    establecerElegidas((actuales) =>
                      marcada ? [...actuales, persona.id] : actuales.filter((id) => id !== persona.id),
                    )
                  }
                >
                  <AvatarDePersona enLinea={enLinea.has(persona.id)} marcarSiNoEsta persona={persona} tamano="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{persona.nombre}</span>
                    <PresenciaDeLaPersona enLinea={enLinea.has(persona.id)} persona={persona} />
                  </span>
                </Checkbox>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="margen-seguro-inferior border-t border-default-100 px-3 py-2.5">
        <Button
          fullWidth
          color="primary"
          isDisabled={!puedeGuardar}
          isLoading={estaGuardando}
          radius="lg"
          startContent={!estaGuardando && <UserPlus className="size-4" />}
          onPress={() => void guardar()}
        >
          {esNuevo
            ? `Crear el grupo${elegidas.length > 0 ? ` con ${elegidas.length + 1} personas` : ""}`
            : `Añadir${elegidas.length > 0 ? ` (${elegidas.length})` : ""}`}
        </Button>
      </div>
    </div>
  );
}

/* ==================================================================== */
/* Detalles de un grupo                                                 */
/* ==================================================================== */

export function DetallesDelGrupo({
  idDelGrupo,
  alVolver,
  alAnadir,
  alSalir,
}: {
  idDelGrupo: string;
  alVolver: () => void;
  alAnadir: () => void;
  /** Tras salirse: la charla ya no es de esta persona. */
  alSalir: () => void;
}) {
  const usuario = useUsuarioAutenticado();
  const enLinea = useQuienEstaEnLinea();
  const { data: grupo, isLoading } = useConversacion(idDelGrupo);
  const renombrar = useRenombrarGrupo();
  const sacar = useSacarDelGrupo();

  const [nombre, establecerNombre] = useState<string | null>(null);
  const [confirmandoSalida, establecerConfirmandoSalida] = useState(false);

  if (isLoading || grupo === undefined) {
    return (
      <div className="flex h-full flex-col">
        <CabeceraConVolver alVolver={alVolver} titulo="Detalles del grupo" />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="sm" />
        </div>
      </div>
    );
  }

  const nombreEnElCampo = nombre ?? grupo.nombre;
  const nombreCambiado = nombreEnElCampo.trim() !== "" && nombreEnElCampo.trim() !== grupo.nombre;

  async function guardarNombre() {
    try {
      await renombrar.mutateAsync({ id: idDelGrupo, nombre: nombreEnElCampo.trim() });
      establecerNombre(null);
      avisarDeExito("Nombre cambiado.");
    } catch (error) {
      avisarDeError(error, "No se pudo cambiar el nombre");
    }
  }

  async function sacarA(persona: PersonaDelChat) {
    try {
      await sacar.mutateAsync({ id: idDelGrupo, idDeLaPersona: persona.id });

      if (persona.id === usuario.id) {
        avisarDeExito("Saliste del grupo.");
        alSalir();
      }
    } catch (error) {
      avisarDeError(error, persona.id === usuario.id ? "No se pudo salir del grupo" : "No se pudo sacar del grupo");
    }
  }

  const participantes = [...grupo.participantes].sort(
    (una, otra) => Number(otra.id === usuario.id) - Number(una.id === usuario.id),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CabeceraConVolver alVolver={alVolver} titulo="Detalles del grupo" />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="flex items-end gap-2">
          <Input
            className="flex-1"
            label="Nombre del grupo"
            maxLength={80}
            radius="lg"
            size="sm"
            value={nombreEnElCampo}
            variant="bordered"
            onValueChange={establecerNombre}
          />
          {nombreCambiado && (
            <Button color="primary" isLoading={renombrar.isPending} radius="lg" onPress={() => void guardarNombre()}>
              Guardar
            </Button>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-default-400">
            {grupo.participantes.length} personas
          </p>
          <Button radius="full" size="sm" startContent={<UserPlus className="size-3.5" />} variant="flat" onPress={alAnadir}>
            Añadir
          </Button>
        </div>

        <ul className="mt-2 flex flex-col gap-0.5">
          {participantes.map((persona) => {
            const esYo = persona.id === usuario.id;

            return (
              <li key={persona.id} className="flex items-center gap-2.5 rounded-2xl px-1 py-1.5">
                <AvatarDePersona
                  enLinea={!esYo && enLinea.has(persona.id)}
                  marcarSiNoEsta={!esYo}
                  persona={persona}
                  tamano="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {persona.nombre}
                    {esYo && <span className="text-default-400"> (tú)</span>}
                  </span>
                  {esYo ? (
                    <span className="block truncate text-[11px] text-default-500">{persona.rolEtiqueta}</span>
                  ) : (
                    <PresenciaDeLaPersona enLinea={enLinea.has(persona.id)} persona={persona} />
                  )}
                </span>
                {!esYo && (
                  <Button
                    isIconOnly
                    aria-label={`Sacar a ${persona.nombre} del grupo`}
                    isDisabled={sacar.isPending}
                    radius="full"
                    size="sm"
                    title={`Sacar a ${persona.nombre} del grupo`}
                    variant="light"
                    onPress={() => void sacarA(persona)}
                  >
                    <UserMinus className="size-4 text-default-400" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="margen-seguro-inferior border-t border-default-100 px-3 py-2.5">
        {confirmandoSalida ? (
          <div className="flex gap-2">
            <Button className="flex-1" radius="lg" variant="flat" onPress={() => establecerConfirmandoSalida(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              color="danger"
              isLoading={sacar.isPending}
              radius="lg"
              onPress={() => {
                const yo = grupo.participantes.find((persona) => persona.id === usuario.id);
                if (yo !== undefined) void sacarA(yo);
              }}
            >
              Sí, salir
            </Button>
          </div>
        ) : (
          <Button
            fullWidth
            color="danger"
            radius="lg"
            startContent={<LogOut className="size-4" />}
            variant="flat"
            onPress={() => establecerConfirmandoSalida(true)}
          >
            Salir del grupo
          </Button>
        )}
      </div>
    </div>
  );
}
