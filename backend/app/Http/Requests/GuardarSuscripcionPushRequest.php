<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GuardarSuscripcionPushRequest — lo que manda el navegador al aceptar
 * los avisos al móvil.
 * ---------------------------------------------------------------------
 * Es tal cual lo que devuelve `PushSubscription.toJSON()`. Los nombres
 * `p256dh` y `auth` se dejan como vienen, igual que `email` o
 * `password`: los impone el estándar del Push API y traducirlos aquí
 * obligaría a traducirlos de vuelta en el navegador.
 *
 * Las dos son claves del NAVEGADOR y sirven para cifrar el contenido del
 * aviso, de forma que el servicio de entrega transporte algo que no
 * puede leer. Ninguna es la clave privada del servidor, que no sale de
 * `config/push.php`.
 *
 * Esto no lo escribe nadie a mano, así que las reglas no están para
 * guiar a una persona: están para que una petición inventada no escriba
 * cualquier cosa en la tabla. El endpoint tiene que ser HTTPS —los
 * servicios de entrega solo dan direcciones https— y sin eso alguien
 * podría apuntar los avisos de su propia cuenta a un servidor suyo.
 */
class GuardarSuscripcionPushRequest extends FormRequest
{
    /**
     * @return array<string,list<string>|string>
     */
    public function rules(): array
    {
        return [
            'endpoint' => ['required', 'string', 'url:https', 'max:500', $this->esDeUnServicioDeEntrega(...)],
            'p256dh' => ['required', 'string', 'max:255'],
            'auth' => ['required', 'string', 'max:255'],
            // El navegador no lo manda: lo pone la interfaz para que la
            // persona reconozca el dispositivo. Opcional a propósito.
            'dispositivo' => ['nullable', 'string', 'max:120'],
        ];
    }

    /**
     * Los servicios de entrega de los navegadores: Chrome, Opera, Brave y
     * Samsung (Google), Firefox (Mozilla), Edge (Microsoft) y Safari
     * (Apple). Desde el 2026-10-01.
     *
     * El servidor hace una petición a esta dirección por cada aviso. Con
     * cualquier https bastaba ponerla a mano para que el servidor llamara
     * a lo que hay dentro de la máquina o de su red (127.0.0.1, el puerto
     * de Reverb…). Un navegador nuevo con su propio servicio se añade aquí.
     */
    private const SERVICIOS_DE_ENTREGA = [
        'fcm.googleapis.com',
        '.push.services.mozilla.com',
        '.notify.windows.com',
        'web.push.apple.com',
    ];

    private function esDeUnServicioDeEntrega(string $atributo, mixed $valor, \Closure $fallar): void
    {
        $partes = parse_url((string) $valor);
        $servidor = strtolower((string) ($partes['host'] ?? ''));

        $esConocido = collect(self::SERVICIOS_DE_ENTREGA)->contains(
            static fn (string $servicio): bool => str_starts_with($servicio, '.')
                ? str_ends_with($servidor, $servicio)
                : $servidor === $servicio,
        );

        // Con puerto propio ya no es el servicio, aunque el nombre coincida.
        if (! $esConocido || isset($partes['port']) || isset($partes['user'])) {
            $fallar('Esa dirección no es de ningún servicio de avisos de un navegador.');
        }
    }

    /**
     * @return array<string,string>
     */
    public function attributes(): array
    {
        return [
            'endpoint' => 'la dirección de entrega',
            'p256dh' => 'la clave de cifrado del navegador',
            'auth' => 'la clave de autenticación del navegador',
            'dispositivo' => 'el dispositivo',
        ];
    }
}
