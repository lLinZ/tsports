<?php

declare(strict_types=1);

namespace App\Support;

/**
 * ContenidoWebPorDefecto — el contenido de fábrica de la web pública.
 * ---------------------------------------------------------------------
 * Es la traducción a PHP del antiguo `content-defaults.js`. Define la
 * forma completa del documento que el panel edita y que la web pinta:
 * si una clave no existe aquí, el panel no sabrá mostrarla.
 *
 * Sirve para tres cosas:
 *   1. Sembrar la base de datos en una instalación nueva.
 *   2. Rellenar los huecos cuando se añade un campo al diseño y el
 *      contenido guardado todavía no lo tiene (ver `fusionarConGuardado`).
 *   3. Alimentar el botón "Restablecer" del panel de administración.
 *
 * Los textos van en dos idiomas (es / en) porque la web pública tiene
 * conmutador de idioma.
 */
final class ContenidoWebPorDefecto
{
    /**
     * Documento completo del contenido de fábrica.
     *
     * @return array<string,mixed>
     */
    public static function comoArreglo(): array
    {
        return [
            'colores' => self::colores(),
            'imagenes' => self::imagenes(),
            'contacto' => self::contacto(),
            'textos' => [
                'es' => self::textosEnEspanol(),
                'en' => self::textosEnIngles(),
            ],
            'servicios' => self::servicios(),
            'proyectos' => self::proyectos(),
            'equipo' => self::equipo(),
            'aliados' => self::aliados(),
        ];
    }

    /**
     * Paleta de la web pública. No tiene nada que ver con el color de
     * acento del panel: esto es lo que ve el visitante.
     */
    private static function colores(): array
    {
        return [
            'azulPrincipal' => '#0a1f3c',   // Fondos de cabecera y pie.
            'azulSecundario' => '#0d2b52',  // Degradados y bloques.
            'acento' => '#1b9aaa',          // Botones y enlaces.
            'acentoVerde' => '#16c79a',     // Detalles y confirmaciones.
            'fondoAlterno' => '#f5f7fa',    // Secciones a franjas.
        ];
    }

    private static function imagenes(): array
    {
        return [
            // Imagen de respaldo del hero y póster del vídeo.
            'hero' => 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1920&q=80',
            // Vídeo de fondo del hero, en bucle y sin sonido.
            'heroVideo' => 'https://videos.pexels.com/video-files/3192198/3192198-hd_1920_1080_25fps.mp4',
            'nosotros' => 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1100&q=80',
            'llamadaAccion' => 'https://images.unsplash.com/photo-1471295253337-3ceaaedca402?auto=format&fit=crop&w=1920&q=80',
        ];
    }

    private static function contacto(): array
    {
        return [
            'email' => 'info@tssports.com',
            'whatsapp' => '+57 320 4325231',
            'instagram' => '',
            'linkedin' => '',
        ];
    }

