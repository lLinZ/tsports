<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ComentarioMarca;
use App\Models\ReaccionDeComentario;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoComentarioMarca — una entrada de la bitácora vista por el cliente.
 * ---------------------------------------------------------------------
 * Las banderas `puedeEditarlo` y `puedeBorrarlo` vienen RESUELTAS del
 * servidor para que la interfaz no compare roles ni autores: enseña los
 * botones que le digan y punto. El servidor lo vuelve a comprobar al
 * recibir la petición, así que esconderlos es cortesía, no seguridad.
 *
 * LAS REACCIONES VIAJAN AGRUPADAS por emoji, con el total y si la
 * persona que mira está dentro. Mandar la lista cruda de filas obligaría
 * a que cada pantalla las contara por su cuenta, y contar en el
 * navegador algo que el servidor ya sabe es justo lo que este proyecto
 * no hace.
 *
 * UNA ENTRADA ELIMINADA SIGUE SALIENDO, sin texto y diciendo quién la
 * quitó y cuándo. Es lo que hace que el histórico exportado valga como
 * registro: si las entradas borradas desaparecieran, cualquiera podría
 * limpiar la conversación antes de exportarla.
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
            'comentarioPadreId' => $this->comentario_padre_id,

            'autorId' => $this->autor_id,
            'autorNombre' => $this->autor_nombre ?? 'Usuario dado de baja',

            'cuerpo' => $this->cuerpo,

            'eliminado' => $this->estaEliminado(),
            'eliminadoPorNombre' => $this->eliminado_por_nombre,
            'eliminadoEn' => $this->eliminado_en?->toIso8601String(),

            // Null mientras no se haya tocado: la interfaz solo pinta
            // «editado» cuando de verdad lo está.
            'editadoEn' => $this->editado_en?->toIso8601String(),

            'reacciones' => $this->reaccionesAgrupadas($usuarioQueConsulta),
            'mencionados' => $this->personasMencionadas(),

            // Solo las entradas raíz traen respuestas; las respuestas no
            // anidan (un solo nivel, ver la migración).
            'respuestas' => $this->esUnaRespuesta()
                ? []
                : self::collection($this->whenLoaded('respuestas')),

            'puedeEditarlo' => $usuarioQueConsulta !== null
                && $this->puedeEditarlo($usuarioQueConsulta),
            'puedeBorrarlo' => $usuarioQueConsulta !== null
                && $this->puedeBorrarlo($usuarioQueConsulta),

            'creadoEn' => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * Las reacciones por emoji, con cuántas hay, quiénes y si estoy yo.
     *
     * `quienes` es lo que se enseña al pasar por encima («Ana, Luis y 2
     * más»). Son nombres de gente del equipo dentro de una marca que
     * quien mira ya puede ver, así que no descubre nada nuevo.
     *
     * @return list<array<string,mixed>>
     */
    private function reaccionesAgrupadas(?User $usuarioQueConsulta): array
    {
        return $this->reacciones
            ->groupBy('emoji')
            ->map(fn ($delMismoEmoji, string $emoji): array => [
                'emoji' => $emoji,
                'total' => $delMismoEmoji->count(),
                'laMia' => $usuarioQueConsulta !== null
                    && $delMismoEmoji->contains(
                        fn (ReaccionDeComentario $reaccion): bool => $reaccion->usuario_id === $usuarioQueConsulta->id,
                    ),
                'quienes' => $delMismoEmoji
                    ->map(fn (ReaccionDeComentario $reaccion): string => $reaccion->usuario?->nombreParaMostrar() ?? 'Alguien')
                    ->values()
                    ->all(),
            ])
            // Las más puestas primero, y a igualdad por emoji, para que
            // el orden no baile entre recargas.
            ->sortByDesc(fn (array $grupo): string => str_pad((string) $grupo['total'], 4, '0', STR_PAD_LEFT).$grupo['emoji'])
            ->values()
            ->all();
    }

    /**
     * @return list<array<string,string>>
     */
    private function personasMencionadas(): array
    {
        return $this->mencionados
            ->map(fn (User $persona): array => [
                'id' => $persona->id,
                'nombre' => $persona->nombreParaMostrar(),
            ])
            ->values()
            ->all();
    }
}
