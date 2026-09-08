<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Sector — el rubro al que pertenece una marca.
 * ---------------------------------------------------------------------
 * Alimentos, Bebidas, Telecomunicaciones… Es con lo que el resumen
 * contesta "¿en qué rubros se está concentrando el esfuerzo?".
 *
 * Era una lista escrita en el código y ahora es una tabla, porque el
 * equipo necesitaba añadir rubros sin esperar a un despliegue.
 *
 * La marca guarda el NOMBRE del sector, no su identificador (ver la
 * migración). Por eso este modelo no tiene relación `marcas()`: la
 * cuenta de cuántas marcas lo usan se hace por texto, y vive en
 * `totalDeMarcas()`.
 *
 * @property string $id
 */
class Sector extends Model
{
    use HasUuids;

    /**
     * El plural correcto en español es "sectores", no "sectors": sin
     * esta línea Eloquent buscaría una tabla que no existe.
     */
    protected $table = 'sectores';

    protected $fillable = [
        'nombre',
        'orden',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
            'orden' => 'integer',
        ];
    }

    /* ------------------------------------------------------------------
     | Consultas
     |-----------------------------------------------------------------*/

    /** Los que se pueden elegir hoy al clasificar una marca. */
    public function scopeActivos(Builder $consulta): Builder
    {
        return $consulta->where('activo', true);
    }

    /**
     * El orden en el que el equipo los nombra, con el alfabético como
     * desempate. Sin el segundo criterio, dos sectores con el mismo
     * `orden` saldrían en un orden distinto en cada consulta.
     */
    public function scopeEnOrdenDeCatalogo(Builder $consulta): Builder
    {
        return $consulta->orderBy('orden')->orderBy('nombre');
    }

    /**
     * Cuántas marcas están clasificadas en este rubro.
     *
     * Se cuenta por el nombre porque es lo que guarda la marca. Importa
     * antes de borrar: un sector en uso no se borra, se desactiva, o las
     * marcas se quedarían con un rubro que ya no existe en el catálogo.
     */
    public function totalDeMarcas(): int
    {
        return Marca::query()->where('sector', $this->nombre)->count();
    }

    /* ------------------------------------------------------------------
     | Para los selectores y la validación
     |-----------------------------------------------------------------*/

    /**
     * Los nombres que se ofrecen al clasificar una marca.
     *
     * @return list<string>
     */
    public static function nombresActivos(): array
    {
        return self::query()->activos()->enOrdenDeCatalogo()->pluck('nombre')->all();
    }

    /**
     * TODOS los nombres, incluidos los desactivados.
     *
     * Es lo que acepta la validación al guardar una marca, y no solo los
     * activos: si se desactiva un sector, las marcas que ya lo llevan
     * tienen que poder seguir guardándose. Si no, editar el teléfono de
     * una de ellas fallaría por un campo que nadie tocó.
     *
     * @return list<string>
     */
    public static function nombresAdmitidos(): array
    {
        return self::query()->enOrdenDeCatalogo()->pluck('nombre')->all();
    }
}
