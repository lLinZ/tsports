<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * CierreDeMes — un reporte de cierre de mes subido al panel.
 * ---------------------------------------------------------------------
 * Un documento por fila (un PDF, un Excel, una presentación), con el mes
 * al que corresponde y quién lo subió. Qué significa cada columna, y por
 * qué el mes es una fecha, está en su migración.
 *
 * El fichero es un ArchivoMedia del disco privado: se sirve con el mismo
 * enlace firmado que los adjuntos de la bitácora y solo lo recibe quien
 * puede ver los cierres (CierreDeMesPolicy). Borrar el cierre se lleva
 * el fichero con él (`eliminarConSuArchivo`).
 *
 * @property string $id
 * @property \Illuminate\Support\Carbon $mes
 */
class CierreDeMes extends Model
{
    use HasUuids;

    protected $table = 'cierres_de_mes';

    protected $fillable = [
        'mes',
        'titulo',
        'notas',
        'archivo_media_id',
        'subido_por_id',
        'subido_por_nombre',
    ];

    protected function casts(): array
    {
        return [
            'mes' => 'date',
        ];
    }

    public function archivo(): BelongsTo
    {
        return $this->belongsTo(ArchivoMedia::class, 'archivo_media_id');
    }

    public function subidoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'subido_por_id');
    }

    /**
     * El mes en palabras, para la auditoría: «septiembre de 2026».
     */
    public function mesEnPalabras(): string
    {
        return $this->mes->locale('es')->translatedFormat('F \d\e Y');
    }

    /**
     * Borra el cierre y su fichero del disco.
     *
     * Se borra primero la fila y después el fichero: si el disco fallara a
     * mitad, queda un fichero huérfano en una carpeta privada, que no se ve
     * desde ningún sitio, en vez de un cierre que apunta a la nada.
     */
    public function eliminarConSuArchivo(): void
    {
        $archivo = $this->archivo;

        $this->delete();

        $archivo?->eliminarConSuFichero();
    }
}