    /**
     * Textos de la web en español. Las claves usan notación por puntos
     * (seccion.elemento) porque así se agrupan solas en el panel.
     */
    private static function textosEnEspanol(): array
    {
        return [
            'nav.nosotros' => 'Nosotros',
            'nav.equipo' => 'Equipo',
            'nav.servicios' => 'Servicios',
            'nav.proyectos' => 'Proyectos',
            'nav.aliados' => 'Aliados',
            'nav.contacto' => 'Contacto',

            'hero.antetitulo' => 'CONSULTORÍA ESTRATÉGICA DEPORTIVA',
            'hero.titulo' => 'El deporte es nuestra pasión. La innovación, nuestro talento.',
            'hero.subtitulo' => 'Diseñamos y ejecutamos estrategias de marketing, patrocinios y eventos que conectan marcas con la emoción del deporte.',
            'hero.prefijoExperto' => 'Expertos en',
            'hero.palabrasRotativas' => 'Marketing,Patrocinios,Eventos,eSports,Derechos de medios',
            'hero.botonPrimario' => 'Nuestros servicios',
            'hero.botonSecundario' => 'Hablemos',

            'metricas.anios' => 'Años de experiencia',
            'metricas.marcas' => 'Marcas aliadas',
            'metricas.areas' => 'Áreas de servicio',
            'metricas.pasion' => 'Pasión por el deporte',
            'metricas.valor1' => '20+',
            'metricas.valor2' => '17+',
            'metricas.valor3' => '6',
            'metricas.valor4' => '100%',

            'nosotros.antetitulo' => 'QUIÉNES SOMOS',
            'nosotros.titulo' => 'Más de 20 años convirtiendo el deporte en oportunidades de negocio',
            'nosotros.parrafo1' => 'Somos una agencia independiente de consultoría estratégica. Nuestro equipo multidisciplinario combina experiencia en educación, ventas, marketing, comunicación y medios para crear soluciones a la medida.',
            'nosotros.parrafo2' => 'Acompañamos a marcas, ligas, clubes y propiedades deportivas en cada etapa: desde la estrategia y la activación, hasta la medición de resultados. Innovación, datos y creatividad en cada proyecto.',
            'nosotros.valor1Titulo' => 'Estrategia',
            'nosotros.valor1Texto' => 'Planes basados en datos y objetivos claros.',
            'nosotros.valor2Titulo' => 'Creatividad',
            'nosotros.valor2Texto' => 'Ideas que generan conversación y comunidad.',
            'nosotros.valor3Titulo' => 'Ejecución',
            'nosotros.valor3Texto' => 'Operación impecable de principio a fin.',
            'nosotros.valor4Titulo' => 'Resultados',
            'nosotros.valor4Texto' => 'Medición de ROI y mejora continua.',

            'equipo.antetitulo' => 'NUESTRO EQUIPO',
            'equipo.titulo' => 'Las personas detrás de TS Sports',
            'equipo.unirseTitulo' => '¿Te gustaría unirte al equipo?',
            'equipo.unirseTexto' => 'Envíanos tu información junto con tu CV.',
            'equipo.unirseBoton' => 'Escríbenos',

            'servicios.antetitulo' => 'NUESTROS SERVICIOS',
            'servicios.titulo' => 'Soluciones integrales para el negocio del deporte',

            'franja.titulo' => 'Convertimos la pasión por el deporte en resultados de negocio',
            'franja.texto' => 'Estrategia, creatividad y ejecución para marcas que quieren jugar en las grandes ligas.',
            'franja.boton' => 'Comencemos',

            'proyectos.antetitulo' => 'NUESTRO TRABAJO',
            'proyectos.titulo' => 'Proyectos que dejan huella',
            'proyectos.cita' => '"Un equipo que entiende el negocio del deporte y lo ejecuta con pasión. Resultados claros y una relación de confianza."',
            'proyectos.citaAutor' => '— Dirección, organización deportiva aliada',

            'aliados.antetitulo' => 'NUESTROS ALIADOS',
            'aliados.titulo' => 'Marcas que confían en nosotros',

            'contacto.antetitulo' => 'CONTACTO',
            'contacto.titulo' => '¿Listo para llevar tu marca al siguiente nivel?',
            'contacto.parrafo' => 'Cuéntanos sobre tu proyecto y diseñaremos una estrategia a tu medida.',
            'contacto.etiquetaEmail' => 'Email',
            'contacto.etiquetaRedes' => 'Redes',
            'contacto.botonWhatsapp' => 'Escríbenos por WhatsApp',

            'whatsapp.antetitulo' => 'RESPUESTA RÁPIDA',
            'whatsapp.titulo' => '¿Prefieres hablar directo?',
            'whatsapp.texto' => 'Escríbenos por WhatsApp y te asesoramos al instante, sin compromiso.',

            'formulario.nombre' => 'Nombre',
            'formulario.email' => 'Email',
            'formulario.empresa' => 'Empresa o marca',
            'formulario.telefono' => 'Teléfono',
            'formulario.mensaje' => 'Mensaje',
            'formulario.enviar' => 'Enviar mensaje',
            'formulario.exito' => '¡Gracias! Hemos recibido tu mensaje y te responderemos muy pronto.',

            'pie.lema' => 'Marketing & consultoría deportiva.',
            'pie.derechos' => 'Todos los derechos reservados.',
        ];
    }

