/**
 * componentes/crm/PanelDeComentarios.tsx
 * ---------------------------------------------------------------------
 * La bitácora de una marca: la columna derecha de la ficha.
 *
 * Es el hilo donde el equipo deja constancia de las llamadas, las
 * respuestas y lo que hay que hacer después. Se lee de arriba abajo,
 * como una conversación, y se desplaza sola al final para enseñar
 * primero lo más reciente.
 *
 * Cualquiera que pueda ver la marca puede comentarla, aunque no pueda
 * editarla: si un vendedor se entera de algo de una marca que trabaja
 * otro, lo natural es que pueda avisarle por aquí.
 * ---------------------------------------------------------------------
 */
import { Button, Textarea, Tooltip } from "@heroui/react";
import { MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  BloqueDeCarga,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import {
  useComentariosDeMarca,
  useCrearComentario,
  useEliminarComentario,
} from "@/hooks/useMarcas";
import { avisarDeError } from "@/utilidades/avisos";
import { formatearTiempoRelativo, inicialesDe } from "@/utilidades/formato";

export function PanelDeComentarios({ idDeLaMarca }: { idDeLaMarca: string }) {
  const consultaDeComentarios = useComentariosDeMarca(idDeLaMarca);
  const crearComentario = useCrearComentario(idDeLaMarca);
  const eliminarComentario = useEliminarComentario(idDeLaMarca);

  const [textoDelComentario, establecerTextoDelComentario] = useState("");
  const referenciaAlFinalDelHilo = useRef<HTMLDivElement>(null);

  const comentarios = consultaDeComentarios.data ?? [];

  // Al abrir la ficha o al añadir una entrada, se baja al final del
  // hilo: lo último es lo que interesa leer.
  useEffect(() => {
    referenciaAlFinalDelHilo.current?.scrollIntoView({ block: "end" });
  }, [comentarios.length]);

  async function enviarElComentario() {
    const textoLimpio = textoDelComentario.trim();

    if (textoLimpio === "") return;

    try {
      await crearComentario.mutateAsync(textoLimpio);

      establecerTextoDelComentario("");
    } catch (error) {
      avisarDeError(error, "No se pudo publicar el comentario");
    }
  }

  async function borrarElComentario(idDelComentario: string) {
    try {
      await eliminarComentario.mutateAsync(idDelComentario);
    } catch (error) {
      avisarDeError(error, "No se pudo eliminar el comentario");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageSquarePlus className="size-4 text-primary" />
        Actividad y comentarios
      </h3>

      {/* Hilo */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {consultaDeComentarios.isLoading ? (
          <BloqueDeCarga alto="min-h-32" mensaje="Cargando la bitácora…" />
        ) : consultaDeComentarios.error ? (
          <p className="rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger dark:bg-danger-100/10">
            {mensajeDeError(consultaDeComentarios.error)}
          </p>
        ) : comentarios.length === 0 ? (
          <EstadoVacio
            descripcion="Anota aquí las llamadas, las respuestas y lo que haya que hacer después."
            titulo="Todavía no hay comentarios"
          />
        ) : (
          comentarios.map((comentario) => (
            <article
              key={comentario.id}
              className="group rounded-2xl bg-default-50 px-3 py-2.5"
            >
              <header className="mb-1 flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary text-[10px] font-bold text-primary-foreground">
                  {inicialesDe(comentario.autorNombre)}
                </span>

                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
                  {comentario.autorNombre}
                </span>

                <time className="shrink-0 text-[10px] text-default-400">
                  {formatearTiempoRelativo(comentario.creadoEn)}
                </time>

                {comentario.puedeBorrarlo && (
                  <Tooltip content="Eliminar" placement="left">
                    <button
                      aria-label="Eliminar el comentario"
                      className="shrink-0 text-default-300 opacity-0 transition hover:text-danger group-hover:opacity-100"
                      type="button"
                      onClick={() => void borrarElComentario(comentario.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </Tooltip>
                )}
              </header>

              <p className="whitespace-pre-wrap break-words pl-8 text-xs leading-relaxed text-default-700">
                {comentario.cuerpo}
              </p>
            </article>
          ))
        )}

        <div ref={referenciaAlFinalDelHilo} />
      </div>

      {/* Caja de escritura */}
      <div className="mt-3 flex flex-col gap-2 border-t border-default-100 pt-3">
        <Textarea
          maxRows={5}
          minRows={2}
          placeholder="Escribe qué ha pasado con esta marca…"
          radius="lg"
          value={textoDelComentario}
          variant="bordered"
          onKeyDown={(evento) => {
            // Ctrl/Cmd + Enter envía, que es lo que espera quien escribe
            // mucho; Enter a secas sigue haciendo salto de línea.
            if ((evento.ctrlKey || evento.metaKey) && evento.key === "Enter") {
              evento.preventDefault();
              void enviarElComentario();
            }
          }}
          onValueChange={establecerTextoDelComentario}
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-default-400">Ctrl + Enter para enviar</span>

          <Button
            color="primary"
            isDisabled={textoDelComentario.trim() === ""}
            isLoading={crearComentario.isPending}
            radius="lg"
            size="sm"
            startContent={!crearComentario.isPending && <Send className="size-3.5" />}
            onPress={() => void enviarElComentario()}
          >
            Comentar
          </Button>
        </div>
      </div>
    </div>
  );
}
