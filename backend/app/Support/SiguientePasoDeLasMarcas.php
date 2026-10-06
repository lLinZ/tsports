<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * SiguientePasoDeLasMarcas — qué marcas no tienen nada por delante.
 * ---------------------------------------------------------------------
 * Una marca TIENE SIGUIENTE PASO si alguien va a volver a tocarla:
 *
 *   · tiene un recordatorio pendiente (de quien sea, vencido o no), o
 *   · tiene una acción de campaña de hoy en adelante.
 *
 * Si no tiene ninguna de las dos, nadie la va a volver a tocar salvo que
 * se acuerde. Esa es la cifra «Sin siguiente paso» del resumen, por
 * persona en «Carga por agente», y el filtro `?siguientePaso=sin` del
 * tablero, que es a donde lleva la cifra al pulsarla.
 *
 * Un recordatorio VENCIDO cuenta como siguiente paso: alguien lo tiene en
 * su lista, y le sale en «Vencidos» cada mañana. Que llegue tarde es otro
 * problema, y ya lo enseña el estado (se enfría) y esa caja.
 *
 * La condición vive aquí, en SQL, y solo aquí: la cifra del panel y el
 * filtro del tablero la leen de este sitio, así que pulsar «7 sin
 * siguiente paso» abre exactamente esas siete (como el estado, regla 26).
 *
 * Un caso que se acepta: el recordatorio pendiente de alguien que ya no
 * puede ver la marca (se la quitaron) no le sale a nadie, pero aquí
 * cuenta. Para no contarlo habría que resolver los permisos de cada
 * persona dentro del SQL, y basta con que quien reparte cumpla o borre
 * los de la ficha al reasignarla.
 */
final class SiguientePasoDeLasMarcas
{
    /** El valor del filtro del tablero: `?siguientePaso=sin`. */
    public const FILTRO_SIN = 'sin';

    /**
     * La condición «esta marca NO tiene siguiente paso», lista para un
     * WHERE o un SUM(CASE…) sobre la tabla `marcas`.
     *
     * @return array{0: string, 1: list<string>} El SQL y sus valores.
     */
    public static function faltaSql(): array
    {
        return [
            '(NOT EXISTS (SELECT 1 FROM recordatorios'
                .' WHERE recordatorios.marca_id = marcas.id AND recordatorios.cumplido_en IS NULL)'
                .' AND NOT EXISTS (SELECT 1 FROM eventos_de_campana'
                .' WHERE eventos_de_campana.marca_id = marcas.id AND eventos_de_campana.fecha >= ?))',
            // El día de Caracas (regla 16), como el resto de fechas.
            [CarbonImmutable::today()->format('Y-m-d')],
        ];
    }

    /**
     * Un SUM que cuenta, de las filas de `marcas` agrupadas, cuántas no
     * tienen siguiente paso. Para meterlo en un selectRaw junto a otros.
     *
     * @return array{0: string, 1: list<string>}
     */
    public static function contarSql(string $alias): array
    {
        [$falta, $valores] = self::faltaSql();

        return ["SUM(CASE WHEN {$falta} THEN 1 ELSE 0 END) as {$alias}", $valores];
    }
}
