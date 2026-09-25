<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use App\Support\Presencia;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoPersonaDelChat — alguien del equipo tal y como lo ve el chat.
 * ---------------------------------------------------------------------
 * Lo justo para reconocerle y saber si está: nombre, papel, su color de
 * perfil (el mismo de su avatar en la barra superior) y si está en
 * línea. Nada de correo ni de zona: el chat no los necesita, y esta
 * lista la recibe todo el equipo, agentes incluidos.
 *
 * @mixin User
 */
class RecursoPersonaDelChat extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        unset($peticion); // Se ve igual para todos.

        return [
            'id' => $this->id,
            'nombre' => $this->nombreParaMostrar(),
            'rolEtiqueta' => $this->rol->etiqueta(),
            'colorAcento' => $this->color_acento,
            'urlAvatar' => $this->url_avatar,
            'activo' => (bool) $this->activo,
            'enLinea' => Presencia::estaEnLinea($this->resource),
            'vistoPorUltimaVezEn' => $this->visto_por_ultima_vez_en?->toIso8601String(),
        ];
    }
}
