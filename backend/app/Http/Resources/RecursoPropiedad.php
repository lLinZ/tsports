<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Propiedad;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoPropiedad — cómo se ve un producto IOP desde el frontend.
 * ---------------------------------------------------------------------
 * Además de traducir las columnas a camelCase, resuelve en el servidor
 * las tres cosas que el cliente tendría que recalcular por su cuenta:
 *
 *   · `forecastDeVentaUsd` → el porcentaje acordado sobre el MTP. Si lo
 *     calculara el navegador, un redondeo distinto haría que el total
 *     del tablero no cuadrase con el del informe.
 *   · `laPuedoOfrecer`     → si quien pregunta puede añadirla al
 *     checklist de una marca. La interfaz desactiva la casilla con esta
 *     bandera, sin comparar roles ni mirar la lista de asignados.
 *   · `puedoEditarla` / `puedoEliminarla` → los botones del catálogo.
 *
 * @mixin Propiedad
 */
class RecursoPropiedad extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        $usuarioQueConsulta = $peticion->user();

        return [
            'id' => $this->id,
            'nombre' => $this->nombre,
            'descripcion' => $this->descripcion,
            'logoUrl' => $this->logo_url,

            // --- Los dos montos que se guardan y el que se deriva ---
            'montoTotalUsd' => (float) $this->monto_total_usd,
            'porcentajeForecast' => (float) $this->porcentaje_forecast,
            'forecastDeVentaUsd' => $this->forecastDeVenta(),

            // --- Reparto entre prospectores ---
            'asignadaATodos' => $this->asignada_a_todos,
            'prospectores' => $this->whenLoaded(
                'prospectores',
                fn () => $this->prospectores
                    ->map(static fn ($prospector): array => [
                        'id' => $prospector->id,
                        'nombre' => $prospector->nombreParaMostrar(),
                        'zona' => $prospector->zona,
                    ])
                    ->values()
                    ->all(),
            ),

            'orden' => $this->orden,
            'activa' => $this->activa,

            // Cuántas marcas la llevan en su checklist y cuánto suman sus
            // pronósticos. Solo viajan si el controlador los pidió, para
            // no lanzar una consulta por fila en el selector de la ficha.
            'totalMarcas' => $this->whenCounted('marcasQueLaOfrecen'),
            // Se mira el arreglo de atributos en crudo y no `$this->…`
            // porque con las comprobaciones estrictas de Eloquent leer
            // una columna que no se seleccionó lanza una excepción.
            'ovpAcumuladoUsd' => $this->when(
                array_key_exists('ovp_acumulado', $this->resource->getAttributes()),
                fn (): float => (float) $this->resource->getAttribute('ovp_acumulado'),
            ),

            // --- Permisos ya resueltos para quien pregunta ---
            'laPuedoOfrecer' => $usuarioQueConsulta !== null
                && $usuarioQueConsulta->can('ofrecer', $this->resource),
            'puedoEditarla' => $usuarioQueConsulta?->can('update', $this->resource) ?? false,
            'puedoEliminarla' => $usuarioQueConsulta?->can('delete', $this->resource) ?? false,

            'creadaEn' => $this->created_at?->toIso8601String(),
            'actualizadaEn' => $this->updated_at?->toIso8601String(),
        ];
    }
}
