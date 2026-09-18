<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Notificacion — un aviso para una persona concreta.
 * ---------------------------------------------------------------------
 * Lo crea siempre `App\Support\Notificador`, que es quien decide a quién
 * le toca cada aviso y cómo se redacta. Este modelo solo lo guarda y
 * sabe a dónde lleva.
 *
 * No es el sistema de notificaciones de Laravel (`Notifiable`, tabla
 * `notifications`): aquel guarda el contenido en un JSON sin forma, y
 * aquí interesa poder filtrar por tipo y contar las no leídas con un
 * índice.
 */
class Notificacion extends Model
{
    use HasUuids;

    protected $table = 'notificaciones';

    /** Entró un lead por el formulario de la web. */
    public const TIPO_LEAD_NUEVO = 'lead_nuevo';

    /** Alguien te asignó una marca. */
    public const TIPO_MARCA_ASIGNADA = 'marca_asignada';

    protected $fillable = [
        'destinatario_id',
        'tipo',
        'titulo',
        'cuerpo',
        'entidad_tipo',
        'entidad_id',
        'leida_en',
    ];

    protected function casts(): array
    {
        return [
            'leida_en' => 'datetime',
        ];
    }

    public function destinatario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'destinatario_id');
    }

    /** @param  Builder<self>  $consulta */
    public function scopeDe(Builder $consulta, User $persona): void
    {
        $consulta->where('destinatario_id', $persona->id);
    }

    /** @param  Builder<self>  $consulta */
    public function scopeSinLeer(Builder $consulta): void
    {
        $consulta->whereNull('leida_en');
    }

    public function estaLeida(): bool
    {
        return $this->leida_en !== null;
    }

    /**
     * La dirección del panel a la que lleva el aviso, o null si no lleva
     * a ningún sitio.
     *
     * Se resuelve aquí y no en la interfaz: la interfaz no compone rutas a
     * mano, y así cambiar cómo se abre una ficha es tocar una línea.
     * `/marcas?abrir=<id>` es la misma entrada que ya usa el calendario.
     */
    public function enlaceEnElPanel(): ?string
    {
        if ($this->entidad_id === null) {
            return null;
        }

        return match ($this->entidad_tipo) {
            'marca' => '/marcas?abrir='.$this->entidad_id,
            default => null,
        };
    }
}
