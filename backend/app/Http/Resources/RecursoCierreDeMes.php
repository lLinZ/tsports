<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\CierreDeMes;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoCierreDeMes — un reporte de cierre de mes, como lo ve el panel.
 * ---------------------------------------------------------------------
 * `mes` viaja como «2026-09», que es como se agrupa en pantalla; el día
 * no significa nada.
 *
 * Las dos direcciones del fichero vienen FIRMADAS y caducan en uno o dos
 * días (ArchivoMedia::enlaceFirmado): el reporte vive en el disco
 * privado, y este recurso solo se construye para quien puede ver los
 * cierres. `url` lo abre en el navegador (un PDF, una foto) y
 * `urlDescarga` lo baja con su nombre original, que es lo que hace falta
 * con un Excel o una presentación.
 *
 * `formato` es lo que la interfaz necesita para elegir el icono, sacado
 * del tipo real que se comprobó al subirlo.
 *
 * @mixin CierreDeMes
 */
class RecursoCierreDeMes extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        $archivo = $this->archivo;

        return [
            'id' => $this->id,
            'mes' => $this->mes->format('Y-m'),
            'titulo' => $this->titulo,
            'notas' => $this->notas,

            'archivo' => $archivo === null ? null : [
                'nombre' => $archivo->nombre_original,
                'formato' => self::formatoDe($archivo->tipo_mime),
                'tamanoBytes' => $archivo->tamano_bytes,
                'url' => $archivo->enlaceFirmado(),
                'urlDescarga' => $archivo->enlaceFirmado('descarga'),
            ],

            'subidoPor' => $this->subido_por_nombre,
            'subidoEn' => $this->created_at?->toIso8601String(),

            'puedoEliminarlo' => $peticion->user()?->can('delete', $this->resource) ?? false,
        ];
    }

    /** 'pdf', 'hoja', 'texto', 'presentacion' o 'imagen'. */
    private static function formatoDe(string $tipoMime): string
    {
        return match (true) {
            $tipoMime === 'application/pdf' => 'pdf',
            str_starts_with($tipoMime, 'image/') => 'imagen',
            str_contains($tipoMime, 'spreadsheet'), $tipoMime === 'application/vnd.ms-excel' => 'hoja',
            str_contains($tipoMime, 'presentation'), $tipoMime === 'application/vnd.ms-powerpoint' => 'presentacion',
            default => 'texto',
        };
    }
}
