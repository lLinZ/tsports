<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Recordatorio;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoRecordatorio — cómo se ve un recordatorio desde el panel.
 * ---------------------------------------------------------------------
 * Lleva resuelto lo que la interfaz no debe decidir por su cuenta:
 *
 *   · `cuando` → vencido, hoy o próximo, con el día de Caracas.
 *   · `esMio`  → si es de quien pregunta (en la ficha salen los de todos).
 *   · `puedoCambiarlo` → si puede cumplirlo, posponerlo o borrarlo; es el
 *     mismo permiso que editar su marca, y la interfaz apaga los botones
 *     con esto en vez de comparar roles.
 *
 * La marca viaja con nombre y logo solo si se cargó: en la ficha ya se
 * sabe de qué marca es; en el panel hace falta para reconocerla.
 *
 * @mixin Recordatorio
 */
class RecursoRecordatorio extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        $quienPregunta = $peticion->user();

        return [
            'id' => $this->id,
            'fecha' => $this->fecha->format('Y-m-d'),
            'cuando' => $this->cuando(),
            'diasHasta' => $this->diasHasta(),
            'nota' => $this->nota,

            'personaId' => $this->persona_id,
            'personaNombre' => $this->whenLoaded('persona', fn () => $this->persona?->nombreParaMostrar()),
            'esMio' => $quienPregunta?->id === $this->persona_id,
            'creadoPorNombre' => $this->creado_por_nombre,

            'cumplido' => $this->estaCumplido(),
            'cumplidoEn' => $this->cumplido_en?->toIso8601String(),
            'cumplidoPorNombre' => $this->cumplido_por_nombre,

            'marca' => $this->whenLoaded('marca', fn () => [
                'id' => $this->marca->id,
                'nombre' => $this->marca->nombre_marca,
                'logoUrl' => $this->marca->logo_url,
            ]),

            'puedoCambiarlo' => $this->whenLoaded(
                'marca',
                fn () => $quienPregunta?->can('update', $this->marca) ?? false,
                false,
            ),
        ];
    }
}
