/**
 * componentes/layout/LayoutDelPanel.tsx
 * ---------------------------------------------------------------------
 * El armazón de todas las pantallas con sesión iniciada: barra lateral
 * de navegación a la izquierda, barra superior con el buscador y los
 * controles de apariencia, y el contenido de la página en el centro.
 *
 * La barra lateral se colapsa a un cajón deslizante en móvil. Las
 * entradas del menú se filtran por los permisos del usuario, de modo que
 * nadie ve un enlace que le va a devolver un "no tienes permiso".
 * ---------------------------------------------------------------------
 */
import {
  Avatar,
  Button,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
  DropdownTrigger,
  Chip,
} from "@heroui/react";
import {
  Building2,
  ExternalLink,
  Globe,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Package,
  ScrollText,
  UserCircle,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BotonDeTema,
  MenuDeColorAcento,
} from "@/componentes/comunes/ControlesDeApariencia";
import { useCatalogos } from "@/hooks/useCatalogos";
import { useSesion, useUsuarioAutenticado } from "@/providers/ProveedorSesion";
import { inicialesDe } from "@/utilidades/formato";
import { avisarDeError } from "@/utilidades/avisos";
import type { Usuario } from "@/tipos/modelos";

/** Una entrada del menú lateral. */
interface EntradaDeMenu {
  ruta: string;
  etiqueta: string;
  descripcion: string;
  icono: typeof LayoutDashboard;
  /** Devuelve si este usuario puede ver la entrada. */
  laPuedeVer: (usuario: Usuario) => boolean;
}

/**
 * El menú completo. El orden es el del uso real: primero el resumen,
 * después las marcas (donde se pasa el día el equipo comercial) y al
 * final lo de administración.
 */
const ENTRADAS_DEL_MENU: EntradaDeMenu[] = [
  {
    ruta: "/panel",
    etiqueta: "Resumen",
    descripcion: "Cifras y actividad",
    icono: LayoutDashboard,
    laPuedeVer: () => true,
  },
  {
    ruta: "/marcas",
    etiqueta: "Marcas",
    descripcion: "El CRM de patrocinios",
    icono: Building2,
    laPuedeVer: () => true,
  },
  {
    ruta: "/propiedades",
    etiqueta: "Propiedades",
    descripcion: "Los productos IOP",
    icono: Package,
    laPuedeVer: () => true,
  },
  {
    ruta: "/campanas",
    etiqueta: "Campañas",
    descripcion: "Los empujones del año",
    icono: Megaphone,
    laPuedeVer: () => true,
  },
  {
    ruta: "/web",
    etiqueta: "Web pública",
    descripcion: "Textos, fotos y colores",
    icono: Globe,
    laPuedeVer: (usuario) => usuario.permisos.editaLaWeb,
  },
  {
    ruta: "/usuarios",
    etiqueta: "Equipo",
    descripcion: "Cuentas y permisos",
    icono: Users,
    laPuedeVer: (usuario) => usuario.permisos.asignaVendedores,
  },
  {
    ruta: "/auditoria",
    etiqueta: "Auditoría",
    descripcion: "Quién hizo qué",
    icono: ScrollText,
    laPuedeVer: (usuario) => usuario.permisos.administraElSistema,
  },
];

