<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Notificacion;
use App\Models\SuscripcionPush;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Push — si el aviso al móvil está encendido, con qué clave y cómo sale.
 * ---------------------------------------------------------------------
 * Mismo papel que `TiempoReal` para el WebSocket: un solo sitio que
 * opine si esto funciona, para que la ruta que configura el navegador,
 * el trabajo que envía y las pruebas digan exactamente lo mismo. Si cada
 * uno lo decidiera por su cuenta, la interfaz podría pedir permiso para
 * unos avisos que el servidor no puede mandar.
 *
 * «Activo» exige las DOS claves. Con solo la pública el navegador se
 * suscribiría y no llegaría nunca nada; con solo la privada no habría
 * con qué suscribirse.
 */
final class Push
{
    public static function estaActivo(): bool
    {
        return filled(config('push.vapid.clave_publica'))
            && filled(config('push.vapid.clave_privada'));
    }

    /**
     * La clave pública VAPID, o null si el push está apagado.
     *
     * NO es secreta: el navegador la necesita para suscribirse y queda a
     * la vista de cualquiera que mire la petición. La privada es la que
     * no sale de la máquina.
     */
    public static function clavePublica(): ?string
    {
        return self::estaActivo()
            ? (string) config('push.vapid.clave_publica')
            : null;
    }

    /**
     * Manda el aviso a los dispositivos que se le pasen y devuelve los
     * endpoints que el servicio de entrega dio por muertos.
     *
     * No lanza excepción si un envío falla, y es a propósito: esto corre
     * dentro de un trabajo en cola detrás de una notificación que YA
     * está guardada. Que el móvil de alguien no reciba el aviso no puede
     * hacer que el trabajo se reintente y acabe mandándolo cuatro veces
     * a los demás.
     *
     * @param  iterable<SuscripcionPush>  $suscripciones
     * @return list<string>  endpoints a borrar (404 o 410)
     */
    public static function enviar(iterable $suscripciones, Notificacion $notificacion): array
    {
        return self::enviarContenido($suscripciones, [
            'titulo' => $notificacion->titulo,
            'cuerpo' => $notificacion->cuerpo,
            // El enlace lo resuelve el modelo, igual que para la
            // campanita: la interfaz no compone rutas a mano.
            'enlace' => $notificacion->enlaceEnElPanel(),
            'tipo' => $notificacion->tipo,
            'id' => $notificacion->id,
        ], $notificacion->tipo);
    }

    /**
     * Lo mismo, con el contenido ya armado. Lo usa además el chat, cuyos
     * mensajes no son avisos de la campanita (ver
     * EnviarMensajeDeChatAlMovil).
     *
     * `$tema` es la etiqueta con la que el servicio de entrega sustituye
     * un aviso por el siguiente del mismo tema. El estándar la limita a
     * 32 caracteres del alfabeto base64 de URL; si no cumple, el servicio
     * rechaza el envío entero, así que se recorta aquí.
     *
     * @param  iterable<SuscripcionPush>  $suscripciones
     * @param  array<string,mixed>  $contenido
     * @return list<string>  endpoints a borrar (404 o 410)
     */
    public static function enviarContenido(iterable $suscripciones, array $contenido, string $tema): array
    {
        if (! self::estaActivo()) {
            return [];
        }

        $tema = substr((string) preg_replace('/[^A-Za-z0-9_-]/', '', $tema), 0, 32);

        $mensajero = new WebPush([
            'VAPID' => [
                'subject' => (string) config('push.vapid.asunto'),
                'publicKey' => (string) config('push.vapid.clave_publica'),
                'privateKey' => (string) config('push.vapid.clave_privada'),
            ],
        ]);

        // Todos los envíos se encolan y salen juntos: la librería abre
        // las conexiones en paralelo, así que avisar a diez dispositivos
        // cuesta más o menos lo que avisar a uno.
        $mensajero->setDefaultOptions([
            'TTL' => (int) config('push.segundos_que_espera'),
            // «normal» deja que el teléfono lo entregue cuando despierte,
            // sin sacarlo del ahorro de energía. Un aviso comercial no
            // justifica encender la pantalla de madrugada.
            'urgency' => 'normal',
            // Un aviso nuevo de la misma clase SUSTITUYE al anterior en
            // la bandeja del teléfono. Sin esto, volver de un fin de
            // semana con quince leads deja quince avisos apilados.
            'topic' => $tema,
        ]);

        $contenidoEnJson = json_encode($contenido, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        foreach ($suscripciones as $suscripcion) {
            $mensajero->queueNotification(
                Subscription::create([
                    'endpoint' => $suscripcion->endpoint,
                    'publicKey' => $suscripcion->clave_p256dh,
                    'authToken' => $suscripcion->clave_auth,
                ]),
                $contenidoEnJson,
            );
        }

        $muertos = [];

        foreach ($mensajero->flush() as $resultado) {
            // 404 y 410 son la forma que tiene el servicio de entrega de
            // decir «este navegador ya no existe»: desinstalaron la
            // aplicación, limpiaron los datos del sitio o revocaron el
            // permiso. Si no se borran, la tabla se llena de direcciones
            // muertas y cada envío tarda un poco más que el anterior.
            if ($resultado->isSubscriptionExpired()) {
                $muertos[] = $resultado->getEndpoint();
            }
        }

        return $muertos;
    }
}
