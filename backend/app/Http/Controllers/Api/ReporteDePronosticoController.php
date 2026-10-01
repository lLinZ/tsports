<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\PropiedadDeMarca;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * ReporteDePronosticoController — en qué marcas está el pronóstico.
 * ---------------------------------------------------------------------
 * Desde el 2026-10-01. La pantalla de Propiedades enseña «Pronosticado
 * por el equipo (OVP)» como una sola cifra, y Antonio preguntó en qué
 * marcas estaba esa plata: el panel solo la repartía por propiedad, y
 * para saberlo había que entrar en cada una.
 *
 * Devuelve el mismo dinero leído de dos maneras:
 *
 *   · `porMarca`     → cada marca con su total y, dentro, lo que se le
 *                      pronostica en cada propiedad.
 *   · `porPropiedad` → cada propiedad con las marcas que la tienen con
 *                      pronóstico. Es la hoja del catálogo con los logos
 *                      de cada evento, que se va llenando según se anotan
 *                      pronósticos en las fichas.
 *
 * Solo cuentan las líneas del checklist con OVP mayor que cero: una
 * marca a la que se le ofrece una propiedad sin cifra todavía no tiene
 * dinero en ninguna parte. El total coincide con el de la pantalla de
 * Propiedades, que suma TODAS las líneas, también las de propiedades
 * desactivadas (esas salen marcadas).
 *
 * LO QUE VE CADA QUIEN es lo que ve en el tablero (regla 6): la agencia
 * entera admin y comercial, su cartera el agente. Al agente no se le
 * manda nada de marcas ajenas, ni sumado en los totales. No lleva el
 * MTP ni la meta de ninguna propiedad: son cifras de la agencia, y aquí
 * no hacen falta para contestar la pregunta.
 */
class ReporteDePronosticoController extends Controller
{
    /**
     * GET /api/reportes/pronostico
     */
    public function porMarca(Request $peticion): JsonResponse
    {
        $this->authorize('viewAny', Marca::class);

        /** @var User $usuario */
        $usuario = $peticion->user();
        $veTodas = $usuario->rol->veTodasLasMarcas();

        $lineas = PropiedadDeMarca::query()
            ->where('ovp_usd', '>', 0)
            ->when(! $veTodas, fn ($consulta) => $consulta->whereIn(
                'marca_id',
                Marca::query()->quePuedeVer($usuario)->select('id'),
            ))
            ->with([
                'marca:id,nombre_marca,logo_url,sector,zona,vendedor_asignado_nombre',
                'propiedad:id,nombre,logo_url,activa,orden',
            ])
            ->get()
            // Una línea cuya marca o propiedad ya no existe no se puede
            // atribuir a nada (no debería quedar ninguna: se borran en
            // cascada).
            ->filter(fn (PropiedadDeMarca $linea): bool => $linea->marca !== null && $linea->propiedad !== null);

        $porMarca = $lineas
            ->groupBy('marca_id')
            ->map(function ($suyas): array {
                $marca = $suyas->first()->marca;

                return [
                    'marcaId' => $marca->id,
                    'nombre' => $marca->nombre_marca,
                    'logoUrl' => $marca->logo_url,
                    'sector' => $marca->sector,
                    'zona' => $marca->zona,
                    'agenteNombre' => $marca->vendedor_asignado_nombre,
                    'ovpUsd' => round((float) $suyas->sum('ovp_usd'), 2),
                    'propiedades' => $suyas
                        ->sortByDesc(fn (PropiedadDeMarca $linea): float => (float) $linea->ovp_usd)
                        ->map(fn (PropiedadDeMarca $linea): array => [
                            'propiedadId' => $linea->propiedad->id,
                            'nombre' => $linea->propiedad->nombre,
                            'activa' => $linea->propiedad->activa,
                            'ovpUsd' => (float) $linea->ovp_usd,
                        ])
                        ->values()
                        ->all(),
                ];
            })
            // Primero donde más dinero hay; a igualdad, por nombre.
            ->sortBy([
                fn (array $una, array $otra): int => $otra['ovpUsd'] <=> $una['ovpUsd'],
                fn (array $una, array $otra): int => strcasecmp($una['nombre'], $otra['nombre']),
            ])
            ->values()
            ->all();

        $lineasPorPropiedad = $lineas->groupBy('propiedad_id');

        // Las activas salen todas, aunque no tengan ninguna marca todavía:
        // en la hoja se ve qué eventos siguen vacíos. Una desactivada solo
        // sale si aún tiene dinero anotado, para que el total cuadre.
        $porPropiedad = Propiedad::query()
            ->enOrdenDeCatalogo()
            ->get(['id', 'nombre', 'logo_url', 'activa', 'orden'])
            ->filter(fn (Propiedad $propiedad): bool => $propiedad->activa || $lineasPorPropiedad->has($propiedad->id))
            ->map(function (Propiedad $propiedad) use ($lineasPorPropiedad): array {
                $suyas = $lineasPorPropiedad->get($propiedad->id, collect());

                return [
                    'propiedadId' => $propiedad->id,
                    'nombre' => $propiedad->nombre,
                    'logoUrl' => $propiedad->logo_url,
                    'activa' => $propiedad->activa,
                    'ovpUsd' => round((float) $suyas->sum('ovp_usd'), 2),
                    'marcas' => $suyas
                        ->sortByDesc(fn (PropiedadDeMarca $linea): float => (float) $linea->ovp_usd)
                        ->map(fn (PropiedadDeMarca $linea): array => [
                            'marcaId' => $linea->marca->id,
                            'nombre' => $linea->marca->nombre_marca,
                            'logoUrl' => $linea->marca->logo_url,
                            'ovpUsd' => (float) $linea->ovp_usd,
                        ])
                        ->values()
                        ->all(),
                ];
            })
            ->values()
            ->all();

        return response()->json([
            'alcance' => $veTodas ? 'empresa' : 'personal',
            'generadoEn' => now()->toIso8601String(),
            'generadoPor' => $usuario->nombreParaMostrar(),
            'resumen' => [
                'totalOvpUsd' => round((float) $lineas->sum('ovp_usd'), 2),
                'totalMarcas' => count($porMarca),
                'totalPropiedades' => $lineasPorPropiedad->count(),
            ],
            'porMarca' => $porMarca,
            'porPropiedad' => $porPropiedad,
        ]);
    }
}
