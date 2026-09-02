/**
 * componentes/comunes/EstadosDePantalla.tsx
 * ---------------------------------------------------------------------
 * Los tres estados que toda pantalla que carga datos tiene que saber
 * mostrar: cargando, vacía y con error.
 *
 * Están juntos en un fichero porque siempre se usan los tres a la vez, y
 * tenerlos aquí evita que cada pantalla improvise su propio "Cargando…"
 * suelto o deje una zona en blanco sin explicación cuando no hay datos,
 * que es lo que más desconcierta a quien está usando el sistema.
 * ---------------------------------------------------------------------
 */
import { Button, Spinner } from "@heroui/react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

/* ==================================================================== */
/* Cargando                                                            */
/* ==================================================================== */

/**
 * Indicador de carga centrado. Se usa dentro de una tarjeta o de una
 * sección; para la carga inicial de toda la aplicación está
 * <PantallaDeArranque>.
 */
export function BloqueDeCarga({
  mensaje = "Cargando…",
  alto = "min-h-40",
}: {
  mensaje?: string;
  alto?: string;
}) {
  return (
    <div className={`flex ${alto} flex-col items-center justify-center gap-3`}>
      <Spinner color="primary" size="lg" />
      <p className="text-sm text-default-500">{mensaje}</p>
    </div>
  );
}

/**
 * Pantalla completa de arranque, mientras se comprueba si el token
 * guardado sigue valiendo.
 *
 * Es deliberadamente sobria: aparece durante unas décimas de segundo y
 * cualquier cosa más elaborada se percibiría como un parpadeo.
 */
export function PantallaDeArranque() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-lg">
        TS
      </div>
      <Spinner color="primary" size="sm" />
    </div>
  );
}

/* ==================================================================== */
/* Vacío                                                               */
/* ==================================================================== */

/**
 * Lo que se ve cuando no hay nada que enseñar.
 *
 * Siempre lleva una explicación y, cuando tiene sentido, un botón que
 * resuelve la situación: una pantalla vacía sin salida hace pensar que
 * el sistema está roto.
 */
export function EstadoVacio({
  titulo,
  descripcion,
  icono,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  icono?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-default-100 text-default-400">
        {icono ?? <Inbox className="size-5" />}
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">{titulo}</p>

        {descripcion && (
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-default-500">
            {descripcion}
          </p>
        )}
      </div>

      {accion}
    </div>
  );
}

/* ==================================================================== */
/* Error                                                               */
/* ==================================================================== */

/**
 * Fallo al cargar datos, con la posibilidad de reintentar.
 *
 * El mensaje que llega es el que redactó el servidor (ya traducido por
 * el cliente HTTP), no un texto genérico: si a la base de datos le falta
 * algo o el permiso no alcanza, aquí se lee exactamente eso.
 */
export function BloqueDeError({
  mensaje,
  alReintentar,
}: {
  mensaje: string;
  alReintentar?: () => void;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-danger-50 text-danger">
        <AlertTriangle className="size-5" />
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">
          No se pudieron cargar los datos
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed whitespace-pre-line text-default-500">
          {mensaje}
        </p>
      </div>

      {alReintentar && (
        <Button
          color="primary"
          radius="lg"
          size="sm"
          startContent={<RefreshCw className="size-4" />}
          variant="flat"
          onPress={alReintentar}
        >
          Volver a intentar
        </Button>
      )}
    </div>
  );
}
