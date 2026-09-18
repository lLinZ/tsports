<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Notificacion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoNotificacion — un aviso tal como lo ve la campanita.
 * ---------------------------------------------------------------------
 * Es también lo que viaja por el WebSocket cuando el aviso se empuja en
 * vivo (`App\Events\NotificacionNueva`), así que la interfaz recibe la
 * misma forma por los dos caminos.
 *
 * El enlace viene resuelto: la interfaz lo sigue tal cual.
 *
 * @mixin Notificacion
 */
class RecursoNotificacion extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        unset($peticion);

        return [
            'id' => $this->id,
            'tipo' => $this->tipo,
            'titulo' => $this->titulo,
            'cuerpo' => $this->cuerpo,
            'enlace' => $this->enlaceEnElPanel(),
            'leida' => $this->estaLeida(),
            'creadaEn' => $this->created_at?->toIso8601String(),
        ];
    }
}
