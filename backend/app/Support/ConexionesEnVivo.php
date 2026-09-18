<?php

declare(strict_types=1);

namespace App\Support;

use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Broadcasting\Broadcasters\PusherBroadcaster;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Str;
use Pusher\PusherException;

/**
 * ConexionesEnVivo — quién tiene ahora mismo el panel abierto y conectado.
 * ---------------------------------------------------------------------
 * Se lo pregunta a Reverb por su API, la misma que la de Pusher: qué
 * canales privados de persona (`private-usuario.{id}`) tienen al menos
 * un suscriptor. Cada pestaña abierta con sesión se suscribe al suyo, así
 * que «canal ocupado» es «esa persona está conectada».
 *
 * Distingue «nadie conectado» (lista vacía) de «no se sabe» (null), que
 * es lo que pasa con Reverb parado: enseñar a todo el mundo desconectado
 * en ese caso haría creer que el problema está en los navegadores.
 *
 * No es estática para que las pruebas puedan sustituirla: en ellas no hay
 * ningún Reverb al que preguntar.
 */
class ConexionesEnVivo
{
    private const PREFIJO_DEL_CANAL_PERSONAL = 'private-usuario.';

    /** @return list<string>|null los ids de usuario, o null si no se sabe */
    public function idsDeLasPersonasConectadas(): ?array
    {
        if (! TiempoReal::estaActivo()) {
            return null;
        }

        try {
            /** @var PusherBroadcaster $emisor */
            $emisor = Broadcast::connection('reverb');

            $respuesta = $emisor->getPusher()->getChannels([
                'filter_by_prefix' => self::PREFIJO_DEL_CANAL_PERSONAL,
            ]);
        } catch (GuzzleException|PusherException) {
            return null;
        }

        return array_values(array_map(
            fn (string $nombreDelCanal): string => Str::after($nombreDelCanal, self::PREFIJO_DEL_CANAL_PERSONAL),
            array_keys($respuesta->channels),
        ));
    }
}
