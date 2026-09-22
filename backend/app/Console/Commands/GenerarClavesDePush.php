<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\Push;
use Illuminate\Console\Command;
use Minishlink\WebPush\VAPID;
use Throwable;

/**
 * push:claves — genera el par de claves VAPID de esta instalación.
 * ---------------------------------------------------------------------
 * Se ejecuta UNA VEZ por instalación (producción y test tienen las
 * suyas) y lo que imprime se pega en el `.env`. No escribe el fichero
 * por su cuenta a propósito: el `.env` del VPS lo mantiene una persona,
 * y un comando que lo reescribe es un comando que algún día lo pisa.
 *
 * CAMBIARLAS APAGA LOS AVISOS DE TODO EL MUNDO. Las suscripciones que ya
 * existen están firmadas con la clave anterior, así que el servicio de
 * entrega las rechazará y nadie recibirá nada hasta volver a aceptar los
 * avisos en cada dispositivo. Por eso el comando avisa antes si ya hay
 * unas puestas, y hay que insistir con --forzar.
 */
class GenerarClavesDePush extends Command
{
    protected $signature = 'push:claves {--forzar : Generar aunque ya haya claves puestas}';

    protected $description = 'Genera el par de claves VAPID para los avisos al móvil';

    public function handle(): int
    {
        if (Push::estaActivo() && ! $this->option('forzar')) {
            $this->components->error('Ya hay claves VAPID puestas en el .env.');
            $this->line('');
            $this->line('  Generar unas nuevas deja SIN AVISOS a todos los dispositivos');
            $this->line('  que ya los aceptaron: tendrían que volver a aceptarlos uno a uno.');
            $this->line('');
            $this->line('  Si aun así hace falta: <comment>php artisan push:claves --forzar</comment>');

            return self::FAILURE;
        }

        try {
            $claves = VAPID::createVapidKeys();
        } catch (Throwable $error) {
            $this->components->error('No se pudieron generar las claves: '.$error->getMessage());

            // En Windows con XAMPP esto falla siempre, y el mensaje de
            // OpenSSL («Unable to create the key») no dice por qué: no
            // encuentra su fichero de configuración, así que no puede
            // generar la curva. En el VPS no pasa.
            if (PHP_OS_FAMILY === 'Windows' && getenv('OPENSSL_CONF') === false) {
                $this->line('');
                $this->line('  En Windows suele ser que OpenSSL no encuentra su configuración.');
                $this->line('  Prueba, sin tocar el php.ini:');
                $this->line('');
                $this->line('    <comment>set OPENSSL_CONF=C:\xampp\apache\conf\openssl.cnf</comment>');
                $this->line('    <comment>php artisan push:claves</comment>');
            }

            return self::FAILURE;
        }

        $this->components->info('Claves generadas. Pégalas en el .env:');
        $this->line('');
        $this->line('VAPID_PUBLIC_KEY='.$claves['publicKey']);
        $this->line('VAPID_PRIVATE_KEY='.$claves['privateKey']);
        $this->line('');
        $this->components->warn('La privada no sale del servidor. No la pegues en ningún sitio más.');

        return self::SUCCESS;
    }
}
