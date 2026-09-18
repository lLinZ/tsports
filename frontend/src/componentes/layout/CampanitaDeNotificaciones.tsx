/**
 * componentes/layout/CampanitaDeNotificaciones.tsx
 * ---------------------------------------------------------------------
 * La campanita de la barra superior: cuántos avisos quedan sin leer y,
 * al pulsarla, los últimos.
 *
 * También es quien ESCUCHA los avisos en vivo (useAvisosEnVivo). Va aquí
 * porque la barra superior está en todas las pantallas del panel y se
 * monta una sola vez: si lo escuchara cada pantalla, un aviso saldría
 * repetido.
 *
 * Pulsar un aviso lo marca como leído y lleva a donde apunta (hoy, la
 * ficha de la marca). El resto de avisos, en /notificaciones.
 * ---------------------------------------------------------------------
 */
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@heroui/react";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import { BloqueDeCarga, EstadoVacio } from "@/componentes/comunes/EstadosDePantalla";
import { FilaDeNotificacion } from "@/componentes/comunes/FilaDeNotificacion";
import {
  useAbrirNotificacion,
  useAvisosEnVivo,
  useContadorDeNotificaciones,
  useMarcarTodasComoLeidas,
  useUltimasNotificaciones,
} from "@/hooks/useNotificaciones";
import { avisarDeError } from "@/utilidades/avisos";
import type { Notificacion } from "@/tipos/modelos";

export function CampanitaDeNotificaciones() {
  const [estaAbierta, establecerAbierta] = useState(false);
  const navegar = useNavigate();

  useAvisosEnVivo();

  const contador = useContadorDeNotificaciones();
  const ultimas = useUltimasNotificaciones({ habilitado: estaAbierta });
  const marcarTodas = useMarcarTodasComoLeidas();
  const abrirNotificacion = useAbrirNotificacion();

  const sinLeer = contador.data ?? 0;

  function pulsarAviso(notificacion: Notificacion) {
    establecerAbierta(false);
    abrirNotificacion(notificacion);
  }

  async function marcarTodasComoLeidas() {
    try {
      await marcarTodas.mutateAsync();
    } catch (error) {
      avisarDeError(error, "No se pudieron marcar como leídas");
    }
  }

  return (
    <Popover
      isOpen={estaAbierta}
      placement="bottom-end"
      radius="lg"
      onOpenChange={establecerAbierta}
    >
      <PopoverTrigger>
        <Button
          isIconOnly
          aria-label={
            sinLeer > 0 ? `Notificaciones: ${sinLeer} sin leer` : "Notificaciones"
          }
          radius="full"
          size="sm"
          variant="light"
        >
          <Badge
            color="danger"
            content={sinLeer > 9 ? "9+" : sinLeer}
            isInvisible={sinLeer === 0}
            shape="circle"
            size="sm"
          >
            <Bell className="size-5" />
          </Badge>
        </Button>
      </PopoverTrigger>

      {/* El ancho se ajusta al móvil: en una pantalla de 360px, un
          desplegable fijo de 22rem se saldría por la izquierda. */}
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex w-full items-center justify-between gap-2 border-b border-default-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Notificaciones</h2>

          {sinLeer > 0 && (
            <Button
              className="h-7 min-w-0 px-2 text-xs"
              isLoading={marcarTodas.isPending}
              radius="full"
              size="sm"
              startContent={!marcarTodas.isPending && <CheckCheck className="size-3.5" />}
              variant="light"
              onPress={() => void marcarTodasComoLeidas()}
            >
              Marcar todas como leídas
            </Button>
          )}
        </div>

        <div className="max-h-[min(24rem,60vh)] w-full overflow-y-auto p-1.5">
          {ultimas.isLoading ? (
            <BloqueDeCarga alto="min-h-32" mensaje="Cargando avisos…" />
          ) : ultimas.error ? (
            <p className="m-2 rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger dark:bg-danger-100/10">
              {mensajeDeError(ultimas.error)}
            </p>
          ) : (ultimas.data ?? []).length === 0 ? (
            <EstadoVacio
              descripcion="Aquí te avisamos de los leads que entran por la web y de las marcas que te asignan."
              titulo="No tienes avisos"
            />
          ) : (
            (ultimas.data ?? []).map((notificacion) => (
              <FilaDeNotificacion
                key={notificacion.id}
                alPulsar={pulsarAviso}
                notificacion={notificacion}
              />
            ))
          )}
        </div>

        <div className="w-full border-t border-default-100 p-1.5">
          <Button
            fullWidth
            radius="lg"
            size="sm"
            variant="light"
            onPress={() => {
              establecerAbierta(false);
              navegar("/notificaciones");
            }}
          >
            Ver todas
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
