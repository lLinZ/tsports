<?php

declare(strict_types=1);

namespace App\Support;

/**
 * TiempoReal — si el WebSocket está encendido y con qué clave se entra.
 * ---------------------------------------------------------------------
 * Lo consultan dos sitios que tienen que opinar lo mismo: la ruta que
 * le da la configuración al navegador (TiempoRealController) y el
 * comando que manda el aviso de prueba (ProbarTiempoReal). Si cada uno
 * lo decidiera por su cuenta, el comando podría decir «enviado»
 * mientras la interfaz ni siquiera intenta conectarse.
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
}
