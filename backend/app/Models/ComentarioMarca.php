<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ComentarioMarca — una entrada de la bitácora de una marca.
 * ---------------------------------------------------------------------
 * Es el hilo de conversación que se ve en la columna derecha de la
 * ficha: quién llamó, qué contestaron y cuándo hay que volver a
 * insistir. Sustituye a la tabla `deal_comments` de Supabase.
 *
 * El nombre del autor se guarda junto al identificador (desnormalizado)
 * a propósito: si esa persona deja la empresa y se borra su usuario, el
 * historial debe seguir diciendo quién escribió cada cosa.
 */
class ComentarioMarca extends Model
{
    use HasUuids;

    protected $table = 'comentarios_marca';

    protected $fillable = [
        'marca_id',
        'autor_id',
        'autor_nombre',
        'cuerpo',
    ];

    public function marca(): BelongsTo
    {
        return $this->belongsTo(Marca::class, 'marca_id');
    }

    public function autor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'autor_id');
    }

    /**
     * Un comentario solo lo borra quien lo escribió o un administrador.
     * Se resuelve aquí y no en una política aparte porque es la única
     * regla que tiene este modelo.
     */
    public function puedeBorrarlo(User $usuario): bool
    {
        return $this->autor_id === $usuario->id || $usuario->esAdministrador();
    }
}
