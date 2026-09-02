<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ComentarioMarca;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoComentarioMarca — una entrada de la bitácora vista por el cliente.
 * ---------------------------------------------------------------------
 * Incluye la bandera `puedeBorrarlo` para que la interfaz muestre el
 * botón de eliminar únicamente a quien de verdad podrá hacerlo: su autor
 * o un administrador.
 *
 * @mixin ComentarioMarca
 */
class RecursoComentarioMarca extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        $usuarioQueConsulta = $peticion->user();

        return [
            'id' => $this->id,
            'marcaId' => $this->marca_id,
            'autorId' => $this->autor_id,
            'autorNombre' => $this->autor_nombre ?? 'Usuario dado de baja',
            'cuerpo' => $this->cuerpo,
            'puedeBorrarlo' => $usuarioQueConsulta !== null
                && $this->puedeBorrarlo($usuarioQueConsulta),
            'creadoEn' => $this->created_at?->toIso8601String(),
        ];
    }
}
