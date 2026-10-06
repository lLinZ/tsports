<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * UmbralesDelEstado — cuántos días tarda una marca en enfriarse.
 * ---------------------------------------------------------------------
 * Una sola fila. Con la marca movida hace N días:
 *
 *   · N ≤ dias_caliente               → caliente
 *   · dias_caliente < N ≤ dias_tibia  → tibia
 *   · N > dias_tibia                  → fría
 *
 * Los de partida son los de la propuesta aceptada (5 y 15). Son un
 * acuerdo del equipo con su propio ritmo, no una ley: por eso se cambian
 * desde el panel y no en el código.
 *
 * @property int $dias_caliente
 * @property int $dias_tibia
 */
class UmbralesDelEstado extends Model
{
    public const DIAS_CALIENTE_POR_DEFECTO = 5;

    public const DIAS_TIBIA_POR_DEFECTO = 15;

    /**
     * Tope de la tibia. Más de un año sin moverse ya no es «tibia» para
     * nadie, y un número enorme por error dejaría el tablero sin frías.
     */
    public const DIAS_MAXIMOS = 365;

    protected $table = 'umbrales_del_estado';

    protected $fillable = [
        'dias_caliente',
        'dias_tibia',
        'cambiado_por_id',
        'cambiado_por_nombre',
    ];

    protected function casts(): array
    {
        return [
            'dias_caliente' => 'integer',
            'dias_tibia' => 'integer',
        ];
    }

    /**
     * Los que valen ahora. Si nadie los ha cambiado nunca no hay fila, y
     * se devuelven los de partida sin guardarlos: leer no debería escribir.
     */
    public static function vigentes(): self
    {
        return self::query()->oldest('id')->first()
            ?? new self([
                'dias_caliente' => self::DIAS_CALIENTE_POR_DEFECTO,
                'dias_tibia' => self::DIAS_TIBIA_POR_DEFECTO,
            ]);
    }
}
