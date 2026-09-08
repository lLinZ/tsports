<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\InversionEnPatrocinios;
use App\Enums\RolUsuario;
use App\Enums\TemaInterfaz;
use App\Models\Propiedad;
use App\Models\Sector;

/**
 * CatalogosDelCrm — listas cerradas que comparten backend y frontend.
 * ---------------------------------------------------------------------
 * Zonas, sectores y vías de contacto son listas que el negocio revisa de
 * vez en cuando. Estaban duplicadas en tres ficheros JavaScript de la
 * versión anterior, así que al añadir una zona había que acordarse de
 * tocarlas todas.
 *
 * Aquí son la única fuente de verdad: el endpoint GET /api/catalogos las
 * sirve al frontend, que las usa para pintar los selectores. Para añadir
 * una zona nueva basta con tocar este fichero.
 */
final class CatalogosDelCrm
{
    /** Zonas geográficas en las que se reparte el equipo comercial. */
    public const ZONAS = [
        'Caracas',
        'Centro',
        'Lara',
        'Andes-Zulia',
        'Oriente',
    ];

    /**
     * Los sectores DE PARTIDA, y solo eso.
     *
     * Desde el 2026-09-08 los rubros viven en la tabla `sectores` y se
     * gestionan desde el panel: el equipo necesitaba añadir uno sin
     * esperar a un despliegue. Esta lista se quedó porque es la que
     * siembra el catálogo la primera vez (`SectoresInicialesSeeder`).
     *
     * NO se use para validar ni para pintar un selector: para eso están
     * `Sector::nombresAdmitidos()` y `Sector::nombresActivos()`, que sí
     * saben de los que el equipo haya añadido después.
     */
    public const SECTORES_INICIALES = [
        'Alimentos',
        'Bebidas',
        'Telecomunicaciones',
        'Banca y finanzas',
        'Retail',
        'Automotriz',
        'Tecnología',
        'Salud',
        'Educación',
        'Deportes',
        'Entretenimiento',
        'Otro',
    ];

    /** Dónde se detectó la marca por primera vez (acciones BTL). */
    public const VIAS_DE_PROSPECCION = [
        'Instagram',
        'Supermercado',
        'Valla local',
        'Radio',
        'Evento local',
        'Otro',
    ];

    /** Cómo se hizo el primer contacto real con la marca. */
    public const VIAS_DE_APROXIMACION = [
        'Conocido',
        'WhatsApp',
        'Otro',
    ];

    /**
     * Colores que un usuario puede elegir como acento de su perfil.
     * Se guardan en hexadecimal y el frontend los convierte a la rampa
     * completa de HeroUI (ver src/theme/colorAcento.ts).
     */
    public const COLORES_DE_ACENTO = [
        ['nombre' => 'Turquesa', 'hex' => '#1b9aaa'],
        ['nombre' => 'Océano',   'hex' => '#2563eb'],
        ['nombre' => 'Violeta',  'hex' => '#7c3aed'],
        ['nombre' => 'Magenta',  'hex' => '#db2777'],
        ['nombre' => 'Coral',    'hex' => '#f0533f'],
        ['nombre' => 'Ámbar',    'hex' => '#f59e0b'],
        ['nombre' => 'Esmeralda','hex' => '#16c79a'],
        ['nombre' => 'Grafito',  'hex' => '#475569'],
    ];

    /**
     * Empaqueta todos los catálogos para el endpoint que consume el
     * frontend al arrancar.
     */
    public static function comoArreglo(): array
    {
        return [
            'zonas' => self::ZONAS,

            // Reparto por defecto entre la agencia y la propiedad, para
            // que el formulario de un producto IOP no lo lleve escrito a
            // mano y pueda cambiarse desde el modelo Propiedad.
            'porcentajeForecastPorDefecto' => Propiedad::PORCENTAJE_FORECAST_POR_DEFECTO,
            // Salen de la tabla, no de la constante: son los que el
            // equipo tenga hoy, incluidos los que haya añadido.
            'sectores' => Sector::nombresActivos(),
            'viasDeProspeccion' => self::VIAS_DE_PROSPECCION,
            'viasDeAproximacion' => self::VIAS_DE_APROXIMACION,
            'coloresDeAcento' => self::COLORES_DE_ACENTO,
            'roles' => array_map(
                static fn (RolUsuario $rol) => [
                    'valor' => $rol->value,
                    'etiqueta' => $rol->etiqueta(),
                ],
                RolUsuario::cases()
            ),
            'temas' => array_map(
                static fn (TemaInterfaz $tema) => [
                    'valor' => $tema->value,
                    'etiqueta' => $tema->etiqueta(),
                ],
                TemaInterfaz::cases()
            ),
            'opcionesDeInversion' => array_map(
                static fn (InversionEnPatrocinios $opcion) => [
                    'valor' => $opcion->value,
                    'etiqueta' => $opcion->etiqueta(),
                ],
                InversionEnPatrocinios::cases()
            ),
        ];
    }
}
