<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\PropiedadDeMarca;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoPropiedadDeMarca — una línea del checklist de prospección.
 * ---------------------------------------------------------------------
 * Lleva los tres montos juntos, que es como los quiere leer la interfaz
 * para pintar la barra sin tener que cruzar dos listas:
 *
 *   · `montoTotalUsd`      → el MTP de la propiedad (el 100 %).
 *   · `ovpUsd`             → lo que el vendedor pronostica vender aquí.
 *   · `forecastDeVentaUsd` → la meta de la propiedad (su % del MTP).
 *
 * Y con ellos `porcentajeSobreElTotal`, que es la relación que el
 * cliente pidió ver: de los 7.400 de la propiedad se estiman vender
 * 500 → 6,76 %.
 *
 * El nombre y el logo de la propiedad se copian en la respuesta a
 * propósito: la tarjeta de la marca los enseña sin abrir la ficha, y
 * pedirle al navegador que cruce el catálogo por su cuenta significaría
 * repetir esa lógica en cada pantalla.
 *
 * @mixin PropiedadDeMarca
 */
class RecursoPropiedadDeMarca extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        unset($peticion); // No hay nada que dependa de quién pregunta.

        $propiedad = $this->propiedad;

        return [
            'id' => $this->id,
            'propiedadId' => $this->propiedad_id,

            'propiedadNombre' => $propiedad?->nombre ?? 'Propiedad eliminada',
            'propiedadLogoUrl' => $propiedad?->logo_url,
            'propiedadActiva' => (bool) ($propiedad?->activa ?? false),

            'montoTotalUsd' => (float) ($propiedad?->monto_total_usd ?? 0),
            'porcentajeForecast' => (float) ($propiedad?->porcentaje_forecast ?? 0),
            'forecastDeVentaUsd' => $propiedad?->forecastDeVenta() ?? 0.0,

            'ovpUsd' => (float) $this->ovp_usd,
            'porcentajeSobreElTotal' => $this->porcentajeSobreElTotal(),

            'nota' => $this->nota,
        ];
    }
}
