<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\MensajeDeChat;
use App\Models\SuscripcionPush;
use App\Models\User;
use App\Support\Presencia;
use App\Support\Push;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * EnviarMensajeDeChatAlMovil — lleva un mensaje del chat al teléfono de
 * quien no está delante del panel.
 * ---------------------------------------------------------------------
 * En cola por lo mismo que EnviarAvisoPush: cada push es una petición a
 * un servidor de Google, Mozilla o Apple por dispositivo, y mandar un
 * mensaje no puede esperar a que contesten. Y con un solo intento: más
 * vale un aviso perdido —el mensaje sigue en el chat— que tres iguales.
 *
 * A QUIÉN LE SUENA, de todos los que están en la charla:
 *
 *   · No a quien lo escribió.
 *   · No a quien ya lo leyó (le dio tiempo antes de que la cola llegase
 *     a este trabajo).
 *   · No a quien está EN LÍNEA, con el panel a la vista: ya lo ve en
 *     pantalla, con su globo y su contador. Hacerle vibrar además el
 *     teléfono que tiene al lado es ruido, y a los tres días lo
 *     silenciaría, y con él los avisos que sí importan.
 *   · No a una cuenta desactivada.
 *
 * El texto lleva las marcas etiquetadas como «#Nombre», con el nombre
 * copiado al escribir: el aviso le llega también a quien no puede ver
 * esa marca, y el nombre es justo lo que quien escribió decidió contar.
 */
class EnviarMensajeDeChatAlMovil implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    /** Lo que cabe cómodo en la bandeja de avisos de un teléfono. */
    private const LARGO_DEL_ADELANTO = 140;

    public function __construct(private readonly int $idDelMensaje) {}

    public function handle(): void
    {
        if (! Push::estaActivo()) {
            return;
        }

        $mensaje = MensajeDeChat::query()
            ->with(['conversacion.participantes', 'marcas'])
            ->find($this->idDelMensaje);

        if ($mensaje === null || $mensaje->esDeSistema() || $mensaje->conversacion === null) {
            return;
        }

        $conversacion = $mensaje->conversacion;

        $aQuienes = $this->aQuienesLesSuena($mensaje);

        if ($aQuienes === []) {
            return;
        }

        $suscripciones = SuscripcionPush::query()->whereIn('usuario_id', $aQuienes)->get();

        if ($suscripciones->isEmpty()) {
            return;
        }

        $texto = $this->adelanto($mensaje->textoPlano());

        // En un grupo el título es el grupo y el texto dice quién habla;
        // en una directa, el título ya es quién habla.
        $contenido = $conversacion->esGrupo()
            ? ['titulo' => (string) $conversacion->nombre, 'cuerpo' => $mensaje->autor_nombre.': '.$texto]
            : ['titulo' => $mensaje->autor_nombre, 'cuerpo' => $texto];

        try {
            $muertos = Push::enviarContenido($suscripciones, $contenido + [
                'enlace' => '/chat/'.$conversacion->id,
                'tipo' => 'mensaje_de_chat',
                'id' => (string) $mensaje->id,
                // Una etiqueta POR CHARLA: los mensajes de la misma charla
                // se sustituyen en la bandeja en vez de apilarse, y los de
                // charlas distintas no se pisan entre sí.
                'etiqueta' => 'chat-'.$conversacion->id,
                // Y aun sustituyendo, cada mensaje vuelve a sonar. Sin
                // esto el segundo mensaje de una charla llegaría callado.
                'volverAAvisar' => true,
            ], 'chat'.str_replace('-', '', $conversacion->id));
        } catch (Throwable $error) {
            Log::warning('No se pudo enviar el mensaje del chat al móvil.', [
                'mensaje' => $mensaje->id,
                'error' => $error->getMessage(),
            ]);

            return;
        }

        if ($muertos !== []) {
            SuscripcionPush::query()->whereIn('endpoint', $muertos)->delete();
        }
    }

    /**
     * Los ids de quienes tienen que recibir el mensaje en el teléfono. Es
     * pública para poder probar la regla sin mandar nada a ningún sitio.
     *
     * @return list<string>
     */
    public function aQuienesLesSuena(MensajeDeChat $mensaje): array
    {
        $mensaje->loadMissing('conversacion.participantes');

        return $mensaje->conversacion->participantes
            ->filter(fn (User $persona): bool => $persona->id !== $mensaje->autor_id
                && $persona->activo
                && (int) $persona->pivot->ultimo_leido_id < $mensaje->id
                && ! Presencia::estaEnLinea($persona))
            ->pluck('id')
            ->values()
            ->all();
    }

    private function adelanto(string $texto): string
    {
        $limpio = trim(preg_replace('/\s+/u', ' ', $texto) ?? $texto);

        return mb_strlen($limpio) > self::LARGO_DEL_ADELANTO
            ? mb_substr($limpio, 0, self::LARGO_DEL_ADELANTO - 1).'…'
            : $limpio;
    }
}
