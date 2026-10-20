<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\VideoTutorial;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoVideoTutorial — un vídeo de la pantalla «Vídeos».
 * ---------------------------------------------------------------------
 * `url` y `portada` vienen FIRMADAS y caducan en uno o dos días
 * (ArchivoMedia::enlaceFirmado), igual que los adjuntos de la bitácora:
 * este recurso solo se construye para quien ve la serie del vídeo
 * (VideoTutorial::scopeQueVe), y es la firma la que impide que alguien
 * de otro rol lo abra copiando la dirección.
 *
 * @mixin VideoTutorial
 */
class RecursoVideoTutorial extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        return [
            'id' => $this->id,
            'clave' => $this->clave,
            'guia' => $this->guia->value,
            'guiaEtiqueta' => $this->guia->etiqueta(),
            'orden' => $this->orden,
            'titulo' => $this->titulo,
            'descripcion' => $this->descripcion,
            'duracionSegundos' => $this->duracion_segundos,
            'url' => $this->archivo?->enlaceFirmado(),
            'portada' => $this->portada?->enlaceFirmado(),
        ];
    }
}
