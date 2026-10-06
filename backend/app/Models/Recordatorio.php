<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\EstadoDeLasMarcas;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Recordatorio — algo que una persona tiene que hacer con una marca un día.
 * ---------------------------------------------------------------------
 * «Volver a llamar a Pepsi el jueves.» Lo deja quien trabaja la marca
 * para sí, o el comercial para alguien del equipo. Por qué es una tabla y
 * no una fecha en la marca está en su migración.
 *
 * DE QUIÉN ES Y QUIÉN LO VE
 *   · Es de su `persona`: a ella le sale en «Para hoy» y le llega el
 *     aviso de la mañana.
 *   · Lo ve en la ficha cualquiera que pueda ver la marca, y lo marca
 *     como cumplido o lo borra cualquiera que pueda editarla
 *     (RecordatorioController). La persona tiene que poder ver la marca:
 *     si se la quitan, el recordatorio deja de salirle, porque llevaría
 *     dentro el nombre de una marca que ya no es suya (regla 6).
 *
 * Cumplirlo NO calienta la marca: el estado (regla 26) se mueve con una
 * lista cerrada de cosas, y esta no está. Si de la llamada sale algo, se
 * escribe en la bitácora, y eso sí la mueve.
 *
 * @property string $id
 * @property string $marca_id
 * @property string $persona_id
 */
class Recordatorio extends Model
{
    use HasUuids;

    protected $table = 'recordatorios';

    /** Qué se ve en la ficha de lo ya cumplido: lo de esta última semana. */
    public const DIAS_QUE_SE_VE_LO_CUMPLIDO = 7;

    protected $fillable = [
        'marca_id',
        'persona_id',
        'fecha',
        'nota',
        'creado_por_id',
        'creado_por_nombre',
        'cumplido_en',
        'cumplido_por_nombre',
        'avisado_en',
    ];

    protected function casts(): array
    {
        return [
            'fecha' => 'date',
            'cumplido_en' => 'datetime',
            'avisado_en' => 'datetime',
        ];
    }

    /* ------------------------------------------------------------------
     | Relaciones
     |-----------------------------------------------------------------*/

    public function marca(): BelongsTo
    {
        return $this->belongsTo(Marca::class, 'marca_id');
    }

    public function persona(): BelongsTo
    {
        return $this->belongsTo(User::class, 'persona_id');
    }

    /* ------------------------------------------------------------------
     | Reglas
     |-----------------------------------------------------------------*/

    public function estaCumplido(): bool
    {
        return $this->cumplido_en !== null;
    }

    /**
     * Si es de un día ya pasado, de hoy o de más adelante, con el
     * calendario de Caracas (ver EstadoDeLasMarcas). Lo dice el servidor
     * para que el panel, la tarjeta y la ficha pinten igual el mismo
     * recordatorio.
     */
    public function cuando(): string
    {
        $dias = $this->diasHasta();

        return match (true) {
            $dias < 0 => 'vencido',
            $dias === 0 => 'hoy',
            default => 'proximo',
        };
    }

    /** Cuántos días faltan: 0 hoy, 1 mañana, negativo si ya pasó. */
    public function diasHasta(): int
    {
        return EstadoDeLasMarcas::diasHastaElDia($this->fecha->toDateString());
    }

    /* ------------------------------------------------------------------
     | Consultas
     |-----------------------------------------------------------------*/

    /** @param  Builder<self>  $consulta */
    public function scopePendientes(Builder $consulta): void
    {
        $consulta->whereNull('cumplido_en');
    }

    /**
     * Los de esta persona, solo en marcas que todavía puede ver. Sin lo
     * segundo, a una agente a la que le quitaron una marca le seguiría
     * saliendo su nombre en «Para hoy».
     *
     * @param  Builder<self>  $consulta
     */
    public function scopeDe(Builder $consulta, User $persona): void
    {
        $consulta->where('persona_id', $persona->id)
            ->whereHas('marca', fn (Builder $marcas) => $marcas->quePuedeVer($persona));
    }
}
