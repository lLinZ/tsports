<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Propiedad — un producto IOP del catálogo de la agencia.
 * ---------------------------------------------------------------------
 * Es lo que TS Sports pone a la venta: el Comité Olímpico, el Deportivo
 * Táchira, Kombat Challenge, Megafitness… Se carga de forma general, sin
 * sub-propiedades: una fila por producto.
 *
 * LOS TRES MONTOS, Y DE DÓNDE SALE CADA UNO
 *
 *   1. MTP      → `monto_total_usd`. El valor total de la propiedad. Lo
 *                 escribe quien gestiona el catálogo (admin/comercial).
 *   2. Forecast → `forecastDeVenta()`. El porcentaje del MTP que se fija
 *                 como meta de venta (20 % por defecto). Se calcula, no
 *                 se guarda: así no puede contradecir al MTP.
 *   3. OVP      → vive en PropiedadDeMarca. Lo escribe el vendedor, una
 *                 vez por cada marca a la que le ofrece la propiedad.
 *
 * QUIÉN PUEDE OFRECERLA
 * O todo el equipo (`asignada_a_todos`), o solo las personas listadas en
 * `prospectores`. La pregunta se hace siempre con `laPuedeOfrecer()`, y
 * nunca comparando roles sueltos por ahí.
 *
 * @property string $id
 */
class Propiedad extends Model
{
    use HasUuids;

    /** Sin esto Eloquent buscaría una tabla llamada `propiedads`. */
    protected $table = 'propiedades';

    protected $fillable = [
        'nombre',
        'descripcion',
        'logo_url',
        'monto_total_usd',
        'porcentaje_forecast',
        'asignada_a_todos',
        'orden',
        'activa',
    ];

    /**
     * Reparto habitual entre la agencia y la propiedad. Vive aquí, y no
     * repetido en cada formulario, para que cambiar el acuerdo por
     * defecto sea tocar una sola línea.
     */
    public const PORCENTAJE_FORECAST_POR_DEFECTO = 20.0;

    protected function casts(): array
    {
        return [
            'monto_total_usd' => 'decimal:2',
            'porcentaje_forecast' => 'decimal:2',
            'asignada_a_todos' => 'boolean',
            'activa' => 'boolean',
            'orden' => 'integer',
        ];
    }

    /* ------------------------------------------------------------------
     | Relaciones
     |-----------------------------------------------------------------*/

    /** Las personas que pueden ofrecerla, si no está asignada a todos. */
    public function prospectores(): BelongsToMany
    {
        return $this->belongsToMany(
            User::class,
            'prospectores_de_propiedad',
            'propiedad_id',
            'usuario_id',
        );
    }

    /** Las marcas a las que se les está ofreciendo, con su OVP. */
    public function marcasQueLaOfrecen(): HasMany
    {
        return $this->hasMany(PropiedadDeMarca::class, 'propiedad_id');
    }

    /* ------------------------------------------------------------------
     | Reglas de negocio
     |-----------------------------------------------------------------*/

    /**
     * Meta de venta de la propiedad: el porcentaje acordado sobre el MTP.
     * Es la cifra que el tablero suma para saber cuánto se espera vender
     * en total entre todas las propiedades.
     */
    public function forecastDeVenta(): float
    {
        return round(
            ((float) $this->monto_total_usd) * ((float) $this->porcentaje_forecast) / 100,
            2,
        );
    }

    /**
     * ¿Esta persona puede ofrecer la propiedad a una marca?
     *
     * Quien gestiona el catálogo puede con todas: es quien reparte el
     * trabajo y necesita poder colocar una propiedad en cualquier ficha.
     */
    public function laPuedeOfrecer(User $usuario): bool
    {
        if ($usuario->rol->puedeGestionarElCatalogoComercial()) {
            return true;
        }

        if ($this->asignada_a_todos) {
            return true;
        }

        // `contains` sobre la relación ya cargada evita una consulta por
        // propiedad cuando esto se pregunta para el catálogo entero.
        return $this->prospectores->contains('id', $usuario->id);
    }

    /* ------------------------------------------------------------------
     | Scopes
     |-----------------------------------------------------------------*/

    public function scopeActivas(Builder $consulta): Builder
    {
        return $consulta->where('activa', true);
    }

    /**
     * Orden en el que se enseña el catálogo: primero el orden manual que
     * fijó el equipo y, a igualdad, por nombre.
     */
    public function scopeEnOrdenDeCatalogo(Builder $consulta): Builder
    {
        return $consulta->orderBy('orden')->orderBy('nombre');
    }

    /**
     * Las propiedades que esta persona puede ofrecer.
     *
     * No sirve para esconder el catálogo —todo el equipo lo ve entero,
     * igual que ve todas las marcas—, sino para decidir qué se le deja
     * añadir a una ficha.
     */
    public function scopeQuePuedeOfrecer(Builder $consulta, User $usuario): Builder
    {
        if ($usuario->rol->puedeGestionarElCatalogoComercial()) {
            return $consulta;
        }

        return $consulta->where(function (Builder $subconsulta) use ($usuario): void {
            $subconsulta->where('asignada_a_todos', true)
                ->orWhereHas(
                    'prospectores',
                    fn (Builder $consultaDeProspectores) => $consultaDeProspectores
                        ->where('users.id', $usuario->id),
                );
        });
    }
}
