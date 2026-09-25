<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Conversacion;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoConversacion — una charla en la lista de quien la pide.
 * ---------------------------------------------------------------------
 * Viene todo resuelto del servidor, para que la interfaz no calcule
 * nada que ya se sabe aquí:
 *
 *   · `nombre`: el del grupo, o en una directa el de la otra persona.
 *   · `sinLeer`: cuántos mensajes de otros hay después de lo último que
 *     esta persona leyó. Lo cuenta la consulta del controlador, de una
 *     vez para todas las charlas (atributo `total_sin_leer`).
 *   · `leidoPorLosDemasHasta`: hasta qué mensaje han leído TODOS los
 *     demás. Es lo que enciende el doble check de «visto» en los
 *     mensajes propios; en un grupo, cuando lo ha visto el último.
 *
 * @mixin Conversacion
 */
class RecursoConversacion extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        /** @var User $lector */
        $lector = $peticion->user();

        $participantes = $this->participantes;
        $losDemas = $participantes->reject(fn (User $persona): bool => $persona->id === $lector->id);
        $yo = $participantes->firstWhere('id', $lector->id);

        $ultimoMensaje = $this->ultimoMensaje;

        return [
            'id' => $this->id,
            'tipo' => $this->tipo,
            'esGrupo' => $this->esGrupo(),
            'nombre' => $this->esGrupo()
                ? (string) $this->nombre
                : ($losDemas->first()?->nombreParaMostrar() ?? 'Charla sin nadie más'),
            'participantes' => RecursoPersonaDelChat::collection($participantes->values())->resolve($peticion),
            'ultimoMensaje' => $ultimoMensaje === null ? null : [
                'id' => $ultimoMensaje->id,
                'autorNombre' => $ultimoMensaje->autor_nombre,
                'esMio' => $ultimoMensaje->autor_id === $lector->id,
                'esDeSistema' => $ultimoMensaje->esDeSistema(),
                // En texto corrido, con las marcas como «#Nombre».
                'texto' => $ultimoMensaje->textoPlano(),
                'creadoEn' => $ultimoMensaje->created_at?->toIso8601String(),
            ],
            'sinLeer' => (int) ($this->getAttribute('total_sin_leer') ?? 0),
            'miUltimoLeidoId' => (int) ($yo?->pivot?->ultimo_leido_id ?? 0),
            'leidoPorLosDemasHasta' => (int) ($losDemas->min(fn (User $persona): int => (int) $persona->pivot->ultimo_leido_id) ?? 0),
            'creadaEn' => $this->created_at?->toIso8601String(),
        ];
    }
}
