<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Sector;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoSector — un rubro del catálogo, visto desde el cliente.
 * ---------------------------------------------------------------------
 * Lleva cuántas marcas están clasificadas en él, que es el dato con el
 * que se decide si un sector se puede borrar o solo desactivar. Se
 * calcula por el nombre, porque es lo que guarda la marca.
 *
 * @mixin Sector
 */
class RecursoSector extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        unset($peticion);

        return [
            'id' => $this->id,
            'nombre' => $this->nombre,
            'orden' => $this->orden,
            'activo' => $this->activo,
            // El listado lo trae ya calculado para todos de una vez;
            // en el alta y la edición, que devuelven uno solo, se cuenta
            // aquí. `??` y no `?:` porque un cero es un total válido.
            'totalMarcas' => $this->total_marcas ?? $this->totalDeMarcas(),
        ];
    }
}
