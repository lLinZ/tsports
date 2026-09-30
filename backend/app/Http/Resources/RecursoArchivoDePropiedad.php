<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ArchivoDePropiedad;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoArchivoDePropiedad — una pieza de la galería, vista desde el
 * panel.
 * ---------------------------------------------------------------------
 * Lleva todo lo que necesitan las tres pantallas donde se ve la galería
 * (la propiedad, el checklist de la ficha y el visor): de qué tipo es,
 * dónde está la foto grande y dónde la pequeña, y lo que se cuenta de
 * ella.
 *
 * `urlMiniatura` es null si el navegador no pudo hacerla al subir; la
 * interfaz usa entonces la foto entera. Los documentos no tienen.
 *
 * @mixin ArchivoDePropiedad
 */
class RecursoArchivoDePropiedad extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        $archivo = $this->archivo;

        return [
            'id' => $this->id,
            'tipo' => $archivo->tipo(),
            'nombre' => $archivo->nombre_original,
            'tamanoBytes' => $archivo->tamano_bytes,
            'url' => $archivo->url_publica,
            'urlMiniatura' => $archivo->urlDeLaMiniatura(),

            'titulo' => $this->titulo,
            'descripcion' => $this->descripcion,
            'orden' => $this->orden,
            'esPortada' => $this->es_portada,
            // Lo que de verdad sale fuera, no solo lo que se marcó: un PDF
            // no sale nunca, esté como esté la casilla.
            'enLaWeb' => $this->saleEnLaWeb(),

            'subidoEn' => $this->created_at?->toIso8601String(),
        ];
    }
}
