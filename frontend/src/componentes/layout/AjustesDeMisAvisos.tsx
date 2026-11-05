/**
 * componentes/layout/AjustesDeMisAvisos.tsx
 * ---------------------------------------------------------------------
 * Notificaciones › Ajustes: qué te llega y por dónde (desde el
 * 2026-11-05, propuesta «Panel de avisos»).
 *
 *   · Los avisos que te llegan a TI, con dos interruptores cada uno: si
 *     te suena el móvil y si suena con el panel abierto. La campanita va
 *     con candado: es donde queda guardado cada aviso (regla 17), y así
 *     nada se pierde aunque se silencie lo demás.
 *   · Tus dispositivos: dónde tienes los avisos activos y cuándo te
 *     llegó el último. Encima, la tarjeta de siempre para activarlos o
 *     quitarlos en el que estás usando.
 *   · El horario de silencio: en esas horas el teléfono no suena. Idea
 *     añadida en la propuesta y aprobada con ella.
 *
 * Un aviso que la administración apagó sale aquí, atenuado y dicho: si
 * desapareciera, no sabrías por qué dejó de llegarte.
 *
 * Qué avisos te llegan lo decide el servidor (MisAvisosController); aquí
 * solo se pinta y se guarda.
 * ---------------------------------------------------------------------
 */
