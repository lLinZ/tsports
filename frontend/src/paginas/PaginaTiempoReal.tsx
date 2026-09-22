/**
 * paginas/PaginaTiempoReal.tsx
 * ---------------------------------------------------------------------
 * La pantalla de pruebas del tiempo real. Solo para administradores.
 *
 * Contesta, sin abrir una consola en el servidor, las tres preguntas que
 * surgen al probar los avisos en vivo:
 *
 *   · ¿Estoy yo conectado?                  → «Tu conexión».
 *   · ¿Quién tiene ahora el panel abierto?  → «Conectados ahora», que se
 *                                             refresca sola.
 *   · ¿Llega un aviso de punta a punta?     → se manda uno (a una
 *     persona, a uno mismo o a todo el equipo) y, si es para uno mismo,
 *     aparece en «Recibidos en esta pestaña» con lo que tardó.
 *
 * Los avisos son el mismo evento que manda `php artisan
 * tiempo-real:probar` (PruebaDeTiempoReal): a cada destinatario le salta
 * como aviso flotante, firmado por quien lo mandó.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Inbox, Radio, RefreshCw, Send, Users, Wifi } from "lucide-react";
import { useRef, useState } from "react";
import { mensajeDeError } from "@/api/clienteHttp";
import { enviarAvisoDePrueba, obtenerPanelDeTiempoReal } from "@/api/echo";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { RejillaBento, TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import {
  useEventoPersonal,
  useTiempoReal,
  type EstadoDeLaConexion,
} from "@/providers/ProveedorTiempoReal";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import type { AvisoDePrueba } from "@/tipos/modelos";
import { errorSoloSiNoHayNadaQueEnsenar } from "@/utilidades/consultas";

/** Cada cuánto se vuelve a preguntar quién está conectado. */
const CADA_CUANTO_SE_REFRESCAN_LOS_CONECTADOS_MS = 10_000;

/** Cuántos avisos recibidos se guardan en la lista de la pestaña. */
const AVISOS_RECIBIDOS_QUE_SE_GUARDAN = 20;

/** Lo que el servidor entiende como «todo el equipo activo». */
const DESTINATARIO_TODO_EL_EQUIPO = "todos";

/**
 * Por encima de esto, la resta entre la hora del servidor y la de este
 * ordenador ya no mide el viaje sino la diferencia entre sus relojes, y
 * se prefiere no enseñar nada a enseñar un tiempo absurdo.
 */
const VIAJE_MAXIMO_CREIBLE_MS = 60_000;

interface AvisoRecibido extends AvisoDePrueba {
  /** Para la key de React: dos avisos pueden llegar en el mismo milisegundo. */
  idLocal: number;
  recibidoEn: Date;
  /** Llegada menos salida, o null si los relojes no permiten fiarse. */
  milisegundosDeViaje: number | null;
}

const ESTADOS_DE_LA_CONEXION: Record<
  EstadoDeLaConexion,
  { etiqueta: string; explicacion: string; colorDelPunto: string }
> = {
  enVivo: {
    etiqueta: "En vivo",
    explicacion: "Conectado y suscrito a tu canal: lo que te manden llega al momento.",
    colorDelPunto: "bg-success",
  },
  conectando: {
    etiqueta: "Conectando…",
    explicacion: "Abriendo el WebSocket con el servidor.",
    colorDelPunto: "bg-warning",
  },
  sinConexion: {
    etiqueta: "Sin conexión",
    explicacion:
      "Se cortó o no se pudo abrir. Se reintenta solo; si dura, revisa el servicio de Reverb del servidor.",
    colorDelPunto: "bg-danger",
  },
  inactivo: {
    etiqueta: "Apagado",
    explicacion: "Este servidor no tiene el tiempo real encendido.",
    colorDelPunto: "bg-default-300",
  },
};

