<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Campana — el empujón comercial al que pertenece el trabajo.
 * ---------------------------------------------------------------------
 * "Temporada 2026", "Copa América", "Cierre de año". Una marca pertenece
 * como mucho a una campaña, y esa relación es la que permite filtrar el
 * tablero y sacar el reparto por campaña en el resumen.
 *
 * El nombre no se copia dentro de la marca: las campañas se renombran, y
 * una copia vieja engañaría al leer la ficha. Se lee siempre por la
 * relación.
 *
 * @property string $id
 */
class Campana extends Model
{
    use HasUuids;

    protected $table = 'campanas';

    protected $fillable = [
        'nombre',
        'descripcion',
        'color',
        'fecha_inicio',
        'fecha_fin',
        'orden',
        'activa',
    ];

    protected function casts(): array
    {
        return [
            'fecha_inicio' => 'date',
            'fecha_fin' => 'date',
            'activa' => 'boolean',
            'orden' => 'integer',
        ];
    }

    /** Las marcas que se están trabajando dentro de esta campaña. */
    public function marcas(): HasMany
    {
        return $this->hasMany(Marca::class, 'campana_id');
    }

    /**
     * ¿La campaña está en marcha hoy?
     *
     * Una campaña sin fechas se considera vigente mientras esté activa:
     * el equipo no siempre las rellena y no tendría sentido esconderla
     * por eso.
     */
    public function estaVigente(): bool
    {
        if (! $this->activa) {
            return false;
        }

        $hoy = now()->startOfDay();

        if ($this->fecha_inicio !== null && $this->fecha_inicio->gt($hoy)) {
            return false;
        }

        return ! ($this->fecha_fin !== null && $this->fecha_fin->lt($hoy));
    }

    public function scopeActivas(Builder $consulta): Builder
    {
        return $consulta->where('activa', true);
    }

    public function scopeEnOrdenDeCatalogo(Builder $consulta): Builder
    {
        return $consulta->orderBy('orden')->orderBy('nombre');
    }
}
