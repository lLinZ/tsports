<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * EstadoDeMarca — caliente, tibia o fría.
 * ---------------------------------------------------------------------
 * Dice en qué punto está una marca según lo que se ha movido. NO es una
 * columna de la marca: se calcula al leer (App\Support\EstadoDeLasMarcas)
 * a partir de su último movimiento y de los umbrales que fija el
 * administrador. Si se guardara, cambiar los umbrales dejaría todas las
 * marcas con el estado de antes.
 *
 * Lo único que se guarda es el estado FIJADO a mano
 * (`marcas.estado_fijado`), que manda sobre el calculado hasta que
 * alguien lo suelta.
 */
enum EstadoDeMarca: string
{
    case Caliente = 'caliente';
    case Tibia = 'tibia';
    case Fria = 'fria';

    public function etiqueta(): string
    {
        return match ($this) {
            self::Caliente => 'Caliente',
            self::Tibia => 'Tibia',
            self::Fria => 'Fría',
        };
    }

    /** @return list<string> */
    public static function valores(): array
    {
        return array_column(self::cases(), 'value');
    }
}
