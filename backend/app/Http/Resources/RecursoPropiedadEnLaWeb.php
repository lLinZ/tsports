<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ArchivoDePropiedad;
use App\Models\Propiedad;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoPropiedadEnLaWeb — una propiedad tal como la ve un visitante.
 * ---------------------------------------------------------------------
 * Sale por una ruta pública, sin sesión, así que lo que importa aquí es
 * lo que NO sale:
 *
 *   · Ni un monto. El MTP, la meta y los pronósticos son de la
 *     negociación, no del escaparate.
 *   · Ni la descripción interna ni quién la trabaja. El visitante lee el
 *     texto escrito para la web, en su idioma.
 *   · Ni documentos, ni las fotos que se apagaron para la web. Un
 *     dossier o un rate card se enseñan en la reunión.
 *
 * Todo lo que no está en este fichero no sale, y por eso no hereda de
 * RecursoPropiedad: con una lista blanca, un campo nuevo del catálogo no
 * se cuela en la web por descuido.
 *
 * @mixin Propiedad
 */
class RecursoPropiedadEnLaWeb extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        $fotosPublicas = $this->galeria
            ->filter(fn (ArchivoDePropiedad $pieza): bool => $pieza->saleEnLaWeb())
            ->values();

        // La portada que se eligió, si es de las que salen fuera; si no,
        // la primera foto que sí sale.
        $portada = $fotosPublicas->first(fn (ArchivoDePropiedad $pieza): bool => $pieza->es_portada)
            ?? $fotosPublicas->first();

        $textoEnEspanol = trim((string) $this->texto_web_es);
        $textoEnIngles = trim((string) $this->texto_web_en);

        return [
            'id' => $this->id,
            'nombre' => $this->nombre,
            'logoUrl' => $this->logo_url,
            'texto' => [
                'es' => $textoEnEspanol,
                // Sin traducción, el visitante en inglés lee el español:
                // mejor eso que una tarjeta sin texto.
                'en' => $textoEnIngles !== '' ? $textoEnIngles : $textoEnEspanol,
            ],
            'portadaUrl' => $portada?->archivo->urlDeLaMiniatura() ?? $portada?->archivo->url_publica,
            'fotos' => $fotosPublicas
                ->map(fn (ArchivoDePropiedad $pieza): array => [
                    'id' => $pieza->id,
                    'url' => $pieza->archivo->url_publica,
                    'urlMiniatura' => $pieza->archivo->urlDeLaMiniatura(),
                    'titulo' => $pieza->titulo,
                    'descripcion' => $pieza->descripcion,
                ])
                ->all(),
        ];
    }
}
