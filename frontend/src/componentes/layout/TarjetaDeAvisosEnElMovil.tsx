/**
 * componentes/layout/TarjetaDeAvisosEnElMovil.tsx
 * ---------------------------------------------------------------------
 * «Recibe los avisos aunque tengas el panel cerrado»: la tarjeta que
 * ofrece el push, dentro de la pantalla de avisos.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO AL ENTRAR
 *
 * El navegador solo deja preguntar UNA VEZ. Quien dice que no, queda en
 * «denegado» y no se le puede volver a preguntar: tendría que ir a la
 * configuración del sitio, que no va a hacer nadie. Así que preguntar
 * nada más entrar —sin que la persona sepa de qué le hablan— apaga la
 * función para siempre en la mitad de los casos.
 *
 * Aquí, en cambio, quien lo ve acaba de abrir sus avisos. Sabe
 * exactamente qué son y qué le va a llegar. El diálogo del navegador
 * solo aparece cuando pulsa el botón.
 *
 * Y se esconde sola cuando no tiene nada que ofrecer: si el servidor no
 * tiene el push encendido, o el navegador no lo admite, no se enseña
 * nada. Ofrecer algo que no puede funcionar es peor que no ofrecerlo.
 * ---------------------------------------------------------------------
 */
import { Button } from "@heroui/react";
import { BellRing, Smartphone } from "lucide-react";
import { TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { useAvisosEnElMovil } from "@/hooks/useAvisosEnElMovil";

export function TarjetaDeAvisosEnElMovil() {
  const {
    estado,
    nombreDelDispositivo,
    estaTrabajando,
    pedirPermisoYSuscribir,
    dejarDeRecibir,
  } = useAvisosEnElMovil();

  // Mientras se comprueba no se enseña nada: una tarjeta que aparece y
  // cambia de texto sola distrae más de lo que informa.
  if (estado === "comprobando" || estado === "noDisponible") {
    return null;
  }

  if (estado === "bloqueados") {
    return (
      <TarjetaBento>
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 size-5 shrink-0 text-default-400" />

          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">
              Este navegador tiene los avisos bloqueados
            </p>
            <p className="text-tiny leading-relaxed text-default-500">
              Lo decidiste en su momento y no se puede volver a preguntar desde
              aquí. Si quieres recibirlos, hay que permitirlos en la
              configuración del sitio: el candado de la barra de direcciones →
              Notificaciones → Permitir.
            </p>
          </div>
        </div>
      </TarjetaBento>
    );
  }

  if (estado === "activos") {
    return (
      <TarjetaBento>
        <div className="flex flex-wrap items-center gap-3">
          <Smartphone className="size-5 shrink-0 text-success" />

          <div className="flex min-w-48 flex-1 flex-col leading-tight">
            <p className="text-sm font-semibold text-foreground">
              Este dispositivo recibe los avisos
            </p>
            <p className="text-tiny text-default-500">
              {nombreDelDispositivo}. Te llegarán aunque tengas el panel
              cerrado.
            </p>
          </div>

          <Button
            isDisabled={estaTrabajando}
            radius="full"
            size="sm"
            variant="flat"
            onPress={() => void dejarDeRecibir()}
          >
            Dejar de recibirlos
          </Button>
        </div>
      </TarjetaBento>
    );
  }

  return (
    <TarjetaBento>
      <div className="flex flex-wrap items-center gap-3">
        <BellRing className="size-5 shrink-0 text-primary" />

        <div className="flex min-w-48 flex-1 flex-col leading-tight">
          <p className="text-sm font-semibold text-foreground">
            Recíbelos también con el panel cerrado
          </p>
          <p className="text-tiny text-default-500">
            Un lead que entra un viernes por la tarde no espera al lunes. Solo
            estos avisos, ninguno más.
          </p>
        </div>

        <Button
          color="primary"
          isLoading={estaTrabajando}
          radius="full"
          size="sm"
          onPress={() => void pedirPermisoYSuscribir()}
        >
          Activar en este dispositivo
        </Button>
      </div>
    </TarjetaBento>
  );
}
