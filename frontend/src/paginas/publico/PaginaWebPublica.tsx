/**
 * paginas/publico/PaginaWebPublica.tsx
 * ---------------------------------------------------------------------
 * La web de TS Sports: la página que ve cualquier visitante.
 *
 * Todo lo que se pinta aquí sale del contenido que el equipo edita en el
 * panel (/web). Este fichero no lleva ni un texto fijo salvo los que la
 * interfaz necesita para funcionar.
 *
 * Tres cosas la separan del resto de la aplicación:
 *
 *   · No usa el tema claro/oscuro del panel. Es una web corporativa con
 *     su propia identidad, y sus colores los define el contenido.
 *   · El formulario de contacto crea una marca en el CRM (origen "web",
 *     sin dueño) y además abre WhatsApp con el mensaje ya redactado.
 *   · Lleva los efectos de desplazamiento del sitio original: cabecera
 *     que se vuelve sólida, cifras que suben, secciones que aparecen,
 *     parallax en la franja central y marquesina de aliados. Viven en
 *     hooks/useEfectosDeScroll.ts.
 * ---------------------------------------------------------------------
 */
import { Button, Input, Textarea } from "@heroui/react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Mail,
  Menu,
  MessageCircle,
  X,
} from "lucide-react";
import {
  IconoInstagram,
  IconoLinkedin,
  IconoWhatsapp,
} from "@/componentes/comunes/IconosDeMarca";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { enviarMensajeDeContacto, obtenerContenidoPublico } from "@/api/sitio";
import { PantallaDeArranque } from "@/componentes/comunes/EstadosDePantalla";
import { mensajeDeError } from "@/api/clienteHttp";
import {
  useCabeceraSolida,
  useContadorAnimado,
  useParallax,
  useRevelarAlEntrar,
} from "@/hooks/useEfectosDeScroll";
import { enlaceDeWhatsapp } from "@/utilidades/formato";
import type { ContenidoDeLaWeb, IdiomaDeLaWeb } from "@/tipos/modelos";

/** Clave con la que se recuerda el idioma elegido por el visitante. */
const CLAVE_DEL_IDIOMA = "tsports:idioma-web";

/**
 * Idioma de arranque.
 *
 * Manda lo que el visitante eligió la última vez. Si es su primera
 * visita, se mira el idioma del navegador: a alguien con el sistema en
 * inglés le sirve de poco aterrizar en español.
 */
