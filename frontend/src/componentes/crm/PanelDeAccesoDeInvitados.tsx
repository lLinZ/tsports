/**
 * componentes/crm/PanelDeAccesoDeInvitados.tsx
 * ---------------------------------------------------------------------
 * El usuario y la contraseña con los que un cliente abre el catálogo de
 * propiedades de la web. Es UNO para todos los clientes, y se ve en
 * claro: es lo que se le manda a cada cliente nuevo, y tener que
 * cambiarlo cada vez que alguien lo pide dejaría fuera a los demás.
 *
 * Cambiarlo es la forma de cerrarle la puerta a quien ya no tiene que
 * ver el catálogo: todos los que entraron con el anterior tienen que
 * volver a entrar con el nuevo. Se avisa antes de guardar.
 *
 * Vive a la vista en la pantalla «Catálogo web» desde el 2026-10-01.
 * Antes era una ventana que se abría con un botón de Propiedades, y el
 * equipo no la encontraba. Solo la ve quien gestiona el catálogo (admin y
 * comercial), y el servidor lo vuelve a comprobar.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Input } from "@heroui/react";
import { Copy, MessageSquareText, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { esErrorDeApi, mensajeDeError } from "@/api/clienteHttp";
import { BloqueDeCarga, BloqueDeError } from "@/componentes/comunes/EstadosDePantalla";
import { useAccesoDeInvitados, useGuardarAccesoDeInvitados } from "@/hooks/usePropiedades";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearFechaYHora } from "@/utilidades/formato";

/** Dónde está el catálogo, para el mensaje que se le manda al cliente. */
export function direccionDelCatalogo(): string {
  return `${window.location.origin}/#propiedades`;
}

async function copiar(texto: string, queSeCopio: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
    avisarDeExito(`${queSeCopio} copiado`);
  } catch {
    avisarDeError("El navegador no dejó copiar. Selecciónalo y cópialo a mano.");
  }
}

export function PanelDeAccesoDeInvitados() {
  const consulta = useAccesoDeInvitados(true);
  const guardar = useGuardarAccesoDeInvitados();

  const acceso = consulta.data ?? null;

  const [usuario, establecerUsuario] = useState("");
  const [contrasena, establecerContrasena] = useState("");
  const [errores, establecerErrores] = useState<Record<string, string>>({});

  // Se rellena con lo guardado cada vez que llega del servidor.
  useEffect(() => {
    establecerUsuario(acceso?.usuario ?? "invitado");
    establecerContrasena(acceso?.contrasena ?? "");
    establecerErrores({});
  }, [acceso]);

  const hayCambios =
    acceso === null || usuario.trim() !== acceso.usuario || contrasena !== (acceso.contrasena ?? "");

  const mensajeParaElCliente = acceso
    ? [
        "Catálogo de propiedades de TS Sports",
        direccionDelCatalogo(),
        `Usuario: ${acceso.usuario}`,
        `Contraseña: ${acceso.contrasena ?? ""}`,
      ].join("\n")
    : "";

  function alGuardar() {
    guardar.mutate(
      { usuario: usuario.trim(), contrasena },
      {
        onSuccess: () => {
          establecerErrores({});
          avisarDeExito(
            acceso === null
              ? "Acceso creado"
              : "Acceso cambiado: los clientes tendrán que entrar con el nuevo",
          );
        },
        onError: (error) => {
          // Los motivos del servidor van debajo de su campo, no en un aviso.
          if (esErrorDeApi(error) && Object.keys(error.erroresPorCampo).length > 0) {
            establecerErrores(
              Object.fromEntries(
                Object.entries(error.erroresPorCampo).map(([campo, motivos]) => [
                  campo,
                  motivos[0] ?? "",
                ]),
              ),
            );

            return;
          }

          avisarDeError(error, "No se pudo guardar el acceso");
        },
      },
    );
  }

  if (consulta.isLoading) {
    return <BloqueDeCarga alto="min-h-40" mensaje="Cargando el acceso…" />;
  }

  if (consulta.error && !consulta.data) {
    return (
      <BloqueDeError
        alReintentar={() => void consulta.refetch()}
        mensaje={mensajeDeError(consulta.error)}
      />
    );
  }

  return (
    <div className="space-y-5">
      {acceso === null ? (
        <p className="rounded-xl bg-warning-50 px-3 py-2.5 text-xs leading-relaxed text-warning-700 dark:bg-warning-100/10 dark:text-warning">
          Todavía no hay usuario de invitado. Sin él, la web no enseña la sección de
          propiedades. Elige un usuario y una contraseña y pulsa «Crear el acceso».
        </p>
      ) : (
        <div className="space-y-3 rounded-2xl bg-default-100 p-4">
          <DatoParaCopiar etiqueta="Usuario" valor={acceso.usuario} />
          <DatoParaCopiar etiqueta="Contraseña" valor={acceso.contrasena ?? "—"} />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-default-500">
              {acceso.cambiadoPor
                ? `Puesto por ${acceso.cambiadoPor} · ${formatearFechaYHora(acceso.cambiadoEn)}`
                : `Puesto el ${formatearFechaYHora(acceso.cambiadoEn)}`}
            </span>

            <Button
              color="primary"
              radius="full"
              size="sm"
              startContent={<MessageSquareText className="size-4" />}
              variant="flat"
              onPress={() => void copiar(mensajeParaElCliente, "Mensaje para el cliente")}
            >
              Copiar el mensaje para el cliente
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">
          {acceso === null ? "Crear el acceso" : "Cambiar el usuario o la contraseña"}
        </h4>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            autoComplete="off"
            errorMessage={errores.usuario}
            isInvalid={Boolean(errores.usuario)}
            label="Usuario"
            labelPlacement="outside"
            radius="lg"
            value={usuario}
            variant="bordered"
            onValueChange={establecerUsuario}
          />
          <Input
            autoComplete="new-password"
            description="Al menos 8 caracteres, sin espacios."
            errorMessage={errores.contrasena}
            isInvalid={Boolean(errores.contrasena)}
            label="Contraseña"
            labelPlacement="outside"
            radius="lg"
            value={contrasena}
            variant="bordered"
            onValueChange={establecerContrasena}
          />
        </div>

        {acceso !== null && hayCambios && (
          <p className="flex items-start gap-2 rounded-xl bg-warning-50 px-3 py-2.5 text-xs leading-relaxed text-warning-700 dark:bg-warning-100/10 dark:text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Al guardar, los clientes que entraron con el acceso de ahora dejan de ver el
            catálogo hasta que entren con el nuevo.
          </p>
        )}

        <div className="flex justify-end">
          <Button
            color="primary"
            isDisabled={!hayCambios || usuario.trim() === "" || contrasena === ""}
            isLoading={guardar.isPending}
            radius="lg"
            size="sm"
            onPress={alGuardar}
          >
            {acceso === null ? "Crear el acceso" : "Guardar el cambio"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DatoParaCopiar({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-default-500">
          {etiqueta}
        </p>
        <p className="truncate font-mono text-base font-semibold text-foreground">{valor}</p>
      </div>

      <Chip
        as="button"
        className="cursor-pointer"
        radius="full"
        size="sm"
        startContent={<Copy className="ml-1 size-3.5" />}
        variant="flat"
        onClick={() => void copiar(valor, etiqueta)}
      >
        Copiar
      </Chip>
    </div>
  );
}
