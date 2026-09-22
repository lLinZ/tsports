<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ComentarioMarca — una entrada de la bitácora de una marca.
 * ---------------------------------------------------------------------
 * Es el hilo de conversación que se ve en la columna derecha de la
 * ficha: quién llamó, qué contestaron y cuándo hay que volver a
 * insistir. Sustituye a la tabla `deal_comments` de Supabase.
 *
 * El nombre del autor se guarda junto al identificador (desnormalizado)
 * a propósito: si esa persona deja la empresa y se borra su usuario, el
 * historial debe seguir diciendo quién escribió cada cosa. Lo mismo con
 * el nombre de quien borra una entrada.
 *
 * UN SOLO NIVEL DE RESPUESTAS. Una entrada o es raíz o cuelga de una
 * raíz, nunca de otra respuesta. Lo comprueba `puedeColgarDe()` y lo
 * usa el controlador al guardar.
 *
 * EL BORRADO ES SUAVE Y SE VE. Una entrada borrada deja su hueco en el
 * hilo diciendo que se eliminó, con quién y cuándo. No se usa el
 * SoftDeletes de Laravel: ese esconde la fila de todas las consultas por
 * defecto, y aquí se quiere justo lo contrario —que siga saliendo—, así
 * que la marca de borrado se lleva a mano y el texto se vacía al
 * borrar. Un registro del que se pueden quitar entradas sin rastro no
 * vale como registro, y este se exporta.
 */
class ComentarioMarca extends Model
{
    use HasUuids;

    protected $table = 'comentarios_marca';

    protected $fillable = [
        'marca_id',
        'comentario_padre_id',
        'autor_id',
        'autor_nombre',
        'cuerpo',
        'editado_en',
        'eliminado_en',
        'eliminado_por_id',
        'eliminado_por_nombre',
    ];

    protected function casts(): array
    {
        return [
            'editado_en' => 'datetime',
            'eliminado_en' => 'datetime',
        ];
    }

    /* ================================================================ */
    /* Relaciones                                                       */
    /* ================================================================ */

    public function marca(): BelongsTo
    {
        return $this->belongsTo(Marca::class, 'marca_id');
    }

    public function autor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'autor_id');
    }

    /** La entrada de la que cuelga esta respuesta, si es una respuesta. */
    public function padre(): BelongsTo
    {
        return $this->belongsTo(self::class, 'comentario_padre_id');
    }

    /** @return HasMany<self,self> */
    public function respuestas(): HasMany
    {
        return $this->hasMany(self::class, 'comentario_padre_id')->orderBy('created_at');
    }

    /** @return HasMany<ReaccionDeComentario,self> */
    public function reacciones(): HasMany
    {
        return $this->hasMany(ReaccionDeComentario::class, 'comentario_id');
    }

    /**
     * Las personas etiquetadas en esta entrada.
     *
     * @return BelongsToMany<User,self>
     */
    public function mencionados(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'menciones_de_comentario', 'comentario_id', 'usuario_id')
                    ->withTimestamps();
    }

    /* ================================================================ */
    /* Estado                                                           */
    /* ================================================================ */

    public function estaEliminado(): bool
    {
        return $this->eliminado_en !== null;
    }

    public function esUnaRespuesta(): bool
    {
        return $this->comentario_padre_id !== null;
    }

    /** @param  Builder<self>  $consulta */
    public function scopeRaices(Builder $consulta): void
    {
        $consulta->whereNull('comentario_padre_id');
    }

    /* ================================================================ */
    /* Quién puede qué                                                  */
    /* ================================================================ */

    /**
     * ¿Esta entrada puede colgar de esa otra?
     *
     * Dos condiciones: que sea de la MISMA marca —o se mezclarían hilos
     * de marcas distintas— y que la otra sea raíz, porque las respuestas
     * no se anidan.
     */
    public function puedeColgarDe(self $posiblePadre): bool
    {
        return $posiblePadre->marca_id === $this->marca_id
            && ! $posiblePadre->esUnaRespuesta();
    }

    /**
     * Editar es cosa de quien lo escribió, y de nadie más.
     *
     * Ni siquiera un administrador: cambiar las palabras de otro en un
     * registro que se exporta es peor que no poder corregir una errata.
     * Lo que un administrador sí puede es eliminar la entrada, que deja
     * rastro de quién lo hizo.
     */
    public function puedeEditarlo(User $usuario): bool
    {
        return ! $this->estaEliminado() && $this->autor_id === $usuario->id;
    }

    /**
     * Una entrada la elimina quien la escribió o un administrador.
     * Se resuelve aquí y no en una política aparte porque son las dos
     * únicas reglas que tiene este modelo.
     */
    public function puedeBorrarlo(User $usuario): bool
    {
        return ! $this->estaEliminado()
            && ($this->autor_id === $usuario->id || $usuario->esAdministrador());
    }

    /**
     * Marca la entrada como eliminada, dejando constancia.
     *
     * El cuerpo se vacía porque eliminar tiene que eliminar de verdad lo
     * escrito; lo que se conserva es el HUECO y el rastro de quién lo
     * quitó, que es lo que hace que el histórico siga valiendo.
     */
    public function eliminarDejandoRastro(User $quienBorra): void
    {
        $this->forceFill([
            'cuerpo' => '',
            'eliminado_en' => now(),
            'eliminado_por_id' => $quienBorra->id,
            'eliminado_por_nombre' => $quienBorra->nombreParaMostrar(),
        ])->save();

        // Las menciones se van con el texto: no tendría sentido que
        // alguien siguiera figurando como etiquetado en algo que ya no
        // dice nada. Las reacciones también.
        $this->mencionados()->detach();
        $this->reacciones()->delete();
    }
}
