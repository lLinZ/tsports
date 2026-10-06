<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\RolUsuario;
use App\Models\Meta;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * AvanceDeLasMetas — cuánto lleva cada persona de su meta del año.
 * ---------------------------------------------------------------------
 * El avance se mide contra el OVP (lo decidió LinZ el 2026-10-05): la
 * suma de los pronósticos de las marcas que la persona lleva. Es la
 * misma cifra que «Mi pronóstico» del panel y que el forecast por
 * prospector, porque sale de la misma regla: el pronóstico de una marca
 * se le apunta a su agente asignado (regla 11), y al reasignarla se va
 * con ella.
 *
 * El porcentaje lo calcula el servidor y la interfaz lo pinta tal cual,
 * como el resto de porcentajes del sistema. Sin meta no hay porcentaje:
 * se devuelve null y no un cero, que se leería como «no ha vendido nada».
 */
final class AvanceDeLasMetas
{
    /** El año en curso, en el calendario de Caracas (regla 16). */
    public static function anioEnCurso(): int
    {
        return (int) now()->year;
    }

    /**
     * La meta de una persona con su avance, o null si no tiene.
     *
     * @return array<string,mixed>|null
     */
    public static function deLaPersona(User $persona, ?int $anio = null): ?array
    {
        $anio ??= self::anioEnCurso();

        $meta = Meta::query()->where('persona_id', $persona->id)->where('anio', $anio)->first();

        if ($meta === null) {
            return null;
        }

        $ovp = self::ovpPorPersona([$persona->id])->get($persona->id, 0.0);

        return self::comoFila($persona, $meta, $ovp, $anio);
    }

    /**
     * Las del equipo, para quien reparte el trabajo: cada agente activo,
     * y además cualquiera que tenga meta u OVP este año (un comercial que
     * también lleva marcas).
     *
     * Primero quien tiene meta, de más a menos avance; después quien
     * todavía no tiene, por su OVP. Así arriba está la conversación que
     * hay que tener y abajo, las metas que faltan por poner.
     *
     * @return list<array<string,mixed>>
     */
    public static function delEquipo(?int $anio = null): array
    {
        $anio ??= self::anioEnCurso();

        $metas = Meta::query()->where('anio', $anio)->get()->keyBy('persona_id');
        $ovpPorPersona = self::ovpPorPersona();

        return User::query()
            ->where('activo', true)
            ->orderBy('name')
            ->get()
            ->filter(fn (User $persona): bool => $persona->rol === RolUsuario::Vendedor
                || $metas->has($persona->id)
                || $ovpPorPersona->get($persona->id, 0.0) > 0)
            ->map(fn (User $persona): array => self::comoFila(
                $persona,
                $metas->get($persona->id),
                $ovpPorPersona->get($persona->id, 0.0),
                $anio,
            ))
            ->sort(function (array $una, array $otra): int {
                $unaTieneMeta = $una['metaUsd'] !== null;
                $otraTieneMeta = $otra['metaUsd'] !== null;

                if ($unaTieneMeta !== $otraTieneMeta) {
                    return $unaTieneMeta ? -1 : 1;
                }

                return $unaTieneMeta
                    ? $otra['porcentaje'] <=> $una['porcentaje']
                    : $otra['ovpUsd'] <=> $una['ovpUsd'];
            })
            ->values()
            ->all();
    }

    /**
     * El OVP de cada persona: la suma de los pronósticos de las marcas que
     * lleva asignadas, por id (nunca por nombre, regla 6).
     *
     * @param  list<string>|null  $idsDePersonas
     * @return Collection<string,float>
     */
    private static function ovpPorPersona(?array $idsDePersonas = null): Collection
    {
        return DB::table('propiedades_de_marca')
            ->join('marcas', 'marcas.id', '=', 'propiedades_de_marca.marca_id')
            ->whereNotNull('marcas.vendedor_asignado_id')
            ->when($idsDePersonas !== null, fn ($consulta) => $consulta->whereIn('marcas.vendedor_asignado_id', $idsDePersonas))
            ->groupBy('marcas.vendedor_asignado_id')
            ->selectRaw('marcas.vendedor_asignado_id as persona_id, SUM(propiedades_de_marca.ovp_usd) as ovp')
            ->pluck('ovp', 'persona_id')
            ->map(fn ($ovp): float => (float) $ovp);
    }

    /** @return array<string,mixed> */
    private static function comoFila(User $persona, ?Meta $meta, float $ovp, int $anio): array
    {
        $monto = $meta === null ? null : (float) $meta->monto_usd;

        return [
            'personaId' => $persona->id,
            'nombre' => $persona->nombreParaMostrar(),
            'rolEtiqueta' => $persona->rol->etiqueta(),
            'anio' => $anio,
            'metaUsd' => $monto,
            'ovpUsd' => round($ovp, 2),
            'porcentaje' => $monto !== null && $monto > 0 ? round($ovp * 100 / $monto, 1) : null,
            'fijadaPorNombre' => $meta?->fijada_por_nombre,
        ];
    }
}
