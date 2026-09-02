/**
 * paginas/PaginaUsuarios.tsx
 * ---------------------------------------------------------------------
 * Las cuentas del equipo: quién entra, con qué rol y en qué zona.
 *
 * Sustituye a la antigua `usuarios.html`. Aquí se crean las cuentas, se
 * reinician contraseñas y se reparte a la gente por zonas.
 *
 * Una salvaguarda importante: NADIE puede cambiarse el rol a sí mismo,
 * ni siquiera un administrador. Si el único administrador se rebajase
 * por error, no quedaría nadie capaz de volver a promover a nadie y
 * habría que arreglarlo a mano en la base de datos. El servidor lo
 * impide igualmente; aquí solo se desactiva el control para que se
 * entienda por qué.
 * ---------------------------------------------------------------------
 */
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from "@heroui/react";
import { KeyRound, Pencil, Plus, ShieldAlert, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  actualizarUsuario,
  crearUsuario,
  listarUsuarios,
  type DatosDeNuevoUsuario,
  type DatosDeUsuarioParaEditar,
} from "@/api/usuarios";
import {
  BloqueDeCarga,
  BloqueDeError,
  EstadoVacio,
} from "@/componentes/comunes/EstadosDePantalla";
import { useCatalogos } from "@/hooks/useCatalogos";
import { useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { avisarDeError, avisarDeExito } from "@/utilidades/avisos";
import { formatearFecha, inicialesDe } from "@/utilidades/formato";
import type { RolUsuario, Usuario } from "@/tipos/modelos";

/** Color del distintivo según el rol, para localizarlos de un vistazo. */
const COLOR_DEL_ROL: Record<RolUsuario, "danger" | "primary" | "default"> = {
  admin: "danger",
  comercial: "primary",
  vendedor: "default",
};

export function PaginaUsuarios() {
  const usuarioActual = useUsuarioAutenticado();
  const { catalogos } = useCatalogos();
  const clienteDeConsultas = useQueryClient();

  const consultaDeUsuarios = useQuery({
    queryKey: ["usuarios", "todos"],
    queryFn: () => listarUsuarios(),
  });

  const [elModalEstaAbierto, establecerModalAbierto] = useState(false);
  const [usuarioEnEdicion, establecerUsuarioEnEdicion] = useState<Usuario | null>(null);

  function refrescarLaLista() {
    void clienteDeConsultas.invalidateQueries({ queryKey: ["usuarios"] });
  }

  function abrirModalDeAlta() {
    establecerUsuarioEnEdicion(null);
    establecerModalAbierto(true);
  }

  function abrirModalDeEdicion(usuario: Usuario) {
    establecerUsuarioEnEdicion(usuario);
    establecerModalAbierto(true);
  }

  const usuarios = consultaDeUsuarios.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Equipo</h2>
          <p className="mt-0.5 text-sm text-default-500">
            {usuarios.length} {usuarios.length === 1 ? "cuenta" : "cuentas"} en el
            sistema.
          </p>
        </div>

        {usuarioActual.permisos.administraElSistema && (
          <Button
            color="primary"
            radius="lg"
            size="sm"
            startContent={<UserPlus className="size-4" />}
            onPress={abrirModalDeAlta}
          >
            Nueva cuenta
          </Button>
        )}
      </div>

      <div className="bento-card overflow-hidden">
        {consultaDeUsuarios.isLoading ? (
          <BloqueDeCarga mensaje="Cargando el equipo…" />
        ) : consultaDeUsuarios.error ? (
          <BloqueDeError
            mensaje={mensajeDeError(consultaDeUsuarios.error)}
            alReintentar={() => void consultaDeUsuarios.refetch()}
          />
        ) : usuarios.length === 0 ? (
          <EstadoVacio
            accion={
              <Button
                color="primary"
                radius="lg"
                size="sm"
                startContent={<Plus className="size-4" />}
                onPress={abrirModalDeAlta}
              >
                Crear la primera cuenta
              </Button>
            }
            icono={<Users className="size-5" />}
            titulo="No hay cuentas todavía"
          />
        ) : (
          <Table
            aria-label="Cuentas del equipo"
            classNames={{
              wrapper: "shadow-none rounded-none p-0",
              th: "bg-default-50 text-[11px] uppercase tracking-wide",
            }}
            removeWrapper
          >
            <TableHeader>
              <TableColumn>Persona</TableColumn>
              <TableColumn>Rol</TableColumn>
              <TableColumn>Zona</TableColumn>
              <TableColumn>Estado</TableColumn>
              <TableColumn>Alta</TableColumn>
              <TableColumn align="end">{""}</TableColumn>
            </TableHeader>

            <TableBody>
              {usuarios.map((usuario) => {
                const esUnoMismo = usuario.id === usuarioActual.id;

                return (
                  <TableRow key={usuario.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                          style={{ backgroundColor: usuario.colorAcento }}
                        >
                          {inicialesDe(usuario.nombre)}
                        </span>

                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                            {usuario.nombre}
                            {esUnoMismo && (
                              <span className="text-[10px] text-default-400">(tú)</span>
                            )}
                          </p>
                          <p className="truncate text-[11px] text-default-500">
                            {usuario.email ?? "—"}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Chip
                        color={COLOR_DEL_ROL[usuario.rol]}
                        radius="lg"
                        size="sm"
                        variant="flat"
                      >
                        {usuario.rolEtiqueta}
                      </Chip>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-default-600">
                        {usuario.zona ?? "—"}
                      </span>
                    </TableCell>

                    <TableCell>
                      {usuario.activo ? (
                        <Chip color="success" radius="lg" size="sm" variant="dot">
                          Activa
                        </Chip>
                      ) : (
                        <Chip radius="lg" size="sm" variant="dot">
                          Desactivada
                        </Chip>
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-default-500">
                        {formatearFecha(usuario.creadoEn)}
                      </span>
                    </TableCell>

                    <TableCell>
                      {usuarioActual.permisos.administraElSistema && (
                        <Tooltip content="Editar la cuenta" placement="left">
                          <Button
                            isIconOnly
                            aria-label={`Editar a ${usuario.nombre}`}
                            radius="lg"
                            size="sm"
                            variant="light"
                            onPress={() => abrirModalDeEdicion(usuario)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <ModalDeUsuario
        alCerrar={() => establecerModalAbierto(false)}
        alGuardar={refrescarLaLista}
        estaAbierto={elModalEstaAbierto}
        usuarioActual={usuarioActual}
        usuarioEnEdicion={usuarioEnEdicion}
        zonasDisponibles={catalogos?.zonas ?? []}
      />
    </div>
  );
}

/* ==================================================================== */
/* Modal de alta y edición                                             */
/* ==================================================================== */

/** Estado del formulario del modal. */
interface FormularioDeUsuario {
  nombre: string;
  email: string;
  password: string;
  rol: RolUsuario;
  zona: string;
  activo: boolean;
}

const FORMULARIO_DE_USUARIO_VACIO: FormularioDeUsuario = {
  nombre: "",
  email: "",
  password: "",
  rol: "comercial",
  zona: "",
  activo: true,
};

function ModalDeUsuario({
  estaAbierto,
  usuarioEnEdicion,
  usuarioActual,
  zonasDisponibles,
  alCerrar,
  alGuardar,
}: {
  estaAbierto: boolean;
  usuarioEnEdicion: Usuario | null;
  usuarioActual: Usuario;
  zonasDisponibles: string[];
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const estamosEditando = usuarioEnEdicion !== null;

  const [formulario, establecerFormulario] = useState<FormularioDeUsuario>(
    FORMULARIO_DE_USUARIO_VACIO,
  );

  // Se recarga el formulario cada vez que se abre el modal con otra
  // cuenta. La clave del Modal fuerza el remontaje, así que basta con
  // inicializar el estado a partir de las propiedades.
  const [idDelUsuarioCargado, establecerIdCargado] = useState<string | null>(null);
  const idQueTocaCargar = usuarioEnEdicion?.id ?? null;

  if (estaAbierto && idDelUsuarioCargado !== idQueTocaCargar) {
    establecerIdCargado(idQueTocaCargar);
    establecerFormulario(
      usuarioEnEdicion
        ? {
            nombre: usuarioEnEdicion.nombre,
            email: usuarioEnEdicion.email ?? "",
            password: "",
            rol: usuarioEnEdicion.rol,
            zona: usuarioEnEdicion.zona ?? "",
            activo: usuarioEnEdicion.activo,
          }
        : FORMULARIO_DE_USUARIO_VACIO,
    );
  }

  const guardarCuenta = useMutation({
    mutationFn: async () => {
      if (estamosEditando && usuarioEnEdicion) {
        const cambios: DatosDeUsuarioParaEditar = {
          nombre: formulario.nombre,
          email: formulario.email,
          rol: formulario.rol,
          zona: formulario.zona || null,
          activo: formulario.activo,
        };

        // La contraseña solo viaja si se escribió una nueva.
        if (formulario.password) cambios.password = formulario.password;

        return actualizarUsuario(usuarioEnEdicion.id, cambios);
      }

      const cuentaNueva: DatosDeNuevoUsuario = {
        nombre: formulario.nombre,
        email: formulario.email,
        password: formulario.password,
        rol: formulario.rol,
        zona: formulario.zona || null,
      };

      return crearUsuario(cuentaNueva);
    },

    onSuccess: () => {
      avisarDeExito(estamosEditando ? "Cuenta actualizada" : "Cuenta creada");
      alGuardar();
      alCerrar();
    },

    onError: (error) => avisarDeError(error, "No se pudo guardar la cuenta"),
  });

  /**
   * Nadie edita su propio rol ni su propia zona: son los dos campos que
   * determinan qué puede hacer, y auto-modificarlos abre la puerta a
   * dejarse a uno mismo (o al sistema entero) sin administrador.
   */
  const estaEditandoSuPropiaCuenta =
    estamosEditando && usuarioEnEdicion.id === usuarioActual.id;

  return (
    <Modal isOpen={estaAbierto} size="lg" onOpenChange={(abierto) => !abierto && alCerrar()}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-lg font-bold tracking-tight">
            {estamosEditando ? "Editar cuenta" : "Nueva cuenta"}
          </span>
          <span className="text-xs font-normal text-default-500">
            {estamosEditando
              ? "Cambia los datos o reinicia la contraseña."
              : "Entrégale la contraseña a la persona para que pueda entrar."}
          </span>
        </ModalHeader>

        <ModalBody className="gap-4">
          <Input
            isRequired
            label="Nombre y apellido"
            labelPlacement="outside"
            placeholder="Ej. Andrés Pérez"
            radius="lg"
            value={formulario.nombre}
            variant="bordered"
            onValueChange={(valor) =>
              establecerFormulario((anterior) => ({ ...anterior, nombre: valor }))
            }
          />

          <Input
            description="Es con lo que inicia sesión. Se guarda siempre en minúsculas."
            isRequired
            label="Correo"
            labelPlacement="outside"
            placeholder="persona@tssports.com"
            radius="lg"
            type="email"
            value={formulario.email}
            variant="bordered"
            onValueChange={(valor) =>
              establecerFormulario((anterior) => ({ ...anterior, email: valor }))
            }
          />

          <Input
            description={
              estamosEditando
                ? "Déjalo en blanco para no cambiarla. Si la cambias, se cerrarán sus sesiones abiertas."
                : "Mínimo 8 caracteres."
            }
            isRequired={!estamosEditando}
            label={estamosEditando ? "Contraseña nueva" : "Contraseña"}
            labelPlacement="outside"
            placeholder={estamosEditando ? "Sin cambios" : "Mínimo 8 caracteres"}
            radius="lg"
            startContent={<KeyRound className="size-4 text-default-400" />}
            type="text"
            value={formulario.password}
            variant="bordered"
            onValueChange={(valor) =>
              establecerFormulario((anterior) => ({ ...anterior, password: valor }))
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              isDisabled={estaEditandoSuPropiaCuenta}
              label="Rol"
              labelPlacement="outside"
              radius="lg"
              selectedKeys={[formulario.rol]}
              variant="bordered"
              onSelectionChange={(seleccion) =>
                establecerFormulario((anterior) => ({
                  ...anterior,
                  rol: (Array.from(seleccion)[0] as RolUsuario) ?? "comercial",
                }))
              }
            >
              <SelectItem key="admin" description="Todo: cuentas, web y marcas">
                Administrador
              </SelectItem>
              <SelectItem key="comercial" description="Todas las marcas; asigna trabajo">
                Comercial
              </SelectItem>
              <SelectItem key="vendedor" description="Ve todo; edita solo lo suyo">
                Vendedor
              </SelectItem>
            </Select>

            <Select
              description="Las marcas que registre heredarán esta zona."
              isDisabled={estaEditandoSuPropiaCuenta}
              label="Zona"
              labelPlacement="outside"
              placeholder="Sin zona"
              radius="lg"
              selectedKeys={formulario.zona ? [formulario.zona] : []}
              variant="bordered"
              onSelectionChange={(seleccion) =>
                establecerFormulario((anterior) => ({
                  ...anterior,
                  zona: String(Array.from(seleccion)[0] ?? ""),
                }))
              }
            >
              {zonasDisponibles.map((zona) => (
                <SelectItem key={zona}>{zona}</SelectItem>
              ))}
            </Select>
          </div>

          {estaEditandoSuPropiaCuenta && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-50 px-3 py-2 text-[11px] leading-relaxed text-warning-700 dark:bg-warning-100/10">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              Nadie puede cambiar su propio rol ni su propia zona. Si el único
              administrador se rebajase por error, no quedaría nadie capaz de
              volver a dar permisos.
            </p>
          )}

          {estamosEditando && !estaEditandoSuPropiaCuenta && (
            <div className="flex items-center justify-between rounded-2xl border border-default-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Cuenta activa</p>
                <p className="text-[11px] text-default-500">
                  Al desactivarla no podrá entrar, pero su historial se conserva.
                </p>
              </div>

              <Switch
                isSelected={formulario.activo}
                size="sm"
                onValueChange={(activa) =>
                  establecerFormulario((anterior) => ({ ...anterior, activo: activa }))
                }
              />
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button radius="lg" variant="light" onPress={alCerrar}>
            Cancelar
          </Button>

          <Button
            color="primary"
            isLoading={guardarCuenta.isPending}
            radius="lg"
            onPress={() => guardarCuenta.mutate()}
          >
            {estamosEditando ? "Guardar cambios" : "Crear cuenta"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
