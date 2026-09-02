<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * InversionEnPatrocinios — si la marca ya invierte hoy en patrocinios.
 * ---------------------------------------------------------------------
 * Es un dato de segmentación: una marca que ya patrocina tiene el
 * presupuesto aprobado y suele ser una venta más corta que una que
 * nunca lo ha hecho. "Desconocido" es el valor de partida y no se
 * confunde con un "no" explícito.
 */
enum InversionEnPatrocinios: string
{
    case Desconocido = 'desconocido';
    case Si = 'si';
    case No = 'no';

    public function etiqueta(): string
    {
        return match ($this) {
            self::Desconocido => 'Sin definir',
            self::Si => 'Sí invierte',
            self::No => 'No invierte',
        };
    }

    public static function valores(): array
    {
        return array_column(self::cases(), 'value');
    }
}
