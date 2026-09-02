<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * EventoDeCampana — una acción de campaña sobre una marca, un día.
 * ---------------------------------------------------------------------
 * "El 10 de septiembre se visitó a Azúcar la Pastora." Cada fila es un
 * hecho del historial comercial de esa marca, y el conjunto es lo que se
 * pinta en el calendario del panel.
 *
 * El nombre y el color de la campaña se guardan COPIADOS dentro del
 * evento, además del id. No es un descuido:
 *
 *   · Si alguien borra la campaña "Visita presencial", las visitas que
 *     se hicieron siguieron ocurriendo; el historial no puede quedarse
 *     con un hueco.
 *   · Si la campaña se renombra, los eventos viejos conservan el nombre
 *     que tenían cuando se registraron, que es lo que de verdad pasó.
 *
 * Es la excepción consciente a la regla de no duplicar datos: aquí la
 * copia no es un atajo, es el registro de un hecho pasado.
 *
 * @property string $id
 */
class EventoDeCampana extends Model
{
    use HasUuids;

    protected $table = 'eventos_de_campana';

    protected $fillable = [
        'marca_id',
        'campana_id',
        'campana_nombre',
        'campana_color',
        'fecha',
        'nota',
        'registrado_por_id',
        'registrado_por_nombre',
    ];

    protected function casts(): array
    {
        return [
            'fecha' => 'date',
        ];
    }

    /* ------------------------------------------------------------------
     | Relaciones
     |-----------------------------------------------------------------*/

    public function marca(): BelongsTo
    {
        return $this->belongsTo(Marca::class, 'marca_id');
    }

    /** Puede ser nula si la campaña se borró después. */
    public function campana(): BelongsTo
    {
        return $this->belongsTo(Campana::class, 'campana_id');
    }

    public function registradoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registrado_por_id');
    }

    /* ------------------------------------------------------------------
     | Consultas
     |-----------------------------------------------------------------*/

    /** Los eventos de un rango de fechas; es lo que pide el calendario. */
    public function scopeEntreFechas(
        Builder $consulta,
        string $desde,
        string $hasta,
    ): Builder {
        return $consulta->whereBetween('fecha', [$desde, $hasta]);
    }

    /**
     * ¿Este evento describe la misma acción que la que se acaba de
     * asignar en la ficha?
     *
     * Se usa para no duplicar el historial: si alguien abre una marca,
     * cambia el teléfono y guarda, la campaña y la fecha siguen siendo
     * las mismas y no debe aparecer un evento repetido. Solo se registra
     * uno nuevo cuando de verdad cambia la acción o el día.
     */
    public function describeLaMismaAccion(?string $idDeCampana, ?string $fecha): bool
    {
        return $this->campana_id === $idDeCampana
            && $this->fecha?->toDateString() === $fecha;
    }
}
