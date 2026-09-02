<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Campana;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoCampana — cómo se ve una campaña desde el frontend.
 * ---------------------------------------------------------------------
 * `estaVigente` viaja calculada del servidor porque depende de la fecha
 * de hoy: si la calculara el navegador, un portátil con el reloj mal
 * puesto enseñaría como cerrada una campaña que sigue abierta.
 *
 * @mixin Campana
 */
class RecursoCampana extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        $usuarioQueConsulta = $peticion->user();

        return [
            'id' => $this->id,
            'nombre' => $this->nombre,
            'descripcion' => $this->descripcion,
            'color' => $this->color,

            'fechaInicio' => $this->fecha_inicio?->toDateString(),
            'fechaFin' => $this->fecha_fin?->toDateString(),

            'orden' => $this->orden,
            'activa' => $this->activa,
            'estaVigente' => $this->estaVigente(),

            // Cuántas marcas se están trabajando dentro de la campaña.
            // Solo viaja si el controlador cargó el contador.
            'totalMarcas' => $this->whenCounted('marcas'),

            'puedoEditarla' => $usuarioQueConsulta?->can('update', $this->resource) ?? false,
            'puedoEliminarla' => $usuarioQueConsulta?->can('delete', $this->resource) ?? false,

            'creadaEn' => $this->created_at?->toIso8601String(),
            'actualizadaEn' => $this->updated_at?->toIso8601String(),
        ];
    }
}
