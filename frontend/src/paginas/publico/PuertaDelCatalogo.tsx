/**
 * paginas/publico/PuertaDelCatalogo.tsx
 * ---------------------------------------------------------------------
 * La puerta del catálogo de propiedades de la web: el usuario y la
 * contraseña de invitado que la agencia le da a cada cliente.
 *
 * Desde el 2026-09-30 el catálogo no lo ve cualquiera. Quien entra con
 * la pareja buena recibe una LLAVE (no la contraseña) y se guarda en su
 * navegador, con la fecha en que caduca: así vuelve otro día sin tener
 * que buscar el mensaje con la clave. Si la agencia cambia la contraseña,
 * la llave deja de abrir y la web lo dice.
 *
 * Los textos salen del CMS (claves `propiedades.*`), como el resto de la
 * web, así que se leen en los dos idiomas y se cambian desde el panel.
 * El fallo de «usuario o contraseña» se enseña con el texto del CMS y no
 * con el del servidor: el servidor solo habla español.
 * ---------------------------------------------------------------------
 */
import { Button, Input } from "@heroui/react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { esErrorDeApi, mensajeDeError } from "@/api/clienteHttp";
import { entrarAlCatalogo } from "@/api/sitio";
import { guardarLlaveDelCatalogo } from "@/utilidades/llaveDelCatalogo";

export function PuertaDelCatalogo({
  texto,
  accesoCaducado,
  alEntrar,
}: {
  texto: (clave: string) => string;
  /** La llave que había dejó de abrir: se dice por qué se pide otra vez. */
  accesoCaducado: boolean;
  alEntrar: (llave: string) => void;
}) {
  const [usuario, establecerUsuario] = useState("");
  const [contrasena, establecerContrasena] = useState("");
  const [seVeLaContrasena, establecerSeVeLaContrasena] = useState(false);
  const [mensajeDeFallo, establecerMensajeDeFallo] = useState<string | null>(null);

  const entrar = useMutation({
    mutationFn: () => entrarAlCatalogo(usuario, contrasena),
    onSuccess: ({ llave, caducaEn }) => {
      guardarLlaveDelCatalogo(llave, caducaEn);
      establecerMensajeDeFallo(null);
      alEntrar(llave);
    },
    onError: (error) =>
      establecerMensajeDeFallo(
        esErrorDeApi(error) && error.codigoHttp === 422
          ? texto("propiedades.errorAcceso")
          : mensajeDeError(error),
      ),
  });

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    entrar.mutate();
  }

  return (
    <form
      className="mx-auto mt-10 max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-md sm:p-8"
      onSubmit={alEnviar}
    >
      <div className="flex items-start gap-4">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ backgroundColor: "var(--web-acento)" }}
        >
          <LockKeyhole className="size-6" />
        </span>

        <div>
          <h3 className="text-lg font-bold tracking-tight text-slate-900">
            {texto("propiedades.puertaTitulo")}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {texto("propiedades.puertaTexto")}
          </p>
        </div>
      </div>

      {accesoCaducado && mensajeDeFallo === null && (
        <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
          {texto("propiedades.accesoCaducado")}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Input
          isRequired
          autoCapitalize="none"
          autoComplete="username"
          label={texto("propiedades.campoUsuario")}
          labelPlacement="outside"
          radius="lg"
          value={usuario}
          variant="bordered"
          onValueChange={establecerUsuario}
        />

        <Input
          isRequired
          autoComplete="current-password"
          endContent={
            <button
              aria-label={seVeLaContrasena ? "Ocultar" : "Mostrar"}
              className="text-slate-400 transition hover:text-slate-600"
              type="button"
              onClick={() => establecerSeVeLaContrasena((antes) => !antes)}
            >
              {seVeLaContrasena ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
          label={texto("propiedades.campoContrasena")}
          labelPlacement="outside"
          radius="lg"
          type={seVeLaContrasena ? "text" : "password"}
          value={contrasena}
          variant="bordered"
          onValueChange={establecerContrasena}
        />
      </div>

      {mensajeDeFallo && (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-600">
          {mensajeDeFallo}
        </p>
      )}

      <Button
        className="mt-6 w-full font-semibold text-white"
        isLoading={entrar.isPending}
        radius="full"
        size="lg"
        style={{ backgroundColor: "var(--web-acento)" }}
        type="submit"
      >
        {texto("propiedades.botonEntrar")}
      </Button>

      <a
        className="mt-4 block text-center text-xs font-semibold text-slate-500 transition hover:text-slate-800"
        href="#contacto"
      >
        {texto("propiedades.pedirAcceso")}
      </a>
    </form>
  );
}
