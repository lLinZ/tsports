<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoPersonaMencionable — alguien a quien se puede etiquetar en la
 * bitácora de una marca.
 * ---------------------------------------------------------------------
 * Deliberadamente escueto: id, nombre y rol para poder distinguir a dos
 * personas que se llamen igual. Nada de correo, ni de zona, ni del resto
 * de la ficha de la cuenta.
 *
 * El motivo es que esta lista la ve cualquiera que pueda comentar una
 * marca, incluido un agente, y un agente no tiene por qué conocer los
 * datos de contacto del equipo solo porque quiera etiquetar a alguien.
 *
 * @mixin User
 */
class RecursoPersonaMencionable extends JsonResource
{
    /**
     * @return array<string,string>
     */
    public function toArray(Request $peticion): array
    {
        unset($peticion);

        return [
            'id' => $this->id,
            'nombre' => $this->nombreParaMostrar(),
            'rolEtiqueta' => $this->rol->etiqueta(),
        ];
    }
}
