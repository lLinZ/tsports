<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * MarcaEnMensaje — una marca etiquetada en un mensaje del chat.
 * ---------------------------------------------------------------------
 * Guarda el nombre que tenía la marca al escribir el mensaje. Es lo que
 * ve quien no puede abrir la marca (un agente con una de otra cartera):
 * el nombre que quien escribió decidió contarle, sin logo ni enlace. Y
 * si la marca se borra, el nombre sigue: `marca_id` no es clave foránea,
 * porque es también lo que une la etiqueta con su sitio en el texto.
 */
class MarcaEnMensaje extends Model
{
    protected $table = 'marcas_en_mensajes';

    public $timestamps = false;

    protected $fillable = [
        'mensaje_id',
        'marca_id',
        'nombre_marca',
    ];

    public function mensaje(): BelongsTo
    {
        return $this->belongsTo(MensajeDeChat::class, 'mensaje_id');
    }

    public function marca(): BelongsTo
    {
        return $this->belongsTo(Marca::class, 'marca_id');
    }
}
