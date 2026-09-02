/**
 * paginas/PaginaNoEncontrada.tsx
 * ---------------------------------------------------------------------
 * La pantalla de dirección equivocada.
 *
 * Ofrece siempre dos salidas —la web pública y el panel— porque quien
 * llega aquí puede ser tanto un visitante como alguien del equipo que
 * escribió mal una dirección.
 * ---------------------------------------------------------------------
 */
import { Button } from "@heroui/react";
import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

export function PaginaNoEncontrada() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-default-100 text-default-400">
        <Compass className="size-6" />
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Esta página no existe
        </h1>
        <p className="mt-1 text-sm text-default-500">
          Puede que el enlace esté mal escrito o que la página se haya movido.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button as={Link} color="primary" radius="lg" to="/">
          Ir a la web
        </Button>

        <Button as={Link} radius="lg" to="/panel" variant="flat">
          Ir al panel
        </Button>
      </div>
    </div>
  );
}
