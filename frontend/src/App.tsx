/**
 * App.tsx
 * ---------------------------------------------------------------------
 * El árbol de proveedores y el mapa de rutas de toda la aplicación.
 *
 * ORDEN DE LOS PROVEEDORES (importa):
 *   Enrutador → HeroUI → Tema → Consultas → Sesión → Tiempo real
 *                                                   → Aplicación instalada
 *
 *   · El TEMA va por fuera de la SESIÓN porque la pantalla de login ya
 *     tiene que respetar el modo oscuro guardado, antes de saber quién
 *     está entrando.
 *   · La SESIÓN va por dentro del TEMA porque, en cuanto conoce al
 *     usuario, le empuja sus preferencias visuales del servidor.
 *   · El TIEMPO REAL va por dentro de la SESIÓN porque sin saber quién
 *     es la persona no hay canal privado al que suscribirse. Va aquí
 *     arriba y no en el layout del panel para que la conexión no se
 *     corte y se vuelva a abrir en cada cambio de pantalla.
 *   · La APLICACIÓN INSTALADA va por dentro de la SESIÓN porque el
 *     service worker solo se registra con sesión iniciada: la raíz
 *     del dominio es la web de la agencia y a un visitante no hay
 *     que ofrecerle instalar un CRM.
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
import { ProveedorAplicacion } from "@/providers/ProveedorAplicacion";
import { ProveedorConsultas } from "@/providers/ProveedorConsultas";
import { ProveedorDatosGuardados } from "@/providers/ProveedorDatosGuardados";
import { ProveedorSesion, useSesion } from "@/providers/ProveedorSesion";
import { ProveedorTema } from "@/providers/ProveedorTema";
import { ProveedorTiempoReal } from "@/providers/ProveedorTiempoReal";
import { PaginaAuditoria } from "@/paginas/PaginaAuditoria";
import { PaginaCampanas } from "@/paginas/PaginaCampanas";
import { PaginaContenidoWeb } from "@/paginas/PaginaContenidoWeb";
import { PaginaEntrar } from "@/paginas/PaginaEntrar";
import { PaginaMarcas } from "@/paginas/PaginaMarcas";
import { PaginaNoEncontrada } from "@/paginas/PaginaNoEncontrada";
import { PaginaNotificaciones } from "@/paginas/PaginaNotificaciones";
import { PaginaPanel } from "@/paginas/PaginaPanel";
import { PaginaPropiedades } from "@/paginas/PaginaPropiedades";
import { PaginaSectores } from "@/paginas/PaginaSectores";
import { PaginaPerfil } from "@/paginas/PaginaPerfil";
import { PaginaReporteDeBitacora } from "@/paginas/PaginaReporteDeBitacora";
import { PaginaTiempoReal } from "@/paginas/PaginaTiempoReal";
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
          <ProveedorSesion>
            <DatosSegunLaPersona>
              <ProveedorTiempoReal>
                <ProveedorAplicacion>{children}</ProveedorAplicacion>
              </ProveedorTiempoReal>
            </DatosSegunLaPersona>
          </ProveedorSesion>
        </ProveedorConsultas>
      </ProveedorTema>
    </HeroUIProvider>
  );
}

/**
 * Enchufa la copia de datos para consultar sin conexión, la de ESTA
 * persona y solo mientras sea ella quien está dentro.
 *
 * El `key` con su id no es adorno: al cambiar de persona fuerza a que el
 * proveedor se monte de nuevo, y es en ese montaje —antes de que sus
 * hijos pidan nada— donde se restaura la copia. Sin él, quien entrase
 * después vería un instante el tablero del anterior.
 */
function DatosSegunLaPersona({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();

  // Sin sesión no hay copia que restaurar ni nada que guardar: la web
  // pública y la pantalla de acceso no tienen datos de nadie.
  if (usuario === null) {
    return children;
  }

  return (
    <ProveedorDatosGuardados key={usuario.id} idDeLaPersona={usuario.id}>
      {children}
    </ProveedorDatosGuardados>
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

      {/* Los rubros los consulta todo el equipo —el selector de la ficha
          los necesita— pero la pantalla que los administra es de quien
          gestiona el catálogo: a un agente solo le daría botones que no
          puede pulsar. */}
      <Route
        element={
          <RutaProtegida
            requiere={(usuario) => usuario.permisos.gestionaElCatalogoComercial}
          >
            <PaginaSectores />
          </RutaProtegida>
        }
        path="/sectores"
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

      {/* Todo el equipo: un agente saca el reporte de sus marcas. Sin
          marcas elegidas es el de toda la agencia, y eso lo comprueba el
          servidor (solo administrador). */}
      <Route
        element={
          <RutaProtegida>
            <PaginaReporteDeBitacora />
          </RutaProtegida>
        }
        path="/reportes/bitacora"
      />

      {/* Cada quien ve solo sus avisos: el corte lo hace el servidor. */}
      <Route
        element={
          <RutaProtegida>
            <PaginaNotificaciones />
          </RutaProtegida>
        }
        path="/notificaciones"
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

      {/* Pruebas del tiempo real: un aviso a «todo el equipo» le salta en
          pantalla a cada persona, así que es cosa del administrador. El
          servidor lo vuelve a comprobar (UserPolicy::probarTiempoReal). */}
      <Route
        element={
          <RutaProtegida
            requiere={(usuario) => usuario.permisos.administraElSistema}
          >
            <PaginaTiempoReal />
          </RutaProtegida>
        }
        path="/tiempo-real"
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
