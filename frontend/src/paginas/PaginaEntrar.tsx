/**
 * paginas/PaginaEntrar.tsx
 * ---------------------------------------------------------------------
 * La puerta de entrada al panel.
 *
 * Es la primera pantalla que ve el equipo cada mañana, así que cuida dos
 * cosas que en la versión anterior daban problemas:
 *
 *   · No parpadea. Si ya hay sesión, redirige sin llegar a pintar el
 *     formulario (lo resuelve el estado "comprobando" de la sesión).
 *
 *   · Los errores se explican. "Correo o contraseña incorrectos" con el
 *     recordatorio de que la contraseña distingue mayúsculas ahorra
 *     bastantes llamadas al administrador.
 * ---------------------------------------------------------------------
 */
import { Button, Input } from "@heroui/react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { mensajeDeError } from "@/api/clienteHttp";
import { BotonDeTema } from "@/componentes/comunes/ControlesDeApariencia";
import { PantallaDeArranque } from "@/componentes/comunes/EstadosDePantalla";
import { useSesion } from "@/providers/ProveedorSesion";

export function PaginaEntrar() {
  const { estadoDeLaSesion, entrar } = useSesion();
  const navegar = useNavigate();

  const [email, establecerEmail] = useState("");
  const [password, establecerPassword] = useState("");
  const [laPasswordEsVisible, establecerPasswordVisible] = useState(false);

  const [estaEntrando, establecerEstaEntrando] = useState(false);
  const [mensajeDeFallo, establecerMensajeDeFallo] = useState<string | null>(null);

  // Mientras se comprueba el token guardado no se enseña nada: si se
  // pintase el formulario, quien ya tenía sesión lo vería un instante.
  if (estadoDeLaSesion === "comprobando") {
    return <PantallaDeArranque />;
  }

  if (estadoDeLaSesion === "conSesion") {
    return <Navigate replace to="/panel" />;
  }

  async function enviarElFormulario(evento: FormEvent) {
    evento.preventDefault();

    establecerMensajeDeFallo(null);
    establecerEstaEntrando(true);

    try {
      await entrar(email, password);

      navegar("/panel", { replace: true });
    } catch (error) {
      establecerMensajeDeFallo(mensajeDeError(error));
    } finally {
      establecerEstaEntrando(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Fondo decorativo: dos manchas de color muy difuminadas que dan
          profundidad sin distraer del formulario. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 size-[32rem] rounded-full bg-primary opacity-[0.13] blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-40 size-[34rem] rounded-full bg-primary opacity-[0.09] blur-[120px]"
      />

      <div className="absolute right-4 top-4">
        <BotonDeTema />
      </div>

      <div className="relative w-full max-w-md animar-entrada">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-lg">
            TS
          </span>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              TS Sports
            </h1>
            <p className="mt-1 text-sm text-default-500">
              CRM de patrocinios y administrador de la web
            </p>
          </div>
        </div>

        <form
          className="bento-card flex flex-col gap-4 p-6 sm:p-7"
          onSubmit={enviarElFormulario}
        >
          <Input
            autoComplete="username"
            isRequired
            label="Correo"
            labelPlacement="outside"
            placeholder="tucorreo@tssports.com"
            radius="lg"
            size="lg"
            type="email"
            value={email}
            variant="bordered"
            onValueChange={establecerEmail}
          />

          <Input
            autoComplete="current-password"
            endContent={
              <button
                aria-label={
                  laPasswordEsVisible ? "Ocultar la contraseña" : "Ver la contraseña"
                }
                className="text-default-400 transition hover:text-default-600"
                type="button"
                onClick={() => establecerPasswordVisible((visible) => !visible)}
              >
                {laPasswordEsVisible ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            }
            isRequired
            label="Contraseña"
            labelPlacement="outside"
            placeholder="••••••••"
            radius="lg"
            size="lg"
            type={laPasswordEsVisible ? "text" : "password"}
            value={password}
            variant="bordered"
            onValueChange={establecerPassword}
          />

          {mensajeDeFallo && (
            <div
              className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-xs leading-relaxed text-danger-600 dark:bg-danger-100/10"
              role="alert"
            >
              {mensajeDeFallo}
            </div>
          )}

          <Button
            className="mt-1 font-semibold"
            color="primary"
            isLoading={estaEntrando}
            radius="lg"
            size="lg"
            startContent={!estaEntrando && <LogIn className="size-4" />}
            type="submit"
          >
            {estaEntrando ? "Entrando…" : "Entrar"}
          </Button>

          <p className="text-center text-[11px] leading-relaxed text-default-400">
            ¿Olvidaste tu contraseña? Pídele a un administrador que te la
            reinicie desde la pantalla de Equipo.
          </p>
        </form>
      </div>
    </div>
  );
}
