<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\MarcaEnMensaje;
use App\Models\MensajeDeChat;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoMensajeDeChat — un mensaje, visto por quien lo pide.
 * ---------------------------------------------------------------------
 * Se arma DISTINTO PARA CADA PERSONA, y es a propósito. Las marcas
 * etiquetadas pasan por `MarcaPolicy::view` de quien mira:
 *
 *   · Si la puede abrir: nombre de hoy, logo y enlace a su ficha.
 *   · Si no (un agente con una marca de otra cartera): el nombre que
 *     tenía cuando se escribió el mensaje, sin logo ni enlace. Es lo que
 *     quien escribió decidió contarle; el resto de la marca sigue siendo
 *     de quien la lleva (regla 6).
 *
 * Por eso el aviso en vivo (CambioEnElChat) no lleva el mensaje: cada
 * navegador lo pide y el servidor lo arma para él.
 *
 * @mixin MensajeDeChat
 */
class RecursoMensajeDeChat extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        /** @var User|null $lector */
        $lector = $peticion->user();

        return [
            'id' => $this->id,
            'conversacionId' => $this->conversacion_id,
            'tipo' => $this->tipo,
            'autorId' => $this->autor_id,
            'autorNombre' => $this->autor_nombre,
            'esMio' => $lector !== null && $this->autor_id === $lector->id,
            // Con las marcas como `[[marca:<id>]]`, en su sitio. La
            // interfaz cambia cada una por su chip, buscándola por id en
            // la lista de abajo.
            'cuerpo' => $this->cuerpo,
            'marcas' => $this->marcas
                ->map(fn (MarcaEnMensaje $etiqueta): array => $this->etiquetaParaElLector($etiqueta, $lector))
                ->values()
                ->all(),
            'creadoEn' => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string,string|null>
     */
    private function etiquetaParaElLector(MarcaEnMensaje $etiqueta, ?User $lector): array
    {
        $marca = $etiqueta->marca;
        $puedeAbrirla = $marca !== null && $lector !== null && $lector->can('view', $marca);

        return [
            'id' => $etiqueta->marca_id,
            'nombre' => $puedeAbrirla ? $marca->nombre_marca : $etiqueta->nombre_marca,
            'logoUrl' => $puedeAbrirla ? $marca->logo_url : null,
            // La misma entrada que usan los avisos y el calendario.
            'enlace' => $puedeAbrirla ? '/marcas?abrir='.$marca->id : null,
        ];
    }
}
