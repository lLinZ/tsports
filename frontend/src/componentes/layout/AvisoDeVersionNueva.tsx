/**
 * componentes/layout/AvisoDeVersionNueva.tsx
 * ---------------------------------------------------------------------
 * «Hay una versión nueva»: la pastilla que aparece abajo cuando se ha
 * desplegado una actualización y esta pestaña sigue con la anterior.
 *
 * POR QUÉ HACE FALTA ALGO ASÍ
 *
 * Con la aplicación instalada, los ficheros vienen de la copia del
 * dispositivo, no del servidor. Eso es lo que la hace abrir al instante
 * y funcionar sin red, pero tiene la otra cara: quien no cierra nunca la
 * aplicación —que es todo el mundo, en el móvil— se queda con la versión
 * del día que la instaló. Acabaría reportando fallos ya arreglados, y
 * nadie sabría por qué a él sí le pasan.
 *
 * POR QUÉ NO SE ACTUALIZA SOLO Y YA
 *
 * Porque cambiar los ficheros por debajo de una pestaña abierta rompe la
 * navegación de quien esté a mitad de una ficha, y encima parece un
 * fallo aleatorio. Se avisa y decide la persona.
 *
 * Se puede cerrar, y entonces no molesta más en esta pestaña. La versión
 * nueva sigue esperando y se aplicará al recargar de todos modos, así
 * que cerrar el aviso no deja a nadie atrás.
 * ---------------------------------------------------------------------
 */
import { Button } from "@heroui/react";
import { ArrowUpCircle, X } from "lucide-react";
import { useState } from "react";
import { useAplicacion } from "@/providers/ProveedorAplicacion";

export function AvisoDeVersionNueva() {
  const { hayVersionNueva, aplicarLaVersionNueva } = useAplicacion();
  const [estaDescartado, establecerDescartado] = useState(false);
  const [estaAplicando, establecerAplicando] = useState(false);

  if (!hayVersionNueva || estaDescartado) {
    return null;
  }

  return (
    <div
      // Abajo y centrado: los avisos flotantes de HeroUI salen arriba a
      // la derecha, y este tiene que poder convivir con ellos.
      className="superficie-cristal fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-2xl border border-default-200 px-4 py-3 shadow-lg"
      role="status"
    >
      <ArrowUpCircle className="size-5 shrink-0 text-primary" />

      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">
          Hay una versión nueva
        </span>
        <span className="text-tiny text-default-500">
          Se aplica al recargar. Tardará un segundo.
        </span>
      </div>

      <Button
        color="primary"
        isLoading={estaAplicando}
        radius="full"
        size="sm"
        onPress={() => {
          // El botón se queda cargando hasta que la página se recarga
          // sola: sin esto parece que no ha hecho nada.
          establecerAplicando(true);
          aplicarLaVersionNueva();
        }}
      >
        Actualizar
      </Button>

      <Button
        isIconOnly
        aria-label="Ahora no"
        radius="full"
        size="sm"
        variant="light"
        onPress={() => establecerDescartado(true)}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
