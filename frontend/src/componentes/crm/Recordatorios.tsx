/**
 * componentes/crm/Recordatorios.tsx
 * ---------------------------------------------------------------------
 * Los recordatorios de seguimiento, en los tres sitios donde salen:
 *
 *   · `RecordatoriosDeLaMarca` — en la ficha, encima de la bitácora: los
 *     pendientes de todo el equipo con esa marca, lo cumplido esta semana
 *     y el formulario para dejar uno nuevo.
 *   · `RecordatorioDeLaTarjeta` — en la tarjeta del tablero: MI próximo
 *     recordatorio, con su casilla para cumplirlo sin abrir la ficha.
 *   · `MisRecordatoriosDelPanel` — las cajas «Para hoy» y «Vencidos» del
 *     resumen.
 *
 * Si un recordatorio es de hoy, vencido o de más adelante lo dice el
 * servidor (`cuando`), con el día de Caracas: aquí no se comparan fechas.
 *
 * Desde el 2026-10-07 cada uno puede llevar QUÉ TOCA (llamada, WhatsApp,
 * reunión o correo) y LA HORA, las dos opcionales: se eligen al dejarlo y
 * se enseñan junto al día («Mañana · 10:00 · Reunión»).
 *
 * Quién puede tocar cada uno también viene resuelto (`puedoCambiarlo`, y
 * en la tarjeta `marca.puedeEditarla`). Dejárselo a otra persona solo lo
 * ofrece la interfaz a quien reparte (`permisos.asignaVendedores`), y la
 * lista sale de quién puede ver esa marca: la misma de las menciones.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Input, Select, SelectItem, Tooltip } from "@heroui/react";
import {
  AlarmClock,
  AlarmClockCheck,
  Check,
  Plus,
  Redo2,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EstadoVacio } from "@/componentes/comunes/EstadosDePantalla";
import { TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { IconoDelTipo, TIPOS_DE_CONTACTO } from "@/componentes/crm/TiposDeContacto";
import { useMencionablesDeMarca } from "@/hooks/useMarcas";
import {
  useCambiarRecordatorio,
  useCrearRecordatorio,
  useEliminarRecordatorio,
  useMisRecordatorios,
  useRecordatoriosDeLaMarca,
} from "@/hooks/useRecordatorios";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { diaLocalDentroDe, formatearDiaAgendado, sumarDias } from "@/utilidades/formato";
import type { Marca, ProximoRecordatorio, Recordatorio, TipoDeContacto } from "@/tipos/modelos";

/** El ancla de la caja «Para hoy», para llegar desde el aviso de la mañana. */
export const ANCLA_DE_MIS_RECORDATORIOS = "mis-recordatorios";

/**
 * «Hoy», «Mañana · 10:00», «Vencido · el 3 oct»… con el `cuando` del
 * servidor y la hora si la tiene.
 */
function diaDelRecordatorio(recordatorio: ProximoRecordatorio): string {
  const conHora = (texto: string) => (recordatorio.hora ? `${texto} · ${recordatorio.hora}` : texto);

  if (recordatorio.cuando === "hoy") return conHora("Hoy");

  const dia = formatearDiaAgendado(recordatorio.fecha, recordatorio.diasHasta);

  if (recordatorio.cuando === "vencido") return conHora(`Vencido · ${dia}`);

  return conHora(dia.charAt(0).toUpperCase() + dia.slice(1));
}

/** «Reunión · Presentar la propuesta», o solo una de las dos. */
function queToca(recordatorio: ProximoRecordatorio): string | null {
  const partes = [recordatorio.tipo?.etiqueta, recordatorio.nota].filter(Boolean);

  // La nota por defecto ya dice el tipo («Volver a llamar»): no hace falta
  // repetirlo delante.
  if (recordatorio.tipo && recordatorio.nota) {
    const porDefecto = TIPOS_DE_CONTACTO.find((opcion) => opcion.valor === recordatorio.tipo?.valor)?.notaPorDefecto;

    if (porDefecto === recordatorio.nota) return recordatorio.nota;
  }

  return partes.length > 0 ? partes.join(" · ") : null;
}

