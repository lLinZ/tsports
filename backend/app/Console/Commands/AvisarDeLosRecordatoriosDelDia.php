<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Recordatorio;
use App\Models\User;
use App\Support\Notificador;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

/**
 * AvisarDeLosRecordatoriosDelDia — el aviso de la mañana.
 * ---------------------------------------------------------------------
 * A cada persona con recordatorios para hoy le deja UN aviso con todos
 * (Notificador::avisarDeLosRecordatoriosDelDia), que sale por la
 * campanita, en vivo y al móvil como cualquier otro (regla 17).
 *
 *   php artisan recordatorios:avisar-del-dia
 *
 * Lo lanza cada mañana el temporizador de systemd
 * (deploy/tsports-recordatorios.timer), a las 08:00 de Caracas. Es el
 * primer proceso programado del sistema: hasta ahora el servidor solo
 * reaccionaba a lo que hacía alguien en el panel.
 *
 * SE PUEDE REPETIR SIN MIEDO. Cada recordatorio avisado queda marcado
 * (`avisado_en`) y no vuelve a contarse: si el servidor estaba apagado a
 * las ocho y el temporizador lo lanza al arrancar, o alguien lo ejecuta a
 * mano para probar, nadie recibe el mismo aviso dos veces. Posponer un
 * recordatorio le quita la marca, para que avise el día nuevo.
 *
 * Solo avisa de lo de HOY. Lo vencido no se repite cada mañana —eso
 * acaba en avisos que nadie lee—: se cuenta dentro del aviso de hoy y se
 * ve en el panel. Quien no tiene nada para hoy no recibe nada.
 */
class AvisarDeLosRecordatoriosDelDia extends Command
{
    protected $signature = 'recordatorios:avisar-del-dia';

    protected $description = 'Avisa a cada persona de los recordatorios que le tocan hoy';

    public function handle(Notificador $notificador): int
    {
        $hoy = CarbonImmutable::today()->toDateString();

        /** @var Collection<string, Collection<int,Recordatorio>> $porPersona */
        $porPersona = Recordatorio::query()
            ->pendientes()
            ->whereDate('fecha', $hoy)
            ->whereNull('avisado_en')
            ->with(['marca', 'persona'])
            ->orderBy('hora')
            ->orderBy('created_at')
            ->get()
            ->groupBy('persona_id');

        $avisadas = 0;

        foreach ($porPersona as $recordatorios) {
            /** @var User $persona */
            $persona = $recordatorios->first()->persona;

            // Una cuenta desactivada no entra: el aviso esperaría a nadie.
            if (! $persona->activo) {
                continue;
            }

            // Solo de marcas que todavía puede ver. Si se la quitaron, el
            // aviso le llevaría el nombre de una marca que ya no es suya.
            $deHoy = $recordatorios
                ->filter(fn (Recordatorio $recordatorio): bool => $persona->can('view', $recordatorio->marca))
                ->values();

            if ($deHoy->isEmpty()) {
                continue;
            }

            $vencidos = Recordatorio::query()
                ->de($persona)
                ->pendientes()
                ->whereDate('fecha', '<', $hoy)
                ->count();

            $notificador->avisarDeLosRecordatoriosDelDia($persona, $deHoy, $vencidos);

            Recordatorio::query()->whereKey($deHoy->modelKeys())->update(['avisado_en' => now()]);

            $avisadas++;
        }

        $this->info($avisadas === 0
            ? 'Nadie tiene recordatorios pendientes de avisar hoy.'
            : "Avisadas {$avisadas} ".($avisadas === 1 ? 'persona.' : 'personas.'));

        return self::SUCCESS;
    }
}