    /** Los mismos textos en inglés; las claves deben coincidir una a una. */
    private static function textosEnIngles(): array
    {
        return [
            'nav.nosotros' => 'About',
            'nav.equipo' => 'Team',
            'nav.servicios' => 'Services',
            'nav.proyectos' => 'Projects',
            'nav.aliados' => 'Partners',
            'nav.contacto' => 'Contact',

            'hero.antetitulo' => 'STRATEGIC SPORTS CONSULTING',
            'hero.titulo' => 'Sport is our passion. Innovation is our talent.',
            'hero.subtitulo' => 'We design and deliver marketing, sponsorship and event strategies that connect brands with the emotion of sport.',
            'hero.prefijoExperto' => 'Experts in',
            'hero.palabrasRotativas' => 'Marketing,Sponsorships,Events,eSports,Media rights',
            'hero.botonPrimario' => 'Our services',
            'hero.botonSecundario' => "Let's talk",

            'metricas.anios' => 'Years of experience',
            'metricas.marcas' => 'Partner brands',
            'metricas.areas' => 'Service areas',
            'metricas.pasion' => 'Passion for sport',
            'metricas.valor1' => '20+',
            'metricas.valor2' => '17+',
            'metricas.valor3' => '6',
            'metricas.valor4' => '100%',

            'nosotros.antetitulo' => 'WHO WE ARE',
            'nosotros.titulo' => '20+ years turning sport into business opportunities',
            'nosotros.parrafo1' => 'We are an independent strategic consulting agency. Our multidisciplinary team blends expertise in education, sales, marketing, communications and media to craft tailor-made solutions.',
            'nosotros.parrafo2' => 'We support brands, leagues, clubs and sports properties at every stage: from strategy and activation to results measurement. Innovation, data and creativity in every project.',
            'nosotros.valor1Titulo' => 'Strategy',
            'nosotros.valor1Texto' => 'Plans built on data and clear objectives.',
            'nosotros.valor2Titulo' => 'Creativity',
            'nosotros.valor2Texto' => 'Ideas that spark conversation and community.',
            'nosotros.valor3Titulo' => 'Execution',
            'nosotros.valor3Texto' => 'Flawless operations from start to finish.',
            'nosotros.valor4Titulo' => 'Results',
            'nosotros.valor4Texto' => 'ROI measurement and continuous improvement.',

            'equipo.antetitulo' => 'OUR TEAM',
            'equipo.titulo' => 'The people behind TS Sports',
            'equipo.unirseTitulo' => 'Would you like to join the team?',
            'equipo.unirseTexto' => 'Send us your details along with your resume.',
            'equipo.unirseBoton' => 'Write us',

            'servicios.antetitulo' => 'OUR SERVICES',
            'servicios.titulo' => 'End-to-end solutions for the business of sport',

            'franja.titulo' => 'We turn passion for sport into business results',
            'franja.texto' => 'Strategy, creativity and execution for brands that want to play in the big leagues.',
            'franja.boton' => "Let's start",

            'proyectos.antetitulo' => 'OUR WORK',
            'proyectos.titulo' => 'Projects that leave a mark',
            'proyectos.cita' => '"A team that understands the business of sport and delivers it with passion. Clear results and a relationship built on trust."',
            'proyectos.citaAutor' => '— Management, partner sports organization',

            'aliados.antetitulo' => 'OUR PARTNERS',
            'aliados.titulo' => 'Brands that trust us',

            'contacto.antetitulo' => 'CONTACT',
            'contacto.titulo' => 'Ready to take your brand to the next level?',
            'contacto.parrafo' => "Tell us about your project and we'll design a strategy tailored to you.",
            'contacto.etiquetaEmail' => 'Email',
            'contacto.etiquetaRedes' => 'Social',
            'contacto.botonWhatsapp' => 'Message us on WhatsApp',

            'whatsapp.antetitulo' => 'QUICK REPLY',
            'whatsapp.titulo' => 'Prefer to talk directly?',
            'whatsapp.texto' => "Message us on WhatsApp and we'll help you right away, no strings attached.",

            'formulario.nombre' => 'Name',
            'formulario.email' => 'Email',
            'formulario.empresa' => 'Company or brand',
            'formulario.telefono' => 'Phone',
            'formulario.mensaje' => 'Message',
            'formulario.enviar' => 'Send message',
            'formulario.exito' => 'Thank you! We received your message and will get back to you soon.',

            'pie.lema' => 'Sports marketing & consulting.',
            'pie.derechos' => 'All rights reserved.',
        ];
    }

