<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Propiedad;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\MovimientoDeLasPropiedades;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * MovimientoDePropiedadesController — Propiedades › Movimiento y Cruce.
 * ---------------------------------------------------------------------
 * Desde el 2026-11-05. Sirve las tres lecturas que arma
 * MovimientoDeLasPropiedades: el ranking, la ficha de una propiedad y el
 * cruce de marcas y propiedades. Aquí solo se autoriza y se anota.
 *
 * LO VEN ADMIN Y COMERCIAL (`UserPolicy::verMovimientoDeLasPropiedades`):
 * las tres enseñan las marcas de todo el equipo con sus importes. Al
 * agente se le responde 403, aunque la pantalla del catálogo la siga
 * viendo como siempre.
 *
 * LA EXPORTACIÓN VA APARTE y queda en la auditoría, como el Excel del
 * tablero (regla 28): saca del sistema marcas e importes. Devuelve lo
 * mismo que la vista que se está mirando, con los mismos filtros, y el
 * navegador arma la hoja con esa respuesta.
 */
class MovimientoDePropiedadesController extends Controller
{
    /** Las vistas que se pueden exportar. */
    private const VISTAS = ['ranking', 'cruce', 'ficha'];

    /**
     * GET /api/propiedades/movimiento?orden=calientes
     */
    public function ranking(Request $peticion): JsonResponse
    {
        $this->authorize('verMovimientoDeLasPropiedades', User::class);

        return response()->json(
            MovimientoDeLasPropiedades::para($peticion->user())
                ->ranking((string) $peticion->query('orden', '')),
        );
    }

    /**
     * GET /api/propiedades/movimiento/cruce?estado=caliente&agente=…&orden=pronostico
     */
    public function cruce(Request $peticion): JsonResponse
    {
        $this->authorize('verMovimientoDeLasPropiedades', User::class);

        return response()->json($this->datosDelCruce($peticion));
    }

    /**
     * GET /api/propiedades/{propiedad}/movimiento
     */
    public function ficha(Request $peticion, Propiedad $propiedad): JsonResponse
    {
        $this->authorize('verMovimientoDeLasPropiedades', User::class);

        return response()->json(MovimientoDeLasPropiedades::para($peticion->user())->ficha($propiedad));
    }

    /**
     * GET /api/propiedades/movimiento/exportacion?vista=ranking|cruce|ficha
     *
     * Con `vista=ficha` lleva `propiedad`; con `cruce`, los filtros de la
     * pantalla. Lo anotado dice qué se sacó.
     */
    public function exportar(Request $peticion): JsonResponse
    {
        $this->authorize('verMovimientoDeLasPropiedades', User::class);

        $datos = $peticion->validate(
            [
                'vista' => ['required', 'in:'.implode(',', self::VISTAS)],
                'propiedad' => ['required_if:vista,ficha', 'nullable', 'uuid', 'exists:propiedades,id'],
            ],
            [
                'vista.*' => 'Indica qué vista se exporta: el ranking, el cruce o la ficha de una propiedad.',
                'propiedad.*' => 'Indica qué propiedad se exporta.',
            ],
        );

        /** @var User $quienExporta */
        $quienExporta = $peticion->user();
        $movimiento = MovimientoDeLasPropiedades::para($quienExporta);

        [$contenido, $descripcion, $idDeLaPropiedad] = match ($datos['vista']) {
            'ranking' => [
                $movimiento->ranking((string) $peticion->query('orden', '')),
                'Exportó el movimiento de las propiedades a Excel',
                null,
            ],
            'cruce' => [
                $this->datosDelCruce($peticion, $movimiento),
                'Exportó el cruce de marcas y propiedades a Excel',
                null,
            ],
            'ficha' => (function () use ($movimiento, $datos): array {
                $propiedad = Propiedad::query()->findOrFail($datos['propiedad']);

                return [$movimiento->ficha($propiedad), 'Exportó las marcas de '.$propiedad->nombre.' a Excel', $propiedad->id];
            })(),
        };

        RegistroActividad::anotar(
            $quienExporta,
            RegistroActividad::ACCION_EXPORTO,
            'propiedad',
            $idDeLaPropiedad,
            $descripcion,
            ['filtros' => array_filter($peticion->only(['vista', 'orden', 'estado', 'agente']), fn ($valor) => $valor !== null && $valor !== '')],
        );

        return response()->json([...$contenido, 'generadoEn' => now()->toIso8601String()]);
    }

    /**
     * @return array<string, mixed>
     */
    private function datosDelCruce(Request $peticion, ?MovimientoDeLasPropiedades $movimiento = null): array
    {
        $movimiento ??= MovimientoDeLasPropiedades::para($peticion->user());

        return $movimiento->cruce(
            $peticion->query('estado'),
            $peticion->query('agente'),
            (string) $peticion->query('orden', ''),
        );
    }
}
