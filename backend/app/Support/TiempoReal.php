<?php

declare(strict_types=1);

namespace App\Support;

use App\Events\PruebaDeTiempoReal;
use App\Exceptions\FalloDelTiempoReal;
use App\Models\User;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Broadcasting\BroadcastException;

/**
 * TiempoReal — si el WebSocket está encendido, con qué clave se entra y
 * cómo se manda un aviso de prueba.
 * ---------------------------------------------------------------------
 * Lo consultan varios sitios que tienen que opinar lo mismo: la ruta que
 * le da la configuración al navegador, el comando `tiempo-real:probar` y
 * la pantalla de pruebas del administrador. Si cada uno lo decidiera por
 * su cuenta, uno podría decir «enviado» mientras la interfaz ni siquiera
 * intenta conectarse.
 *
 * «Activo» exige las dos cosas: el driver de Reverb elegido Y la clave
 * puesta. Con el driver `null` o `log` los eventos no salen de la
 * máquina, y sin clave el navegador no tiene con qué abrir la conexión.
 */
final class TiempoReal
{
    public static function estaActivo(): bool
    {
        return config('broadcasting.default') === 'reverb'
            && filled(config('broadcasting.connections.reverb.key'));
    }

    /**
     * La clave de la aplicación de Reverb, o null si está apagado.
     *
     * NO es secreta: viaja en la URL del WebSocket de cualquier
     * navegador. El secreto es REVERB_APP_SECRET, que firma lo que
     * publica el backend y no sale nunca del servidor.
     */
    public static function clavePublica(): ?string
    {
        return self::estaActivo()
            ? (string) config('broadcasting.connections.reverb.key')
            : null;
    }

    /**
     * Manda el aviso de prueba al canal privado de cada destinatario, en
     * una sola llamada a Reverb.
     *
     * Si no sale, lanza FalloDelTiempoReal con un mensaje que dice en qué
     * tramo se cortó: el diagnóstico vive aquí para que la consola y la
     * pantalla del administrador digan exactamente lo mismo.
     *
     * @param  list<User>  $destinatarios
     *
     * @throws FalloDelTiempoReal
     */
    public static function enviarAvisoDePrueba(
        array $destinatarios,
        ?string $titulo = null,
        ?string $mensaje = null,
        ?User $remitente = null,
    ): void {
        // Con el driver `null` o `log`, event() no falla: el aviso se tira
        // o se escribe en el registro. Sin esta comprobación se diría
        // «enviado» sin que nada haya salido de la máquina.
        if (! self::estaActivo()) {
            throw new FalloDelTiempoReal(
                'El tiempo real no está activo en esta instalación: hacen falta '
                .'BROADCAST_CONNECTION=reverb y REVERB_APP_KEY en el .env, y después php artisan config:cache.'
            );
        }

        try {
            event(new PruebaDeTiempoReal($destinatarios, $titulo, $mensaje, $remitente?->nombreParaMostrar()));
        } catch (GuzzleException $error) {
            // Laravel solo traduce los errores que DEVUELVE Reverb; si no
            // hay nadie escuchando, sale la excepción de Guzzle tal cual.
            throw new FalloDelTiempoReal(
                'Reverb no contesta. ¿Está arrancado el servicio? REVERB_HOST y REVERB_PORT tienen que '
                .'apuntar a donde escucha (REVERB_SERVER_HOST y REVERB_SERVER_PORT).',
                previous: $error,
            );
        } catch (BroadcastException $error) {
            throw new FalloDelTiempoReal(
                'Reverb contestó con un error ('.$error->getMessage().'). Suele ser que REVERB_APP_ID, KEY '
                .'o SECRET no coinciden con los del proceso que está corriendo: reinicia el servicio después de cambiar el .env.',
                previous: $error,
            );
        }
    }
}