    /** Tarjetas de servicios; el icono es un carácter tipográfico. */
    private static function servicios(): array
    {
        return [
            [
                'icono' => '✦',
                'es' => ['titulo' => 'Contenido & Estrategia', 'descripcion' => 'Planificación, estrategia creativa, brand content y storytelling para conectar con tu audiencia.'],
                'en' => ['titulo' => 'Content & Strategy', 'descripcion' => 'Planning, creative strategy, brand content and storytelling to connect with your audience.'],
            ],
            [
                'icono' => '◈',
                'es' => ['titulo' => 'Digital & Social Media', 'descripcion' => 'Desarrollo web, gestión de redes sociales y sistemas CRM para impulsar tu presencia digital.'],
                'en' => ['titulo' => 'Digital & Social Media', 'descripcion' => 'Web development, social media management and CRM systems to boost your digital presence.'],
            ],
            [
                'icono' => '◆',
                'es' => ['titulo' => 'Eventos & Proyectos', 'descripcion' => 'Valoración, negociación, gestión de proyectos y producción de eventos deportivos.'],
                'en' => ['titulo' => 'Events & Projects', 'descripcion' => 'Valuation, negotiation, project management and production of sports events.'],
            ],
            [
                'icono' => '▲',
                'es' => ['titulo' => 'eSports', 'descripcion' => 'Planificación, activación de patrocinios y consultoría de marca en el ecosistema de eSports.'],
                'en' => ['titulo' => 'eSports', 'descripcion' => 'Planning, sponsorship activation and brand consulting within the eSports ecosystem.'],
            ],
            [
                'icono' => '●',
                'es' => ['titulo' => 'Derechos de Medios', 'descripcion' => 'Consultoría de derechos, estrategia de valoración y orientación de inversión.'],
                'en' => ['titulo' => 'Media Rights', 'descripcion' => 'Rights consulting, valuation strategy and investment guidance.'],
            ],
            [
                'icono' => '■',
                'es' => ['titulo' => 'Gestión de Patrocinios', 'descripcion' => 'Gestión de portafolio, valoración de propiedades, análisis de activación y medición de ROI.'],
                'en' => ['titulo' => 'Sponsorship Management', 'descripcion' => 'Portfolio management, property valuation, activation analysis and ROI measurement.'],
            ],
        ];
    }

    /** Proyectos destacados; si no hay imagen se usa el degradado. */
    private static function proyectos(): array
    {
        return [
            [
                'imagen' => 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=800&q=80',
                'degradado' => 'linear-gradient(135deg,#0d3b66,#1b6ca8)',
                'es' => ['etiqueta' => 'Liga deportiva', 'titulo' => 'Activación de Liga', 'descripcion' => 'Estrategia integral de patrocinios y contenido para una temporada completa.'],
                'en' => ['etiqueta' => 'Sports league', 'titulo' => 'League Activation', 'descripcion' => 'Comprehensive sponsorship and content strategy for a full season.'],
            ],
            [
                'imagen' => 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=800&q=80',
                'degradado' => 'linear-gradient(135deg,#b91c1c,#f97316)',
                'es' => ['etiqueta' => 'Construcción de marca', 'titulo' => 'Construcción de Marca', 'descripcion' => 'Posicionamiento y narrativa para una marca deportiva emergente.'],
                'en' => ['etiqueta' => 'Brand Building', 'titulo' => 'Brand Building', 'descripcion' => 'Positioning and narrative for an emerging sports brand.'],
            ],
            [
                'imagen' => 'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=800&q=80',
                'degradado' => 'linear-gradient(135deg,#166534,#22c55e)',
                'es' => ['etiqueta' => 'Evento', 'titulo' => 'Producción de Evento', 'descripcion' => 'Organización de principio a fin de un torneo con cobertura multiplataforma.'],
                'en' => ['etiqueta' => 'Event', 'titulo' => 'Event Production', 'descripcion' => 'End-to-end organization of a tournament with multi-platform coverage.'],
            ],
        ];
    }

