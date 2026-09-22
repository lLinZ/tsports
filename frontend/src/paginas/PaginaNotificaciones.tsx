/**
 * paginas/PaginaNotificaciones.tsx
 * ---------------------------------------------------------------------
 * Todos los avisos de la persona, los últimos primero. La campanita solo
 * enseña los ocho más recientes; esto es lo que hay detrás del «Ver
 * todas».
 *
 * Se recorre con scroll infinito, como el tablero y la auditoría (regla
 * 14): los avisos se acumulan semana tras semana y nadie los pagina.
 *
 * «Sin leer» es un filtro del servidor, no de esta pantalla: filtrar
 * aquí la lista ya cargada dejaría fuera los que están en páginas que
 * aún no se han pedido.
 * ---------------------------------------------------------------------
 */
import { Button, Tab, Tabs } from "@heroui/react";
import { BellOff, CheckCheck } from "lucide-react";
import { useState } from "react";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { FilaDeNotificacion } from "@/componentes/comunes/FilaDeNotificacion";
import { TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  useAbrirNotificacion,
  useContadorDeNotificaciones,
  useListadoDeNotificaciones,
  useMarcarTodasComoLeidas,
} from "@/hooks/useNotificaciones";
import { useScrollInfinito } from "@/hooks/useScrollInfinito";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearNumero } from "@/utilidades/formato";
import { TarjetaDeAvisosEnElMovil } from "@/componentes/layout/TarjetaDeAvisosEnElMovil";

type Vista = "todas" | "sinLeer";

export function PaginaNotificaciones() {
  const [vista, establecerVista] = useState<Vista>("todas");

  const listado = useListadoDeNotificaciones(vista === "sinLeer");
  const contador = useContadorDeNotificaciones();
  const marcarTodas = useMarcarTodasComoLeidas();
  const abrirNotificacion = useAbrirNotificacion();

  const sinLeer = contador.data ?? 0;

  const finalDeLaLista = useScrollInfinito({
    hayMas: listado.hayMas,
    estaCargando: listado.estaCargandoMas,
    pedirMas: listado.pedirMas,
  });

  async function marcarTodasComoLeidas() {
    try {
      const resultado = await marcarTodas.mutateAsync();

      avisarDeExito(resultado.mensaje);
    } catch (error) {
      avisarDeError(error, "No se pudieron marcar como leídas");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Notificaciones
          </h2>
          <p className="mt-0.5 text-sm text-default-500">
            {sinLeer === 0
              ? "Estás al día."
              : `${formatearNumero(sinLeer)} sin leer`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            aria-label="Qué avisos ver"
            radius="full"
            selectedKey={vista}
            size="sm"
            onSelectionChange={(clave) => establecerVista(clave as Vista)}
          >
            <Tab key="todas" title="Todas" />
            <Tab key="sinLeer" title="Sin leer" />
          </Tabs>

          <Button
            isDisabled={sinLeer === 0}
            isLoading={marcarTodas.isPending}
            radius="full"
            size="sm"
            startContent={!marcarTodas.isPending && <CheckCheck className="size-4" />}
            variant="flat"
            onPress={() => void marcarTodasComoLeidas()}
          >
            Marcar todas como leídas
          </Button>
        </div>
      </div>

      <TarjetaDeAvisosEnElMovil />

      <TarjetaBento>
        {listado.estaCargando ? (
          <BloqueDeCarga alto="min-h-48" mensaje="Cargando avisos…" />
        ) : listado.error ? (
          <BloqueDeError mensaje={mensajeDeError(listado.error)} />
        ) : listado.notificaciones.length === 0 ? (
          <EstadoVacio
            descripcion={
              vista === "sinLeer"
                ? "Has leído todos tus avisos."
                : "Aquí aparecerán los leads que entren por la web y las marcas que te asignen."
            }
            icono={<BellOff className="size-6" />}
            titulo={vista === "sinLeer" ? "Nada pendiente" : "Todavía no tienes avisos"}
          />
        ) : (
          <div className="space-y-1">
            {listado.notificaciones.map((notificacion) => (
              <FilaDeNotificacion
                key={notificacion.id}
                alPulsar={abrirNotificacion}
                notificacion={notificacion}
              />
            ))}
          </div>
        )}

        {/* El centinela se queda montado aunque no queden páginas: ver
            useScrollInfinito. */}
        <div ref={finalDeLaLista} />

        {listado.estaCargandoMas && <BloqueDeCarga alto="min-h-16" />}
      </TarjetaBento>
    </div>
  );
}
