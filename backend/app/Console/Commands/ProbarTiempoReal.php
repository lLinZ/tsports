<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Events\PruebaDeTiempoReal;
use App\Models\User;
use App\Support\TiempoReal;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Broadcasting\BroadcastException;
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
 */
class ProbarTiempoReal extends Command
{
    protected $signature = 'tiempo-real:probar
                            {correo : Correo de la cuenta que debe recibir el aviso}';

    protected $description = 'Manda un aviso de prueba por el WebSocket para comprobar que el tiempo real funciona';

    public function handle(): int
    {
        // Con el driver `null` o `log`, event() no falla: el aviso se
        // tira o se escribe en el registro. Sin esta comprobación el
        // comando diría «enviado» sin que nada haya salido de la máquina.
        if (! TiempoReal::estaActivo()) {
            $this->error('El tiempo real no está activo en esta instalación.');
            $this->line('Hacen falta BROADCAST_CONNECTION=reverb y REVERB_APP_KEY en el .env, y después php artisan config:cache.');

            return self::FAILURE;
        }

        $correo = (string) $this->argument('correo');
        $destinatario = User::where('email', $correo)->first();

        if ($destinatario === null) {
            $this->error("No hay ninguna cuenta con el correo {$correo}.");

            return self::FAILURE;
        }

        try {
            event(new PruebaDeTiempoReal($destinatario));
        } catch (GuzzleException $error) {
            // Laravel solo traduce los errores que DEVUELVE Reverb; si no
            // hay nadie escuchando, sale la excepción de Guzzle tal cual.
            $this->error('Reverb no contesta: '.$error->getMessage());
            $this->line('¿Está arrancado el servicio? REVERB_HOST y REVERB_PORT tienen que apuntar a donde escucha (REVERB_SERVER_HOST y REVERB_SERVER_PORT).');

            return self::FAILURE;
        } catch (BroadcastException $error) {
            $this->error('Reverb contestó con un error: '.$error->getMessage());
            $this->line('Suele ser que REVERB_APP_ID, KEY o SECRET no coinciden con los del proceso que está corriendo: reinicia el servicio después de cambiar el .env.');

            return self::FAILURE;
        }

        $this->info("Aviso de prueba enviado a {$destinatario->name}.");
        $this->line('Si tiene el panel abierto, le aparece ahora. Si no, el corte está entre Reverb y el navegador (el proxy /app/ de nginx).');

        return self::SUCCESS;
    }
}
