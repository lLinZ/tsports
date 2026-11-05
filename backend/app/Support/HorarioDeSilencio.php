<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * HorarioDeSilencio — las horas en que a una persona no le suena el móvil.
 * ---------------------------------------------------------------------
 * Desde el 2026-11-05, idea añadida en la propuesta «Panel de avisos» y
 * aprobada con ella. Cada quien lo enciende en sus ajustes; apagado de
 * partida, con 20:00 a 07:30 y los fines de semana ya puestos.
 *
 * En silencio NO SE MANDA AL MÓVIL, ni se aplaza: el aviso ya está en la
 * campanita (regla 17) y lo verá al abrir el panel. Aplazarlo haría que a
 * las 07:30 sonaran juntos los de toda la noche.
 *
 * Un horario que cruza la medianoche (20:00 a 07:30) es lo normal: está
 * en silencio desde las 20:00 Y hasta las 07:30. Desde y hasta iguales,
 * nunca. La hora es la de Caracas, como todo el sistema (regla 16).
 */
final class HorarioDeSilencio
{
    public static function estaEnSilencio(User $persona, ?CarbonInterface $ahora = null): bool
    {
        if (! $persona->silencio_activo) {
            return false;
        }

        $ahora = CarbonImmutable::instance($ahora ?? now())->setTimezone(config('app.timezone'));

        if ($persona->silencio_fines_de_semana && $ahora->isWeekend()) {
            return true;
        }

        $hora = $ahora->format('H:i');
        $desde = (string) $persona->silencio_desde;
        $hasta = (string) $persona->silencio_hasta;

        if ($desde === $hasta) {
            return false;
        }

        return $desde < $hasta
            ? $hora >= $desde && $hora < $hasta
            : $hora >= $desde || $hora < $hasta;
    }
}
