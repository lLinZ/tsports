<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Exceptions\FalloDelTiempoReal;
use App\Models\User;
use App\Support\TiempoReal;
use Illuminate\Console\Command;

/**
 * ProbarTiempoReal — manda un aviso de prueba por el WebSocket.
 * ---------------------------------------------------------------------
 * Comprueba el tiempo real de punta a punta después de un despliegue,
 * sin esperar a que ocurra algo real que avisar:
 *
 *   php artisan tiempo-real:probar admin@tsports.tech
 *
 * Si esa persona tiene el panel abierto, le aparece un aviso flotante.
 * Y si no le aparece, el comando ayuda a saber en qué tramo se corta:
 *
 *   · Falla aquí mismo           → el tramo backend → Reverb. El mensaje
 *                                  distingue «no contesta» (servicio
 *                                  parado, puerto equivocado) de
 *                                  «contesta con error» (credenciales).
 *   · Dice «enviado» y no llega  → el tramo Reverb → navegador: el proxy
 *                                  de nginx en /app/, o que la persona
 *                                  no tiene el panel abierto.
 *
 * Lo mismo, con más opciones, está en el panel del administrador
 * (pantalla «Tiempo real»); los dos envían por TiempoReal.
 */
class ProbarTiempoReal extends Command
{
    protected $signature = 'tiempo-real:probar
                            {correo : Correo de la cuenta que debe recibir el aviso}';

    protected $description = 'Manda un aviso de prueba por el WebSocket para comprobar que el tiempo real funciona';

    public function handle(): int
    {
        $correo = (string) $this->argument('correo');
        $destinatario = User::where('email', $correo)->first();

        if ($destinatario === null) {
            $this->error("No hay ninguna cuenta con el correo {$correo}.");

            return self::FAILURE;
        }

        try {
            TiempoReal::enviarAvisoDePrueba([$destinatario]);
        } catch (FalloDelTiempoReal $fallo) {
            $this->error($fallo->getMessage());

            return self::FAILURE;
        }

        $this->info("Aviso de prueba enviado a {$destinatario->name}.");
        $this->line('Si tiene el panel abierto, le aparece ahora. Si no, el corte está entre Reverb y el navegador (el proxy /app/ de nginx).');

        return self::SUCCESS;
    }
}
