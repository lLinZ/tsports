/**
 * componentes/comunes/BotonDeActivacion.tsx
 * ---------------------------------------------------------------------
 * El «Desactivar / Reactivar» de las tarjetas del catálogo: propiedades
 * y campañas.
 *
 * Antes desactivar solo se podía desde un interruptor al final del
 * formulario de edición, y el equipo no lo encontraba: para «dar de
 * baja» una carrera que ya se había corrido, la borraba. Borrar se lleva
 * lo hablado con cada marca; desactivar lo guarda para el año que viene.
 * Por eso la acción está a la vista, en la propia tarjeta.
 * ---------------------------------------------------------------------
 */
import { Button } from "@heroui/react";
import { Archive, ArchiveRestore } from "lucide-react";

export function BotonDeActivacion({
  estaActiva,
  estaCambiando,
  alPulsar,
}: {
  estaActiva: boolean;
  estaCambiando: boolean;
  alPulsar: () => void;
}) {
  return (
    // La tarjeta entera abre el formulario al pulsarla: sin cortar aquí
    // el clic, desactivar abriría además la edición.
    <span
      className="contents"
      onClick={(evento) => evento.stopPropagation()}
      onKeyDown={(evento) => evento.stopPropagation()}
    >
      <Button
        isLoading={estaCambiando}
        radius="lg"
        size="sm"
        startContent={
          !estaCambiando &&
          (estaActiva ? (
            <Archive className="size-3.5" />
          ) : (
            <ArchiveRestore className="size-3.5" />
          ))
        }
        variant="flat"
        onPress={alPulsar}
      >
        {estaActiva ? "Desactivar" : "Reactivar"}
      </Button>
    </span>
  );
}
