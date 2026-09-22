<?php

declare(strict_types=1);

/**
 * config/push.php — el aviso al móvil con el panel cerrado.
 * ---------------------------------------------------------------------
 * El push del navegador se firma con un par de claves VAPID, que es lo
 * que le demuestra al servicio de entrega (Google, Mozilla, Apple) que
 * quien manda el aviso es quien dice ser. Se generan UNA VEZ por
 * instalación con `php artisan push:claves` y no se vuelven a tocar:
 * cambiarlas invalida todas las suscripciones que ya hay, y la gente
 * dejaría de recibir avisos sin que nadie sepa por qué.
 *
 * La PÚBLICA viaja al navegador y no es secreta. La PRIVADA firma y no
 * sale del servidor jamás.
 *
 * `asunto` tiene que ser una dirección de correo (`mailto:`) o una URL,
 * y es a quien contacta el servicio de entrega si algo va mal con los
 * envíos. Va el dominio, que siempre existe, y no un correo, que hoy no
 * hay configurado.
 */

return [
    'vapid' => [
        'asunto' => env('VAPID_SUBJECT', 'https://tsports.tech'),
        'clave_publica' => env('VAPID_PUBLIC_KEY', ''),
        'clave_privada' => env('VAPID_PRIVATE_KEY', ''),
    ],

    /**
     * Cuánto puede esperar el aviso en el servicio de entrega si el
     * teléfono está apagado o sin datos.
     *
     * Cuatro horas. Un aviso del CRM que llega al día siguiente ya no
     * sirve para nada: el lead o se atendió o se perdió, y recibirlo
     * tarde solo confunde.
     */
    'segundos_que_espera' => (int) env('PUSH_TTL', 4 * 60 * 60),
];
