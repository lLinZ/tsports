<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ArchivoMedia;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoAdjunto — un fichero adjunto a una entrada de la bitácora.
 * ---------------------------------------------------------------------
 * Las tres direcciones vienen FIRMADAS y con caducidad (ver
 * ArchivoMedia::enlaceFirmado). Este recurso solo se construye dentro de
 * una respuesta a quien ya puede ver la marca, y ese es todo el control
 * de acceso que necesita el enlace: la etiqueta <img> que lo pide no
 * manda el token de sesión, y la firma impide fabricar uno.
 *
 *   · `url`          → el fichero, para verlo (una foto, un PDF en el
 *                      visor del navegador).
 *   · `urlMiniatura` → la versión pequeña de una foto, para el hilo. Null
 *                      si no la hay: la interfaz usa entonces `url`.
 *   · `urlDescarga`  → el mismo fichero, pero como descarga y con su
 *                      nombre original.
 *
 * @mixin ArchivoMedia
 */
class RecursoAdjunto extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        return [
            'id' => $this->id,
            'tipo' => $this->tipo(),
            'nombre' => $this->nombre_original,
            'tamanoBytes' => $this->tamano_bytes,
            'url' => $this->enlaceFirmado(),
            'urlMiniatura' => $this->enlaceFirmado('miniatura'),
            'urlDescarga' => $this->enlaceFirmado('descarga'),
        ];
    }
}