/** El color del día: lo vencido en rojo, lo de hoy con el acento. */
function colorDelDia(recordatorio: ProximoRecordatorio): string {
  if (recordatorio.cuando === "vencido") return "text-danger";
  if (recordatorio.cuando === "hoy") return "text-primary";

  return "text-default-500";
}

/* ==================================================================== */
/* Una fila                                                             */
/* ==================================================================== */

/**
 * Un recordatorio en una lista: la casilla para cumplirlo, el día, la
 * nota y, según dónde se pinte, la marca o la persona de quien es.
 */
function FilaDeRecordatorio({
  recordatorio,
  conLaMarca = false,
  conLaPersona = false,
  sePuedeBorrar = false,
}: {
  recordatorio: Recordatorio;
  /** En el panel: de qué marca es, con enlace a su ficha. */
  conLaMarca?: boolean;
  /** En la ficha: de quién es, si no es mío. */
  conLaPersona?: boolean;
  sePuedeBorrar?: boolean;
}) {
  const cambiar = useCambiarRecordatorio();
  const eliminar = useEliminarRecordatorio();

  const estaOcupado = cambiar.isPending || eliminar.isPending;

  function alternarCumplido() {
    cambiar.mutate(
      { idDelRecordatorio: recordatorio.id, cambios: { cumplido: !recordatorio.cumplido } },
      {
        onSuccess: () =>
          avisarDeExito(recordatorio.cumplido ? "Recordatorio pendiente otra vez" : "Recordatorio cumplido"),
        onError: (error) => avisarDeError(error, "No se pudo cambiar el recordatorio"),
      },
    );
  }

  function pasarAManana() {
    // Mañana según el servidor (el día del recordatorio menos los días que
    // le faltaban, más uno), no según el reloj de este ordenador.
    const manana = sumarDias(recordatorio.fecha, 1 - recordatorio.diasHasta);

    cambiar.mutate(
      { idDelRecordatorio: recordatorio.id, cambios: { fecha: manana } },
      {
        onSuccess: () => avisarDeExito("Pasado a mañana"),
        onError: (error) => avisarDeError(error, "No se pudo posponer el recordatorio"),
      },
    );
  }

  function borrar() {
    eliminar.mutate(recordatorio.id, {
      onError: (error) => avisarDeError(error, "No se pudo eliminar el recordatorio"),
    });
  }

  return (
    <li
      className={[
        "flex items-start gap-2.5 rounded-xl bg-default-50 px-2.5 py-2",
        recordatorio.cumplido ? "opacity-60" : "",
      ].join(" ")}
    >
      <button
        aria-label={recordatorio.cumplido ? "Marcar como pendiente" : "Marcar como cumplido"}
        aria-pressed={recordatorio.cumplido}
        className={[
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition",
          recordatorio.cumplido
            ? "border-success bg-success text-white"
            : "border-default-300 hover:border-success",
          !recordatorio.puedoCambiarlo ? "cursor-not-allowed opacity-50" : "",
        ].join(" ")}
        disabled={!recordatorio.puedoCambiarlo || estaOcupado}
        type="button"
        onClick={alternarCumplido}
      >
        {recordatorio.cumplido && <Check className="size-3" strokeWidth={3.5} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
          <span className={`font-semibold ${recordatorio.cumplido ? "text-default-500" : colorDelDia(recordatorio)}`}>
            {diaDelRecordatorio(recordatorio)}
          </span>

          {conLaMarca && recordatorio.marca && (
            <Link
              className="truncate font-semibold text-foreground hover:text-primary hover:underline"
              to={`/marcas?abrir=${recordatorio.marca.id}`}
            >
              {recordatorio.marca.nombre}
            </Link>
          )}

          {conLaPersona && !recordatorio.esMio && recordatorio.personaNombre && (
            <span className="text-[11px] text-default-400">· para {recordatorio.personaNombre}</span>
          )}
        </p>

        {queToca(recordatorio) && (
          <p
            className={[
              "mt-0.5 flex items-start gap-1 break-words text-xs text-default-600",
              recordatorio.cumplido ? "line-through" : "",
            ].join(" ")}
          >
            {recordatorio.tipo && (
              <span className="mt-px shrink-0 text-default-400">
                <IconoDelTipo className="size-3" tipo={recordatorio.tipo.valor} />
              </span>
            )}
            <span className="min-w-0">{queToca(recordatorio)}</span>
          </p>
        )}

        {recordatorio.cumplido && recordatorio.cumplidoPorNombre && (
          <p className="mt-0.5 text-[10px] text-default-400">Cumplido por {recordatorio.cumplidoPorNombre}</p>
        )}
      </div>

      {recordatorio.puedoCambiarlo && !recordatorio.cumplido && recordatorio.cuando !== "proximo" && (
        <Tooltip content="Pasarlo a mañana">
          <Button
            isIconOnly
            aria-label="Pasarlo a mañana"
            className="size-7 min-w-7"
            isDisabled={estaOcupado}
            radius="full"
            size="sm"
            variant="light"
            onPress={pasarAManana}
          >
            <Redo2 className="size-3.5" />
          </Button>
        </Tooltip>
      )}

      {sePuedeBorrar && recordatorio.puedoCambiarlo && (
        <Tooltip content="Eliminar">
          <Button
            isIconOnly
            aria-label="Eliminar el recordatorio"
            className="size-7 min-w-7 text-default-400"
            isDisabled={estaOcupado}
            radius="full"
            size="sm"
            variant="light"
            onPress={borrar}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </Tooltip>
      )}
    </li>
  );
}

/* ==================================================================== */
/* En la ficha                                                          */
/* ==================================================================== */

export function RecordatoriosDeLaMarca({ marca }: { marca: Marca }) {
  const consulta = useRecordatoriosDeLaMarca(marca.id);
  const [estaEscribiendo, establecerEscribiendo] = useState(false);

  const recordatorios = consulta.data ?? [];
  const pendientes = recordatorios.filter((recordatorio) => !recordatorio.cumplido);

  return (
    <section className="bento-card mb-4 shrink-0 p-3">
      <div className="flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 text-sm font-semibold text-foreground">
          <AlarmClock className="size-4 text-primary" />
          Recordatorios
          {pendientes.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
              {pendientes.length}
            </span>
          )}
        </h3>

        {marca.puedeEditarla && !estaEscribiendo && (
          <Button
            radius="full"
            size="sm"
            startContent={<Plus className="size-3.5" />}
            variant="flat"
            onPress={() => establecerEscribiendo(true)}
          >
            Recordar
          </Button>
        )}
      </div>

      {estaEscribiendo && (
        <FormularioDeRecordatorio marca={marca} alTerminar={() => establecerEscribiendo(false)} />
      )}

      {recordatorios.length > 0 ? (
        <ul className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto">
          {recordatorios.map((recordatorio) => (
            <FilaDeRecordatorio
              key={recordatorio.id}
              conLaPersona
              sePuedeBorrar
              recordatorio={recordatorio}
            />
          ))}
        </ul>
      ) : (
        !estaEscribiendo && (
          <p className="mt-1.5 text-[11px] text-default-400">
            {consulta.isLoading
              ? "Cargando…"
              : "Nada pendiente con esta marca. Deja uno para no olvidar el próximo contacto."}
          </p>
        )
      )}
    </section>
  );
}

