/**
 * App.tsx
 * ---------------------------------------------------------------------
 * El árbol de proveedores y el mapa de rutas de toda la aplicación.
 *
 * ORDEN DE LOS PROVEEDORES (importa):
 *   Enrutador → HeroUI → Tema → Consultas → Sesión
 *
 *   · El TEMA va por fuera de la SESIÓN porque la pantalla de login ya
 *     tiene que respetar el modo oscuro guardado, antes de saber quién
 *     está entrando.
 *   · La SESIÓN va por dentro del TEMA porque, en cuanto conoce al
 *     usuario, le empuja sus preferencias visuales del servidor.
 *
 * RUTAS:
 *   /            → la web pública (sin sesión)
 *   /entrar      → el acceso al panel
 *   /panel …     → el CRM, protegido
 * ---------------------------------------------------------------------
 */
import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { BrowserRouter, Navigate, Route, Routes, useHref, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { PantallaDeArranque } from "@/componentes/comunes/EstadosDePantalla";
import { LayoutDelPanel } from "@/componentes/layout/LayoutDelPanel";
import { ProveedorConsultas } from "@/providers/ProveedorConsultas";
import { ProveedorSesion, useSesion } from "@/providers/ProveedorSesion";
import { ProveedorTema } from "@/providers/ProveedorTema";
import { PaginaAuditoria } from "@/paginas/PaginaAuditoria";
import { PaginaCampanas } from "@/paginas/PaginaCampanas";
import { PaginaContenidoWeb } from "@/paginas/PaginaContenidoWeb";
import { PaginaEntrar } from "@/paginas/PaginaEntrar";
import { PaginaMarcas } from "@/paginas/PaginaMarcas";
import { PaginaNoEncontrada } from "@/paginas/PaginaNoEncontrada";
import { PaginaPanel } from "@/paginas/PaginaPanel";
import { PaginaPropiedades } from "@/paginas/PaginaPropiedades";
import { PaginaPerfil } from "@/paginas/PaginaPerfil";
import { PaginaUsuarios } from "@/paginas/PaginaUsuarios";
import { PaginaWebPublica } from "@/paginas/publico/PaginaWebPublica";
import type { Usuario } from "@/tipos/modelos";

export function App() {
  return (
    <BrowserRouter>
      <ProveedoresDeLaAplicacion>
        <RutasDeLaAplicacion />
      </ProveedoresDeLaAplicacion>
    </BrowserRouter>
  );
}

/**
 * Conecta HeroUI con el enrutador para que sus componentes de enlace
 * (botones con `href`, elementos de menú) naveguen sin recargar la
 * página, y monta el resto de proveedores.
 */
function ProveedoresDeLaAplicacion({ children }: { children: ReactNode }) {
  const navegar = useNavigate();

  return (
    <HeroUIProvider navigate={navegar} useHref={useHref}>
      {/* Los avisos flotantes se apilan arriba a la derecha. */}
      <ToastProvider placement="top-right" toastProps={{ radius: "lg" }} />

      <ProveedorTema>
        <ProveedorConsultas>
          <ProveedorSesion>{children}</ProveedorSesion>
        </ProveedorConsultas>
      </ProveedorTema>
    </HeroUIProvider>
  );
}

function RutasDeLaAplicacion() {
  return (
    <Routes>
      {/* --- Público --- */}
      <Route element={<PaginaWebPublica />} path="/" />
      <Route element={<PaginaEntrar />} path="/entrar" />

      {/* --- Panel (requiere sesión) --- */}
      <Route
        element={
          <RutaProtegida>
            <PaginaPanel />
          </RutaProtegida>
        }
        path="/panel"
      />

      <Route
        element={
          <RutaProtegida>
            <PaginaMarcas />
          </RutaProtegida>
        }
        path="/marcas"
      />

      {/* El catálogo comercial lo consulta todo el equipo; los botones
          de alta y edición los esconde cada pantalla según el permiso. */}
      <Route
        element={
          <RutaProtegida>
            <PaginaPropiedades />
          </RutaProtegida>
        }
        path="/propiedades"
      />

      {/* Las campañas las planifica quien decide el calendario comercial
          del año. El vendedor sí las usa —les asigna marcas desde la
          ficha— pero no las crea ni las cierra, así que la pantalla
          entera le queda fuera. Esconder solo los botones no bastaba:
          la ruta seguía siendo alcanzable escribiéndola a mano. */}
      <Route
        element={
          <RutaProtegida
            requiere={(usuario) => usuario.permisos.gestionaElCatalogoComercial}
          >
            <PaginaCampanas />
          </RutaProtegida>
        }
        path="/campanas"
      />

      <Route
        element={
          <RutaProtegida>
            <PaginaPerfil />
          </RutaProtegida>
        }
        path="/perfil"
      />

      {/* --- Requieren además un permiso concreto --- */}
      <Route
        element={
          <RutaProtegida requiere={(usuario) => usuario.permisos.editaLaWeb}>
            <PaginaContenidoWeb />
          </RutaProtegida>
        }
        path="/web"
      />

      <Route
        element={
          <RutaProtegida requiere={(usuario) => usuario.permisos.asignaVendedores}>
            <PaginaUsuarios />
          </RutaProtegida>
        }
        path="/usuarios"
      />

      <Route
        element={
          <RutaProtegida
            requiere={(usuario) => usuario.permisos.administraElSistema}
          >
            <PaginaAuditoria />
          </RutaProtegida>
        }
        path="/auditoria"
      />

      <Route element={<PaginaNoEncontrada />} path="*" />
    </Routes>
  );
}

/**
 * Envoltorio de las pantallas que exigen sesión.
 *
 * Distingue tres situaciones, y esa distinción es la que evita el
 * parpadeo del login que tenía la versión anterior:
 *
 *   · "comprobando" → se está validando el token guardado. Se muestra la
 *     pantalla de arranque, NO el login.
 *   · "sinSesion"   → al login, recordando a dónde quería ir.
 *   · "conSesion"   → adentro, comprobando además el permiso concreto.
 */
function RutaProtegida({
  children,
  requiere,
}: {
  children: ReactNode;
  /** Permiso adicional que la pantalla exige, si tiene alguno. */
  requiere?: (usuario: Usuario) => boolean;
}) {
  const { estadoDeLaSesion, usuario } = useSesion();

  if (estadoDeLaSesion === "comprobando") {
    return <PantallaDeArranque />;
  }

  if (estadoDeLaSesion === "sinSesion" || usuario === null) {
    return <Navigate replace to="/entrar" />;
  }

  // Tiene sesión pero no el permiso: se le devuelve al resumen, que
  // todo el mundo puede ver, en lugar de dejarle en una pantalla de
  // error sin salida.
  if (requiere && !requiere(usuario)) {
    return <Navigate replace to="/panel" />;
  }

  return <LayoutDelPanel>{children}</LayoutDelPanel>;
}