export function PaginaTiempoReal() {
  const usuario = useUsuarioAutenticado();
  const { estadoDeLaConexion } = useTiempoReal();

  const panel = useQuery({
    queryKey: ["panel-de-tiempo-real"],
    queryFn: obtenerPanelDeTiempoReal,
    refetchInterval: CADA_CUANTO_SE_REFRESCAN_LOS_CONECTADOS_MS,
  });

  const envio = useMutation({ mutationFn: enviarAvisoDePrueba });

  // De partida, para uno mismo: es la prueba que se puede ver entera
  // desde esta pantalla, sin molestar a nadie.
  const [destinatario, establecerDestinatario] = useState(usuario.id);
  const [titulo, establecerTitulo] = useState("");
  const [mensaje, establecerMensaje] = useState("");
  const [avisosRecibidos, establecerAvisosRecibidos] = useState<AvisoRecibido[]>([]);
  const contadorDeAvisos = useRef(0);

  useEventoPersonal<AvisoDePrueba>(".prueba-de-conexion", (aviso) => {
    const recibidoEn = new Date();
    const viaje = recibidoEn.getTime() - new Date(aviso.enviadaEn).getTime();

    contadorDeAvisos.current += 1;

    establecerAvisosRecibidos((anteriores) =>
      [
        {
          ...aviso,
          idLocal: contadorDeAvisos.current,
          recibidoEn,
          milisegundosDeViaje:
            viaje >= 0 && viaje < VIAJE_MAXIMO_CREIBLE_MS ? viaje : null,
        },
        ...anteriores,
      ].slice(0, AVISOS_RECIBIDOS_QUE_SE_GUARDAN),
    );
  });

  async function enviarElAviso() {
    try {
      const resultado = await envio.mutateAsync({
        destinatario,
        titulo: titulo.trim(),
        mensaje: mensaje.trim(),
      });

      avisarDeExito(resultado.mensaje);
    } catch (error) {
      avisarDeError(error, "No se pudo enviar el aviso");
    }
  }

  const personas = panel.data?.personas ?? [];
  const seSabeQuienEstaConectado = panel.data?.seSabeQuienEstaConectado ?? false;
  const conectadasPrimero = [...personas].sort(
    (una, otra) => Number(otra.conectada) - Number(una.conectada),
  );
  const cuantasConectadas = personas.filter((persona) => persona.conectada).length;
  const elServidorLoTieneApagado = panel.data?.activo === false;

  const opcionesDeDestinatario = [
    {
      clave: usuario.id,
      etiqueta: "A mí",
      descripcion: "Lo verás aquí abajo, con lo que tardó",
      conectada: estadoDeLaConexion === "enVivo",
    },
    {
      clave: DESTINATARIO_TODO_EL_EQUIPO,
      etiqueta: "Todo el equipo",
      descripcion: "Le salta a todo el que tenga el panel abierto",
      conectada: cuantasConectadas > 0,
    },
    ...personas
      .filter((persona) => persona.id !== usuario.id)
      .map((persona) => ({
        clave: persona.id,
        etiqueta: persona.nombre,
        descripcion: persona.conectada ? `${persona.rolEtiqueta} · conectada` : persona.rolEtiqueta,
        conectada: persona.conectada,
      })),
  ];

  const estadoPropio = ESTADOS_DE_LA_CONEXION[estadoDeLaConexion];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Tiempo real</h2>
        <p className="mt-0.5 text-sm text-default-500">
          Manda avisos de prueba por el WebSocket y mira quién los recibe.
        </p>
      </div>

      <RejillaBento>
        <TarjetaBento
          columnas={4}
          descripcion="El WebSocket de esta pestaña."
          icono={<Wifi className="size-4" />}
          titulo="Tu conexión"
        >
          <div className="flex items-center gap-3">
            <span className={`size-3 shrink-0 rounded-full ${estadoPropio.colorDelPunto}`} />
            <span className="text-lg font-bold tracking-tight text-foreground">
              {estadoPropio.etiqueta}
            </span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-default-500">
            {estadoPropio.explicacion}
          </p>
        </TarjetaBento>

        <TarjetaBento
          columnas={8}
          descripcion="Le salta como aviso flotante a quien lo reciba, firmado con tu nombre."
          icono={<Send className="size-4" />}
          titulo="Enviar un aviso de prueba"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              disallowEmptySelection
              label="Para quién"
              labelPlacement="outside"
              radius="lg"
              selectedKeys={[destinatario]}
              variant="bordered"
              onSelectionChange={(seleccion) => {
                const clave = Array.from(seleccion)[0];

                if (clave !== undefined) establecerDestinatario(String(clave));
              }}
            >
              {opcionesDeDestinatario.map((opcion) => (
                <SelectItem
                  key={opcion.clave}
                  description={opcion.descripcion}
                  startContent={<PuntoDeConexion estaConectada={opcion.conectada} />}
                  textValue={opcion.etiqueta}
                >
                  {opcion.etiqueta}
                </SelectItem>
              ))}
            </Select>

            <Input
              label="Título"
              labelPlacement="outside"
              maxLength={80}
              placeholder="Tiempo real funcionando"
              radius="lg"
              value={titulo}
              variant="bordered"
              onValueChange={establecerTitulo}
            />

            <Textarea
              className="sm:col-span-2"
              label="Mensaje"
              labelPlacement="outside"
              maxLength={300}
              minRows={2}
              placeholder="Este aviso ha llegado por el WebSocket, sin recargar la página."
              radius="lg"
              value={mensaje}
              variant="bordered"
              onValueChange={establecerMensaje}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-default-500">
              {elServidorLoTieneApagado
                ? "Este servidor tiene el tiempo real apagado: el aviso no saldría."
                : "Título y mensaje son opcionales."}
            </p>

            <Button
              color="primary"
              isDisabled={elServidorLoTieneApagado}
              isLoading={envio.isPending}
              radius="lg"
              size="sm"
              startContent={!envio.isPending && <Send className="size-4" />}
              onPress={() => void enviarElAviso()}
            >
              Enviar aviso
            </Button>
          </div>
        </TarjetaBento>

        <TarjetaBento
          accionDeCabecera={
            <>
              {seSabeQuienEstaConectado && (
                <Chip radius="lg" size="sm" variant="flat">
                  {cuantasConectadas} de {personas.length}
                </Chip>
              )}

              <Button
                isIconOnly
                aria-label="Volver a preguntar quién está conectado"
                isLoading={panel.isFetching}
                radius="lg"
                size="sm"
                variant="flat"
                onPress={() => void panel.refetch()}
              >
                {!panel.isFetching && <RefreshCw className="size-4" />}
              </Button>
            </>
          }
          columnas={6}
          descripcion="Quién tiene ahora mismo el panel abierto. Se actualiza sola cada 10 segundos."
          icono={<Users className="size-4" />}
          titulo="Conectados ahora"
        >
          {panel.isLoading ? (
            <BloqueDeCarga alto="min-h-32" mensaje="Preguntando al servidor…" />
          ) : errorSoloSiNoHayNadaQueEnsenar(panel) ? (
            <BloqueDeError
              alReintentar={() => void panel.refetch()}
              mensaje={mensajeDeError(panel.error)}
            />
          ) : (
            <>
              {!seSabeQuienEstaConectado && (
                <p className="mb-3 rounded-xl bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-100/10">
                  No se pudo preguntar a Reverb quién está conectado: el servicio puede estar
                  parado. Mientras tanto, nadie sale como conectado.
                </p>
              )}

              <ul className="divide-y divide-default-100">
                {conectadasPrimero.map((persona) => (
                  <li key={persona.id} className="flex items-center gap-2.5 py-2">
                    <PuntoDeConexion estaConectada={persona.conectada} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {persona.nombre}
                      {persona.id === usuario.id && (
                        <span className="text-default-400"> (tú)</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-default-400">
                      {persona.rolEtiqueta}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </TarjetaBento>

        <TarjetaBento
          columnas={6}
          descripcion="Lo que ha llegado a ESTA pestaña desde que la abriste, lo más nuevo arriba."
          icono={<Inbox className="size-4" />}
          titulo="Recibidos en esta pestaña"
        >
          {avisosRecibidos.length === 0 ? (
            <EstadoVacio
              descripcion="Mándate uno a ti mismo y aparecerá aquí, con lo que tardó en llegar."
              icono={<Radio className="size-5" />}
              titulo="Todavía no ha llegado nada"
            />
          ) : (
            <ul className="space-y-2">
              {avisosRecibidos.map((aviso) => (
                <li key={aviso.idLocal} className="rounded-2xl bg-default-50 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {aviso.titulo ?? "Tiempo real funcionando"}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-default-400">
                      {horaConSegundos(aviso.recibidoEn)}
                      {aviso.milisegundosDeViaje !== null &&
                        ` · ${aviso.milisegundosDeViaje} ms`}
                    </span>
                  </div>

                  {aviso.mensaje && (
                    <p className="mt-0.5 break-words text-xs text-default-600">{aviso.mensaje}</p>
                  )}

                  <p className="mt-1 text-[11px] text-default-400">
                    {aviso.enviadoPor ? `De ${aviso.enviadoPor}` : "Desde la consola del servidor"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TarjetaBento>
      </RejillaBento>
    </div>
  );
}

/* ==================================================================== */
/* Piezas                                                              */
/* ==================================================================== */

function PuntoDeConexion({ estaConectada }: { estaConectada: boolean }) {
  return (
    <span
      aria-label={estaConectada ? "Conectada" : "Sin conectar"}
      className={`size-2 shrink-0 rounded-full ${estaConectada ? "bg-success" : "bg-default-300"}`}
      role="img"
    />
  );
}

/**
 * La hora con segundos. Aquí sí hacen falta: dos avisos de prueba
 * seguidos llegan en el mismo minuto, y es lo que permite distinguirlos.
 */
function horaConSegundos(fecha: Date): string {
  return fecha.toLocaleTimeString("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
