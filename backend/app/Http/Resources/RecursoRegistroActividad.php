<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\RegistroActividad;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoRegistroActividad — una línea del historial de auditoría.
 * ---------------------------------------------------------------------
 * La descripción viene ya redactada desde el servidor para que la
 * interfaz solo tenga que pintarla; los metadatos llevan el detalle de
 * qué campos cambiaron, por si se quiere desplegar.
 *
 * @mixin RegistroActividad
 */
class RecursoRegistroActividad extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        unset($peticion);

        return [
            'id' => $this->id,
            'usuarioId' => $this->usuario_id,
            'usuarioNombre' => $this->usuario_nombre ?? 'Sistema',
            'accion' => $this->accion,
            'entidadTipo' => $this->entidad_tipo,
            'entidadId' => $this->entidad_id,
            'descripcion' => $this->descripcion,
            'metadatos' => $this->metadatos,
            'creadoEn' => $this->created_at?->toIso8601String(),
        ];
    }
}
