<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ArchivoDePropiedad — una pieza de la galería de una propiedad.
 * ---------------------------------------------------------------------
 * Una foto del recinto, un plano o el dossier comercial en PDF. El
 * fichero es un ArchivoMedia; esta fila dice de qué propiedad es, en qué
 * lugar de la galería va y qué se cuenta de él.
 *
 * Las reglas de la galería que no caben en una columna:
 *
 *   · LA PORTADA ES UNA SOLA, Y ES UNA IMAGEN. Es lo que representa a la
 *     propiedad en el catálogo, en el checklist de la ficha y en la web.
 *     La primera foto que se sube la estrena, y al borrar la portada la
 *     hereda la siguiente foto. Lo lleva GaleriaDePropiedadController.
 *   · UN DOCUMENTO NO SALE EN LA WEB, marque lo que marque `en_la_web`.
 *     Un dossier o un rate card es material para la reunión, no para
 *     cualquiera que entre en la portada. Lo decide `saleEnLaWeb()`.
 *
 * @property string $id
 */
class ArchivoDePropiedad extends Model
{
    use HasUuids;

    protected $table = 'archivos_de_propiedad';

    protected $fillable = [
        'propiedad_id',
        'archivo_media_id',
        'titulo',
        'descripcion',
        'orden',
        'es_portada',
        'en_la_web',
    ];

    protected function casts(): array
    {
        return [
            'orden' => 'integer',
            'es_portada' => 'boolean',
            'en_la_web' => 'boolean',
        ];
    }

    public function propiedad(): BelongsTo
    {
        return $this->belongsTo(Propiedad::class, 'propiedad_id');
    }

    public function archivo(): BelongsTo
    {
        return $this->belongsTo(ArchivoMedia::class, 'archivo_media_id');
    }

    public function esImagen(): bool
    {
        return $this->archivo->esImagen();
    }

    /** ¿Se enseña en la web pública cuando la propiedad está publicada? */
    public function saleEnLaWeb(): bool
    {
        return $this->en_la_web && $this->esImagen();
    }
}
