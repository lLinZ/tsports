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
 * Conversacion — una charla del chat interno: directa o de grupo.
 * ---------------------------------------------------------------------
 * Quién puede leerla y escribir en ella lo decide `ConversacionPolicy`,
 * y la respuesta es siempre la misma: quien está dentro. Ni un
 * administrador lee las charlas de otros; es la misma regla que con los
 * avisos de la campanita.
 *
 * Una directa entre dos personas es ÚNICA. Se busca y se crea por
 * `clave_directa` (ver `claveDirectaEntre`), que en la base tiene índice
 * único: aunque dos pestañas pidan abrirla a la vez, sale una.
 *
 * @property string $id
 * @property string $tipo
 * @property string|null $nombre
 */
class Conversacion extends Model
{
    use HasUuids;

    public const TIPO_DIRECTA = 'directa';

    public const TIPO_GRUPO = 'grupo';

    protected $table = 'conversaciones';

    protected $fillable = [
        'tipo',
        'nombre',
        'clave_directa',
        'creada_por_id',
        'ultimo_mensaje_id',
    ];

    protected function casts(): array
    {
        return [
            'ultimo_mensaje_id' => 'integer',
        ];
    }

    /* ------------------------------------------------------------------
     | Relaciones
     |-----------------------------------------------------------------*/

    /** Quién está dentro, con hasta dónde ha leído cada uno. */
    public function participantes(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'participantes_de_conversacion', 'conversacion_id', 'usuario_id')
            ->withPivot('ultimo_leido_id')
            ->withTimestamps();
    }

    public function mensajes(): HasMany
    {
        return $this->hasMany(MensajeDeChat::class, 'conversacion_id');
    }

    public function ultimoMensaje(): BelongsTo
    {
        return $this->belongsTo(MensajeDeChat::class, 'ultimo_mensaje_id');
    }

    public function creadaPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creada_por_id');
    }

    /* ------------------------------------------------------------------
     | Preguntas
     |-----------------------------------------------------------------*/

    public function esDirecta(): bool
    {
        return $this->tipo === self::TIPO_DIRECTA;
    }

    public function esGrupo(): bool
    {
        return $this->tipo === self::TIPO_GRUPO;
    }

    /**
     * ¿Está esta persona dentro? Se pregunta a la base y no a la relación
     * cargada: la política lo usa con charlas recién sacadas por id, y
     * cargar a todos los participantes para responder sí o no sobra.
     */
    public function tieneDentroA(User $persona): bool
    {
        return $this->participantes()->where('users.id', $persona->id)->exists();
    }

    /**
     * La clave de la charla directa entre dos personas: sus dos ids en
     * orden, para que «Ana con Pedro» y «Pedro con Ana» den la misma.
     */
    public static function claveDirectaEntre(User $una, User $otra): string
    {
        $ids = [$una->id, $otra->id];
        sort($ids, SORT_STRING);

        return implode(':', $ids);
    }

    /** @param  Builder<self>  $consulta */
    public function scopeDe(Builder $consulta, User $persona): void
    {
        $consulta->whereHas('participantes', fn (Builder $quienes) => $quienes->where('users.id', $persona->id));
    }
}