    /** Miembros del equipo que se muestran en el carrusel. */
    private static function equipo(): array
    {
        return [
            [
                'nombre' => 'Carlos Méndez',
                'foto' => 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=500&h=500&q=75',
                'es' => ['cargo' => 'Director General'],
                'en' => ['cargo' => 'Managing Director'],
            ],
            [
                'nombre' => 'Ana Rodríguez',
                'foto' => 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=500&h=500&q=75',
                'es' => ['cargo' => 'Directora de Estrategia'],
                'en' => ['cargo' => 'Strategy Director'],
            ],
            [
                'nombre' => 'Diego Torres',
                'foto' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&h=500&q=75',
                'es' => ['cargo' => 'Líder de Patrocinios'],
                'en' => ['cargo' => 'Sponsorship Lead'],
            ],
            [
                'nombre' => 'Valentina Ruiz',
                'foto' => 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=500&h=500&q=75',
                'es' => ['cargo' => 'Directora de Contenido'],
                'en' => ['cargo' => 'Content Director'],
            ],
        ];
    }

    /** Logos de aliados; si no hay logo se muestra el nombre como texto. */
    private static function aliados(): array
    {
        return array_map(
            static fn (string $nombre): array => ['nombre' => $nombre, 'logo' => ''],
            ['Atlético', 'Pepsi', 'Copa Air', 'LVBP', 'FVF', 'Gatorade', 'Movistar', 'Nike', 'Coca-Cola', 'Banco', 'Polar', '+ más'],
        );
    }

    /**
     * Fusiona el contenido guardado sobre el de fábrica.
     *
     * Se usa al leer: si el diseño estrena una clave que el contenido
     * guardado todavía no tiene, el visitante ve el valor de fábrica en
     * lugar de un hueco. Reglas:
     *   · Objetos → se combinan clave a clave, en profundidad.
     *   · Listas  → manda la guardada, pero cada elemento hereda los
     *     campos nuevos del elemento por defecto de su misma posición.
     *   · Textos  → una cadena vacía cae al valor de fábrica.
     */
    public static function fusionarConGuardado(mixed $valorPorDefecto, mixed $valorGuardado): mixed
    {
        if ($valorGuardado === null) {
            return $valorPorDefecto;
        }

        $ambosSonListas = is_array($valorPorDefecto) && is_array($valorGuardado)
            && array_is_list($valorPorDefecto) && array_is_list($valorGuardado);

        if ($ambosSonListas) {
            return array_map(
                static fn (mixed $elementoGuardado, int $posicion): mixed => self::fusionarConGuardado(
                    $valorPorDefecto[$posicion] ?? null,
                    $elementoGuardado,
                ),
                $valorGuardado,
                array_keys($valorGuardado),
            );
        }

        $ambosSonObjetos = is_array($valorPorDefecto) && is_array($valorGuardado)
            && ! array_is_list($valorPorDefecto) && ! array_is_list($valorGuardado);

        if ($ambosSonObjetos) {
            $resultado = $valorPorDefecto;

            foreach ($valorGuardado as $clave => $valor) {
                $resultado[$clave] = self::fusionarConGuardado($valorPorDefecto[$clave] ?? null, $valor);
            }

            return $resultado;
        }

        // Hoja: una cadena vacía significa "usa el valor de fábrica".
        if ($valorGuardado === '' && is_string($valorPorDefecto) && $valorPorDefecto !== '') {
            return $valorPorDefecto;
        }

        return $valorGuardado;
    }

    /**
     * Atajo de lectura: el contenido guardado, completado con lo que
     * falte del contenido de fábrica.
     */
    public static function completar(array $contenidoGuardado): array
    {
        /** @var array<string,mixed> $fusionado */
        $fusionado = self::fusionarConGuardado(self::comoArreglo(), $contenidoGuardado);

        return $fusionado;
    }
}
