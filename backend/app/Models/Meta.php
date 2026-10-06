<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Meta — el objetivo de venta de una persona para un año.
 * ---------------------------------------------------------------------
 * Solo el monto acordado. Cuánto lleva cumplido se calcula al leer
 * contra el OVP de sus marcas (App\Support\AvanceDeLasMetas): si se
 * guardara, cada pronóstico corregido en una ficha lo dejaría viejo.
 *
 * La ponen quienes reparten el trabajo (admin y comercial,
 * UserPolicy::fijarMetas). Cada agente ve la suya; ellos, las de todos.
 *
 * @property int $id
 * @property string $persona_id
 * @property int $anio
 * @property string $monto_usd
 */
class Meta extends Model
{
    protected $table = 'metas';

    protected $fillable = [
        'persona_id',
        'anio',
        'monto_usd',
        'fijada_por_id',
        'fijada_por_nombre',
    ];

    protected function casts(): array
    {
        return [
            'anio' => 'integer',
            'monto_usd' => 'decimal:2',
        ];
    }

    public function persona(): BelongsTo
    {
        return $this->belongsTo(User::class, 'persona_id');
    }
}