import { Checkbox, Chip, Input, Switch, Tooltip } from "@heroui/react";
import { Lock, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  BloqueDeCarga,
  BloqueDeError,
} from "@/componentes/comunes/EstadosDePantalla";
import { TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { TarjetaDeAvisosEnElMovil } from "@/componentes/layout/TarjetaDeAvisosEnElMovil";
import {
  useGuardarMiHorarioDeSilencio,
  useGuardarMiPreferenciaDeAviso,
  useMisAvisos,
} from "@/hooks/useAvisos";
import type { HorarioDeSilencio, MiAviso } from "@/tipos/modelos";
import { avisarDeError } from "@/utilidades/avisos";
import { formatearTiempoRelativo } from "@/utilidades/formato";
import { iconoDelAviso } from "@/utilidades/iconosDeAvisos";

export function AjustesDeMisAvisos() {
  const { misAvisos, estaCargando, error, recargar } = useMisAvisos();

  if (estaCargando) {
    return <BloqueDeCarga alto="min-h-72" mensaje="Cargando tus avisos…" />;
  }

  if (error || misAvisos === undefined) {
    return (
      <BloqueDeError
        alReintentar={() => void recargar()}
        mensaje={mensajeDeError(error)}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.55fr_1fr]">
      {/* Envuelta: TarjetaBento trae su ancho de la rejilla de doce, y aquí
          la rejilla es de dos columnas. */}
      <div className="min-w-0">
        <TarjetaBento
          descripcion="Todo queda en la campanita. Aquí eliges qué te hace sonar el teléfono y qué suena con el panel abierto."
          titulo="Qué te avisa el sistema"
        >
          <div className="hidden grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] gap-3 border-b border-default-100 pb-2 text-[10px] font-semibold uppercase tracking-wide text-default-400 sm:grid">
            <span>Aviso</span>
            <span className="text-center">Campanita</span>
            <span className="text-center">Móvil</span>
            <span className="text-center">Sonido</span>
          </div>

          {misAvisos.avisos.map((aviso) => (
            <FilaDeMiAviso key={aviso.tipo} aviso={aviso} />
          ))}
        </TarjetaBento>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <TarjetaDeAvisosEnElMovil />

        <TarjetaBento
          descripcion="Donde te llegan los avisos con el panel cerrado."
          titulo="Tus dispositivos"
        >
          {/* Una lista que informa no se esconde vacía: dice que no hay. */}
          {misAvisos.dispositivos.length === 0 ? (
            <p className="text-xs text-default-500">
              Todavía no tienes ningún dispositivo con los avisos activos.
              Actívalos en el móvil o en el ordenador donde quieras recibirlos.
            </p>
          ) : (
            <ul className="divide-y divide-default-100">
              {misAvisos.dispositivos.map((dispositivo) => {
                const esUnMovil = /iphone|ipad|android|m[oó]vil/i.test(
                  dispositivo.dispositivo ?? "",
                );
                const Icono = esUnMovil ? Smartphone : Monitor;

                return (
                  <li
                    key={dispositivo.id}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-default-100 text-default-500">
                      <Icono className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {dispositivo.dispositivo ?? "Un dispositivo"}
                      </p>
                      <p className="truncate text-xs text-default-500">
                        {dispositivo.ultimoEnvioEn === null
                          ? "Todavía no le ha llegado ningún aviso"
                          : `Último aviso ${formatearTiempoRelativo(dispositivo.ultimoEnvioEn)}`}
                      </p>
                    </div>
                    <Chip
                      color="success"
                      radius="full"
                      size="sm"
                      variant="flat"
                    >
                      Activo
                    </Chip>
                  </li>
                );
              })}
            </ul>
          )}
        </TarjetaBento>

        {/* La clave la vuelve a montar cuando cambian las horas guardadas
            (en otra pestaña, o al deshacer un error), con las nuevas. */}
        <TarjetaHorarioDeSilencio
          key={`${misAvisos.silencio.desde}-${misAvisos.silencio.hasta}`}
          silencio={misAvisos.silencio}
        />
      </div>
    </div>
  );
}

/* ==================================================================== */
/* Piezas                                                              */
/* ==================================================================== */

function FilaDeMiAviso({ aviso }: { aviso: MiAviso }) {
  const guardar = useGuardarMiPreferenciaDeAviso();
  const Icono = iconoDelAviso(aviso.tipo);

  async function cambiar(cambios: { alMovil?: boolean; conSonido?: boolean }) {
    try {
      await guardar.mutateAsync({ tipo: aviso.tipo, cambios });
    } catch (errorAlGuardar) {
      avisarDeError(errorAlGuardar, "No se pudo guardar");
    }
  }

  return (
    <div
      className={[
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-default-100 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_5rem]",
        aviso.apagadoEnElSistema ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <Icono className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {aviso.nombre}
          </p>
          <p className="truncate text-xs text-default-500">
            {aviso.apagadoEnElSistema
              ? "Apagado por la administración: ahora no le llega a nadie"
              : aviso.porQue}
          </p>
        </div>
      </div>

      {/* En el móvil, los tres en una fila a la derecha. */}
      <div className="flex items-center gap-4 sm:contents">
        <span className="flex justify-center">
          {aviso.vaALaCampanita ? (
            <Tooltip content="La campanita no se apaga: es donde queda guardado el aviso.">
              <span className="flex size-7 items-center justify-center rounded-lg bg-default-100 text-default-400">
                <Lock className="size-3.5" />
              </span>
            </Tooltip>
          ) : (
            <span className="text-default-300">—</span>
          )}
        </span>

        <span className="flex justify-center">
          <Switch
            aria-label={`${aviso.nombre} en el móvil`}
            isDisabled={aviso.apagadoEnElSistema || guardar.isPending}
            isSelected={aviso.alMovil}
            size="sm"
            onValueChange={(alMovil) => void cambiar({ alMovil })}
          />
        </span>

        <span className="flex justify-center">
          <Switch
            aria-label={`Sonido de ${aviso.nombre}`}
            isDisabled={aviso.apagadoEnElSistema || guardar.isPending}
            isSelected={aviso.conSonido}
            size="sm"
            onValueChange={(conSonido) => void cambiar({ conSonido })}
          />
        </span>
      </div>
    </div>
  );
}

function TarjetaHorarioDeSilencio({
  silencio,
}: {
  silencio: HorarioDeSilencio;
}) {
  const guardar = useGuardarMiHorarioDeSilencio();

  // Las horas se escriben y se guardan al terminar; mientras, viven aquí.
  const [desde, establecerDesde] = useState(silencio.desde);
  const [hasta, establecerHasta] = useState(silencio.hasta);

  async function guardarSilencio(cambios: Partial<HorarioDeSilencio>) {
    try {
      await guardar.mutateAsync({ ...silencio, desde, hasta, ...cambios });
    } catch (errorAlGuardar) {
      avisarDeError(
        errorAlGuardar,
        "No se pudo guardar el horario de silencio",
      );
      establecerDesde(silencio.desde);
      establecerHasta(silencio.hasta);
    }
  }

  function alSalirDeUnaHora() {
    if (desde === silencio.desde && hasta === silencio.hasta) return;
    void guardarSilencio({});
  }

  return (
    <TarjetaBento
      descripcion="El teléfono no suena en estas horas. Los avisos esperan en la campanita."
      titulo="Horario de silencio"
    >
      <Switch
        className="mb-3"
        isDisabled={guardar.isPending}
        isSelected={silencio.activo}
        size="sm"
        onValueChange={(activo) => void guardarSilencio({ activo })}
      >
        <span className="text-sm text-foreground">
          {silencio.activo ? "Encendido" : "Apagado"}
        </span>
      </Switch>
      <div
        className={[
          "flex flex-wrap items-center gap-2",
          silencio.activo ? "" : "opacity-60",
        ].join(" ")}
      >
        <span className="text-xs text-default-500">De</span>
        <Input
          aria-label="Desde"
          className="w-36"
          radius="lg"
          size="sm"
          type="time"
          value={desde}
          onBlur={alSalirDeUnaHora}
          onValueChange={establecerDesde}
        />
        <span className="text-xs text-default-500">a</span>
        <Input
          aria-label="Hasta"
          className="w-36"
          radius="lg"
          size="sm"
          type="time"
          value={hasta}
          onBlur={alSalirDeUnaHora}
          onValueChange={establecerHasta}
        />
        <Checkbox
          isDisabled={guardar.isPending}
          isSelected={silencio.finesDeSemana}
          radius="md"
          size="sm"
          onValueChange={(finesDeSemana) =>
            void guardarSilencio({ finesDeSemana })
          }
        >
          <span className="text-xs text-default-600">
            y los fines de semana
          </span>
        </Checkbox>
      </div>
    </TarjetaBento>
  );
}
