/**
 * paginas/PaginaPerfil.tsx
 * ---------------------------------------------------------------------
 * Los datos y la apariencia de la propia cuenta.
 *
 * Tres cajas:
 *   · Mis datos      → nombre, correo de acceso y foto.
 *   · Apariencia     → tema y color de perfil. Se guardan en el servidor,
 *                      así que acompañan a la persona a cualquier equipo.
 *   · Contraseña     → cambio exigiendo la actual.
 *
 * El rol y la zona se muestran pero no se editan: son competencia de un
 * administrador, y poder cambiárselos uno mismo sería poder ascenderse.
 * ---------------------------------------------------------------------
 */
import { Button, Chip, Input } from "@heroui/react";
import { Eye, EyeOff, KeyRound, Palette, Save, UserCircle } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  actualizarMiPerfil,
  cambiarPassword as cambiarPasswordEnLaApi,
} from "@/api/autenticacion";
import { CampoDeImagen } from "@/componentes/comunes/CampoDeImagen";
import {
  SelectorDeColorAcento,
  SelectorDeTema,
} from "@/componentes/comunes/ControlesDeApariencia";
import { RejillaBento, TarjetaBento } from "@/componentes/comunes/TarjetaBento";
import { useCatalogos } from "@/hooks/useCatalogos";
import { useSesion, useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { inicialesDe } from "@/utilidades/formato";

export function PaginaPerfil() {
  const usuario = useUsuarioAutenticado();
  const { reemplazarUsuarioEnMemoria } = useSesion();
  const { catalogos } = useCatalogos();

  /* ---------------------------------------------------------------- */
  /* Mis datos                                                        */
  /* ---------------------------------------------------------------- */

  const [nombre, establecerNombre] = useState(usuario.nombre);
  const [email, establecerEmail] = useState(usuario.email ?? "");
  const [urlAvatar, establecerUrlAvatar] = useState(usuario.urlAvatar ?? "");

  const guardarMisDatos = useMutation({
    mutationFn: () =>
      actualizarMiPerfil({
        nombre,
        email,
        urlAvatar: urlAvatar || null,
      }),

    onSuccess: (usuarioActualizado) => {
      reemplazarUsuarioEnMemoria(usuarioActualizado);

      avisarDeExito(
        usuarioActualizado.email !== usuario.email
          ? `Datos guardados. Tu correo de acceso ahora es ${usuarioActualizado.email}.`
          : "Datos guardados",
      );
    },

    onError: (error) => avisarDeError(error, "No se pudieron guardar tus datos"),
  });

  const hayCambiosSinGuardar =
    nombre !== usuario.nombre ||
    email !== (usuario.email ?? "") ||
    urlAvatar !== (usuario.urlAvatar ?? "");

  /* ---------------------------------------------------------------- */
  /* Contraseña                                                       */
  /* ---------------------------------------------------------------- */

  const [passwordActual, establecerPasswordActual] = useState("");
  const [passwordNueva, establecerPasswordNueva] = useState("");
  const [lasPasswordsSonVisibles, establecerPasswordsVisibles] = useState(false);

  const cambiarLaPassword = useMutation({
    mutationFn: () => cambiarPasswordEnLaApi(passwordActual, passwordNueva),

    onSuccess: (mensajeDelServidor) => {
      avisarDeExito(mensajeDelServidor);

      establecerPasswordActual("");
      establecerPasswordNueva("");
    },

    onError: (error) => avisarDeError(error, "No se pudo cambiar la contraseña"),
  });

  const laPasswordNuevaEsValida = passwordNueva.length >= 8;

  return (
    <div className="space-y-5">
      {/* Cabecera con el avatar */}
      <div className="flex flex-wrap items-center gap-4">
        <span
          className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-3xl text-lg font-bold text-white shadow-md"
          style={{ backgroundColor: usuario.colorAcento }}
        >
          {usuario.urlAvatar ? (
            <img
              alt={usuario.nombre}
              className="size-full object-cover"
              src={usuario.urlAvatar}
            />
          ) : (
            inicialesDe(usuario.nombre)
          )}
        </span>

        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight text-foreground">
            {usuario.nombre}
          </h2>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip radius="lg" size="sm" variant="flat">
              {usuario.rolEtiqueta}
            </Chip>

            {usuario.zona && (
              <Chip radius="lg" size="sm" variant="flat">
                {usuario.zona}
              </Chip>
            )}

            <span className="text-[11px] text-default-400">
              El rol y la zona los gestiona un administrador.
            </span>
          </div>
        </div>
      </div>

      <RejillaBento>
        {/* --- Mis datos --- */}
        <TarjetaBento
          columnas={6}
          descripcion="Tu nombre y el correo con el que entras al sistema."
          icono={<UserCircle className="size-4" />}
          titulo="Mis datos"
        >
          <div className="space-y-4">
            <Input
              label="Nombre y apellido"
              labelPlacement="outside"
              radius="lg"
              value={nombre}
              variant="bordered"
              onValueChange={establecerNombre}
            />

            <Input
              description="Si lo cambias, a partir de ahora entrarás con el nuevo."
              label="Correo de acceso"
              labelPlacement="outside"
              radius="lg"
              type="email"
              value={email}
              variant="bordered"
              onValueChange={establecerEmail}
            />

            <CampoDeImagen
              alCambiar={establecerUrlAvatar}
              ayuda="Si no pones ninguna, se usan tus iniciales sobre tu color de perfil."
              etiqueta="Foto de perfil"
              formaDeLaVistaPrevia="cuadrada"
              proposito="avatar"
              valor={urlAvatar}
            />

            <Button
              className="w-full"
              color="primary"
              isDisabled={!hayCambiosSinGuardar}
              isLoading={guardarMisDatos.isPending}
              radius="lg"
              startContent={!guardarMisDatos.isPending && <Save className="size-4" />}
              onPress={() => guardarMisDatos.mutate()}
            >
              Guardar mis datos
            </Button>
          </div>
        </TarjetaBento>

        {/* --- Apariencia --- */}
        <TarjetaBento
          columnas={6}
          descripcion="Se guarda en tu cuenta: te acompaña a cualquier ordenador."
          icono={<Palette className="size-4" />}
          titulo="Apariencia"
        >
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold text-default-600">Tema</p>
              <SelectorDeTema />
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-default-600">
                Color de mi perfil
              </p>
              <p className="mb-3 text-[11px] leading-relaxed text-default-500">
                Tiñe los botones, los enlaces y tu avatar. Sirve para reconocer
                de un vistazo que la sesión abierta es la tuya.
              </p>

              <SelectorDeColorAcento coloresDisponibles={catalogos?.coloresDeAcento} />
            </div>
          </div>
        </TarjetaBento>

        {/* --- Contraseña --- */}
        <TarjetaBento
          columnas={6}
          descripcion="Al cambiarla se cierran tus demás sesiones abiertas."
          icono={<KeyRound className="size-4" />}
          titulo="Contraseña"
        >
          <div className="space-y-4">
            <Input
              autoComplete="current-password"
              endContent={
                <button
                  aria-label={
                    lasPasswordsSonVisibles ? "Ocultar" : "Ver las contraseñas"
                  }
                  className="text-default-400 transition hover:text-default-600"
                  type="button"
                  onClick={() => establecerPasswordsVisibles((visible) => !visible)}
                >
                  {lasPasswordsSonVisibles ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              }
              label="Contraseña actual"
              labelPlacement="outside"
              placeholder="La que usas ahora"
              radius="lg"
              type={lasPasswordsSonVisibles ? "text" : "password"}
              value={passwordActual}
              variant="bordered"
              onValueChange={establecerPasswordActual}
            />

            <Input
              autoComplete="new-password"
              description="Mínimo 8 caracteres."
              errorMessage={
                passwordNueva !== "" && !laPasswordNuevaEsValida
                  ? "Todavía es demasiado corta."
                  : undefined
              }
              isInvalid={passwordNueva !== "" && !laPasswordNuevaEsValida}
              label="Contraseña nueva"
              labelPlacement="outside"
              placeholder="La nueva"
              radius="lg"
              type={lasPasswordsSonVisibles ? "text" : "password"}
              value={passwordNueva}
              variant="bordered"
              onValueChange={establecerPasswordNueva}
            />

            <Button
              className="w-full"
              color="primary"
              isDisabled={passwordActual === "" || !laPasswordNuevaEsValida}
              isLoading={cambiarLaPassword.isPending}
              radius="lg"
              variant="flat"
              onPress={() => cambiarLaPassword.mutate()}
            >
              Cambiar la contraseña
            </Button>
          </div>
        </TarjetaBento>
      </RejillaBento>
    </div>
  );
}
