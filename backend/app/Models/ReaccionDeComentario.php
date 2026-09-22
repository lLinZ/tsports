<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ReaccionDeComentario — un emoji de una persona en una entrada.
 * ---------------------------------------------------------------------
 * Una fila por persona, entrada y emoji. El índice único de los tres es
 * lo que hace que reaccionar dos veces con el mismo emoji sea quitar la
 * reacción en vez de sumar dos.
 *
 * Aquí no hay política: quien puede ver la marca puede reaccionar en su
 * bitácora, y quitar una reacción es quitar la SUYA, así que no hay nada
 * de otra persona que se pueda tocar.
 */
class ReaccionDeComentario extends Model
{
    use HasUuids;

    protected $table = 'reacciones_de_comentario';

    protected $fillable = [
        'comentario_id',
        'usuario_id',
        'emoji',
    ];

    public function comentario(): BelongsTo
    {
        return $this->belongsTo(ComentarioMarca::class, 'comentario_id');
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }
}