/** Para qué día, a qué hora, qué toca, una nota corta y, a quien reparte, para quién. */
function FormularioDeRecordatorio({
  marca,
  alTerminar,
}: {
  marca: Marca;
  alTerminar: () => void;
}) {
  const usuario = useUsuarioAutenticado();
  const crear = useCrearRecordatorio(marca.id);

  const puedeElegirPersona = usuario.permisos.asignaVendedores;
  const { data: quienesPuedenVerla = [] } = useMencionablesDeMarca(puedeElegirPersona ? marca.id : null);

  // Mañana, de partida: es lo más habitual al colgar una llamada.
  const [fecha, establecerFecha] = useState(diaLocalDentroDe(1));
  const [hora, establecerHora] = useState("");
  const [tipo, establecerTipo] = useState<TipoDeContacto | null>(null);
  const [nota, establecerNota] = useState("");
  const [idDeLaPersona, establecerIdDeLaPersona] = useState(usuario.id);

  function guardar() {
    crear.mutate(
      {
        fecha,
        hora: hora || null,
        tipo,
        nota: nota.trim() || null,
        personaId: idDeLaPersona === usuario.id ? null : idDeLaPersona,
      },
      {
        onSuccess: () => {
          avisarDeExito("Recordatorio guardado");
          alTerminar();
        },
        onError: (error) => avisarDeError(error, "No se pudo guardar el recordatorio"),
      },
    );
  }

  return (
    <form
      className="mt-2.5 space-y-2 rounded-xl bg-default-50 p-2.5"
      onSubmit={(evento) => {
        evento.preventDefault();
        guardar();
      }}
    >
      {/* La hora, con sitio para «04:00 p. m.»: en Venezuela el navegador
          la enseña en 12 horas. */}
      <div className="grid grid-cols-[1fr_8.5rem] gap-2">
        <Input
          aria-label="Día del recordatorio"
          min={diaLocalDentroDe(0)}
          radius="lg"
          size="sm"
          type="date"
          value={fecha}
          variant="bordered"
          onValueChange={establecerFecha}
        />
        <Input
          aria-label="Hora (opcional)"
          radius="lg"
          size="sm"
          type="time"
          value={hora}
          variant="bordered"
          onValueChange={establecerHora}
        />
      </div>

      {/* Qué toca, opcional: se puede dejar sin ninguno («mandar el
          dossier»). Pulsar el elegido lo quita. */}
      <div aria-label="Qué toca" className="flex flex-wrap gap-1.5" role="group">
        {TIPOS_DE_CONTACTO.map((opcion) => (
          <Chip
            key={opcion.valor}
            aria-pressed={tipo === opcion.valor}
            as="button"
            className="cursor-pointer gap-1 px-2"
            color={tipo === opcion.valor ? "primary" : "default"}
            radius="full"
            size="sm"
            startContent={opcion.icono}
            type="button"
            variant={tipo === opcion.valor ? "solid" : "flat"}
            onClick={() => establecerTipo((actual) => (actual === opcion.valor ? null : opcion.valor))}
          >
            {opcion.etiqueta}
          </Chip>
        ))}
      </div>

      <Input
        aria-label="Qué hay que hacer"
        maxLength={300}
        placeholder="Qué hay que hacer (opcional)"
        radius="lg"
        size="sm"
        value={nota}
        variant="bordered"
        onValueChange={establecerNota}
      />

      {puedeElegirPersona && quienesPuedenVerla.length > 1 && (
        <Select
          aria-label="Para quién"
          disallowEmptySelection
          radius="lg"
          selectedKeys={[idDeLaPersona]}
          size="sm"
          startContent={<span className="text-[11px] text-default-400">Para</span>}
          variant="bordered"
          onSelectionChange={(seleccion) => {
            const elegida = Array.from(seleccion)[0];

            if (elegida !== undefined) establecerIdDeLaPersona(String(elegida));
          }}
        >
          {quienesPuedenVerla.map((persona) => (
            <SelectItem key={persona.id} textValue={persona.id === usuario.id ? "mí" : persona.nombre}>
              {persona.id === usuario.id ? "mí" : `${persona.nombre} · ${persona.rolEtiqueta}`}
            </SelectItem>
          ))}
        </Select>
      )}

      <div className="flex justify-end gap-1.5">
        <Button radius="lg" size="sm" startContent={<X className="size-3.5" />} variant="light" onPress={alTerminar}>
          Cancelar
        </Button>
        <Button
          color="primary"
          isDisabled={fecha === ""}
          isLoading={crear.isPending}
          radius="lg"
          size="sm"
          type="submit"
        >
          Guardar
        </Button>
      </div>
    </form>
  );
}

