<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * PropiedadDeMarca — una línea del checklist de prospección.
 * ---------------------------------------------------------------------
 * "A esta marca se le está ofreciendo esta propiedad, y el vendedor
 * pronostica venderle este importe (OVP)".
 *
 * Es una tabla puente con datos propios, y por eso es un modelo completo
 * y no un `belongsToMany` a secas: el OVP y la nota son del vínculo, no
 * de la marca ni de la propiedad.
 *
 * La proporción que se pinta en la interfaz —cuánto representa el OVP
 * sobre el MTP de la propiedad— se calcula aquí con
 * `porcentajeSobreElTotal()`. No se guarda en ninguna columna: si se
 * guardara, corregir el MTP de una propiedad dejaría desactualizadas
 * todas sus líneas y el tablero enseñaría porcentajes falsos.
 *
 * @property string $id
 */
class PropiedadDeMarca extends Model
{
    use HasUuids;

    protected $table = 'propiedades_de_marca';

    protected $fillable = [
        'marca_id',
        'propiedad_id',
        'ovp_usd',
        'nota',
    ];

    protected function casts(): array
    {
        return [
            'ovp_usd' => 'decimal:2',
        ];
    }

    public function marca(): BelongsTo
    {
        return $this->belongsTo(Marca::class, 'marca_id');
    }

    public function propiedad(): BelongsTo
    {
        return $this->belongsTo(Propiedad::class, 'propiedad_id');
    }

    /**
     * Qué porcentaje del valor total de la propiedad representa este
     * pronóstico. Es exactamente lo que pide ver el cliente: "de los
     * 7.400 de la propiedad estima vender 500" → 6,76 %.
     *
     * Con una propiedad a la que todavía no se le ha cargado el MTP se
     * devuelve 0, en vez de dividir entre cero o inventar un 100 %.
     */
    public function porcentajeSobreElTotal(): float
    {
        $montoTotalDeLaPropiedad = (float) ($this->propiedad?->monto_total_usd ?? 0);

        if ($montoTotalDeLaPropiedad <= 0) {
            return 0.0;
        }

        return round(((float) $this->ovp_usd) * 100 / $montoTotalDeLaPropiedad, 2);
    }
}