export function LayoutDelPanel({ children }: { children: ReactNode }) {
  const usuario = useUsuarioAutenticado();
  const [elCajonMovilEstaAbierto, establecerCajonMovilAbierto] = useState(false);

  const entradasVisibles = ENTRADAS_DEL_MENU.filter((entrada) =>
    entrada.laPuedeVer(usuario),
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Barra lateral fija, solo a partir de tablet. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-default-200 bg-content1 lg:flex">
        <MarcaDelSistema />

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {entradasVisibles.map((entrada) => (
            <EnlaceDelMenu key={entrada.ruta} entrada={entrada} />
          ))}
        </nav>

        <PieDeLaBarraLateral usuario={usuario} />
      </aside>

      {/* Cajón deslizante con el mismo menú, para móvil. */}
      <Drawer
        isOpen={elCajonMovilEstaAbierto}
        placement="left"
        size="xs"
        onOpenChange={establecerCajonMovilAbierto}
      >
        <DrawerContent>
          <DrawerBody className="px-0 py-0">
            <MarcaDelSistema />

            <nav className="flex-1 space-y-1 px-3 py-4">
              {entradasVisibles.map((entrada) => (
                <EnlaceDelMenu
                  key={entrada.ruta}
                  entrada={entrada}
                  alNavegar={() => establecerCajonMovilAbierto(false)}
                />
              ))}
            </nav>

            <PieDeLaBarraLateral usuario={usuario} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Contenido, desplazado para dejar sitio a la barra lateral. */}
      <div className="lg:pl-64">
        <BarraSuperior
          usuario={usuario}
          onAbrirMenuMovil={() => establecerCajonMovilAbierto(true)}
        />

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ==================================================================== */
/* Piezas de la barra lateral                                          */
/* ==================================================================== */

function MarcaDelSistema() {
  return (
    <Link
      className="flex items-center gap-3 border-b border-default-200 px-5 py-5"
      to="/panel"
    >
      <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">
        TS
      </span>

      <span className="flex flex-col leading-tight">
        <span className="text-sm font-bold tracking-tight text-foreground">
          TS Sports
        </span>
        <span className="text-[11px] text-default-500">CRM de patrocinios</span>
      </span>
    </Link>
  );
}

function EnlaceDelMenu({
  entrada,
  alNavegar,
}: {
  entrada: EntradaDeMenu;
  alNavegar?: () => void;
}) {
  const IconoDeLaEntrada = entrada.icono;

  return (
    <NavLink
      className={({ isActive }) =>
        [
          "flex items-start gap-3 rounded-2xl px-3 py-2.5 transition",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-default-600 hover:bg-default-100 hover:text-foreground",
        ].join(" ")
      }
      to={entrada.ruta}
      onClick={alNavegar}
    >
      {({ isActive }) => (
        <>
          <IconoDeLaEntrada className="mt-0.5 size-[18px] shrink-0" />

          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm font-semibold">{entrada.etiqueta}</span>
            <span
              className={[
                "truncate text-[11px]",
                isActive ? "text-primary-foreground/75" : "text-default-400",
              ].join(" ")}
            >
              {entrada.descripcion}
            </span>
          </span>
        </>
      )}
    </NavLink>
  );
}

/** Enlace a la web pública, al final de la barra lateral. */
function PieDeLaBarraLateral({ usuario }: { usuario: Usuario }) {
  return (
    <div className="border-t border-default-200 p-3">
      <a
        className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-default-600 transition hover:bg-default-100 hover:text-foreground"
        href="/"
        rel="noreferrer"
        target="_blank"
      >
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Ver la web</span>
          <span className="text-[11px] text-default-400">Se abre aparte</span>
        </span>

        <ExternalLink className="size-4" />
      </a>

      {usuario.zona && (
        <div className="mt-2 px-3">
          <Chip
            className="w-full justify-start"
            radius="lg"
            size="sm"
            variant="flat"
          >
            Zona: {usuario.zona}
          </Chip>
        </div>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Barra superior                                                      */
/* ==================================================================== */

function BarraSuperior({
  usuario,
  onAbrirMenuMovil,
}: {
  usuario: Usuario;
  onAbrirMenuMovil: () => void;
}) {
  const { salir } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { catalogos } = useCatalogos();

  const tituloDeLaPagina =
    ENTRADAS_DEL_MENU.find((entrada) =>
      ubicacion.pathname.startsWith(entrada.ruta),
    )?.etiqueta ?? "Mi perfil";

  async function cerrarLaSesion() {
    try {
      await salir();
      navegar("/entrar", { replace: true });
    } catch (error) {
      avisarDeError(error, "No se pudo cerrar la sesión");
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-default-200 superficie-cristal px-4 lg:px-8">
      <Button
        isIconOnly
        aria-label="Abrir el menú"
        className="lg:hidden"
        radius="full"
        size="sm"
        variant="light"
        onPress={onAbrirMenuMovil}
      >
        <Menu className="size-5" />
      </Button>

      <h1 className="flex-1 truncate text-base font-semibold tracking-tight text-foreground">
        {tituloDeLaPagina}
      </h1>

      <div className="flex items-center gap-1">
        <MenuDeColorAcento coloresDisponibles={catalogos?.coloresDeAcento} />
        <BotonDeTema />

        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <button
              aria-label="Abrir mi menú"
              className="ml-1 rounded-full transition hover:opacity-80"
              type="button"
            >
              <Avatar
                className="size-9"
                name={inicialesDe(usuario.nombre)}
                src={usuario.urlAvatar ?? undefined}
                style={{
                  // El avatar sin foto usa el color de perfil: es el
                  // recordatorio más visible de "esta cuenta es la mía".
                  backgroundColor: usuario.urlAvatar ? undefined : usuario.colorAcento,
                  color: "#fff",
                }}
              />
            </button>
          </DropdownTrigger>

          <DropdownMenu aria-label="Menú de la cuenta" variant="flat">
            <DropdownSection showDivider title={usuario.nombre}>
              <DropdownItem
                key="perfil"
                description={`${usuario.rolEtiqueta}${usuario.zona ? ` · ${usuario.zona}` : ""}`}
                startContent={<UserCircle className="size-4" />}
                onPress={() => navegar("/perfil")}
              >
                Mi perfil
              </DropdownItem>
            </DropdownSection>

            <DropdownItem
              key="salir"
              className="text-danger"
              color="danger"
              startContent={<LogOut className="size-4" />}
              onPress={cerrarLaSesion}
            >
              Cerrar sesión
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </header>
  );
}

/** Se exporta el separador por comodidad de las pantallas. */
export { Divider };
