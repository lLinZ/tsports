<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Presencia — quién está ahora mismo con el panel delante.
 * ---------------------------------------------------------------------
 * Funciona SIN WebSocket, y es a propósito: producción no tiene Reverb
 * encendido, y «en línea» tiene que ser verdad en los dos sitios. Cada
 * pestaña con el panel a la vista avisa cada pocos segundos (el
 * «latido», `POST /api/chat/latido`) y eso deja a la persona en línea
 * un rato; si deja de avisar, deja de estarlo sola.
 *
 * «A la vista» y no «abierto»: una pestaña olvidada detrás de otras
 * veinte no es alguien que esté para contestar. Al esconderse, la
 * pestaña se despide y la persona pasa a ausente en el acto, sin esperar
 * a que caduque.
 *
 * La misma respuesta decide si un mensaje del chat va al teléfono: quien
 * está en línea lo ve en pantalla, y hacerle vibrar además el móvil que
 * tiene al lado es ruido (ver EnviarMensajeDeChatAlMovil).
 */
final class Presencia
{
    /**
     * Cuánto dura un latido. Tiene que ser más largo que el intervalo al
     * que avisa el navegador (30 s con tiempo real, 15 s sin él), para
     * que un aviso que llega un poco tarde no haga parpadear a nadie.
     */
    public const SEGUNDOS_QUE_DURA_EL_LATIDO = 50;

    /**
     * Apunta el latido de una persona.
     *
     * Se escribe con una consulta directa y no guardando el modelo: el
     * latido llega cada pocos segundos, y no debe mover `updated_at` de
     * la cuenta ni disparar nada de lo que cuelgue de guardar un usuario.
     */
    public static function anotarLatido(User $persona, bool $tieneElPanelALaVista): void
    {
        $ahora = now();

        DB::table('users')->where('id', $persona->id)->update([
            'en_linea_hasta' => $tieneElPanelALaVista
                ? $ahora->copy()->addSeconds(self::SEGUNDOS_QUE_DURA_EL_LATIDO)
                : null,
            'visto_por_ultima_vez_en' => $ahora,
        ]);
    }

    public static function estaEnLinea(User $persona): bool
    {
        $hasta = $persona->en_linea_hasta;

        return $hasta !== null && $hasta->isFuture();
    }
}