/* ==================================================================== */
/* En la tarjeta                                                        */
/* ==================================================================== */

/**
 * Mi próximo recordatorio en esta marca, con su casilla. Solo sale si
 * tengo alguno: la tarjeta ya va llena y una línea vacía no dice nada.
 */
export function RecordatorioDeLaTarjeta({ marca }: { marca: Marca }) {
  const cambiar = useCambiarRecordatorio();
  const proximo = marca.miProximoRecordatorio;

  if (!proximo) return null;

  const otros = (marca.misRecordatoriosPendientes ?? 1) - 1;

  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-xl bg-default-50 px-2.5 py-1.5"
      role="presentation"
      // La casilla no puede abrir la ficha al pulsarla.
      onClick={(evento) => evento.stopPropagation()}
      onKeyDown={(evento) => evento.stopPropagation()}
    >
      <Tooltip content={marca.puedeEditarla ? "Marcar como cumplido" : "No puedes editar esta marca"}>
        <button
          aria-label="Marcar el recordatorio como cumplido"
          className="flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-default-300 transition hover:border-success hover:bg-success/10"
          disabled={!marca.puedeEditarla || cambiar.isPending}
          type="button"
          onClick={() =>
            cambiar.mutate(
              { idDelRecordatorio: proximo.id, cambios: { cumplido: true } },
              {
                onSuccess: () => avisarDeExito("Recordatorio cumplido"),
                onError: (error) => avisarDeError(error, "No se pudo cumplir el recordatorio"),
              },
            )
          }
        >
          {cambiar.isPending && <Check className="size-2.5 text-success" strokeWidth={3.5} />}
        </button>
      </Tooltip>

      <AlarmClockCheck className={`size-3.5 shrink-0 ${colorDelDia(proximo)}`} />

      <p className="min-w-0 flex-1 truncate text-[11px] text-default-600">
        <span className={`font-semibold ${colorDelDia(proximo)}`}>{diaDelRecordatorio(proximo)}</span>
        {queToca(proximo) && ` · ${queToca(proximo)}`}
      </p>

      {otros > 0 && <span className="shrink-0 text-[10px] text-default-400">+{otros}</span>}
    </div>
  );
}

