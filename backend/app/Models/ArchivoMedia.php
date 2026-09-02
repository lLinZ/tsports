<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * ArchivoMedia — inventario de las imágenes subidas al servidor.
 * ---------------------------------------------------------------------
 * Sustituye al bucket "media" de Supabase Storage. Los ficheros viven en
 * el disco público del propio VPS (storage/app/public, enlazado a
 * public/storage) y esta tabla lleva la cuenta de qué hay, para qué se
 * subió y quién lo hizo.
 *
 * Guardar solo la ruta relativa y calcular la URL al vuelo permite
 * cambiar de dominio, pasar a HTTPS o mover el sitio a un CDN sin tener
 * que reescribir ninguna fila.
 */
class ArchivoMedia extends Model
{
    use HasUuids;

    protected $table = 'archivos_media';

    /** Los tres usos posibles de una imagen dentro del sistema. */
    public const PROPOSITO_LOGO_MARCA = 'logo_marca';
    public const PROPOSITO_CONTENIDO_WEB = 'contenido_web';
    public const PROPOSITO_AVATAR = 'avatar';

    protected $fillable = [
        'ruta_relativa',
        'nombre_original',
        'tipo_mime',
        'tamano_bytes',
        'proposito',
        'subido_por_id',
    ];

    protected function casts(): array
    {
        return [
            'tamano_bytes' => 'integer',
        ];
    }

    /**
     * Los campos calculados viajan siempre al cliente: la interfaz nunca
     * debería componer una URL a mano.
     */
    protected $appends = ['url_publica'];

    public function subidoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'subido_por_id');
    }

    /** URL absoluta desde la que el navegador puede pedir la imagen. */
    public function getUrlPublicaAttribute(): string
    {
        return Storage::disk('public')->url($this->ruta_relativa);
    }

    /** Borra el fichero del disco además de la fila de la tabla. */
    public function eliminarConSuFichero(): void
    {
        Storage::disk('public')->delete($this->ruta_relativa);

        $this->delete();
    }
}