function detectarIdiomaInicial(): IdiomaDeLaWeb {
  try {
    const idiomaGuardado = localStorage.getItem(CLAVE_DEL_IDIOMA);

    if (idiomaGuardado === "es" || idiomaGuardado === "en") {
      return idiomaGuardado;
    }
  } catch {
    /* Sin almacenamiento se decide por el navegador. */
  }

  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

export function PaginaWebPublica() {
  const consultaDelContenido = useQuery({
    queryKey: ["contenido-web", "publico"],
    queryFn: obtenerContenidoPublico,
    staleTime: 5 * 60 * 1000,
  });

  const [idioma, establecerIdioma] = useState<IdiomaDeLaWeb>(detectarIdiomaInicial);

  const [elMenuMovilEstaAbierto, establecerMenuMovilAbierto] = useState(false);

  // Efectos de desplazamiento (ver hooks/useEfectosDeScroll.ts).
  const laCabeceraEsSolida = useCabeceraSolida();
  const revelar = useRevelarAlEntrar();
  const parallaxDeLaFranja = useParallax<HTMLElement, HTMLImageElement>();

  function cambiarIdioma(idiomaNuevo: IdiomaDeLaWeb) {
    establecerIdioma(idiomaNuevo);

    try {
      localStorage.setItem(CLAVE_DEL_IDIOMA, idiomaNuevo);
    } catch {
      /* Sin almacenamiento el idioma dura solo esta visita. */
    }
  }

  // La web pública tiene su propia identidad: se fuerza el tema claro
  // para que no herede el modo oscuro del panel.
  useEffect(() => {
    const laRaizTeniaModoOscuro = document.documentElement.classList.contains("dark");

    document.documentElement.classList.remove("dark");

    return () => {
      if (laRaizTeniaModoOscuro) document.documentElement.classList.add("dark");
    };
  }, []);

  // El idioma también se anuncia en el <html>: lo usan los lectores de
  // pantalla para pronunciar bien y los buscadores para indexar.
  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  const contenido = consultaDelContenido.data;

  /** Atajo para leer un texto del idioma activo. */
  const texto = useMemo(() => {
    return (clave: string): string => contenido?.textos?.[idioma]?.[clave] ?? "";
  }, [contenido, idioma]);

  if (consultaDelContenido.isLoading || !contenido) {
    return <PantallaDeArranque />;
  }

  // Los colores del contenido se inyectan como variables CSS: así el
  // equipo puede cambiar la identidad de la web desde el panel sin que
  // haga falta tocar ni una línea de este fichero.
  const variablesDeColor = {
    "--web-azul": contenido.colores.azulPrincipal,
    "--web-azul-2": contenido.colores.azulSecundario,
    "--web-acento": contenido.colores.acento,
    "--web-acento-verde": contenido.colores.acentoVerde,
    "--web-fondo-alterno": contenido.colores.fondoAlterno,
  } as CSSProperties;

  const enlacesDelMenu = [
    { ancla: "#nosotros", etiqueta: texto("nav.nosotros") },
    { ancla: "#equipo", etiqueta: texto("nav.equipo") },
    { ancla: "#servicios", etiqueta: texto("nav.servicios") },
    { ancla: "#proyectos", etiqueta: texto("nav.proyectos") },
    { ancla: "#aliados", etiqueta: texto("nav.aliados") },
    { ancla: "#contacto", etiqueta: texto("nav.contacto") },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900" style={variablesDeColor}>
      {/* ============================= Cabecera ============================= */}
      {/* Sobre la portada va translúcida para no tapar el vídeo; en
          cuanto se baja se vuelve sólida, o el menú quedaría ilegible
          sobre el contenido claro. */}
      <header
        className={[
          "sticky top-0 z-40 transition-colors duration-300",
          laCabeceraEsSolida
            ? "border-b border-white/10 bg-[var(--web-azul)]/95 shadow-lg backdrop-blur"
            : "border-b border-transparent bg-transparent",
        ].join(" ")}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <a className="flex items-center gap-2.5 text-white" href="#inicio">
            <span
              className="flex size-9 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: "var(--web-acento)" }}
            >
              TS
            </span>
            <span className="text-sm font-bold tracking-tight">TS Sports</span>
          </a>

          <nav className="ml-auto hidden items-center gap-6 lg:flex">
            {enlacesDelMenu.map((enlace) => (
              <a
                key={enlace.ancla}
                className="text-sm text-white/80 transition hover:text-white"
                href={enlace.ancla}
              >
                {enlace.etiqueta}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {/* Conmutador de idioma */}
            <div className="flex overflow-hidden rounded-full border border-white/20">
              {(["es", "en"] as const).map((codigoDeIdioma) => (
                <button
                  key={codigoDeIdioma}
                  className={[
                    "px-2.5 py-1 text-[11px] font-semibold uppercase transition",
                    idioma === codigoDeIdioma
                      ? "bg-white text-[var(--web-azul)]"
                      : "text-white/70 hover:text-white",
                  ].join(" ")}
                  type="button"
                  onClick={() => cambiarIdioma(codigoDeIdioma)}
                >
                  {codigoDeIdioma}
                </button>
              ))}
            </div>

            <button
              aria-label="Menú"
              className="text-white lg:hidden"
              type="button"
              onClick={() => establecerMenuMovilAbierto((abierto) => !abierto)}
            >
              {elMenuMovilEstaAbierto ? (
                <X className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </button>
          </div>
        </div>

        {/* Menú desplegado en móvil */}
        {elMenuMovilEstaAbierto && (
          <nav className="border-t border-white/10 bg-[var(--web-azul)] px-4 py-3 lg:hidden">
            {enlacesDelMenu.map((enlace) => (
              <a
                key={enlace.ancla}
                className="block py-2 text-sm text-white/80"
                href={enlace.ancla}
                onClick={() => establecerMenuMovilAbierto(false)}
              >
                {enlace.etiqueta}
              </a>
            ))}
          </nav>
        )}
      </header>

      {/* ============================== Portada ============================= */}
      {/* El margen negativo sube la portada los 64 px que ocupa la
          cabecera, de modo que el vídeo se vea también detrás de ella
          mientras es translúcida. */}
      <section
        className="relative -mt-16 flex min-h-[85vh] items-center overflow-hidden"
        id="inicio"
      >
        {/* Vídeo de fondo, con la foto de respaldo debajo. */}
        {contenido.imagenes.heroVideo ? (
          <video
            autoPlay
            className="absolute inset-0 size-full object-cover"
            loop
            muted
            playsInline
            poster={contenido.imagenes.hero}
            src={contenido.imagenes.heroVideo}
          />
        ) : (
          <img
            alt=""
            className="absolute inset-0 size-full object-cover"
            src={contenido.imagenes.hero}
          />
        )}

        {/* Velo oscuro para que el texto se lea sobre cualquier imagen. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, var(--web-azul) 12%, color-mix(in srgb, var(--web-azul) 78%, transparent) 52%, transparent 100%)",
          }}
        />

        <div className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p
              className="mb-4 text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--web-acento-verde)" }}
            >
              {texto("hero.antetitulo")}
            </p>

            {/*
              `whitespace-pre-line` respeta los saltos de línea que venga
              a poner quien edita el titular desde el panel. El texto se
              pinta como texto —nunca como HTML— porque sale del CMS: si
              se interpretara, cualquiera con acceso al panel podría
              colar un <script> en la portada.
            */}
            <h1 className="whitespace-pre-line text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              {texto("hero.titulo")}
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80">
              {texto("hero.subtitulo")}
            </p>

            <PalabrasRotativas
              palabras={texto("hero.palabrasRotativas")}
              prefijo={texto("hero.prefijoExperto")}
            />

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                as="a"
                className="font-semibold text-white"
                href="#servicios"
                radius="full"
                size="lg"
                style={{ backgroundColor: "var(--web-acento)" }}
              >
                {texto("hero.botonPrimario")}
              </Button>

              <Button
                as="a"
                className="border-white/40 font-semibold text-white"
                href="#contacto"
                radius="full"
                size="lg"
                variant="bordered"
              >
                {texto("hero.botonSecundario")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================== Cifras ============================= */}
      <section className="bg-[var(--web-azul-2)] py-12">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 sm:px-6 lg:grid-cols-4">
          {(
            [
              ["metricas.valor1", "metricas.anios"],
              ["metricas.valor2", "metricas.marcas"],
              ["metricas.valor3", "metricas.areas"],
              ["metricas.valor4", "metricas.pasion"],
            ] as const
          ).map(([claveDelValor, claveDeLaEtiqueta]) => (
            <CifraDestacada
              key={claveDelValor}
              etiqueta={texto(claveDeLaEtiqueta)}
              valor={texto(claveDelValor)}
            />
          ))}
        </div>
      </section>

      {/* =========================== Quiénes somos ========================== */}
      <SeccionDeLaWeb id="nosotros">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="overflow-hidden rounded-3xl shadow-xl">
            <img
              alt=""
              className="aspect-4/3 w-full object-cover"
              src={contenido.imagenes.nosotros}
            />
          </div>

          <div>
            <AntetituloDeSeccion>{texto("nosotros.antetitulo")}</AntetituloDeSeccion>
            <TituloDeSeccion>{texto("nosotros.titulo")}</TituloDeSeccion>

            <p className="mt-4 leading-relaxed text-slate-600">
              {texto("nosotros.parrafo1")}
            </p>
            <p className="mt-3 leading-relaxed text-slate-600">
              {texto("nosotros.parrafo2")}
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {([1, 2, 3, 4] as const).map((numero) => (
                <div key={numero} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-900">
                    {texto(`nosotros.valor${numero}Titulo`)}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    {texto(`nosotros.valor${numero}Texto`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SeccionDeLaWeb>

      {/* ============================== Equipo ============================= */}
      {contenido.equipo.length > 0 && (
        <SeccionDeLaWeb fondo="oscuro" id="equipo">
          <CabeceraDeSeccion
            antetitulo={texto("equipo.antetitulo")}
            sobreFondoOscuro
            titulo={texto("equipo.titulo")}
          />

          <CarruselDeEquipo equipo={contenido.equipo} idioma={idioma} />

          {/* La caja de "únete" ya no puede ser del azul de la marca: la
              sección entera lo es y se perdería el borde. Se separa con
              una línea tenue, como en el sitio anterior. */}
          <div
            ref={revelar}
            className="revelar mt-10 border-t border-white/15 px-6 pt-8 text-center"
          >
            <p className="text-lg font-bold text-white">
              {texto("equipo.unirseTitulo")}
            </p>
            <p className="mt-1 text-sm text-white/70">{texto("equipo.unirseTexto")}</p>

            <Button
              as="a"
              className="mt-4 font-semibold text-white"
              href="#contacto"
              radius="full"
              style={{ backgroundColor: "var(--web-acento)" }}
            >
              {texto("equipo.unirseBoton")}
            </Button>
          </div>
        </SeccionDeLaWeb>
      )}

      {/* ============================= Servicios =========================== */}
      <SeccionDeLaWeb id="servicios">
        <CabeceraDeSeccion
          antetitulo={texto("servicios.antetitulo")}
          titulo={texto("servicios.titulo")}
        />

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {contenido.servicios.map((servicio, posicion) => (
            <article
              key={posicion}
              ref={revelar}
              className="revelar rounded-3xl border border-slate-200 p-6 transition hover:border-[var(--web-acento)] hover:shadow-lg"
              // Cada tarjeta entra un poco después que la anterior, para
              // que la fila aparezca en cascada y no toda de golpe.
              style={{ transitionDelay: `${posicion * 70}ms` }}
            >
              <span
                className="mb-4 flex size-11 items-center justify-center rounded-2xl text-lg text-white"
                style={{ backgroundColor: "var(--web-acento)" }}
              >
                {servicio.icono}
              </span>

              <h3 className="text-base font-bold text-slate-900">
                {servicio[idioma].titulo}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {servicio[idioma].descripcion}
              </p>
            </article>
          ))}
        </div>
      </SeccionDeLaWeb>

      {/* ====================== Franja de llamada a acción ================== */}
      {/* El fondo se desplaza más despacio que la página (parallax): da
          sensación de profundidad al cruzar esta franja. */}
      <section
        ref={parallaxDeLaFranja.referenciaALaSeccion}
        className="relative overflow-hidden py-20"
      >
        <img
          ref={parallaxDeLaFranja.referenciaAlFondo}
          alt=""
          // Un poco más alta que la sección para que el desplazamiento
          // no llegue a descubrir el borde de la imagen.
          className="absolute -inset-y-12 inset-x-0 size-auto h-[calc(100%+6rem)] w-full object-cover will-change-transform"
          src={contenido.imagenes.llamadaAccion}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: "color-mix(in srgb, var(--web-azul) 88%, transparent)",
          }}
        />

        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {texto("franja.titulo")}
          </h2>
          <p className="mt-3 leading-relaxed text-white/80">{texto("franja.texto")}</p>

          <Button
            as="a"
            className="mt-6 font-semibold text-white"
            endContent={<ArrowRight className="size-4" />}
            href="#contacto"
            radius="full"
            size="lg"
            style={{ backgroundColor: "var(--web-acento)" }}
          >
            {texto("franja.boton")}
          </Button>
        </div>
      </section>

      {/* ============================= Proyectos =========================== */}
      {contenido.proyectos.length > 0 && (
        <SeccionDeLaWeb id="proyectos">
          <CabeceraDeSeccion
            antetitulo={texto("proyectos.antetitulo")}
            titulo={texto("proyectos.titulo")}
          />

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {contenido.proyectos.map((proyecto, posicion) => (
              <article
                key={posicion}
                ref={revelar}
                className="revelar group overflow-hidden rounded-3xl shadow-md transition hover:shadow-xl"
                style={{ transitionDelay: `${posicion * 90}ms` }}
              >
                <div
                  className="aspect-4/3 w-full overflow-hidden"
                  style={
                    proyecto.imagen ? undefined : { background: proyecto.degradado }
                  }
                >
                  {proyecto.imagen && (
                    <img
                      alt={proyecto[idioma].titulo}
                      className="size-full object-cover transition duration-500 group-hover:scale-105"
                      src={proyecto.imagen}
                    />
                  )}
                </div>

                <div className="p-5">
                  {proyecto[idioma].etiqueta && (
                    <p
                      className="text-[11px] font-bold uppercase tracking-wide"
                      style={{ color: "var(--web-acento)" }}
                    >
                      {proyecto[idioma].etiqueta}
                    </p>
                  )}

                  <h3 className="mt-1 text-base font-bold text-slate-900">
                    {proyecto[idioma].titulo}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {proyecto[idioma].descripcion}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <blockquote className="mx-auto mt-12 max-w-3xl text-center">
            <p className="text-lg font-medium italic leading-relaxed text-slate-700">
              {texto("proyectos.cita")}
            </p>
            <footer className="mt-3 text-xs text-slate-500">
              {texto("proyectos.citaAutor")}
            </footer>
          </blockquote>
        </SeccionDeLaWeb>
      )}

      {/* ============================== Aliados ============================ */}
      {contenido.aliados.length > 0 && (
        <SeccionDeLaWeb fondo="alterno" id="aliados">
          <CabeceraDeSeccion
            antetitulo={texto("aliados.antetitulo")}
            titulo={texto("aliados.titulo")}
          />

          <MarquesinaDeAliados aliados={contenido.aliados} />
        </SeccionDeLaWeb>
      )}

      {/* ============================= WhatsApp =============================
          Tarjeta sobre fondo claro, no franja de lado a lado.

          Sobre el degradado: los tres tonos son los oficiales de WhatsApp
          (#075E54, #128C7E y #25D366), pero el orden NO es decorativo. El
          texto blanco vive en la mitad izquierda, así que ahí va el verde
          oscuro, que le da 7,7 de contraste. El claro se reserva para la
          derecha, donde solo hay un botón blanco macizo que se lee solo.

          El `acentoVerde` del CMS (#16c79a) daba 2,2, y el degradado del
          sitio anterior copiado tal cual dejaba el texto sobre su extremo
          claro con 2,0: aún peor. Los dos por debajo del 4,5 que pide la
          WCAG, y en la práctica, letras que se perdían en el fondo. */}
      {contenido.contacto.whatsapp && (
        <section className="py-14" style={{ backgroundColor: "var(--web-fondo-alterno)" }}>
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="relative flex flex-wrap items-center gap-7 overflow-hidden rounded-[20px] bg-[linear-gradient(120deg,#075E54_0%,#128C7E_55%,#25D366_100%)] px-10 py-9 shadow-[0_24px_50px_rgba(7,94,84,.35)]">
              {/* Destello suave en la esquina, como en el sitio anterior. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-14 -top-14 size-60 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.18),transparent_70%)]"
              />

              <span className="relative z-10 flex size-20 shrink-0 items-center justify-center rounded-full bg-white text-[#25D366] shadow-[0_8px_20px_rgba(0,0,0,.15)]">
                <IconoWhatsapp className="size-9" />
              </span>

              <div className="relative z-10 flex-1 basis-80">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/90">
                  {texto("whatsapp.antetitulo")}
                </p>
                <h2 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
                  {texto("whatsapp.titulo")}
                </h2>
                <p className="mt-2 max-w-lg text-sm text-white/95">
                  {texto("whatsapp.texto")}
                </p>
                <p className="mt-2.5 text-lg font-bold tracking-wide text-white">
                  {contenido.contacto.whatsapp}
                </p>
              </div>

              <Button
                as="a"
                className="relative z-10 bg-white font-bold text-[#075E54] shadow-[0_10px_24px_rgba(0,0,0,.18)]"
                href={enlaceDeWhatsapp(contenido.contacto.whatsapp)}
                radius="full"
                rel="noreferrer"
                size="lg"
                startContent={<MessageCircle className="size-4" />}
                target="_blank"
              >
                {texto("contacto.botonWhatsapp")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ============================== Contacto =========================== */}
      <SeccionDeLaWeb id="contacto">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <AntetituloDeSeccion>{texto("contacto.antetitulo")}</AntetituloDeSeccion>
            <TituloDeSeccion>{texto("contacto.titulo")}</TituloDeSeccion>

            <p className="mt-4 leading-relaxed text-slate-600">
              {texto("contacto.parrafo")}
            </p>

            <div className="mt-7 space-y-3">
              <a
                className="flex items-center gap-3 text-sm text-slate-700 transition hover:text-[var(--web-acento)]"
                href={`mailto:${contenido.contacto.email}`}
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100">
                  <Mail className="size-4" />
                </span>
                {contenido.contacto.email}
              </a>

              {contenido.contacto.instagram && (
                <a
                  className="flex items-center gap-3 text-sm text-slate-700 transition hover:text-[var(--web-acento)]"
                  href={contenido.contacto.instagram}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100">
                    <IconoInstagram className="size-4" />
                  </span>
                  Instagram
                </a>
              )}

              {contenido.contacto.linkedin && (
                <a
                  className="flex items-center gap-3 text-sm text-slate-700 transition hover:text-[var(--web-acento)]"
                  href={contenido.contacto.linkedin}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100">
                    <IconoLinkedin className="size-4" />
                  </span>
                  LinkedIn
                </a>
              )}
            </div>
          </div>

          <FormularioDeContacto contenido={contenido} idioma={idioma} />
        </div>
      </SeccionDeLaWeb>

      {/* =============================== Pie ============================== */}
      <footer className="bg-[var(--web-azul)] py-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 text-white">
            <span
              className="flex size-9 items-center justify-center rounded-xl text-sm font-bold"
              style={{ backgroundColor: "var(--web-acento)" }}
            >
              TS
            </span>

            <div>
              <p className="text-sm font-bold">TS Sports</p>
              <p className="text-[11px] text-white/60">{texto("pie.lema")}</p>
            </div>
          </div>

          <p className="text-[11px] text-white/50">
            © {new Date().getFullYear()} TS Sports. {texto("pie.derechos")}
          </p>

          {/* Acceso discreto al panel, para el equipo. */}
          <Link
            className="text-[11px] text-white/40 transition hover:text-white/80"
            to="/entrar"
          >
            Acceso al panel
          </Link>
        </div>
      </footer>

      {/* ===================== Botón flotante de WhatsApp =================== */}
      {/* Acompaña al visitante por toda la página: es el camino más corto
          entre "me interesa" y una conversación real. */}
      {contenido.contacto.whatsapp && (
        <a
          aria-label="Escríbenos por WhatsApp"
          className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full text-white shadow-xl transition hover:scale-110 hover:shadow-2xl"
          href={enlaceDeWhatsapp(
            contenido.contacto.whatsapp,
            idioma === "en"
              ? "Hi TS Sports, I'd like more information."
              : "Hola TS Sports, me gustaría más información.",
          )}
          rel="noreferrer"
          style={{ backgroundColor: "#25d366" }}
          target="_blank"
        >
          <IconoWhatsapp className="size-7" />
        </a>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Piezas de la web                                                    */
/* ==================================================================== */

/**
 * Una de las cuatro cifras destacadas ("20+ años de experiencia").
 *
 * El número sube desde cero cuando la sección entra en pantalla. El
 * sufijo se conserva intacto: "20+" cuenta hasta 20 y mantiene el signo,
 * y "100%" hasta 100 con su porcentaje.
 */
function CifraDestacada({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const { referenciaAlElemento, textoMostrado } =
    useContadorAnimado<HTMLParagraphElement>(valor);

  return (
    <div className="text-center">
      <p
        ref={referenciaAlElemento}
        className="text-3xl font-extrabold tabular-nums tracking-tight sm:text-4xl"
        style={{ color: "var(--web-acento-verde)" }}
      >
        {textoMostrado}
      </p>
      <p className="mt-1 text-xs text-white/70">{etiqueta}</p>
    </div>
  );
}

/**
 * Cuánto se ignora el desplazamiento después de mover el carrusel a
 * mano. El navegador anima el scroll y va disparando eventos por el
 * camino; sin esta pausa, dos pulsaciones seguidas en la flecha leerían
 * la posición a medio viaje y la segunda volvería atrás.
 */
const MILISEGUNDOS_DE_LA_ANIMACION = 700;

/**
 * Dónde empieza una ficha dentro de la pista, en píxeles de maquetación.
 *
 * Se usa `offsetLeft` y NO `getBoundingClientRect()`. Las fichas que no
 * están centradas llevan un `scale(.93)`, y el rectángulo que devuelve el
 * navegador es el YA TRANSFORMADO: la ficha encogida parece empezar once
 * píxeles más a la derecha de donde de verdad está. Con esa medida, el
 * destino salía siempre corrido y solo el anclaje del scroll lo tapaba.
 *
 * Cuenta con que la pista no esté posicionada —no lo está— para que
 * `offsetLeft` incluya su hueco lateral, que es justo el origen desde el
 * que se mide `scrollLeft`.
 */
function izquierdaEnLaPista(ficha: HTMLElement): number {
  return ficha.offsetLeft;
}

/**
 * El equipo, como carrusel horizontal con flechas.
 *
 * Se eligió carrusel y no rejilla porque el equipo crece: con una
 * rejilla fija, la novena persona rompe la composición, mientras que
 * aquí simplemente se desplaza un poco más.
 *
 * SIEMPRE HAY UNA FICHA CENTRADA Y RESALTADA, y al cargar es la primera
 * de la lista. Que eso funcione depende de dos cosas:
 *
 *   · El hueco lateral de la pista (`--margen-del-carrusel`), que vale
 *     media pista menos media ficha. Sin él, la primera persona no puede
 *     llegar al centro y el resalte nunca coincide con lo que se ve.
 *   · Que las flechas muevan un ÍNDICE y no un puñado de píxeles. Al
 *     empujar píxeles, el resalte lo decidía después el evento de
 *     desplazamiento y las dos cosas se desincronizaban.
 *
 * También se puede pulsar una ficha para traerla al centro, como en el
 * sitio anterior.
 */
function CarruselDeEquipo({
  equipo,
  idioma,
}: {
  equipo: ContenidoDeLaWeb["equipo"];
  idioma: IdiomaDeLaWeb;
}) {
  const referenciaALaPista = useRef<HTMLDivElement>(null);
  const [posicionCentrada, establecerPosicionCentrada] = useState(0);

  /**
   * La ficha a la que se está yendo. Se guarda aparte del estado porque
   * hace falta leerla dentro del mismo gesto: dos clics rápidos en la
   * flecha tienen que avanzar dos fichas, y el estado todavía no se ha
   * refrescado cuando llega el segundo.
   */
  const posicionObjetivo = useRef(0);

  /** Cuándo se lanzó el último desplazamiento propio. Ver la constante. */
  const momentoDelUltimoSalto = useRef(0);

  /*
   * El hueco de los lados: media pista menos media ficha. Se recalcula
   * al cambiar el tamaño porque el ancho de la ficha va en `clamp()` y
   * depende de la anchura disponible.
   */
  useEffect(() => {
    const pista = referenciaALaPista.current;

    if (pista === null) return;

    function medirElMargen() {
      const actual = referenciaALaPista.current;
      const primeraFicha = actual?.querySelector("article");

      if (!actual || !primeraFicha) return;

      const margen = Math.max(
        4,
        (actual.clientWidth - primeraFicha.offsetWidth) / 2,
      );

      actual.style.setProperty("--margen-del-carrusel", `${margen}px`);
    }

    medirElMargen();

    const observador = new ResizeObserver(medirElMargen);
    observador.observe(pista);

    return () => observador.disconnect();
  }, [equipo.length]);

  /** Trae al centro la ficha de esa posición. */
  function irALaFicha(posicion: number) {
    const pista = referenciaALaPista.current;

    if (pista === null) return;

    const destino = Math.min(Math.max(posicion, 0), equipo.length - 1);
    const ficha = pista.querySelectorAll("article")[destino];

    if (ficha === undefined) return;

    posicionObjetivo.current = destino;
    momentoDelUltimoSalto.current = Date.now();

    // El resalte cambia ya, sin esperar a que termine la animación: si
    // esperase, la ficha se movería antes de encenderse y se vería el
    // salto en dos tiempos.
    establecerPosicionCentrada(destino);

    pista.scrollTo({
      left:
        izquierdaEnLaPista(ficha) - (pista.clientWidth - ficha.offsetWidth) / 2,
      behavior: "smooth",
    });
  }

  /**
   * Al arrastrar con el dedo o con la rueda, manda la posición real: se
   * resalta la ficha que ha quedado más cerca del centro.
   */
  function alDesplazarLaPista() {
    const pista = referenciaALaPista.current;

    if (pista === null) return;

    // Mientras dura una animación propia, el destino ya está decidido.
    if (Date.now() - momentoDelUltimoSalto.current < MILISEGUNDOS_DE_LA_ANIMACION) {
      return;
    }

    const centroDeLaVista = pista.scrollLeft + pista.clientWidth / 2;
    const fichas = Array.from(pista.querySelectorAll("article"));

    let posicionMasCercana = 0;
    let distanciaMinima = Number.POSITIVE_INFINITY;

    fichas.forEach((ficha, posicion) => {
      const centroDeLaFicha = izquierdaEnLaPista(ficha) + ficha.offsetWidth / 2;
      const distancia = Math.abs(centroDeLaFicha - centroDeLaVista);

      if (distancia < distanciaMinima) {
        distanciaMinima = distancia;
        posicionMasCercana = posicion;
      }
    });

    posicionObjetivo.current = posicionMasCercana;
    establecerPosicionCentrada(posicionMasCercana);
  }

  return (
    <div className="relative mt-10">
      <div
        ref={referenciaALaPista}
        className="carrusel-equipo py-4"
        onScroll={alDesplazarLaPista}
      >
        {equipo.map((miembro, posicion) => {
          const estaCentrada = posicion === posicionCentrada;

          return (
            <article
              key={`${miembro.nombre}-${posicion}`}
              aria-label={`Ver a ${miembro.nombre}`}
              className={[
                "carrusel-equipo__ficha relative aspect-[3/4] cursor-pointer overflow-hidden rounded-[18px]",
                "transition duration-500",
                estaCentrada
                  ? "scale-100 shadow-[0_24px_55px_rgba(0,0,0,.55)] grayscale-0 brightness-100"
                  : "scale-[0.93] grayscale brightness-[0.65]",
              ].join(" ")}
              role="button"
              tabIndex={0}
              onClick={() => irALaFicha(posicion)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter" || evento.key === " ") {
                  evento.preventDefault();
                  irALaFicha(posicion);
                }
              }}
            >
              {miembro.foto && (
                <img
                  alt={miembro.nombre}
                  className="absolute inset-0 size-full object-cover"
                  loading="lazy"
                  src={miembro.foto}
                />
              )}

              {/*
                El nombre va SOBRE la foto, no debajo: así la ficha es una
                sola pieza rectangular y el carrusel no cambia de altura
                según lo largo que sea un cargo. El degradado oscuro por
                detrás es lo que mantiene el texto legible sea cual sea la
                foto que se suba desde el panel.
              */}
              <div
                className={[
                  "absolute inset-x-0 bottom-0 px-5 pb-4 pt-12 transition duration-500",
                  estaCentrada
                    ? "bg-[linear-gradient(transparent,rgba(22,199,154,.35)_40%,rgba(0,0,0,.9))]"
                    : "bg-[linear-gradient(transparent,rgba(0,0,0,.85))]",
                ].join(" ")}
              >
                <h3 className="text-lg font-bold leading-tight text-white">
                  {miembro.nombre}
                </h3>
                <p className="text-sm font-semibold text-white/80">
                  {miembro[idioma].cargo}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      {/*
        Las flechas salen en cuanto hay más de una persona. Antes se medía
        si la lista desbordaba, pero con el hueco lateral la pista siempre
        se puede desplazar y esa cuenta ya no dice nada: lo que mueven las
        flechas es cuál está centrada, y eso tiene sentido aunque quepan
        todas en pantalla.
      */}
      {equipo.length > 1 && (
        <>
          <BotonDelCarrusel
            direccion="anterior"
            onPress={() => irALaFicha(posicionObjetivo.current - 1)}
          />
          <BotonDelCarrusel
            direccion="siguiente"
            onPress={() => irALaFicha(posicionObjetivo.current + 1)}
          />
        </>
      )}
    </div>
  );
}

function BotonDelCarrusel({
  direccion,
  onPress,
}: {
  direccion: "anterior" | "siguiente";
  onPress: () => void;
}) {
  const esAnterior = direccion === "anterior";

  return (
    <button
      aria-label={esAnterior ? "Ver anteriores" : "Ver siguientes"}
      // Cristal translúcido sobre el azul de la sección, como en el sitio
      // anterior: un círculo blanco macizo pesa demasiado y se come la
      // atención que tienen que llevarse las fotos.
      className={[
        "absolute top-1/2 z-10 flex size-[46px] -translate-y-1/2 items-center justify-center",
        "rounded-full border border-white/30 bg-white/[0.14] text-white backdrop-blur-[6px]",
        "transition hover:bg-white/30",
        // En el móvil estorban: ahí se arrastra con el dedo.
        "hidden sm:flex",
        esAnterior ? "-left-2" : "-right-2",
      ].join(" ")}
      type="button"
      onClick={onPress}
    >
      {esAnterior ? (
        <ChevronLeft className="size-5" />
      ) : (
        <ChevronRight className="size-5" />
      )}
    </button>
  );
}

/**
 * Los logos de los aliados, desplazándose sin fin.
 *
 * La lista se pinta DUPLICADA y la animación la mueve exactamente hasta
 * la mitad: al terminar, el segundo juego de logos está justo donde
 * empezó el primero, así que el salto de vuelta no se percibe y el
 * movimiento parece continuo. Es el mismo truco de la versión anterior.
 *
 * Los bordes se difuminan para que los logos no aparezcan y desaparezcan
 * de golpe al llegar a los extremos.
 */
function MarquesinaDeAliados({
  aliados,
}: {
  aliados: ContenidoDeLaWeb["aliados"];
}) {
  const listaDuplicada = [...aliados, ...aliados];

  return (
    <div
      className="marquesina relative mt-10 overflow-hidden"
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
      }}
    >
      <div className="marquesina-pista gap-4">
        {listaDuplicada.map((aliado, posicion) => (
          <div
            key={posicion}
            // La segunda mitad es una copia visual: se oculta a los
            // lectores de pantalla para no leer la lista dos veces.
            aria-hidden={posicion >= aliados.length}
            className="flex h-20 w-36 shrink-0 items-center justify-center rounded-2xl bg-white px-4 shadow-sm"
          >
            {aliado.logo ? (
              <img
                alt={aliado.nombre}
                className="max-h-10 max-w-full object-contain"
                loading="lazy"
                src={aliado.logo}
              />
            ) : (
              <span className="text-center text-xs font-bold text-slate-400">
                {aliado.nombre}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Una franja de la portada. El fondo tiene tres variantes y ninguna se
 * elige a ojo desde fuera: `alterno` es el gris muy claro que separa dos
 * secciones seguidas, y `oscuro` el azul de la marca, que se reserva
 * para el equipo —igual que en el sitio anterior— porque las fotos en
 * blanco y negro necesitan fondo oscuro para no verse deslavadas.
 */
function SeccionDeLaWeb({
  id,
  children,
  fondo = "claro",
}: {
  id: string;
  children: React.ReactNode;
  fondo?: "claro" | "alterno" | "oscuro";
}) {
  const colorDeFondo = {
    claro: undefined,
    alterno: "var(--web-fondo-alterno)",
    oscuro: "var(--web-azul)",
  }[fondo];

  return (
    <section
      className={["py-20", fondo === "oscuro" ? "overflow-hidden" : ""].join(" ")}
      id={id}
      style={colorDeFondo ? { backgroundColor: colorDeFondo } : undefined}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

function AntetituloDeSeccion({
  children,
  sobreFondoOscuro = false,
}: {
  children: React.ReactNode;
  sobreFondoOscuro?: boolean;
}) {
  return (
    <p
      className="text-[11px] font-bold uppercase tracking-[0.2em]"
      style={{
        // Sobre el azul de la marca, el acento azul no contrasta lo
        // suficiente: ahí se usa el verde, como hacía el sitio anterior.
        color: sobreFondoOscuro ? "var(--web-acento-verde)" : "var(--web-acento)",
      }}
    >
      {children}
    </p>
  );
}

function TituloDeSeccion({
  children,
  sobreFondoOscuro = false,
}: {
  children: React.ReactNode;
  sobreFondoOscuro?: boolean;
}) {
  return (
    <h2
      className={[
        "mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl",
        sobreFondoOscuro ? "text-white" : "text-slate-900",
      ].join(" ")}
    >
      {children}
    </h2>
  );
}

function CabeceraDeSeccion({
  antetitulo,
  titulo,
  sobreFondoOscuro = false,
}: {
  antetitulo: string;
  titulo: string;
  /** Invierte los colores del texto para las franjas de fondo oscuro. */
  sobreFondoOscuro?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <AntetituloDeSeccion sobreFondoOscuro={sobreFondoOscuro}>
        {antetitulo}
      </AntetituloDeSeccion>
      <TituloDeSeccion sobreFondoOscuro={sobreFondoOscuro}>{titulo}</TituloDeSeccion>
    </div>
  );
}

/**
 * Las palabras que van rotando bajo el titular ("Expertos en Marketing,
 * Patrocinios, Eventos…"). Vienen del contenido como una lista separada
 * por comas, para que se puedan cambiar desde el panel.
 */
function PalabrasRotativas({
  prefijo,
  palabras,
}: {
  prefijo: string;
  palabras: string;
}) {
  const listaDePalabras = useMemo(
    () =>
      palabras
        .split(",")
        .map((palabra) => palabra.trim())
        .filter(Boolean),
    [palabras],
  );

  const [posicionActual, establecerPosicionActual] = useState(0);

  useEffect(() => {
    if (listaDePalabras.length <= 1) return;

    const temporizador = window.setInterval(() => {
      establecerPosicionActual((posicion) => (posicion + 1) % listaDePalabras.length);
    }, 2400);

    return () => window.clearInterval(temporizador);
  }, [listaDePalabras.length]);

  if (listaDePalabras.length === 0) return null;

  return (
    <p className="mt-6 text-sm text-white/70">
      {prefijo}{" "}
      <span
        key={posicionActual}
        className="inline-block font-bold animar-entrada"
        style={{ color: "var(--web-acento-verde)" }}
      >
        {listaDePalabras[posicionActual]}
      </span>
    </p>
  );
}

/**
 * El formulario de contacto.
 *
 * Hace DOS cosas con cada envío, y las dos importan:
 *
 *   1. Crea una marca en el CRM con origen "web" y sin vendedor
 *      asignado. Así el lead queda registrado aunque nadie conteste al
 *      instante, y aparece en el tablero para que lo trabaje el primero
 *      del equipo que lo abra.
 *
 *   2. Abre WhatsApp con el mensaje ya redactado. Es lo que hacía la
 *      versión anterior y funciona: la conversación empieza en el sitio
 *      donde el equipo de verdad responde, no en una bandeja de correo
 *      que se mira una vez al día.
 *
 * El orden es deliberado: primero se guarda y solo después se abre
 * WhatsApp. Si se abriese antes, el navegador cambiaría de pestaña y en
 * algunos móviles la petición al servidor se quedaría a medias.
 */
function FormularioDeContacto({
  contenido,
  idioma,
}: {
  contenido: ContenidoDeLaWeb;
  idioma: IdiomaDeLaWeb;
}) {
  const texto = (clave: string): string => contenido.textos[idioma]?.[clave] ?? "";

  const [nombre, establecerNombre] = useState("");
  const [email, establecerEmail] = useState("");
  const [empresa, establecerEmpresa] = useState("");
  const [telefono, establecerTelefono] = useState("");
  const [mensaje, establecerMensaje] = useState("");

  // Trampa para robots: oculta por CSS, una persona nunca la rellena.
  const [campoTrampa, establecerCampoTrampa] = useState("");

  const [mensajeDeFallo, establecerMensajeDeFallo] = useState<string | null>(null);
  const [seEnvioCorrectamente, establecerSeEnvioCorrectamente] = useState(false);

  const enviar = useMutation({
    mutationFn: () =>
      enviarMensajeDeContacto({
        nombre,
        email,
        empresa,
        telefono,
        mensaje,
        sitioWeb: campoTrampa,
      }),

    onSuccess: () => {
      // El lead ya está a salvo en el CRM: ahora se lleva la
      // conversación a WhatsApp, con el mensaje ya escrito.
      abrirWhatsappConElMensaje();

      establecerSeEnvioCorrectamente(true);
      establecerMensajeDeFallo(null);

      establecerNombre("");
      establecerEmail("");
      establecerEmpresa("");
      establecerTelefono("");
      establecerMensaje("");
    },

    onError: (error) => establecerMensajeDeFallo(mensajeDeError(error)),
  });

  /**
   * Abre WhatsApp con los datos del formulario ya redactados.
   *
   * Si no hay número configurado en el panel, simplemente no hace nada:
   * el lead ya quedó guardado y el visitante ve igualmente el mensaje de
   * confirmación.
   */
  function abrirWhatsappConElMensaje() {
    const numeroDeWhatsapp = contenido.contacto.whatsapp;

    if (!numeroDeWhatsapp) return;

    const enIngles = idioma === "en";

    // Los campos opcionales solo aparecen si se rellenaron; el resto de
    // la estructura del mensaje es fija.
    const datosDelContacto = [
      `${enIngles ? "Name" : "Nombre"}: ${nombre}`,
      `${enIngles ? "Email" : "Correo"}: ${email}`,
      empresa && `${enIngles ? "Company" : "Empresa"}: ${empresa}`,
      telefono && `${enIngles ? "Phone" : "Teléfono"}: ${telefono}`,
    ].filter(Boolean);

    const mensajeRedactado = [
      enIngles ? "Hi TS Sports! 👋" : "¡Hola TS Sports! 👋",
      "",
      ...datosDelContacto,
      "",
      enIngles ? "Message:" : "Mensaje:",
      mensaje,
    ].join("\n");

    window.open(
      enlaceDeWhatsapp(numeroDeWhatsapp, mensajeRedactado),
      "_blank",
      "noopener",
    );
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    enviar.mutate();
  }

  if (seEnvioCorrectamente) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 p-10 text-center">
        <span
          className="mb-4 flex size-12 items-center justify-center rounded-2xl text-white"
          style={{ backgroundColor: "var(--web-acento-verde)" }}
        >
          <Mail className="size-5" />
        </span>

        <p className="text-sm leading-relaxed text-slate-700">
          {texto("formulario.exito")}
        </p>

        <Button
          className="mt-4"
          radius="full"
          size="sm"
          variant="flat"
          onPress={() => establecerSeEnvioCorrectamente(false)}
        >
          Enviar otro mensaje
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 rounded-3xl border border-slate-200 p-6 shadow-sm"
      onSubmit={alEnviar}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          isRequired
          label={texto("formulario.nombre")}
          labelPlacement="outside"
          radius="lg"
          value={nombre}
          variant="bordered"
          onValueChange={establecerNombre}
        />

        <Input
          isRequired
          label={texto("formulario.email")}
          labelPlacement="outside"
          radius="lg"
          type="email"
          value={email}
          variant="bordered"
          onValueChange={establecerEmail}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={texto("formulario.empresa")}
          labelPlacement="outside"
          radius="lg"
          value={empresa}
          variant="bordered"
          onValueChange={establecerEmpresa}
        />

        <Input
          label={texto("formulario.telefono")}
          labelPlacement="outside"
          radius="lg"
          value={telefono}
          variant="bordered"
          onValueChange={establecerTelefono}
        />
      </div>

      <Textarea
        isRequired
        label={texto("formulario.mensaje")}
        labelPlacement="outside"
        minRows={4}
        radius="lg"
        value={mensaje}
        variant="bordered"
        onValueChange={establecerMensaje}
      />

      {/* Trampa para robots. Oculta a la vista y a los lectores de
          pantalla, pero rellenable por un programa automático. */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="sitioWeb">No rellenar</label>
        <input
          autoComplete="off"
          id="sitioWeb"
          name="sitioWeb"
          tabIndex={-1}
          type="text"
          value={campoTrampa}
          onChange={(evento) => establecerCampoTrampa(evento.target.value)}
        />
      </div>

      {mensajeDeFallo && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-600">
          {mensajeDeFallo}
        </p>
      )}

      <Button
        className="w-full font-semibold text-white"
        isLoading={enviar.isPending}
        radius="full"
        size="lg"
        style={{ backgroundColor: "var(--web-acento)" }}
        type="submit"
      >
        {texto("formulario.enviar")}
      </Button>
    </form>
  );
}