/* ==================================================================== */
/* En el panel                                                          */
/* ==================================================================== */

/**
 * «Para hoy» (con lo que viene esta semana debajo) y «Vencidos», de quien
 * mira. Las dos cajas se enseñan aunque estén vacías: una lista que
 * desaparece se lee como que no funciona, y «nada para hoy» también es
 * una respuesta.
 */
export function MisRecordatoriosDelPanel() {
  const consulta = useMisRecordatorios();

  const vencidos = consulta.data?.vencidos ?? [];
  const paraHoy = consulta.data?.paraHoy ?? [];
  const proximos = consulta.data?.proximos ?? [];

  const cargando = consulta.isLoading;

  return (
    <>
      <TarjetaBento
        columnas={6}
        descripcion="Lo que te toca hoy y lo que viene esta semana. Se dejan desde la ficha de cada marca."
        icono={<AlarmClock className="size-4" />}
        id={ANCLA_DE_MIS_RECORDATORIOS}
        titulo="Para hoy"
      >
        {paraHoy.length === 0 && proximos.length === 0 ? (
          <EstadoVacio
            descripcion={cargando ? "Cargando…" : "Abre una marca y pulsa «Recordar» para no olvidar el próximo contacto."}
            titulo="Nada para hoy"
          />
        ) : (
          <div className="space-y-3">
            {paraHoy.length > 0 ? (
              <ul className="space-y-1.5">
                {paraHoy.map((recordatorio) => (
                  <FilaDeRecordatorio key={recordatorio.id} conLaMarca recordatorio={recordatorio} />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-default-500">Hoy no tienes nada pendiente.</p>
            )}

            {proximos.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-default-400">
                  Esta semana
                </p>
                <ul className="space-y-1.5">
                  {proximos.map((recordatorio) => (
                    <FilaDeRecordatorio key={recordatorio.id} conLaMarca recordatorio={recordatorio} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </TarjetaBento>

      <TarjetaBento
        columnas={6}
        descripcion="Lo que se quedó sin hacer. Cúmplelo o pásalo a mañana."
        icono={<AlarmClock className="size-4 text-danger" />}
        titulo={vencidos.length > 0 ? `Vencidos · ${vencidos.length}` : "Vencidos"}
      >
        {vencidos.length === 0 ? (
          <EstadoVacio
            descripcion={cargando ? "Cargando…" : "Todo lo que tenías pendiente está al día."}
            titulo="Nada vencido"
          />
        ) : (
          <ul className="space-y-1.5">
            {vencidos.map((recordatorio) => (
              <FilaDeRecordatorio key={recordatorio.id} conLaMarca recordatorio={recordatorio} />
            ))}
          </ul>
        )}
      </TarjetaBento>
    </>
  );
}
